---
title: "Valve"
---

The `valve` component is one of ESPHome's core [entity](/architecture/components/index) types. A valve represents
anything that opens and closes and can optionally be moved to a position - a water shutoff valve, a gas valve, an
irrigation valve, and so on. It is a *controllable* entity: in addition to reporting its current position it accepts
open/close/stop/toggle commands from the front-end (Home Assistant, the web server, MQTT, etc.).

`valve` is closely modeled on [cover](/architecture/components/cover), but simpler: it has no `tilt` concept, since
valves only ever open and close (optionally to an intermediate position).

Like the other entity types, `valve` is a *platform* base. Individual components (for example a relay-driven shutoff
valve or a motorized ball valve) register a valve and implement the logic that actually drives the hardware.

## Python

A valve platform lives in a `valve.py` file (or a `valve/__init__.py` package) inside your component's directory. This
file name tells ESPHome that the component provides a `valve` platform, allowing the user to configure it under the
`valve:` block:

```yaml
valve:
  - platform: my_component
    name: "My Valve"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import valve

my_valve_ns = cg.esphome_ns.namespace("my_valve")
MyValve = my_valve_ns.class_("MyValve", valve.Valve, cg.Component)
```

Note that `MyValve` inherits from both `valve.Valve` and a component base (`cg.Component` here).

### Configuration schema

Use the `valve.valve_schema()` helper. It returns a schema pre-populated with all of the options common to every
valve - `name`, `id`, `icon`, `device_class`, `entity_category`, the `on_open` / `on_closed` automations, and so on:

```python
CONFIG_SCHEMA = valve.valve_schema(MyValve).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyValve`) as the first argument tells the helper which class to declare the ID for, so you do not
need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `valve.new_valve()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code to
apply the common valve options from the configuration:

```python
async def to_code(config):
    var = await valve.new_valve(config)
    await cg.register_component(var, config)
```

If your component owns a valve as a child (rather than *being* a valve), use `await valve.register_valve(var, config)`
instead, having declared the ID yourself.

## C++

The C++ class inherits from `valve::Valve` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/valve/valve.h"

namespace esphome::my_valve {

class MyValve : public valve::Valve, public Component {
 public:
  void dump_config() override;
  valve::ValveTraits get_traits() override;

 protected:
  void control(const valve::ValveCall &call) override;
};

}  // namespace esphome::my_valve
```

### Command flow

As with [cover](/architecture/components/cover#command-flow), a valve command is built up as a `valve::ValveCall` object: the
front-end (or your own code) calls `make_call()` to get one, sets whichever fields it wants to change
(`set_position()`, `set_command_open()`, `set_stop()`, ...), and then calls `perform()` on it. This in turn dispatches
to your protected virtual `control()` method with the finished call.

The two methods you *must* implement are `control(const valve::ValveCall &call)` and `get_traits()`.

```cpp
void MyValve::control(const valve::ValveCall &call) {
  if (call.get_stop()) {
    this->stop_hardware_();
    this->current_operation = valve::VALVE_OPERATION_IDLE;
    this->publish_state();
  }

  if (call.get_position().has_value()) {
    float pos = *call.get_position();
    this->move_to_position_(pos);
    this->position = pos;
    this->publish_state();
  }
}

valve::ValveTraits MyValve::get_traits() {
  auto traits = valve::ValveTraits();
  traits.set_supports_position(false);
  traits.set_supports_stop(false);
  traits.set_is_assumed_state(false);
  return traits;
}
```

A few important details:

- Inspect `call.get_position()` and `call.get_stop()` to find out what the caller actually asked for; only the fields
  the caller set will be present (`get_position()` is an `optional<float>`, so check `has_value()` before
  dereferencing).
- `get_position()` ranges from `0.0` (`valve::VALVE_CLOSED`) to `1.0` (`valve::VALVE_OPEN`) - use these constants rather than the raw
  literals where it improves readability. A simple binary valve will only ever be commanded to one of these two
  extremes.
- After driving the hardware, update `this->position` and set `this->current_operation` before calling
  `publish_state()`, so the front-end sees an accurate, up-to-date state.
- `get_traits()` tells the front-end what the valve can do - whether it supports a continuous `position`, being
  stopped mid-move, or only reports an *assumed* state (see below). Report only the capabilities your hardware
  actually has; a simple on/off shutoff valve should leave `supports_position` and `supports_stop` false.

### Assumed state

If your valve cannot read back the real hardware position (so the reported position is only what ESPHome last
commanded), set `traits.set_is_assumed_state(true)` in `get_traits()`. The front-end will then show separate open/close
controls rather than trusting the reported position as ground truth.

### Useful members

- `position`: the current reported position, `0.0` (closed) to `1.0` (open). Use `valve::VALVE_OPEN` / `valve::VALVE_CLOSED` for the
  extremes.
- `current_operation`: one of `valve::VALVE_OPERATION_IDLE`, `valve::VALVE_OPERATION_OPENING`, `valve::VALVE_OPERATION_CLOSING`.
- `is_fully_open()` / `is_fully_closed()`: convenience helpers comparing `position` against `1.0` / `0.0`.
- `publish_state(bool save = true)`: report the current `position`/`current_operation` to the front-end; pass
  `save = false` to skip persisting the state to flash.
- `LOG_VALVE(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the valve in the standard format.

## Exposing multiple valves from one component

Hardware often controls more than one valve - an irrigation controller, for example, might drive a separate valve for
each watering zone. There are two established ways to model this. Both are valid and both are widely used in-tree -
which one fits depends on how the hardware itself is shaped, so read the two together and pick the one that
describes your device more honestly.

### A hub plus a `type` on the platform

If your component already has a top-level hub, let the user add one `valve:` entry per zone, distinguished by a
`type` key via `cv.typed_schema()`:

```yaml
valve:
  - platform: my_hub
    type: zone_1
    name: "Zone 1"
  - platform: my_hub
    type: zone_2
    name: "Zone 2"
```

```python
CONFIG_SCHEMA = cv.typed_schema(
    {
        "zone_1": valve.valve_schema(MyHubZoneValve).extend(_HUB_ID_SCHEMA),
        "zone_2": valve.valve_schema(MyHubZoneValve).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)


async def to_code(config):
    var = await valve.new_valve(config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

Each zone is a first-class platform entry with the full set of per-entity options, adding a new zone later is purely
additive, and different zones can use different C++ classes if they need to.

### Sub-configs on a single platform entry

Some components instead nest a small, fixed set of valves under one platform entry, each an inline
`cv.Optional(CONF_FILL): valve.valve_schema()` - note `valve_schema()` called *without* a class argument. There is no
`SUB_VALVE` macro (`SUB_*` exists only for `binary_sensor`, `button`, `number`, `select`, `sensor`, `switch` and
`text_sensor`), so declare the pointer member and setter by hand, and null-check before use since the user may
configure only one of them:

```cpp
class MyValveDevice final : public Component {
 public:
  void set_fill_valve(valve::Valve *fill_valve) { this->fill_valve_ = fill_valve; }

 protected:
  valve::Valve *fill_valve_{nullptr};
};
```

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example of both patterns, including the matching Python schema and `to_code`.

### Choosing between them

Neither pattern is deprecated; they express different relationships between a device and the valves it controls, so
let the hardware decide:

- **Sub-configs** fit a small, fixed set of valves on a single device - one physical device maps to one YAML block,
  which is easier to read.
- **A hub plus `type`** fits when a top-level hub already exists to describe the connection, and the set of valves is
  large or open-ended (such as an irrigation controller's zones), or different valves need different update
  strategies.

If both descriptions fit equally well, follow whichever pattern the surrounding component already uses. In a new
component with no hub, sub-configs are usually the smaller change.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
