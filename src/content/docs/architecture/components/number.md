---
title: "Number"
---

The `number` component is one of ESPHome's core [entity](/architecture/components/index) types. A number is a
single floating point value, bounded by a minimum and maximum and stepped by some increment, that the user can set
from the front-end (Home Assistant, the web server, MQTT, etc.) - think of a setpoint, a brightness limit, or a
timeout value. It is conceptually similar to a [sensor](/architecture/components/sensor), except that it can also be
*written to*: in addition to reporting its current value, it accepts a new target value from the front-end and drives
some piece of hardware or internal state in response.

Like the other entity types, `number` is a *platform* base. Individual components (for example a fan's `speed_count`,
a thermostat's setpoint, or a template value) register a number and implement the logic that applies the new value.

## Python

A number platform lives in a `number.py` file (or a `number/__init__.py` package) inside your component's directory.
This file name tells ESPHome that the component provides a `number` platform, allowing the user to configure it under
the `number:` block:

```yaml
number:
  - platform: my_component
    name: "My Number"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import number

my_number_ns = cg.esphome_ns.namespace("my_number")
MyNumber = my_number_ns.class_("MyNumber", number.Number, cg.Component)
```

Note that `MyNumber` inherits from both `number.Number` and a component base (`cg.Component` here).

### Configuration schema

Use the `number.number_schema()` helper. It returns a schema pre-populated with all of the options common to every
number - `name`, `id`, `icon`, `entity_category`, `device_class`, `unit_of_measurement`, the `on_value` /
`on_value_range` automations, and so on:

```python
CONFIG_SCHEMA = number.number_schema(MyNumber).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyNumber`) as the first argument tells the helper which class to declare the ID for, so you do
not need a separate `cv.GenerateID()`. Unlike `sensor.sensor_schema()`, `number.number_schema()` does *not* take
`min_value`, `max_value` or `step` arguments - those bounds are supplied later, when the number is actually
instantiated in `to_code`, since they often depend on the specific device or hardware capability rather than being
fixed for the whole platform.

### Code generation

In `to_code`, use the `number.new_number()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code
to apply the common number options from the configuration. Because the schema does not carry the value bounds, you
must supply `min_value`, `max_value` and `step` as keyword arguments here:

```python
async def to_code(config):
    var = await number.new_number(config, min_value=0.0, max_value=100.0, step=1.0)
    await cg.register_component(var, config)
```

If your component owns a number as a child (rather than *being* a number), use
`await number.register_number(var, config, min_value=..., max_value=..., step=...)` instead, having declared the ID
yourself.

## C++

The C++ class inherits from `number::Number` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/number/number.h"

namespace esphome::my_number {

class MyNumber : public number::Number, public Component {
 public:
  void dump_config() override;

 protected:
  void control(float value) override;
};

}  // namespace esphome::my_number
```

### Handling the new value

The one method you *must* implement is `control()`. It is called by the front-end when the user (or an automation)
sets a new value. Your implementation drives the hardware and then calls `publish_state()` to acknowledge the value
that was actually applied:

```cpp
void MyNumber::control(float value) {
  // Drive the hardware here (send a command, store a setting, etc.)
  this->write_hardware_(value);

  // Acknowledge the new value back to the front-end.
  this->publish_state(value);
}
```

A few important details:

- `control()` is only called with a value that has already been validated against the configured `min_value:`,
  `max_value:` and `step:` bounds, so you do not need to re-validate it yourself.
- You should call `publish_state()` yourself once the hardware has been driven; the base class does *not* do this for
  you. This lets you report the *actual* achieved value, which may differ slightly from the requested one (for
  example if the hardware only supports coarser steps).
- Do not implement any public setter for the front-end to call directly - the base class's `make_call()` /
  `NumberCall` machinery handles validation and dispatches to your `control()`.

### Traits

The `min_value`, `max_value` and `step` bounds passed to `new_number()` end up on `this->traits` in the generated
code, and the front-end mode (`NumberMode::NUMBER_MODE_AUTO` / `NUMBER_MODE_BOX` / `NUMBER_MODE_SLIDER`) is likewise
set from the user's `mode:` option. If your hardware only discovers its real bounds at runtime (for example after
probing a chip in `setup()`), you can adjust them yourself:

```cpp
void MyNumber::setup() {
  this->traits.set_max_value(this->detected_max_());
}
```

### Useful members

- `state`: the current reported value.
- `traits`: the `NumberTraits` object holding `min_value`/`max_value`/`step`/`mode`.
- `publish_state(float)`: report a new value to the front-end (stores `state`, fires callbacks).
- `LOG_NUMBER(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the number in the standard
  format.

## Exposing multiple numbers from one component

Hardware often exposes more than one adjustable value - a controller hub might expose a setpoint, a deadband and a
calibration offset, each independently tunable. There are two established ways to model this. Both are valid and
both are widely used in-tree - which one fits depends on how the hardware itself is shaped.

### A hub plus a `type` on the platform

If your component already has a top-level hub - configured once to describe the device or connection - you can let
the user add *one `number:` entry per value*, distinguished by a `type` key, using `cv.typed_schema()` with
`key=CONF_TYPE`. Because `number.number_schema()` does not carry `min_value`, `max_value` or `step`, those bounds are
supplied per type in `to_code`:

```yaml
controller_hub:
  id: the_hub

number:
  - platform: controller_hub
    type: setpoint
    name: "Setpoint"
  - platform: controller_hub
    type: deadband
    name: "Deadband"
```

```python
from esphome.const import CONF_TYPE

from .. import CONF_CONTROLLER_HUB_ID, ControllerHub, controller_hub_ns

_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_CONTROLLER_HUB_ID): cv.use_id(ControllerHub)})

CONFIG_SCHEMA = cv.typed_schema(
    {
        "setpoint": number.number_schema(SetpointNumber).extend(_HUB_ID_SCHEMA),
        "deadband": number.number_schema(DeadbandNumber).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)


async def to_code(config):
    bounds = {
        "setpoint": (0.0, 100.0, 0.5),
        "deadband": (0.0, 10.0, 0.1),
    }[config[CONF_TYPE]]
    min_value, max_value, step = bounds
    var = await number.new_number(
        config, min_value=min_value, max_value=max_value, step=step
    )
    await cg.register_parented(var, config[CONF_CONTROLLER_HUB_ID])
```

What this shape gives you:

- Each value is a first-class platform entry, so it picks up the full set of per-entity options naturally.
- Adding a new value later is purely additive - one more key in the `typed_schema` - with no reshaping of the
  existing schema and no change to existing user configurations.
- Different values can use different C++ classes and their own bounds.

### Sub-configs on a single platform entry

Many existing components instead nest optional numbers under one platform entry. Like `switch.switch_schema()`,
`number.number_schema()` always requires a class, so this pattern still declares a dedicated class per number - it is
just folded under one entry as an optional key. `ld2410` does this for its gate and timeout thresholds:

```yaml
number:
  - platform: ld2410
    ld2410_id: my_ld2410
    timeout:
      name: "Timeout"
    light_threshold:
      name: "Light Threshold"
```

On the C++ side, use the `SUB_NUMBER(name)` macro from `number.h`, which generates a protected `name##_number_`
member (defaulted to `nullptr`) and a public `set_##name##_number()` setter:

```cpp
class LD2410Component : public PollingComponent {
 public:
  SUB_NUMBER(timeout)
  SUB_NUMBER(light_threshold)
};
```

Always null-check before use - the user may have configured only one of them.

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its values, so let the hardware decide:

- **Sub-configs** fit when the values are a small, fixed set that belong to a single chip - one physical device to
  one YAML block, which is easier to read.
- **A hub plus `type`** fits when the values are genuinely independent things that happen to share a connection. If a
  hub component already exists because the device or transport must be configured once and shared, then each value
  being its own entry is the more natural fit - especially when the set is large or open-ended, or when different
  values need different bounds or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example of both patterns.

For everything else, the component implements the usual set of methods [as described here](/architecture/components/index#common-methods).
