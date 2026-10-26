---
title: "Deep sleep"
---

The `deep_sleep` component powers the device down between runs. On ESP32, ESP8266 and BK72xx, a wake from deep sleep
restarts the firmware from the beginning, so `setup()` runs again just as it does after a power cycle, a reset or an
OTA update.

Some components can do less work on a wake. For example, a chip next to the microcontroller may keep its own state
while the microcontroller sleeps, and that state can only change with new firmware, so there is nothing to check
again. Such a component can ask whether this boot is a wake from deep sleep:

```cpp
#ifdef USE_DEEP_SLEEP
#include "esphome/components/deep_sleep/deep_sleep_component.h"
#endif

void MyComponent::setup() {
#ifdef USE_DEEP_SLEEP
  if (deep_sleep::woke_from_deep_sleep()) {
    this->resume_();
    return;
  }
#endif
  this->full_init_();
}
```

Without `deep_sleep` in the configuration the device never wakes from deep sleep, so the code outside the `#ifdef`
treats every boot as a normal boot. Do not add `deep_sleep` to `DEPENDENCIES` or `AUTO_LOAD` only to use this check.

`deep_sleep::get_wakeup_cause()` returns the reason as a `WakeupCause` value: `WAKEUP_CAUSE_TIMER`,
`WAKEUP_CAUSE_GPIO`, `WAKEUP_CAUSE_TOUCH`, `WAKEUP_CAUSE_UNKNOWN`, or `WAKEUP_CAUSE_NONE` for a boot that was not a
wake. `woke_from_deep_sleep()` is the same as `get_wakeup_cause() != WAKEUP_CAUSE_NONE`. Both are available whenever
`deep_sleep` is configured, with or without an `on_wake` automation.

On nRF52 (Zephyr), a wake from System OFF is not yet told apart from a reset, so both report a normal boot. Code that
uses them must still work correctly when a wake is reported as a normal boot.
