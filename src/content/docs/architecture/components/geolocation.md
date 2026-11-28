---
title: "Geolocation"
---

The `geolocation` component is a hardware abstraction base for location sources, not an
[entity](/architecture/components/index). Today these are satellite navigation receivers (GPS, Galileo, GLONASS,
BeiDou); a modem, a fixed position or inertial navigation fit the same model. A geolocation platform reads its source
in whatever protocol it speaks and fills a shared `GeolocationData`. `geolocation` hands that data to the
`geolocation` sensor platform and to the `geolocation` time source, so each platform gets latitude, longitude,
altitude, speed, course, satellites, HDOP and time sync without defining them again.

## Python

A geolocation platform lives in a `geolocation.py` file inside your component's directory, so the user configures
it under the `geolocation:` block:

```yaml
geolocation:
  - platform: my_receiver
    id: receiver
```

Build the schema with `geolocation_schema()` and create the variable with `new_geolocation()` in `to_code`. It
creates the variable and registers it as a component:

```python
import esphome.codegen as cg
from esphome.components import uart
from esphome.components.geolocation import GeolocationComponent, geolocation_schema, new_geolocation

DEPENDENCIES = ["uart"]

my_receiver_ns = cg.esphome_ns.namespace("my_receiver")
MyReceiver = my_receiver_ns.class_("MyReceiver", GeolocationComponent, uart.UARTDevice)

CONFIG_SCHEMA = geolocation_schema(MyReceiver).extend(uart.UART_DEVICE_SCHEMA)


async def to_code(config):
    var = await new_geolocation(config)
    await uart.register_uart_device(var, config)
```

`geolocation_schema()` adds `update_interval` (default `20s`), the interval on which the sensors publish, and the
`field_age`, `millisecond` and `geoid_separation` options.

Some values cost RAM or flash that most configurations don't need, so they are compiled in only on request: call
`request_field_age()`, `request_millisecond()` or `request_geoid_separation()` from `esphome.components.geolocation`
in the `to_code` of a component that needs them, or the user turns them on with the options above. In C++ the
matching code sits behind `USE_GEOLOCATION_FIELD_AGE`, `USE_GEOLOCATION_MILLISECOND` and
`USE_GEOLOCATION_GEOID_SEPARATION`.

## C++

Derive from `geolocation::GeolocationComponent`. Read the receiver, write each new value into `this->data_`, and
call `this->publish_fix_()` once a new solution is complete. `GeolocationData` holds integers scaled by a power of
ten (a name ending in `eN` is the value times 10^N), and a `geolocation::GeolocationField` bit for each value: set it
in `updated` for each value the solution carries and in `valid` for each value that is still good. The sensors
publish `NAN` for a field without its `valid` bit.

```cpp
class MyReceiver final : public geolocation::GeolocationComponent, public uart::UARTDevice {
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
    d.updated |= geolocation::GEOLOCATION_FIELD_LOCATION | geolocation::GEOLOCATION_FIELD_ALTITUDE;
    d.satellites = sats;
    d.updated |= geolocation::GEOLOCATION_FIELD_SATELLITES;
    if (/* the receiver's UTC is valid */) {
      d.year = year;  // and month, day, hour, minute, second
#ifdef USE_GEOLOCATION_MILLISECOND
      d.millisecond = ms;
#endif
      geolocation::set_utc(d, timestamp, millis_64());  // UTC seconds of the solution
      d.updated |= geolocation::GEOLOCATION_FIELD_TIME | geolocation::GEOLOCATION_FIELD_DATE;
    }
#ifdef USE_GEOLOCATION_GEOID_SEPARATION
    d.geoid_separation_e3 = geoid_mm;  // m from the WGS84 ellipsoid up to mean sea level times 1000
    d.updated |= geolocation::GEOLOCATION_FIELD_GEOID_SEPARATION;
#endif
    d.valid |= d.updated;
    this->publish_fix_();
  }
}
```

When the receiver reports that it has no fix, either keep the last position (`nmea` does, like most receivers'
NMEA output) or clear its bits from `valid` so the sensors show no value.

`publish_fix_()` also stamps the age of each `updated` field for `get_age()`, so set `updated` before calling it.
`GeolocationComponent::update()` publishes the latest `data_` to the sensors. If your platform overrides `update()`,
call `GeolocationComponent::update()` from it.

Set `utc` with `set_utc()` only when the receiver says its UTC is valid, after the `millisecond` of the time. It sets
`utc_millis` to `millis_64()` moved back by that millisecond, and the time source corrects `utc` by the time elapsed
since `utc_millis`, so it doesn't matter that the clock is set later than the solution arrived. The time source
requests `millisecond`, so a platform that knows the fraction of the second should fill it. It ignores a `utc` older than 10 seconds, so a receiver that stops sending time leaves the
clock alone.

## Consumers

Code that needs every new solution as it arrives (the time source is one) adds a statement to the hub's
`FIX_PUBLISHER` in its `to_code`. Code that only needs the latest values on `update_interval` (the sensors) uses
`DATA_PUBLISHER`. Both are a [`cg.HubFunction`](/architecture/components/index#entities-the-hub-publishes-to) with a `const GeolocationData &` parameter:

```python
from esphome.automation import parent_ref
from esphome.components.geolocation import CONF_GEOLOCATION_ID, FIX, FIX_PUBLISHER


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    parent = await cg.get_variable(config[CONF_GEOLOCATION_ID])
    FIX_PUBLISHER.add(parent, parent_ref(var).on_fix(FIX))
```

`GeolocationComponent::get_data()` returns the latest data at any other time, and with `USE_GEOLOCATION_FIELD_AGE`,
`get_age(field)` the milliseconds since a message last set a field.

## Moving from `gps`

The `gps` component is deprecated and will be removed in 2027.6.0. `gps::GPSListener` and its
`on_update(const GPSData &)` have no replacement in `geolocation`: add a `FIX_PUBLISHER` item as shown above and
read `GeolocationData` instead. The NMEA parser that `gps` uses moved to `nmea/nmea_parser.h` and fills
`GeolocationData`; `gps` keeps `GPSData` and `GPS_FIELD_*` as aliases of `geolocation::GeolocationData` and
`geolocation::GEOLOCATION_FIELD_*` until it is removed. `gps.request_millisecond()` and
`gps.request_geoid_separation()` request the same fields from `geolocation`; use the `geolocation` ones in new code.
A lambda calls `get_data()` on the `nmea` receiver instead of `get_tiny_gps()`.
