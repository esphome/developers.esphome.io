---
title: "Fan"
---

The `fan` component is one of ESPHome's core [entity](/architecture/components/index) types. A fan represents a
device that can be turned on/off and, depending on the hardware, may also support variable speed, oscillation, a
configurable direction and named preset modes. Unlike a [switch](/architecture/components/switch), a fan's state is
made up of several independent properties that the front-end (Home Assistant, the web server, MQTT, etc.) can set
together or individually.

Like the other entity types, `fan` is a *platform* base. Individual components (for example `template`, `speed` or a
relay-driven fan) register a fan and implement the logic that actually drives the hardware.

We have an [example, minimal fan component](https://github.com/esphome/starter-components/tree/main/components/empty_fan)
which is a good starting point.

## Python

A fan platform lives in a `fan.py` file (or a `fan/__init__.py` package) inside your component's directory. This file
name tells ESPHome that the component provides a `fan` platform, allowing the user to configure it under the `fan:`
block:

```yaml
fan:
  - platform: my_component
    name: "My Fan"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import fan

my_fan_ns = cg.esphome_ns.namespace("my_fan")
MyFan = my_fan_ns.class_("MyFan", fan.Fan, cg.Component)
```

Note that `MyFan` inherits from both `fan.Fan` and a component base (`cg.Component` here).

### Configuration schema

Use the `fan.fan_schema()` helper. It returns a schema pre-populated with all of the options common to every fan -
`name`, `id`, `icon`, `restore_mode`, `entity_category`, the `on_state` / `on_turn_on` / `on_turn_off` / `on_speed_set`
/ `on_oscillating_set` / `on_direction_set` / `on_preset_set` automations, and so on - and lets you pass defaults for
your device:

```python
CONFIG_SCHEMA = fan.fan_schema(MyFan).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyFan`) as the first argument tells the helper which class to declare the ID for, so you do not
need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `fan.new_fan()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code to
apply the common fan options from the configuration:

```python
async def to_code(config):
    var = await fan.new_fan(config)
    await cg.register_component(var, config)
```

If your component owns a fan as a child (rather than *being* a fan), use `await fan.register_fan(var, config)` instead,
having declared the ID yourself.

## C++

The C++ class inherits from `fan::Fan` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/fan/fan.h"

namespace esphome::my_fan {

class MyFan : public fan::Fan, public Component {
 public:
  void setup() override;
  void dump_config() override;

  fan::FanTraits get_traits() override { return this->traits_; }

 protected:
  void control(const fan::FanCall &call) override;

  fan::FanTraits traits_;
};

}  // namespace esphome::my_fan
```

### Declaring traits

`get_traits()` tells the front-end what the fan supports. `FanTraits` is usually built once (in `setup()`, or lazily
in `get_traits()`) from a small set of booleans plus the number of discrete speed levels:

```cpp
void MyFan::setup() {
  // oscillation, speed, direction, speed_count
  this->traits_ = fan::FanTraits(this->has_oscillating_, this->speed_count_ > 0, this->has_direction_,
                                  this->speed_count_);
}
```

If your fan supports named preset modes (e.g. "Sleep", "Auto"), call `set_supported_preset_modes()` on the *fan
entity itself* (not on the traits) and wire the pointer into the traits you return:

```cpp
fan::FanTraits MyFan::get_traits() {
  this->wire_preset_modes_(this->traits_);
  return this->traits_;
}
```

### Handling commands with `FanCall`

The one method you *must* implement is `control()`. It is called whenever the front-end (or an automation, via
`fan.turn_on`/`fan.turn_off`/`fan.toggle`) wants to change one or more properties of the fan. Rather than a single
value like `switch::Switch::write_state(bool)`, you are given a `FanCall` - a builder object where each property is an
`optional<T>` that is only present if the caller actually asked to change it:

```cpp
void MyFan::control(const fan::FanCall &call) {
  if (call.get_state().has_value())
    this->state = *call.get_state();
  if (call.get_speed().has_value())
    this->speed = *call.get_speed();
  if (call.get_oscillating().has_value())
    this->oscillating = *call.get_oscillating();
  if (call.get_direction().has_value())
    this->direction = *call.get_direction();
  this->apply_preset_mode_(call);

  // Drive the hardware here, based on this->state / this->speed / ...

  this->publish_state();
}
```

A few important details:

- Only apply a field if `has_value()` is true - a `FanCall` that only sets `speed` should not silently turn the fan on
  or off.
- `apply_preset_mode_(call)` is a protected helper on `Fan` that looks up `call.get_preset_mode()` against the
  supported preset modes and stores it for you; use it instead of handling preset mode by hand.
- Drive the hardware, then call `publish_state()` (no arguments - it republishes whatever is currently stored on
  `state`, `speed`, `oscillating`, `direction` and the preset mode) to report the *actually achieved* state back to
  the front-end.

### `make_call()`

Code elsewhere in ESPHome (actions, other components, or your own `setup()` when restoring state) never calls
`control()` directly. Instead it builds a `FanCall` via `make_call()` (or the shorthand `turn_on()` / `turn_off()` /
`toggle()`) and calls `perform()`, which validates the requested values against `get_traits()` and then dispatches to
your `control()`:

```cpp
id(my_fan).make_call().set_state(true).set_speed(3).perform();
```

### Useful members

- `state` / `speed` / `oscillating` / `direction`: the current reported values, kept in sync by `publish_state()`.
- `has_preset_mode()` / `get_preset_mode()`: whether a preset mode is currently active, and its name.
- `FanDirection`: enum with `FORWARD` and `REVERSE`.
- `LOG_FAN(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the fan and its traits in the
  standard format.

## Exposing multiple fans from one component

Hardware sometimes drives more than one fan from a single controller - a multi-fan controller hub might expose one
fan per header, and not every header is necessarily the same kind (for example one PWM header with variable speed,
and one relay header that only supports on/off). There are two established ways to model this. Both are valid and
both are widely used in-tree - which one fits depends on how the hardware itself is shaped, so read the two together
and pick the one that describes your device more honestly.

### A hub plus a `type` on the platform

If your component has a top-level hub, let the user add *one `fan:` entry per header*, distinguished by a `type`
key, using `cv.typed_schema()` with `key=CONF_TYPE`:

```yaml
my_hub:
  id: the_hub
fan:
  - platform: my_hub
    type: pwm
    name: "Case Fan"
  - platform: my_hub
    type: relay
    name: "Exhaust Fan"
```

```python
_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_MY_HUB_ID): cv.use_id(MyHub)})
CONFIG_SCHEMA = cv.typed_schema(
    {
        "pwm": fan.fan_schema(MyHubPwmFan).extend(_HUB_ID_SCHEMA),
        "relay": fan.fan_schema(MyHubRelayFan).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await fan.new_fan(config)
    await cg.register_component(var, config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

Each `type` gets its own schema and C++ class - the PWM header and the relay header return different `FanTraits`
from `get_traits()` - and adding a third type later is purely additive. See
[Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example.

### Sub-configs on a single platform entry

Some components instead nest their headers as optional sub-keys under one platform entry, the way
[`dht`](https://github.com/esphome/esphome/tree/dev/esphome/components/dht) nests `temperature:` and `humidity:`
under one `sensor:` entry. There is no `SUB_FAN` macro (only `binary_sensor`, `button`, `number`, `select`,
`sensor`, `switch`, `text_sensor` have one), and unlike `sensor.sensor_schema()`, `fan.fan_schema()` always requires
a class argument. Declare the pointer member and setter by hand, and null-check before use:

```cpp
class MyHubComponent : public Component {
 public:
  void set_header_0_fan(fan::Fan *fan) { this->header_0_fan_ = fan; }
 protected:
  fan::Fan *header_0_fan_{nullptr};
};
```

### Choosing between them

Neither pattern is deprecated; they express different relationships between a controller and the fans it drives, so
let the hardware decide:

- **Sub-configs** fit when the headers are a small, fixed set on a single controller board - one physical device
  maps to one YAML block, which is easier to read.
- **A hub plus `type`** fits when a hub component already exists to describe the connection, and the set of headers
  is large or open-ended, or different headers need different traits or C++ classes.

If both descriptions fit equally well, follow whichever pattern the surrounding component already uses. In a new
component with no hub, sub-configs are usually the smaller change.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
