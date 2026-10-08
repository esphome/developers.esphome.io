---
title: "Switch"
---

The `switch` component is one of ESPHome's core [entity](/architecture/components/index) types. A switch is a simple
two-state (ON/OFF) entity that the user can control from the front-end (Home Assistant, the web server, MQTT, etc.). It
is conceptually a [binary sensor](/architecture/components/binary_sensor) that can also be *written to*: in addition to
reporting its current state, it accepts turn-on/turn-off/toggle commands and drives some piece of hardware in response.

Like the other entity types, `switch` is a *platform* base. Individual components (for example `gpio`, `template` or a
relay board) register a switch and implement the logic that actually turns the hardware on and off.

We have an [example, minimal switch component](https://github.com/esphome/starter-components/tree/main/components/empty_switch)
which is a good starting point.

## Python

A switch platform lives in a `switch.py` file (or a `switch/__init__.py` package) inside your component's directory. This
file name tells ESPHome that the component provides a `switch` platform, allowing the user to configure it under the
`switch:` block:

```yaml
switch:
  - platform: my_component
    name: "My Switch"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import switch

my_switch_ns = cg.esphome_ns.namespace("my_switch")
MySwitch = my_switch_ns.class_("MySwitch", switch.Switch, cg.Component)
```

Note that `MySwitch` inherits from both `switch.Switch` and a component base (`cg.Component` here).

### Configuration schema

Use the `switch.switch_schema()` helper. It returns a schema pre-populated with all of the options common to every
switch - `name`, `id`, `icon`, `inverted`, `restore_mode`, `device_class`, `entity_category`, the `on_turn_on` /
`on_turn_off` automations, and so on - and lets you pass defaults for your device:

```python
CONFIG_SCHEMA = switch.switch_schema(MySwitch).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MySwitch`) as the first argument tells the helper which class to declare the ID for, so you do not
need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `switch.new_switch()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code to
apply the common switch options from the configuration:

```python
async def to_code(config):
    var = await switch.new_switch(config)
    await cg.register_component(var, config)
```

If your component owns a switch as a child (rather than *being* a switch), use `await switch.register_switch(var, config)`
instead, having declared the ID yourself.

## C++

The C++ class inherits from `switch_::Switch` alongside its component base. Note the trailing underscore in the
namespace: `switch` is a reserved C++ keyword, so the namespace is spelled `switch_`.

```cpp
#include "esphome/core/component.h"
#include "esphome/components/switch/switch.h"

namespace esphome::my_switch {

class MySwitch : public switch_::Switch, public Component {
 public:
  void dump_config() override;

 protected:
  void write_state(bool state) override;
};

}  // namespace esphome::my_switch
```

### Writing state to hardware

The one method you *must* implement is `write_state()`. It is called by the front-end when the user (or an automation)
turns the switch on or off. Your implementation drives the hardware and then calls `publish_state()` to acknowledge that
the new state was applied:

```cpp
void MySwitch::write_state(bool state) {
  // Drive the hardware here (set a GPIO, send a command, etc.)
  this->write_hardware_(state);

  // Acknowledge the new state back to the front-end.
  this->publish_state(state);
}
```

A few important details:

- The `state` argument already has the user's `inverted:` option applied, so you can write it to the hardware directly.
- You should call `publish_state()` yourself once the hardware has been driven; the base class does *not* do this for
  you. This lets you report the *actual* achieved state, which may differ from the requested one.
- Do not implement `turn_on()` / `turn_off()` / `toggle()` - those are provided by the base class and ultimately call
  your `write_state()`.

### Assumed state and restore mode

- If your switch cannot read back the real hardware state (so the reported state is only what ESPHome last wrote),
  override `assumed_state()` to return `true`. The front-end will then show separate ON and OFF buttons rather than a
  single toggle.
- The base class handles the user's `restore_mode:` option (restoring the previous state from flash on boot). At the end
  of `setup()`, you can consult `get_initial_state_with_restore_mode()` to decide what state to apply.

### Useful members

- `state`: the current reported state.
- `publish_state(bool)`: report a new state to the front-end (applies inversion, stores `state`, fires callbacks).
- `LOG_SWITCH(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the switch in the standard format.

## Exposing multiple switches from one component

Hardware often maps to more than one switch - a relay board might drive four independent relays, or a device hub
might expose several unrelated feature toggles (a buzzer, a night light, a child lock). There are two established
ways to model this. Both are valid and both are widely used in-tree - which one fits depends on how the hardware
itself is shaped.

### A hub plus a `type` on the platform

If your component already has a top-level hub - configured once to describe the device or connection - you can let
the user add *one `switch:` entry per relay*, distinguished by a `type` key, using `cv.typed_schema()` with
`key=CONF_TYPE`:

```yaml
relay_hub:
  id: the_hub

switch:
  - platform: relay_hub
    type: relay_1
    name: "Relay 1"
  - platform: relay_hub
    type: relay_2
    name: "Relay 2"
```

```python
from esphome.const import CONF_TYPE

from .. import CONF_RELAY_HUB_ID, RelayHub, relay_hub_ns

_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_RELAY_HUB_ID): cv.use_id(RelayHub)})

CONFIG_SCHEMA = cv.typed_schema(
    {
        "relay_1": switch.switch_schema(Relay1Switch).extend(_HUB_ID_SCHEMA),
        "relay_2": switch.switch_schema(Relay2Switch).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)


async def to_code(config):
    var = await switch.new_switch(config)
    await cg.register_parented(var, config[CONF_RELAY_HUB_ID])
```

What this shape gives you:

- Each relay is a first-class platform entry, so it picks up the full set of per-entity options naturally.
- Adding a new relay later is purely additive - one more key in the `typed_schema` - with no reshaping of the
  existing schema and no change to existing user configurations.
- Different relays can use different C++ classes.

The `switch` platform of `dfrobot_sen0395` is a real in-tree example - its `type:` selects which of four switches
(power, LED, UART presence, start-after-boot) a given entry controls.

### Sub-configs on a single platform entry

Many existing components instead nest optional switches under one platform entry. Unlike `sensor.sensor_schema()`,
`switch.switch_schema()` always requires a class, so this pattern still declares a dedicated class per switch - it is
just folded under one entry as an optional key instead of getting its own `type:`. `ld2410` does this for its
`engineering_mode` and `bluetooth` switches:

```yaml
switch:
  - platform: ld2410
    ld2410_id: my_ld2410
    engineering_mode:
      name: "Engineering Mode"
    bluetooth:
      name: "Bluetooth"
```

On the C++ side, use the `SUB_SWITCH(name)` macro from `switch.h`, which generates a protected `name##_switch_`
member (defaulted to `nullptr`) and a public `set_##name##_switch()` setter:

```cpp
class LD2410Component : public PollingComponent {
 public:
  SUB_SWITCH(engineering_mode)
  SUB_SWITCH(bluetooth)
};
```

Always null-check before use - the user may have configured only one of them.

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its switches, so let the hardware decide:

- **Sub-configs** fit when the switches are a small, fixed set that belong to a single chip - one physical device to
  one YAML block, which is easier to read.
- **A hub plus `type`** fits when the switches are genuinely independent things that happen to share a connection.
  If a hub component already exists because the device or transport must be configured once and shared, then each
  switch being its own entry is the more natural fit - especially when the set is large or open-ended, or when
  different switches need different C++ classes or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example of both patterns.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
