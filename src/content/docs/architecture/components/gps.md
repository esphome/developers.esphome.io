---
title: "Reading position and time from gps"
---

`gps` parses GGA and RMC sentences from an NMEA receiver on a UART. A component that needs the position, speed or time
can read the latest values with `get_data()`, or be called after each sentence as a `gps::GPSListener`. The `gps`
time platform in `esphome/components/gps/time` is a small example.

Take the `gps` by ID and register the component as a listener:

```python
import esphome.codegen as cg
from esphome.components import gps
import esphome.config_validation as cv
from esphome.const import CONF_ID

my_tracker_ns = cg.esphome_ns.namespace("my_tracker")
MyTracker = my_tracker_ns.class_("MyTracker", cg.Component, gps.GPSListener)

CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(MyTracker),
        cv.GenerateID(gps.CONF_GPS_ID): cv.use_id(gps.GPS),
    }
).extend(cv.COMPONENT_SCHEMA)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    hub = await cg.get_variable(config[gps.CONF_GPS_ID])
    await gps.register_listener(hub, var)
```

Add `"gps"` to `DEPENDENCIES`. A component that only reads `get_data()` does not need to be a listener; it can keep
the `gps::GPS *` from `cg.get_variable()` instead.

## Reading data

`on_update()` is called from the `gps` component's `loop()` after each GGA or RMC sentence that
`parse_nmea_sentence()` accepts. `data.updated` has the `GPSField` bits that sentence set, and `data.valid` has every
bit set by any sentence so far:

```cpp
class MyTracker : public Component, public gps::GPSListener {
 public:
  void on_update(const gps::GPSData &data) override {
    if (!data.is_updated(gps::GPS_FIELD_LOCATION))
      return;
    ESP_LOGD(TAG, "%.7f, %.7f", data.latitude(), data.longitude());
  }
};
```

`get_data()` returns the same `GPSData` at any time, from the listener or from the `gps::GPS` object.

Values are stored as integers scaled by a power of ten: a name ending in `eN` is the value times 10^N. The scaled
integers keep the full precision of the receiver; methods such as `latitude()`, `altitude()` and `speed_kmh()` convert
them to `float`. `speed_e3` is in knots. Date and time are UTC.

| Bit                          | Fields                                            | From         |
| ---------------------------- | ------------------------------------------------- | ------------ |
| `GPS_FIELD_LOCATION`         | `latitude_e7`, `longitude_e7`                     | GGA, RMC     |
| `GPS_FIELD_SPEED`            | `speed_e3`                                        | RMC          |
| `GPS_FIELD_COURSE`           | `course_e2`                                       | RMC          |
| `GPS_FIELD_ALTITUDE`         | `altitude_e3`                                     | GGA          |
| `GPS_FIELD_SATELLITES`       | `satellites`                                      | GGA          |
| `GPS_FIELD_HDOP`             | `hdop_e2`                                         | GGA          |
| `GPS_FIELD_TIME`             | `hour`, `minute`, `second`, `millisecond`         | GGA, RMC     |
| `GPS_FIELD_DATE`             | `year`, `month`, `day`                            | RMC          |
| `GPS_FIELD_GEOID_SEPARATION` | `geoid_separation_e3`                             | GGA          |

The satellite count and HDOP are taken from every GGA sentence, and other values only from a sentence that reports a
fix. A field keeps its last value and its `valid` bit when the fix is lost, so `has()` alone does not say that a
position is current.

## Optional fields

Three features are off unless a configuration or a component asks for them, so a `gps` without them has no extra RAM
or code. A component turns one on by calling its request function from `to_code()`:

```python
async def to_code(config):
    ...
    gps.request_field_age()
    gps.request_millisecond()
    gps.request_geoid_separation()
```

| Request function             | Define                     | Adds                                                     |
| ---------------------------- | -------------------------- | -------------------------------------------------------- |
| `request_field_age()`        | `USE_GPS_FIELD_AGE`        | `get_age()` on `gps::GPS` and `gps::GPSListener`         |
| `request_millisecond()`      | `USE_GPS_MILLISECOND`      | `GPSData::millisecond`                                   |
| `request_geoid_separation()` | `USE_GPS_GEOID_SEPARATION` | `GPSData::geoid_separation_e3` and `geoid_separation()`  |

The same features are turned on by the `field_age`, `millisecond` and `geoid_separation` options of `gps`, for use in
lambdas. Code that uses a field must be inside `#ifdef` of its define unless the component always requests it.

`get_age(field)` gives the milliseconds since a sentence last set one field, or `UINT32_MAX` if none has. An age stops
growing at 2^31 ms, about 24.8 days. Use it to drop a stale position:

```cpp
void MyTracker::loop() {
  if (this->get_age(gps::GPS_FIELD_LOCATION) > 3000)
    return;  // no fix in the last 3 s
  const auto &data = this->get_data();
  ...
}
```

`millisecond` is the fraction of the time, with digits past milliseconds dropped. It is 0 when the receiver sends whole
seconds, which many do.

`geoid_separation_e3` is the height of mean sea level above the WGS84 ellipsoid, negative where sea level is below
it, from GGA field 11. Add it to `altitude_e3` for the height above the ellipsoid. Some receivers leave the field empty,
and then `GPS_FIELD_GEOID_SEPARATION` is never set.

## Parsing without a UART

`parse_nmea_sentence()` in `nmea.h` parses one line into a `GPSData`, for a component that gets NMEA by another route.
It returns `false` and leaves the data unchanged for a sentence that is not GGA or RMC, has a bad checksum, or has a
malformed value in a field it reads. The line is changed in place.
