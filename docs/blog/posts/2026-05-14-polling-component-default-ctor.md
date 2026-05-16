---
date: 2026-05-14
authors:
  - bdraco
comments: true
---

# Default-Constructed PollingComponent No Longer Polls

The no-argument `PollingComponent()` constructor now initializes the update interval to `SCHEDULER_DONT_RUN` (`UINT32_MAX`) instead of `1`. External components that subclass `PollingComponent`, instantiate it with no constructor argument, and never call `set_update_interval()` will stop polling. Pass an interval to the constructor or call `set_update_interval()` explicitly.

This is a **breaking change** for external components in **ESPHome 2026.5.0 and later**.

<!-- more -->

## Background

**[PR #15832](https://github.com/esphome/esphome/pull/15832): Default PollingComponent() to not run when codegen is bypassed**

Codegen-driven components always pass the user's `update_interval:` through to the constructor (or call `set_update_interval()` explicitly), so they were never affected by the default value. The default only mattered when an external component bypassed codegen — wrote `PollingComponent()` directly in C++ and never set an interval.

The old default of `1` was a workaround. Before the recent scheduler rework (#15516), the inefficient scheduler informally throttled `interval=0` and `interval=1` into something close to plain `loop()` behavior, so components that forgot to set an interval got "some" polling. After the scheduler became efficient and #15799 / #15831 hardened the runtime coercion path, an explicit `1` ms interval would have meant **1000 polls per second** — starving the watchdog and masking any real symptoms.

No author who forgets to set an interval actually wants 1000 polls per second. The correct behavior when an interval is genuinely missing is to **fail loudly** — don't poll at all, log `Update Interval: never`, and let the developer notice.

## What's Changing

```cpp
// Before
PollingComponent() : update_interval_(1) {}
// → polled every 1 ms when never configured

// After
PollingComponent() : update_interval_(SCHEDULER_DONT_RUN) {}
// → does not poll until set_update_interval() is called
```

`SCHEDULER_DONT_RUN` is `UINT32_MAX`. The scheduler already treats this value as disabled (see `scheduler.cpp:137`, `component.cpp:446`), and `LOG_UPDATE_INTERVAL` already prints `Update Interval: never` for this value — so the dump_config output is also self-describing.

## Who This Affects

External components that meet **all three** of these conditions:

1. Subclass `PollingComponent` (or `polling_component_schema` equivalents)
2. Construct it via the no-argument `PollingComponent()` constructor
3. Never call `set_update_interval()` afterwards

Codegen-driven components are unaffected — codegen always passes the configured (or default-from-schema) interval.

A known example is [`psvanstrom/esphome-p1reader`](https://github.com/psvanstrom/esphome-p1reader/pull/110), which independently switched to `PollingComponent(10)` ahead of this change.

## Migration Guide

Pick whichever fits your component:

```cpp
// Option 1: pass the interval to the constructor (recommended for fixed-interval components)
class MyComponent : public PollingComponent {
 public:
  MyComponent() : PollingComponent(60000) {}  // 60 s
  // ...
};
```

```cpp
// Option 2: keep the no-arg constructor and configure later (e.g. from YAML codegen)
class MyComponent : public PollingComponent {
 public:
  void setup() override {
    this->set_update_interval(60000);
    PollingComponent::setup();
  }
};
```

```cpp
// Option 3: if you want the component to behave like a plain Component (no polling),
// inherit from Component instead — that's the new explicit way to express "no polling."
class MyComponent : public Component {
  // ...
};
```

If you see `Update Interval: never` in your device's startup log and the component used to poll, you're hitting this case — pick option 1 or 2.

## References

- [PR #15832](https://github.com/esphome/esphome/pull/15832) — Default PollingComponent() to not run when codegen is bypassed
- [PR #15831](https://github.com/esphome/esphome/pull/15831) — Prerequisite: encode the old runtime coerce as a compile-time no-op
- [PR #15799](https://github.com/esphome/esphome/pull/15799) — Earlier scheduler hardening that made the old default actually mean 1 ms
