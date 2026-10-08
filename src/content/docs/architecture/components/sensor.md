---
title: "Sensor"
---

The `sensor` component is one of ESPHome's core [entity](/architecture/components/index) types. A sensor represents a
single numeric measurement - a temperature, a voltage, a humidity reading, and so on - which is published to the
front-end (Home Assistant, the web server, MQTT, etc.) as a floating point value.

Rather than being used on its own, `sensor` is a *platform* base: individual components (for example `dht`, `adc` or
`bmp280`) register one or more sensors and periodically push new values into them. If you are writing a component that
measures something, you will almost always expose that measurement as a sensor.

We have an [example, minimal sensor component](https://github.com/esphome/starter-components/tree/main/components/empty_sensor)
which is a good starting point.

## Python

A sensor platform lives in a `sensor.py` file (or a `sensor/__init__.py` package) inside your component's directory. This
file name tells ESPHome that the component provides a `sensor` platform, allowing the user to configure it under the
`sensor:` block:

```yaml
sensor:
  - platform: my_component
    name: "My Measurement"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import sensor
from esphome.const import UNIT_CELSIUS, ICON_THERMOMETER, DEVICE_CLASS_TEMPERATURE

my_sensor_ns = cg.esphome_ns.namespace("my_sensor")
MySensor = my_sensor_ns.class_("MySensor", cg.PollingComponent, sensor.Sensor)
```

Note that `MySensor` inherits from both a component base (`cg.PollingComponent` here, since a sensor is usually polled)
and `sensor.Sensor`.

### Configuration schema

Instead of building the schema from scratch, use the `sensor.sensor_schema()` helper. It returns a schema pre-populated
with all of the options common to every sensor - `name`, `id`, `filters`, `accuracy_decimals`, `unit_of_measurement`,
`device_class`, `state_class`, `entity_category` and so on - and lets you supply sensible defaults for your specific
device:

```python
CONFIG_SCHEMA = sensor.sensor_schema(
    MySensor,
    unit_of_measurement=UNIT_CELSIUS,
    icon=ICON_THERMOMETER,
    accuracy_decimals=1,
    device_class=DEVICE_CLASS_TEMPERATURE,
    state_class=sensor.StateClass.MEASUREMENT,
).extend(cv.polling_component_schema("60s"))
```

Passing your class (`MySensor`) as the first argument tells the helper which class to declare the ID for, so you do not
need a separate `cv.GenerateID()`. The `.extend(cv.polling_component_schema("60s"))` call adds the `update_interval`
option with a default of 60 seconds.

### Code generation

In `to_code`, use the `sensor.new_sensor()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code
to apply the common sensor options (name, unit, filters, etc.) from the configuration:

```python
async def to_code(config):
    var = await sensor.new_sensor(config)
    await cg.register_component(var, config)
```

If your component owns a sensor as a child (rather than *being* a sensor), use `await sensor.register_sensor(var, config)`
instead, having declared the ID yourself.

## C++

The C++ class inherits from `sensor::Sensor` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/sensor/sensor.h"

namespace esphome::my_sensor {

class MySensor : public sensor::Sensor, public PollingComponent {
 public:
  void update() override;
  void dump_config() override;
};

}  // namespace esphome::my_sensor
```

### Publishing values

`sensor::Sensor` is a read-only entity: there is no command coming back from the front-end. Your only job is to push
new measurements out. Whenever you have a new reading, call `publish_state()`:

```cpp
void MySensor::update() {
  float value = this->read_measurement_();
  this->publish_state(value);
}
```

`publish_state()` takes the raw `float` value, passes it through the user-configured [filter chain](https://esphome.io/components/sensor/#sensor-filters)
(offsets, moving averages, calibration, etc.), stores the final result in the `state` member and notifies all
front-ends. Publish the raw, unfiltered value - the filters the user configured in YAML are applied for you.

To publish an "unknown"/unavailable state, publish `NAN` (`quiet_NaN`).

### Useful members

- `state`: the most recent published (filtered) value.
- `has_state()`: whether a value has ever been published.
- `get_accuracy_decimals()` / `get_unit_of_measurement()` / `get_device_class()`: the metadata configured by the user or
  by your schema defaults.
- `LOG_SENSOR(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the sensor's name, unit, accuracy
  and device class in the standard format.

## Exposing multiple sensors from one component

Hardware rarely maps to exactly one sensor. A DHT22 reports temperature *and* humidity; a power meter reports voltage,
current and power; a BLE device may expose a dozen readings. There are two established ways to model this. Both are
valid and both are widely used in-tree - which one fits depends on how the hardware itself is shaped, so read the two
together and pick the one that describes your device more honestly.

### A hub plus a `type` on the platform

If your component already has a top-level hub component - something the user configures once to describe the device or
connection - you can let the user add *one `sensor:` entry per reading*, distinguished by a `type` key. Use
`cv.typed_schema()` with `key=CONF_TYPE`:

```yaml
# The hub: configured once.
my_hub:
  id: the_hub

sensor:
  - platform: my_hub
    type: voltage
    name: "Voltage"
  - platform: my_hub
    type: current
    name: "Current"
    filters:
      - throttle: 10s
```

Each `type` gets its own schema, so each can declare its own unit, accuracy, device class and even its own C++ class
and component base:

```python
from esphome.const import CONF_TYPE

from .. import CONF_MY_HUB_ID, MyHub, my_hub_ns

DEPENDENCIES = ["my_hub"]

_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_MY_HUB_ID): cv.use_id(MyHub)})

CONFIG_SCHEMA = cv.typed_schema(
    {
        "voltage": sensor.sensor_schema(
            MyHubVoltageSensor,
            unit_of_measurement=UNIT_VOLT,
            accuracy_decimals=2,
            device_class=DEVICE_CLASS_VOLTAGE,
            state_class=STATE_CLASS_MEASUREMENT,
        ).extend(_HUB_ID_SCHEMA),
        "current": sensor.sensor_schema(
            MyHubCurrentSensor,
            unit_of_measurement=UNIT_AMPERE,
            accuracy_decimals=2,
            device_class=DEVICE_CLASS_CURRENT,
            state_class=STATE_CLASS_MEASUREMENT,
        ).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)


async def to_code(config):
    var = await sensor.new_sensor(config)
    await cg.register_component(var, config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

`cg.register_parented()` gives each sensor a `parent_` pointer back to the hub, so the hub can push readings into it (or
the sensor can pull from the hub). See the `sensor` platform of the `sendspin` component for a real, in-tree example of
this pattern.

What this shape gives you:

- Each sensor is a first-class platform entry, so it picks up the full set of per-entity options naturally.
- Adding a new reading later is purely additive - one more key in the `typed_schema` - with no reshaping of the existing
  schema and no change to existing user configurations.
- Different readings can use different C++ classes and component bases (for example one polled at an interval, another
  updated only when an event arrives).

### Sub-configs on a single platform entry

Many existing components instead expose all of their readings as optional *sub-configs* nested under one platform entry.
[`dht`](https://github.com/esphome/esphome/tree/dev/esphome/components/dht) is the simplest example:

```yaml
sensor:
  - platform: dht
    pin: GPIO22
    temperature:
      name: "Living Room Temperature"
    humidity:
      name: "Living Room Humidity"
```

Here the *component* is the platform entry, and each reading is an optional key whose value is an inline
`sensor.sensor_schema()`. Note that `sensor_schema()` is called without a class argument, so each sub-config declares a
plain `sensor::Sensor`:

```python
CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(DHT),
        cv.Required(CONF_PIN): pins.internal_gpio_input_pullup_pin_schema,
        cv.Optional(CONF_TEMPERATURE): sensor.sensor_schema(
            unit_of_measurement=UNIT_CELSIUS,
            accuracy_decimals=1,
            device_class=DEVICE_CLASS_TEMPERATURE,
            state_class=STATE_CLASS_MEASUREMENT,
        ),
        cv.Optional(CONF_HUMIDITY): sensor.sensor_schema(...),
    }
).extend(cv.polling_component_schema("60s"))


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    if temperature_config := config.get(CONF_TEMPERATURE):
        sens = await sensor.new_sensor(temperature_config)
        cg.add(var.set_temperature_sensor(sens))
```

On the C++ side, your component holds a pointer per reading and publishes to whichever ones the user configured. Rather
than writing those members and setters out by hand, use the `SUB_SENSOR(name)` macro from `sensor.h`, which generates a
protected `name##_sensor_` member (defaulted to `nullptr`) and a public `set_##name##_sensor()` setter:

```cpp
class MyComponent final : public PollingComponent {
 public:
  SUB_SENSOR(temperature)
  SUB_SENSOR(humidity)

  void update() override;
};

void MyComponent::update() {
  // Always null-check: the user may have configured only one of them.
  if (this->temperature_sensor_ != nullptr) {
    this->temperature_sensor_->publish_state(this->read_temperature_());
  }
  if (this->humidity_sensor_ != nullptr) {
    this->humidity_sensor_->publish_state(this->read_humidity_());
  }
}
```

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device and
its readings, so let the hardware decide:

- **Sub-configs** fit when the readings are facets of one inseparable measurement cycle. `dht` reads temperature and
  humidity from a single bus transaction, so a single entry with two optional sub-keys mirrors what the chip actually
  does. This also keeps one physical device to one YAML block, which is easier to read.
- **A hub plus `type`** fits when the readings are genuinely independent things that happen to share a connection. If a
  hub component already exists because the device or transport must be configured once and shared, then each reading
  being its own entry is the more natural fit - especially when the set is large or open-ended, or when different
  readings need different C++ classes, polling intervals or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses. In a
new component with no hub, sub-configs are usually the smaller change.

Equivalent `SUB_*` macros exist for the other entity types that are commonly exposed this way:
`SUB_BINARY_SENSOR`, `SUB_BUTTON`, `SUB_NUMBER`, `SUB_SELECT`, `SUB_SWITCH` and `SUB_TEXT_SENSOR`.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
