---
title: "Time"
---

Like [display](/architecture/components/display) and [touchscreen](/architecture/components/touchscreen), `time` is
not a Home Assistant entity type - it's a hardware/utility base that provides the device's wall-clock time. A `time`
platform's only job is to figure out the current time (from an RTC chip, SNTP, Home Assistant, GPS, and so on) and
make it available to the rest of the device - via `now()`, via `on_time`/cron-style automations, or simply by other
components calling `id(my_time).now()`.

Like the entity types, `time` is a *platform* base: individual components (for example `sntp`, `ds1307` or
`homeassistant.time`) register a real-time clock and implement the code that actually obtains the time.

## Python

A time platform lives in a `time.py` file (or a `time/__init__.py` package) inside your component's directory,
allowing the user to configure it under the top-level `time:` block:

```yaml
time:
  - platform: my_component
    timezone: "Australia/Sydney"
    on_time:
      - seconds: 0
        minutes: 0
        hours: 0
        then:
          - logger.log: "It's midnight!"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import time as time_

my_time_ns = cg.esphome_ns.namespace("my_time")
MyTime = my_time_ns.class_("MyTime", time_.RealTimeClock)
```

`time_.RealTimeClock` already inherits `cg.PollingComponent`, so no separate component base is needed. The component
is imported as `time_` to avoid shadowing Python's own `time` module.

### Configuration schema

Extend the shared `time_.TIME_SCHEMA`, which provides the `timezone` option and the `on_time` / `on_time_sync`
automations, together with `update_interval` (defaulting to 15 minutes) via `cv.polling_component_schema`:

```python
CONFIG_SCHEMA = time_.TIME_SCHEMA.extend(
    {
        cv.GenerateID(): cv.declare_id(MyTime),
    }
)
```

As with the display and touchscreen schema helpers, `TIME_SCHEMA` doesn't take your class as an argument, so you
supply your own `cv.GenerateID()`.

### Code generation

In `to_code`, register the platform with `time_.register_time()`. Unlike `sensor.new_sensor()` or
`display.register_display()`, this does *not* call `cg.register_component()` for you - you must do that yourself -
but it does generate the code for `timezone` and the `on_time`/`on_time_sync` automations:

```python
async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await time_.register_time(var, config)
```

## C++

The C++ class inherits from `time::RealTimeClock`:

```cpp
#include "esphome/components/time/real_time_clock.h"

namespace esphome::my_time {

class MyTime : public time::RealTimeClock {
 public:
  void update() override;
};

}  // namespace esphome::my_time
```

### Reporting the time

Whenever you obtain a fresh reading of the current time - from an RTC register read, an SNTP callback, an API
message from Home Assistant, etc. - call the protected `synchronize_epoch_(epoch)` with the Unix epoch (UTC
seconds since 1970-01-01):

```cpp
void MyTime::update() {
  uint32_t epoch = this->read_epoch_from_hardware_();
  this->synchronize_epoch_(epoch);
}
```

`synchronize_epoch_()` sets the device's system clock (skipping the write if it's already within a second of the
given value, to avoid clock jitter and log spam) and fires the `on_time_sync` trigger/`add_on_time_sync_callback()`
listeners. You never need to apply the user's `timezone:` yourself - the base class parses and applies it during
setup, and every other component that reads the time goes through `RealTimeClock::now()`, which already returns
timezone-local values.

Not every platform needs to override `update()` at all: some (like `sntp`, which delegates to the underlying OS's
own SNTP client) only need `setup()` to kick off the sync mechanism, and call `synchronize_epoch_()`/rely on the
system clock being set for them elsewhere.

### Clock chips that store the time in BCD

Most clock chips keep each field of the time as packed BCD: two decimal digits in one byte, the tens in the high four
bits, so 59 seconds is stored as `0x59`. Convert single bytes with `bcd_to_uint8()` and `uint8_to_bcd()` from
`esphome/core/helpers.h` rather than writing your own:

```cpp
bcd_to_uint8(0x59);  // 59
uint8_to_bcd(59);    // 0x59, for values from 0 to 99
```

Most clock chips keep the whole calendar in seven consecutive bytes: second, minute, hour, the weekday and the day
of the month, the month and the year since 2000. `time::decode_bcd_calendar<LAYOUT>()` and
`time::encode_bcd_calendar<LAYOUT>()` from `real_time_clock.h` convert the whole block at once; the layout names the
details that differ between chip families:

| Layout               | Weekday byte              | Byte order        | Month bit 7   | Hour byte              | Chips                     |
| -------------------- | ------------------------- | ----------------- | ------------- | ---------------------- | ------------------------- |
| `EPSON_BCD_CALENDAR` | one bit per day, Sunday 0 | weekday, then day | ignored       | 24-hour                | RX8025T, RX8111, RX8130   |
| `DS_BCD_CALENDAR`    | 1 to 7, Sunday 1          | weekday, then day | set from 2100 | 12-hour flag honoured  | DS1307, DS3231            |
| `PCF_BCD_CALENDAR`   | 0 to 6, Sunday 0          | day, then weekday | ignored       | 24-hour                | PCF8563, PCF85063, BM8563 |

Pick the layout whose datasheet matches, or add one to `real_time_clock.h` when a chip differs; each layout compiles
to one decode and one encode function shared by every driver that uses it. `rx8025t` reads and writes its clock like
this:

```cpp
uint8_t date[7];
if (!this->read_bytes(RX8025T_REG_SEC, date, sizeof(date)))
  return;
ESPTime rtc_time = time::decode_bcd_calendar<time::EPSON_BCD_CALENDAR>(date);
if (!rtc_time.is_valid(/*check_day_of_week=*/true, /*check_day_of_year=*/false))
  return;
this->synchronize_epoch_(rtc_time.timestamp);
```

```cpp
auto now = this->utcnow();
if (!now.is_valid())
  return;
uint8_t buff[7];
time::encode_bcd_calendar<time::EPSON_BCD_CALENDAR>(now, buff);
this->write_bytes(RX8025T_REG_SEC, buff, sizeof(buff));
```

Decoding drops the bits each byte does not use for the value, such as a chip's flag bits, and fills in `timestamp`
as UTC. It does not work out the day of the year, so check the result with `check_day_of_year=false` as shown.
Encoding always writes 24-hour mode. Only encode a valid time, with a year from 2000 to 2099 unless the layout has a
century bit.

### Useful members

- `now()`: the current time in the configured timezone, as an `ESPTime` (year/month/day/hour/minute/second plus
  day-of-week/day-of-year and an `is_valid()` check).
- `utcnow()`: the current time with no timezone/DST correction applied.
- `timestamp_now()`: the raw Unix epoch (`time_t`) - what you'd pass back into `synchronize_epoch_()`.
- `add_on_time_sync_callback(F &&)`: register a callback to run whenever this clock successfully synchronizes -
  useful for components that need to defer work until real time is available.

Other components read the current time by depending on `time` and calling `now()` on the configured `time_id`, most
commonly through the [`time.has_time` condition](https://esphome.io/components/time/#time-has-time-condition) or an
`on_time` automation, rather than polling a platform directly.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
