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
`this->publish_fix_()` once a new solution is complete. `GNSSData` holds integers scaled by a power of ten (a name
ending in `eN` is the value times 10^N), and a `gnss::GNSSField` bit for each value: set it in `updated` for each
value the solution carries and in `valid` for each value that is still good. The sensors publish `NAN` for a field
without its `valid` bit.

```cpp
class MyReceiver final : public gnss::GNSSComponent, public uart::UARTDevice {
 public:
  void loop() override;
};

void MyReceiver::loop() {
  // parse what has arrived
  if (/* a solution is complete */) {
    auto &d = this->data_;
    d.updated = 0;
    d.latitude_e7 = lat_e7;    // degrees times 10^7, north positive
    d.longitude_e7 = lon_e7;   // degrees times 10^7, east positive
    d.altitude_e3 = alt_mm;    // m above mean sea level times 1000
    d.updated |= gnss::GNSS_FIELD_LOCATION | gnss::GNSS_FIELD_ALTITUDE;
    d.satellites = sats;
    d.updated |= gnss::GNSS_FIELD_SATELLITES;
    if (/* the receiver's UTC is valid */) {
      d.year = year;  // and month, day, hour, minute, second
      d.utc = timestamp;  // UTC seconds of the solution
      d.utc_millis = millis_64();
      d.updated |= gnss::GNSS_FIELD_TIME | gnss::GNSS_FIELD_DATE;
    }
    d.valid |= d.updated;
    this->publish_fix_();
  }
}
```

When the receiver reports that it has no fix, either keep the last position (`nmea` does, like most receivers'
NMEA output) or clear its bits from `valid` so the sensors show no value.

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
`on_update(const GPSData &)` have no replacement in `gnss`: add a `FIX_PUBLISHER` item as shown above and read
`GNSSData` instead. The NMEA parser that `gps` uses moved to `nmea/nmea_parser.h` and fills `GNSSData`; `gps` keeps
`GPSData` and `GPS_FIELD_*` as aliases of `gnss::GNSSData` and `gnss::GNSS_FIELD_*` until it is removed. A lambda
calls `get_data()` on the `nmea` receiver instead of `get_tiny_gps()`.
