---
title: "Button"
---

The `button` component is one of ESPHome's core [entity](/architecture/components/index) types. Unlike a
[switch](/architecture/components/switch), a button has no persistent state - it is a momentary, stateless entity that
only knows how to be *pressed*. There is nothing to publish and nothing to read back; pressing the button simply
triggers a one-shot action on the device (rebooting, sending a single IR code, factory-resetting, and so on).

Like the other entity types, `button` is a *platform* base. Individual components (for example `restart`, `safe_mode`
or `factory_reset`) register a button and implement the action that should run when it is pressed.

## Python

A button platform lives in a `button.py` file (or a `button/__init__.py` package) inside your component's directory.
This file name tells ESPHome that the component provides a `button` platform, allowing the user to configure it under
the `button:` block:

```yaml
button:
  - platform: my_component
    name: "My Button"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import button

my_button_ns = cg.esphome_ns.namespace("my_button")
MyButton = my_button_ns.class_("MyButton", button.Button, cg.Component)
```

Note that `MyButton` inherits from both `button.Button` and a component base (`cg.Component` here).

### Configuration schema

Use the `button.button_schema()` helper. It returns a schema pre-populated with all of the options common to every
button - `name`, `id`, `icon`, `entity_category`, `device_class`, the `on_press` automation, and so on - and lets you
pass defaults for your device:

```python
CONFIG_SCHEMA = button.button_schema(MyButton).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyButton`) as the first argument tells the helper which class to declare the ID for, so you do not
need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `button.new_button()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code
to apply the common button options from the configuration:

```python
async def to_code(config):
    var = await button.new_button(config)
    await cg.register_component(var, config)
```

If your component owns a button as a child (rather than *being* a button), use `await button.register_button(var, config)`
instead, having declared the ID yourself.

## C++

The C++ class inherits from `button::Button` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/button/button.h"

namespace esphome::my_button {

class MyButton : public button::Button, public Component {
 public:
  void dump_config() override;

 protected:
  void press_action() override;
};

}  // namespace esphome::my_button
```

### Handling the press

A button has no `write_state()`-style method taking a value - there is nothing to write. Instead, the front-end calls
the public `press()` method, which the base class uses to log the event, invoke your `press_action()` override, and
finally fire any `on_press` automations. The one method you *must* implement is `press_action()`:

```cpp
void MyButton::press_action() {
  // Perform the one-shot action here.
  this->write_command_to_hardware_();
}
```

A few important details:

- `press_action()` is called synchronously from `press()`; there is no state to publish and no `publish_state()` call to
  make afterwards.
- If the action needs to un-do itself after a delay (for example a relay pulse), use `set_timeout()` from within
  `press_action()` rather than blocking - see [`output_button`](https://github.com/esphome/esphome/blob/dev/esphome/components/output/button/output_button.cpp)
  for an example that turns an output on and schedules it back off.
- Do not implement `press()` yourself - it is provided by the base class and calls your `press_action()` for you.

### Useful members

- `add_on_press_callback(F &&callback)`: register an additional `void()` callback to run whenever the button is
  pressed, in case you need to react to a press outside of `press_action()` itself.
- `LOG_BUTTON(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the button in the standard format.

## Exposing multiple buttons from one component

Hardware often maps to more than one button - a hub component might expose a reboot button, a calibrate button and a
clear-counters button, all acting on the same underlying device. There are two established ways to model this. Both
are valid and both are widely used in-tree - which one fits depends on how the hardware itself is shaped, so read the
two together and pick the one that describes your device more honestly.

### A hub plus a `type` on the platform

If your component already has a top-level hub, let the user add *one `button:` entry per action*, distinguished by a
`type` key, using `cv.typed_schema()` with `key=CONF_TYPE`:

```yaml
button:
  - platform: my_hub
    type: reboot
    name: "Reboot"
  - platform: my_hub
    type: calibrate
    name: "Calibrate"
```

```python
_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_MY_HUB_ID): cv.use_id(MyHub)})

CONFIG_SCHEMA = cv.typed_schema(
    {
        "reboot": button.button_schema(MyHubRebootButton).extend(_HUB_ID_SCHEMA),
        "calibrate": button.button_schema(MyHubCalibrateButton).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await button.new_button(config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

Each entry is a first-class platform entry with the full set of per-entity options, adding a new action later is
purely additive, and each action naturally gets its own `press_action()` via its own C++ class.

### Sub-configs on a single platform entry

Many components instead nest optional sub-keys under one platform entry, one per action. Note an important difference
from the sensor case: `sensor_schema()` can be called with no class at all, because `sensor::Sensor` is concrete and a
bare instance is perfectly usable - it just holds a value. `button::Button` is abstract: `press_action()` is pure
virtual, so there is no generic button to fall back on and every button needs its own subclass. `button_schema()`
reflects that by making `class_` a required argument rather than defaulting it to `cv.UNDEFINED`.

> [!NOTE]
> Whether the Python helper *enforces* this varies by entity type and is partly historical: `text_schema()`,
> `lock_schema()` and `valve_schema()` all default `class_` even though those base classes are abstract too, so omitting
> the class there fails later at C++ compile time instead of during validation. The rule to follow is to pass a concrete
> subclass whenever the base class is abstract, whether or not the helper forces you to. Only `sensor`,
> `binary_sensor`, `text_sensor` and `event` have non-abstract bases where omitting it genuinely works.

So every sub-config, even inline ones, must still declare and pass its own concrete class, exactly as
[`ld2450`](https://github.com/esphome/esphome/tree/dev/esphome/components/ld2450) does for its `factory_reset` and
`restart` sub-configs: `cv.Optional(CONF_FACTORY_RESET): button.button_schema(FactoryResetButton)`, with
`FactoryResetButton` declared as its own `button.Button` subclass.

The hub still uses `SUB_BUTTON(name)` from `button.h`, which generates a protected `name##_button_` member (defaulted
to `nullptr`) and a public `set_##name##_button()` setter, exactly as for the other entity types. Always null-check
before calling into a sub-button, since the user may have configured only some of them:

```cpp
class MyHubComponent final : public Component {
 public:
  SUB_BUTTON(factory_reset)
  SUB_BUTTON(restart)
};
// if (this->factory_reset_button_ != nullptr) { ... }
```

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example of both patterns.

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its actions, so let the hardware decide:

- **Sub-configs** fit when the actions are facets of one inseparable set that a single device exposes together.
  `ld2450` offers `factory_reset` and `restart` as sub-configs of the one radar entry, so a single YAML block for the
  device is easier to read than several separate platform entries.
- **A hub plus `type`** fits when the actions are genuinely independent things that happen to share a connection. If
  a hub component already exists because the device or transport must be configured once and shared, then each
  action being its own entry is the more natural fit - especially when the set is large or open-ended, or when
  different actions need different `press_action()` implementations or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.

For everything else, the component implements the usual set of methods [as described here](/architecture/components/index#common-methods).
