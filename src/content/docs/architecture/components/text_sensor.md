---
title: "Text Sensor"
---

The `text_sensor` component is one of ESPHome's core [entity](/architecture/components/index) types. A text sensor
represents a single string-valued measurement - a firmware version, an IP address, the currently playing track, and
so on - which is published to the front-end (Home Assistant, the web server, MQTT, etc.) as a string value. It is the
string-valued analogue of [sensor](/architecture/components/sensor): where `sensor` publishes a `float`, `text_sensor`
publishes an `std::string`.

Rather than being used on its own, `text_sensor` is a *platform* base: individual components (for example `version`,
`wifi_info` or `mqtt_subscribe`) register one or more text sensors and periodically push new values into them. If you
are writing a component that produces a textual reading, you will almost always expose that reading as a text sensor.

We have an [example, minimal text sensor component](https://github.com/esphome/starter-components/tree/main/components/empty_text_sensor)
which is a good starting point.

## Python

A text sensor platform lives in a `text_sensor.py` file (or a `text_sensor/__init__.py` package) inside your
component's directory. This file name tells ESPHome that the component provides a `text_sensor` platform, allowing
the user to configure it under the `text_sensor:` block:

```yaml
text_sensor:
  - platform: my_component
    name: "My Text Value"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import text_sensor

my_text_sensor_ns = cg.esphome_ns.namespace("my_text_sensor")
MyTextSensor = my_text_sensor_ns.class_("MyTextSensor", text_sensor.TextSensor, cg.Component)
```

Note that `MyTextSensor` inherits from both `text_sensor.TextSensor` and a component base (`cg.Component` here, or
`cg.PollingComponent` if you need to poll for a new value).

### Configuration schema

Use the `text_sensor.text_sensor_schema()` helper. It returns a schema pre-populated with all of the options common
to every text sensor - `name`, `id`, `icon`, `device_class`, `entity_category`, `filters` and so on - and lets you
pass defaults for your specific device:

```python
CONFIG_SCHEMA = text_sensor.text_sensor_schema(MyTextSensor).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyTextSensor`) as the first argument tells the helper which class to declare the ID for, so you
do not need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `text_sensor.new_text_sensor()` helper. It calls `cg.new_Pvariable()` for you *and* generates
all the code to apply the common text sensor options (name, filters, etc.) from the configuration:

```python
async def to_code(config):
    var = await text_sensor.new_text_sensor(config)
    await cg.register_component(var, config)
```

If your component owns a text sensor as a child (rather than *being* a text sensor), use
`await text_sensor.register_text_sensor(var, config)` instead, having declared the ID yourself.

## C++

The C++ class inherits from `text_sensor::TextSensor` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/text_sensor/text_sensor.h"

namespace esphome::my_text_sensor {

class MyTextSensor : public text_sensor::TextSensor, public PollingComponent {
 public:
  void update() override;
  void dump_config() override;
};

}  // namespace esphome::my_text_sensor
```

### Publishing values

`text_sensor::TextSensor` is a read-only entity: there is no command coming back from the front-end. Your only job is
to push new values out. Whenever you have a new reading, call `publish_state()`:

```cpp
void MyTextSensor::update() {
  std::string value = this->read_value_();
  this->publish_state(value);
}
```

`publish_state()` accepts an `std::string`, a `const char *`, or a `const char *` plus length. It passes the value
through the user-configured [filter chain](https://esphome.io/components/text_sensor/#text-sensor-filters)
(uppercasing, substitution, mapping, etc.), stores the final result in the `state` member and notifies all
front-ends. Publish the raw, unfiltered value - the filters the user configured in YAML are applied for you.

### Useful members

- `state`: the most recent published (filtered) value.
- `get_state()`: getter-syntax accessor for `state`.
- `get_raw_state()`: the pre-filter value, when a filter chain is configured.
- `LOG_TEXT_SENSOR(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the text sensor's name in
  the standard format.

## Exposing multiple text sensors from one component

Hardware often maps to more than one text sensor - a device hub might expose a firmware version, a serial number and
a current-status string, all read from the same connection. There are two established ways to model this. Both are
valid and both are widely used in-tree - which one fits depends on how the hardware itself is shaped, so read the two
together and pick the one that describes your device more honestly.

### A hub plus a `type` on the platform

If your component already has a top-level hub, let the user add *one `text_sensor:` entry per string*, distinguished
by a `type` key, using `cv.typed_schema()` with `key=CONF_TYPE`:

```yaml
text_sensor:
  - platform: my_hub
    type: firmware_version
    name: "Firmware Version"
  - platform: my_hub
    type: serial_number
    name: "Serial Number"
```

```python
_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_MY_HUB_ID): cv.use_id(MyHub)})

CONFIG_SCHEMA = cv.typed_schema(
    {
        "firmware_version": text_sensor.text_sensor_schema(MyHubFirmwareVersionTextSensor).extend(_HUB_ID_SCHEMA),
        "serial_number": text_sensor.text_sensor_schema(MyHubSerialNumberTextSensor).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await text_sensor.new_text_sensor(config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

Each entry is a first-class platform entry with the full set of per-entity options, adding a new string later is
purely additive, and different strings could use different C++ classes.

### Sub-configs on a single platform entry

Many components instead nest optional sub-keys under one platform entry, each an inline
`text_sensor.text_sensor_schema()` called without a class argument - [`pylontech`](https://github.com/esphome/esphome/tree/dev/esphome/components/pylontech)
does exactly this for its `base_state`, `voltage_state`, `current_state` and `temperature_state` strings, all read
from the same battery. Use `SUB_TEXT_SENSOR(name)` from `text_sensor.h`, which generates a protected
`name##_text_sensor_` member (defaulted to `nullptr`) and a public `set_##name##_text_sensor()` setter. Always
null-check before publishing, since the user may have configured only some of them:

```cpp
class MyComponent final : public Component {
 public:
  SUB_TEXT_SENSOR(firmware_version)
  SUB_TEXT_SENSOR(serial_number)
};
// this->firmware_version_text_sensor_->publish_state(version); once null-checked
```

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example of both patterns.

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its strings, so let the hardware decide:

- **Sub-configs** fit when the strings are facets of one inseparable read cycle. `pylontech` reads `base_state`,
  `voltage_state`, `current_state` and `temperature_state` from a single battery poll, so one entry with several
  optional sub-keys mirrors what the device actually reports. This also keeps one physical device to one YAML block,
  which is easier to read.
- **A hub plus `type`** fits when the strings are genuinely independent things that happen to share a connection. If
  a hub component already exists because the device or transport must be configured once and shared, then each
  string being its own entry is the more natural fit - especially when the set is large or open-ended, or when
  different strings need different C++ classes or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
