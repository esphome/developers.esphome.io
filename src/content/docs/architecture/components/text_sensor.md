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

A parser that reads optional values, such as a BLE advertisement parser, can publish them with
[`publish_optional()`](/architecture/components/sensor#publishing-optional-readings), which skips an unset value or an
unconfigured entity.

### Useful members

- `state`: the most recent published (filtered) value.
- `get_state()`: getter-syntax accessor for `state`.
- `get_raw_state()`: the pre-filter value, when a filter chain is configured.
- `LOG_TEXT_SENSOR(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the text sensor's name in
  the standard format.

## Filters that keep state

The [filters](https://esphome.io/components/text_sensor/#text-sensor-filters) of a text sensor are `Filter` objects
(`esphome/components/text_sensor/filter.h`), linked into a chain. `initialize(parent, next)` puts a filter in its state
before the first value. It can be called more than once, so a filter that remembers something between values, such as
the time of the last value the `throttle` filter let through, or the pending timer of the `timeout` filter, clears that
state there:

```cpp
class MyThrottleFilter : public text_sensor::Filter {
 public:
  bool new_value(std::string &value) override;
  void initialize(text_sensor::TextSensor *parent, text_sensor::Filter *next) override {
    Filter::initialize(parent, next);
    this->last_input_ = 0;
  }

 protected:
  uint32_t last_input_{0};
};
```

A filter without state needs no override. A filter that cannot be reset, such as a lambda that uses a global variable,
keeps its state.

`reset_chain()` calls `initialize()` again on a filter and on every filter after it, so calling it on the first filter
of a sensor puts the whole chain back in its state at boot.

### Taking the filters out of use

A component can take the filter chain of one of its own text sensors out of use at run time, for example to publish
every value for a while, and put it back later. Do not use `filter_list_` or `raw_state_` for that; use
`detach_filters()` and `attach_filters()`:

```cpp
// Values published from now on skip the filters
text_sensor::Filter *filters = sensor->detach_filters();
// ... later: the filters are back, in their state at boot
sensor->attach_filters(filters);
```

- `detach_filters()` resets the chain, so a timeout that was running cannot publish an old value afterwards. It sends
  a value the filters were holding back, and returns the chain, or `nullptr` if the sensor has none. Keep the returned
  pointer, and give it to `attach_filters()`. Calling it again while detached returns `nullptr`.
- `attach_filters()` puts the chain back and runs the current state through it, so filters such as a `map` apply to
  a value that was published while detached. It does not call the raw state callbacks again.

Do not call `detach_filters()` from the sensor's own raw state callback, because publishing still uses the filters
after the callback returns. Defer the call instead.

These and `reset_chain()` are compiled only when a component asks for them, so call `request_filter_reset()` from its
`to_code`:

```python
from esphome.components import text_sensor


async def to_code(config):
    ...
    text_sensor.request_filter_reset()
```

The [`ld2450`](https://github.com/esphome/esphome/tree/dev/esphome/components/ld2450) `xy_unfiltered` button does this.

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

In `to_code`, create each configured text sensor and pass it to its setter with `text_sensor.sub_text_sensors()`:

```python
text_sensors = text_sensor.sub_text_sensors(config)
await text_sensors(CONF_FIRMWARE_VERSION, var.set_firmware_version_text_sensor)
await text_sensors(CONF_SERIAL_NUMBER, var.set_serial_number_text_sensor)
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

## Following another entity

A text sensor that only republishes another entity's string needs no C++ class: create a plain
`text_sensor::TextSensor` and call `text_sensor.follow_text_sensor(entity, source)`. It works with any source whose
state callback takes a `const std::string &`, such as a `text::Text`. See
[following another entity](/architecture/components/sensor#following-another-entity) for how it works and for
`FollowEntity`.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
