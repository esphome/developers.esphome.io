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
