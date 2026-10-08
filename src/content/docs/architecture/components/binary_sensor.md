---
title: "Binary Sensor"
---

The `binary_sensor` component is one of ESPHome's core [entity](/architecture/components/index) types. A binary
sensor represents a single two-state (ON/OFF) measurement - a door being open or closed, motion being detected, a
button being pressed, and so on - which is published to the front-end (Home Assistant, the web server, MQTT, etc.) as
a boolean value. It is the read-only counterpart to [switch](/architecture/components/switch): a binary sensor only
*reports* a state, it never accepts commands from the front-end.

Rather than being used on its own, `binary_sensor` is a *platform* base: individual components (for example `gpio`,
`pn532` or a PIR motion module) register one or more binary sensors and push new states into them whenever the
underlying condition changes. If you are writing a component that detects a two-state condition, you will almost
always expose that condition as a binary sensor.

We have an [example, minimal binary sensor component](https://github.com/esphome/starter-components/tree/main/components/empty_binary_sensor)
which is a good starting point.

## Python

A binary sensor platform lives in a `binary_sensor.py` file (or a `binary_sensor/__init__.py` package) inside your
component's directory. This file name tells ESPHome that the component provides a `binary_sensor` platform, allowing
the user to configure it under the `binary_sensor:` block:

```yaml
binary_sensor:
  - platform: my_component
    name: "My Contact"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import binary_sensor
from esphome.const import DEVICE_CLASS_DOOR

my_binary_sensor_ns = cg.esphome_ns.namespace("my_binary_sensor")
MyBinarySensor = my_binary_sensor_ns.class_("MyBinarySensor", binary_sensor.BinarySensor, cg.Component)
```

Note that `MyBinarySensor` inherits from both `binary_sensor.BinarySensor` and a component base (`cg.Component` here,
or `cg.PollingComponent` if you need to poll the hardware for a new state).

### Configuration schema

Use the `binary_sensor.binary_sensor_schema()` helper. It returns a schema pre-populated with all of the options
common to every binary sensor - `name`, `id`, `icon`, `device_class`, `entity_category`, `filters`, the
`on_press` / `on_release` / `on_click` automations, and so on - and lets you pass defaults for your device:

```python
CONFIG_SCHEMA = binary_sensor.binary_sensor_schema(
    MyBinarySensor,
    device_class=DEVICE_CLASS_DOOR,
).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyBinarySensor`) as the first argument tells the helper which class to declare the ID for, so you
do not need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `binary_sensor.new_binary_sensor()` helper. It calls `cg.new_Pvariable()` for you *and*
generates all the code to apply the common binary sensor options from the configuration:

```python
async def to_code(config):
    var = await binary_sensor.new_binary_sensor(config)
    await cg.register_component(var, config)
```

If your component owns a binary sensor as a child (rather than *being* a binary sensor), use
`await binary_sensor.register_binary_sensor(var, config)` instead, having declared the ID yourself.

## C++

The C++ class inherits from `binary_sensor::BinarySensor` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/binary_sensor/binary_sensor.h"

namespace esphome::my_binary_sensor {

class MyBinarySensor : public binary_sensor::BinarySensor, public Component {
 public:
  void setup() override;
  void loop() override;
  void dump_config() override;
};

}  // namespace esphome::my_binary_sensor
```

### Publishing values

`binary_sensor::BinarySensor` is a read-only entity: there is no command coming back from the front-end. Your only job
is to push new states out. Whenever the condition you are monitoring changes, call `publish_state()`:

```cpp
void MyBinarySensor::loop() {
  bool value = this->read_contact_();
  this->publish_state(value);
}
```

`publish_state()` takes the raw `bool` value, passes it through the user-configured filter chain (delayed on/off,
inverting, debouncing, etc.), stores the final result in the `state` member and notifies all front-ends, including
firing any `on_press` / `on_release` / `on_state` automations. Calling `publish_state()` repeatedly with the same
value is cheap: the base class skips re-dispatching if the state has not actually changed.

For the very first reading on boot, prefer `publish_initial_state()` instead of `publish_state()`. It sets the state
the same way but does not fire the state-change callbacks, which avoids spuriously triggering `on_state_change`
automations for a value the device is reporting for the first time rather than transitioning to.

### Useful members

- `state`: the most recent published (filtered) value.
- `has_state()`: whether a value has ever been published.
- `publish_state(bool)` / `publish_initial_state(bool)`: report a new state to the front-end.
- `LOG_BINARY_SENSOR(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the binary sensor's name
  and device class in the standard format.

## Exposing multiple binary sensors from one component

Hardware often maps to more than one binary sensor - a multi-channel input expander reports several contacts, and an
alarm panel hub exposes a zone contact per configured zone. There are two established ways to model this. Both are
valid and both are widely used in-tree - which one fits depends on how the hardware itself is shaped, so read the two
together and pick the one that describes your device more honestly.

### A hub plus a `type` on the platform

If your component already has a top-level hub, let the user add *one `binary_sensor:` entry per contact*,
distinguished by a `type` key, using `cv.typed_schema()` with `key=CONF_TYPE`:

```yaml
binary_sensor:
  - platform: my_hub
    type: zone_1
    name: "Zone 1"
  - platform: my_hub
    type: zone_2
    name: "Zone 2"
```

```python
_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_MY_HUB_ID): cv.use_id(MyHub)})

CONFIG_SCHEMA = cv.typed_schema(
    {
        "zone_1": binary_sensor.binary_sensor_schema(MyHubZoneBinarySensor).extend(_HUB_ID_SCHEMA),
        "zone_2": binary_sensor.binary_sensor_schema(MyHubZoneBinarySensor).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await binary_sensor.new_binary_sensor(config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

Each entry is a first-class platform entry with the full set of per-entity options, adding a new zone later is purely
additive, and different zones could use different C++ classes - see the `binary_sensor` platform of `packet_transport`
for a real, in-tree example.

### Sub-configs on a single platform entry

Many components instead nest optional sub-keys under one platform entry, each an inline
`binary_sensor.binary_sensor_schema()` called without a class argument - [`ld2410`](https://github.com/esphome/esphome/tree/dev/esphome/components/ld2410)
does this for `has_target`, `has_moving_target` and `has_still_target`. Use `SUB_BINARY_SENSOR(name)` from
`binary_sensor.h`, which generates a protected `name##_binary_sensor_` member (defaulted to `nullptr`) and a public
`set_##name##_binary_sensor()` setter. Always null-check before publishing, since the user may have configured only
some of them:

```cpp
class MyComponent final : public Component {
 public:
  SUB_BINARY_SENSOR(moving_target)
  SUB_BINARY_SENSOR(still_target)
};
// this->moving_target_binary_sensor_->publish_state(moving); once null-checked
```

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example of both patterns.

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its contacts, so let the hardware decide:

- **Sub-configs** fit when the contacts are facets of one inseparable read cycle. `ld2410` reads `has_target`,
  `has_moving_target` and `has_still_target` from a single sensor frame, so one entry with several optional sub-keys
  mirrors what the chip actually reports. This also keeps one physical device to one YAML block, which is easier to
  read.
- **A hub plus `type`** fits when the contacts are genuinely independent things that happen to share a connection. If
  a hub component already exists because the device or transport must be configured once and shared, then each
  contact being its own entry is the more natural fit - especially when the set is large or open-ended, or when
  different contacts need different C++ classes or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
