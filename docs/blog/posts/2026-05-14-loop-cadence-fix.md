---
date: 2026-05-14
authors:
  - bdraco
comments: true
---

# Main Loop Cadence Decoupled from Scheduler Wake Timing

Every component's `loop()` now runs at the configured `loop_interval_` (default ~62 Hz). Previously, **when other scheduler activity was running** — `set_interval` / `set_timeout` / `PollingComponent` updates with sub-`loop_interval_` cadences — the component phase got pulled forward up to ~128 Hz; quiet configs with no such scheduler entries were unaffected and always ran at the documented rate. Background events (MQTT RX, USB RX, BLE events, ESPNOW, camera, `micro_wake_word`, speaker, USB host/CDC, lwIP socket) still wake their component within one tick via the existing `wake_loop_*` paths. `App.set_loop_interval()` — the documented knob for power savings — finally works.

This is a **behavior change** in **ESPHome 2026.5.0 and later** with no API break, but it affects every component whose `loop()` implicitly depended on running at ~2× the configured rate when scheduler activity was driving the pull-forward.

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

`Application::loop()` bounded its sleep by `min(loop_interval_ - elapsed, next_schedule_in())` with a `delay_time / 2` floor. If the scheduler had any entry due sooner than `loop_interval_ / 2`, the loop slept for `loop_interval_ / 2` and ran the **entire component phase** again — every component's `loop()` got pulled forward by whatever else happened to be scheduling work. The effect was config-dependent and non-local: adding one scheduled item anywhere silently shifted every other component's cadence.

Two recent trends made this bite harder: (1) more components are `PollingComponent`s, each of which is a `set_interval` under the hood; (2) more components use `set_interval` / `set_timeout` directly for retries, debouncing, animations, and protocol timing. `App.set_loop_interval()` — the documented knob for power savings — was silently defeated by the same coupling.

Removing the floor is safe now because **`wake_loop_threadsafe()` is accessible everywhere as of 2026.4.0** (see the [2026.4.0 wake_loop blog post](2026-04-09-wake-loop-moved-to-core.md)). Any component that needs to wake the loop sooner than `loop_interval_` has a proper way to do it without the floor papering over missing wake-ups.

## What's Changing

`Application::loop()` is restructured into two independent phases:

- **Phase A (every tick):** drain wake notifications, run `scheduler.call()`, feed the watchdog.
- **Phase B (gated):** iterate registered components. Runs when **any** of these is true:
    - `loop_interval_` has elapsed since the last component phase, **or**
    - `HighFrequencyLoopRequester` is active, **or**
    - a background producer set the wake-request flag via `wake_loop_*` (MQTT RX, USB RX, BLE events, ESPNOW, camera, `micro_wake_word`, speaker, USB host/CDC, lwIP socket, or a component-level `enable_loop_soon_any_context()`).

Sleep between ticks is `min(time-until-next-component-phase, next_schedule_in())`. A scheduler-timer wake runs only Phase A; a `wake_loop_threadsafe()` wake runs Phase B too so the producer's component can drain its queued work.

The `delay_time / 2` floor is removed entirely. Zero-delay `set_interval(0, ...)` registrations no longer busy-loop the component phase, because Phase B is gated separately from scheduler timer expiry. `HighFrequencyLoopRequester` remains the correct mechanism for "I need fast wakes sometimes." Zero-delay `defer()` is unaffected.

**Ordering preserved:** `defer()` → FIFO before components; scheduled items before components when both are due; scheduled callbacks still main-thread-only; the WDT is fed ≥ once per tick.

## Who This Affects

**Every component that overrides `loop()`** — in-tree and external alike — but most won't notice. Specifically:

- **Components whose `loop()` depended on running at ~128 Hz** — animations stepping per loop tick, debounce / state-machine timing keyed to loop count, anything that implicitly assumed the doubled rate. Those will now step at ~62 Hz when scheduler activity was previously providing the pull-forward.
- **Background-event producers** — already wired up. Every existing `wake_loop_*` caller (MQTT RX, USB RX, BLE events, ESPNOW, camera, `micro_wake_word`, speaker, USB host/CDC, lwIP socket, and per-component `enable_loop_soon_any_context()` calls) now sets a wake-request flag before signalling the platform so that Phase B runs in the next tick. No action needed in callers.
- **Components that need sub-`loop_interval_` cadence** — see the migration guide below for the preferred event-driven pattern. `HighFrequencyLoopRequester` is available but should be a last resort.
- **Power-managed configs** using `App.set_loop_interval()` — this knob now actually saves power. If you previously bumped `loop_interval_` to 100 ms and saw no power reduction, expect a real change this release.

## Migration Guide

For most components, **do nothing**. Your `loop()` will simply run at the documented rate.

If your component genuinely needs to run more often than `loop_interval_`, the **preferred pattern is event-driven, not high-frequency**: keep the loop disabled while there's nothing to do, and have your event source re-enable it. The `Component` base class has the primitives you need:

| API | Where you call it | Purpose |
|---|---|---|
| `this->disable_loop()` | Main thread (typically the tail of `loop()` once your work is done) | Take the component out of the iteration list — its `loop()` won't be called again until something re-enables it. |
| `this->enable_loop()` | Main thread | Put the component back in the iteration list. |
| `this->enable_loop_soon_any_context()` | **ISR, FreeRTOS task, or any thread** | ISR-safe enable. Sets a pending flag that the main loop drains on the next tick. There is intentionally no `disable_loop_soon_any_context()` — use `disable_loop()` from `loop()` itself. |
| `App.wake_loop_threadsafe()` | FreeRTOS task / non-ISR thread (BLE callbacks, network events, platform task callbacks) | Forces Phase B in the next tick globally; lets every enabled component drain queued work without changing per-component enable state. |
| `App.wake_loop_any_context()` / `App.wake_loop_isrsafe()` | ISR context | ISR-safe global wake. See [Waking from ISR](../../architecture/components/advanced.md#waking-from-isr) for per-platform IRAM and `xHigherPriorityTaskWoken` notes. |

The typical event-driven pattern looks like this:

```cpp
#include "esphome/core/application.h"
#include "esphome/core/component.h"

class MyEventDrivenComponent : public Component {
 public:
  void setup() override {
    // ... register hardware / callbacks ...
    this->disable_loop();  // nothing to do until an event arrives
  }

  void loop() override {
    this->drain_queued_events_();
    if (this->queue_empty_()) {
      this->disable_loop();  // re-enable from on_event()
    }
  }

  // Called from a FreeRTOS task / network callback / etc.
  void on_event(Event e) {
    this->queue_.push(e);
    this->enable_loop_soon_any_context();  // ISR-safe; also wakes the main loop
  }
};
```

`enable_loop_soon_any_context()` both flips the component's enable bit *and* wakes the main loop, so `loop()` runs within a tick of the event landing — regardless of where `loop_interval_` is set. This composes cleanly with `App.set_loop_interval(...)` for power-managed configs: idle current drops because the loop sleeps; latency stays low because events wake it.

!!! warning "`HighFrequencyLoopRequester` is a last resort"
    `HighFrequencyLoopRequester::start()` keeps Phase B running every tick unconditionally. It exists for genuinely time-critical workloads (e.g. tight bit-banged protocol timing where you can't wait for an event), and even there, scoping the request as narrowly as possible — `start()` only while the critical work is in flight, `stop()` immediately after — is the supported usage. If you're reaching for it because "I just need faster wakes," prefer `disable_loop()` / `enable_loop_soon_any_context()` first — it gets you the same latency at a fraction of the wakeup count.

The full architectural rationale, including how to decide between `loop()`, `set_interval()`, and the scheduler under the new cadence rules, is documented in [Choosing Between loop() and the Scheduler](../../architecture/components/advanced.md#choosing-between-loop-and-the-scheduler).

## Finding Code That Needs Updates

```bash
# Components with a loop() override (the work you might want to review).
# The narrower `override`-style pattern catches modern code; the wider one
# also picks up older external components that declared `void loop();` without
# `override` and is precisely where you're most likely to find code that
# implicitly depended on the old ~128 Hz cadence.
grep -rn 'void loop() override' your_component/
grep -rEn 'void[[:space:]]+loop[[:space:]]*\([[:space:]]*\)' your_component/

# Zero-delay set_interval calls — previously busy-looped the component phase
grep -rEn 'set_interval\(\s*0\s*,' your_component/

# Background producers that should be using a wake primitive
grep -rn 'wake_loop_threadsafe\|enable_loop_soon_any_context\|wake_loop_any_context\|wake_loop_isrsafe' your_component/

# Components already opted in to high-frequency wakes (no action needed)
grep -rn 'HighFrequencyLoopRequester' your_component/
```

If your `loop()` was implicitly relying on the ~128 Hz emergent rate and ~62 Hz is now insufficient, switch to `HighFrequencyLoopRequester` (for sustained fast wakes) or a wake primitive driven from your event source (for event-driven wakes).

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15792](https://github.com/esphome/esphome/pull/15792) — decouple main loop cadence from scheduler wake timing
- [PR #15846](https://github.com/esphome/esphome/pull/15846) — prerequisite WDT-feed rate-limit adjustment
- [Architecture doc: loop control and main-loop cadence](../../architecture/components/advanced.md)
- [2026.4.0 blog: wake_loop moved to core](2026-04-09-wake-loop-moved-to-core.md) — provided the unconditional wake primitive that made this fix safe
