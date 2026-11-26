---
title: "GNSS"
---

The `gnss` component is a hardware abstraction base for satellite navigation receivers (GPS, Galileo, GLONASS,
BeiDou), not an [entity](/architecture/components/index). A gnss platform reads the receiver in whatever protocol it
speaks and fills a shared `GNSSData`. `gnss` hands that data to the `gnss` sensor platform and to the `gnss` time
source, so each platform gets latitude, longitude, altitude, speed, course, satellites, HDOP and time sync without
defining them again.

## Python

A gnss platform lives in a `gnss.py` file inside your component's directory, so the user configures it under the
`gnss:` block:

```yaml
gnss:
  - platform: my_receiver
    id: receiver
```

Build the schema with `gnss_schema()` and create the variable with `new_gnss()` in `to_code`. It creates the
variable and registers it as a component:

```python
import esphome.codegen as cg
from esphome.components import uart
from esphome.components.gnss import GNSSComponent, gnss_schema, new_gnss

DEPENDENCIES = ["uart"]

my_receiver_ns = cg.esphome_ns.namespace("my_receiver")
MyReceiver = my_receiver_ns.class_("MyReceiver", GNSSComponent, uart.UARTDevice)

CONFIG_SCHEMA = gnss_schema(MyReceiver).extend(uart.UART_DEVICE_SCHEMA)


async def to_code(config):
    var = await new_gnss(config)
    await uart.register_uart_device(var, config)
```

`gnss_schema()` adds `update_interval` (default `20s`), the interval on which the sensors publish.

## C++

Derive from `gnss::GNSSComponent`. Read the receiver, write each new value into `this->data_`, and call
`this->publish_fix_()` once a new solution is complete. Leave values the receiver doesn't report as they are: unset
floats are `NAN`, `satellites` and `utc` are `0`.

```cpp
class MyReceiver final : public gnss::GNSSComponent, public uart::UARTDevice {
 public:
  void loop() override;
};

void MyReceiver::loop() {
  // parse what has arrived
  if (/* a solution is complete */) {
    this->data_.latitude = lat;    // degrees, double
    this->data_.longitude = lon;   // degrees, double
    this->data_.altitude = alt;    // m above mean sea level
    this->data_.speed = speed;     // km/h
    this->data_.course = course;   // degrees from true north
    this->data_.hdop = hdop;
    this->data_.satellites = sats;
    if (/* the receiver's UTC is valid */) {
      this->data_.utc = timestamp;  // UTC seconds of the solution
      this->data_.utc_millis = millis_64();
    }
    this->publish_fix_();
  }
}
```

`GNSSComponent::update()` publishes the latest `data_` to the sensors. If your platform overrides `update()`, call
`GNSSComponent::update()` from it.

Set `utc` only when the receiver says its UTC is valid, and set `utc_millis` to `millis_64()` at the same time. The
time source corrects `utc` by the time elapsed since `utc_millis`, so it doesn't matter that the clock is set later
than the solution arrived. It ignores a `utc` older than 10 seconds, so a receiver that stops sending time leaves the
clock alone.

## Consumers

Code that needs every new solution as it arrives (the time source is one) adds a statement to the hub's
`FIX_PUBLISHER` in its `to_code`. Code that only needs the latest values on `update_interval` (the sensors) uses
`DATA_PUBLISHER`. Both are a [`cg.HubFunction`](/architecture/components/index#entities-the-hub-publishes-to) with a `const GNSSData &` parameter:

```python
from esphome.automation import parent_ref
from esphome.components.gnss import CONF_GNSS_ID, FIX, FIX_PUBLISHER


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    parent = await cg.get_variable(config[CONF_GNSS_ID])
    FIX_PUBLISHER.add(parent, parent_ref(var).on_fix(FIX))
```

`GNSSComponent::get_data()` returns the latest data at any other time.

## Moving from `gps`

The `gps` component is deprecated and will be removed in 2027.6.0. `gps::GPSListener` and its
`on_update(TinyGPSPlus &)` have no replacement in `gnss`: add a `FIX_PUBLISHER` item as shown above and read
`GNSSData` instead of TinyGPS++. A lambda that used `id(my_gps).get_tiny_gps()` can call `get_tiny_gps()` on the
`nmea` platform.
