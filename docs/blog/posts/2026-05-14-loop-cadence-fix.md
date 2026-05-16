---
date: 2026-05-14
authors:
  - bdraco
comments: true
---

# Main Loop Cadence Decoupled from Scheduler Wake Timing

Every component's `loop()` now runs at the configured `loop_interval_` (default ~62 Hz) instead of being pulled forward to ~128 Hz by unrelated scheduler activity. Background events (MQTT RX, USB RX, BLE, ESPNOW, camera, mWW, speaker, USB host/CDC, lwip socket) still wake their component within one tick via the existing `wake_loop_*` paths. `App.set_loop_interval()` — the documented knob for power savings — finally works.

This is a **behavior change** in **ESPHome 2026.5.0 and later** with no API break, but it affects every external component whose `loop()` implicitly depended on running at ~2× the configured rate.

<!-- more -->

## Background

**[PR #15792](https://github.com/esphome/esphome/pull/15792): decouple main loop cadence from scheduler wake timing**

### What was happening

Sampling runtime stats over 60 s on a typical ESP32 IDF config (api + esp32_ble + esp32_ble_tracker + bluetooth_proxy + debug + a couple of sensors) at the default `loop_interval_ = 16 ms`:

| Component | Before | After | What's counted |
|---|---|---|---|
| `api` | 7650 / 60 s ≈ **128 Hz** | 3720 / 60 s ≈ **62 Hz** | `loop()` calls |
| `esp32_ble` | 7650 ≈ **128 Hz** | 3720 ≈ **62 Hz** | `loop()` calls |
| `esp32_ble_tracker` | 7650 ≈ **128 Hz** | 3720 ≈ **62 Hz** | `loop()` calls |
| `debug` | 7651 ≈ **128 Hz** | 3720 ≈ **62 Hz** | `loop()` calls |
| `bluetooth_proxy` | 589 ≈ 10 Hz | 599 ≈ 10 Hz | 100 ms `set_interval` (unaffected) |

Every component with a real `loop()` was running at **~2× the configured `loop_interval_`**. 62 Hz is what the documentation has always promised; the 128 Hz was emergent behavior.

### Why it happened

`Application::loop()` bounded its sleep by `min(loop_interval_ − elapsed, next_schedule_in())` with a `delay_time / 2` floor. If the scheduler had any entry due sooner than `loop_interval_ / 2`, the loop slept for `loop_interval_ / 2` and ran the **entire component phase** again — every component's `loop()` got pulled forward by whatever else happened to be scheduling work. The effect was config-dependent and non-local: adding one scheduled item anywhere silently shifted every other component's cadence.

Two recent trends made this bite harder: (1) more components are `PollingComponent`s, each of which is a `set_interval` under the hood; (2) more components use `set_interval` / `set_timeout` directly for retries, debouncing, animations, and protocol timing. `App.set_loop_interval()` — the documented knob for power savings — was silently defeated by the same coupling.

Removing the floor is safe now because **`wake_loop_threadsafe()` is accessible everywhere as of 2026.4.0** (see the [2026.4.0 wake_loop blog post](2026-04-09-wake-loop-moved-to-core.md)). Any component that needs to wake the loop sooner than `loop_interval_` has a proper way to do it without the floor papering over missing wake-ups.

## What's Changing

`Application::loop()` is restructured into two independent phases:

- **Phase A (every tick):** drain wake notifications, run `scheduler.call()`, feed the watchdog.
- **Phase B (gated):** iterate registered components. Runs when **any** of these is true:
    - `loop_interval_` has elapsed since the last component phase, **or**
    - `HighFrequencyLoopRequester` is active, **or**
    - a background producer set the wake-request flag via `wake_loop_*` (MQTT RX, USB RX, BLE event, ESPNOW, camera, mWW, speakers, USB host/CDC, lwip socket, `enable_loop_soon_any_context()`).

Sleep between ticks is `min(time-until-next-component-phase, next_schedule_in())`. A scheduler-timer wake runs only Phase A; a `wake_loop_threadsafe()` wake runs Phase B too so the producer's component can drain its queued work.

The `delay_time / 2` floor is removed entirely. `interval=0` schedules no longer busy-loop the component phase, because Phase B is gated separately. `HighFrequencyLoopRequester` remains the correct mechanism for "I need fast wakes sometimes." Zero-delay `defer()` is unaffected.

**Ordering preserved:** `defer()` → FIFO before components; scheduled items before components when both are due; scheduled callbacks still main-thread-only; the WDT is fed ≥ once per tick.

## Who This Affects

**Every external component**, but most won't notice. Specifically:

- **Components whose `loop()` depended on running at ~128 Hz** — animations stepping per loop tick, debounce / state-machine timing keyed to loop count, anything that implicitly assumed the doubled rate. Those will now step at ~62 Hz.
- **Components that need sub-`loop_interval_` cadence** — use `HighFrequencyLoopRequester` to keep Phase B running while the request is active. This is the long-standing mechanism and is unchanged.
- **Background-event producers** — already wired up. Every existing `wake_loop_*` caller (MQTT RX, USB RX, BLE event, ESPNOW, camera, mWW, speakers, USB host/CDC, lwip socket, `enable_loop_soon_any_context()`) now sets a wake-request flag before signalling the platform so that Phase B runs in the next tick. No external action needed.
- **Power-managed configs** using `App.set_loop_interval()` — this knob now actually saves power. If you previously bumped `loop_interval_` to 100 ms and saw no power reduction, expect a real change this release.

## Migration Guide

For most components, **do nothing**. Your `loop()` will simply run at the documented rate.

If your component genuinely needs faster wakes:

```cpp
#include "esphome/core/application.h"
#include "esphome/core/component.h"
#include "esphome/core/helpers.h"

class MyFastComponent : public Component {
 public:
  void setup() override {
    this->high_freq_.start();   // keep Phase B running every tick
  }
  void loop() override {
    // ... time-sensitive work ...
    if (this->done_) {
      this->high_freq_.stop();  // release when no longer needed
    }
  }

 protected:
  HighFrequencyLoopRequester high_freq_;
};
```

If your component publishes data from a background event (ISR, FreeRTOS task, USB callback), call `App.wake_loop_threadsafe()` from the producer. That sets the wake-request flag and forces Phase B in the next tick — your component's `loop()` will drain the queued event without waiting up to `loop_interval_` ms.

The full architectural rationale, including how to decide between `loop()`, `set_interval()`, and the scheduler under the new cadence rules, is documented in [Choosing Between loop() and the Scheduler](../../architecture/components/advanced.md#choosing-between-loop-and-the-scheduler).

## References

- [PR #15792](https://github.com/esphome/esphome/pull/15792) — decouple main loop cadence from scheduler wake timing
- [PR #15846](https://github.com/esphome/esphome/pull/15846) — prerequisite WDT-feed rate-limit adjustment
- [Architecture doc: loop control and main-loop cadence](../../architecture/components/advanced.md)
- [2026.4.0 blog: wake_loop moved to core](2026-04-09-wake-loop-moved-to-core.md) — provided the unconditional wake primitive that made this fix safe
