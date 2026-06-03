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

`SCHEDULER_DONT_RUN` is `UINT32_MAX`. The scheduler already treats this value as disabled, and `LOG_UPDATE_INTERVAL` already prints `Update Interval: never` for this value — so the `dump_config` output is also self-describing. See [PR #15832](https://github.com/esphome/esphome/pull/15832) for the full picture of how the scheduler and `Component` handle this sentinel.

## Who This Affects

External components written in C++ that meet **all three** of these conditions:

1. Inherit from `PollingComponent` in C++
2. Construct the instance via the no-argument `PollingComponent()` constructor (not `PollingComponent(interval)`)
3. Never call `set_update_interval()` afterwards

Components driven by ESPHome's Python code generation (`cv.polling_component_schema(...)`, `sensor.sensor_schema()`, etc.) are unaffected — the codegen always passes the configured (or schema-default) interval through to the constructor, so the default value never matters for them.

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
// Option 2: keep the no-arg constructor and let codegen set the interval before registration.
class MyComponent : public PollingComponent {
 public:
  void update() override;       // your periodic work
  void dump_config() override;
  // (no need to override setup() or pass an interval to the constructor —
  // the Python codegen below calls set_update_interval() for you)
};
```

```python
# Python side — use polling_component_schema; cg.register_component() handles set_update_interval
# automatically when CONF_UPDATE_INTERVAL is in config.
CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(): cv.declare_id(MyComponent),
    # ...
}).extend(cv.polling_component_schema("60s"))

async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)   # ← this sets the update interval for you
```

`cg.register_component()` (in `esphome/cpp_helpers.py`) calls `set_update_interval(config[CONF_UPDATE_INTERVAL])` before it registers the variable with `App`, so by the time `App::register_component()` triggers `call_setup()` → `start_poller()`, `update_interval_` already holds the user's configured value.

!!! warning "Don't call `set_update_interval()` from inside `setup()`"
    `PollingComponent::call_setup()` runs `start_poller()` **before** the subclass's `setup()` — see [the
    implementation](https://github.com/esphome/esphome/blob/dev/esphome/core/component.cpp) (search for
    `PollingComponent::call_setup`). By the time `setup()` executes, the scheduler interval has already been
    registered with whatever `update_interval_` held at registration time (`SCHEDULER_DONT_RUN` if the default
    constructor was used). Calling `set_update_interval()` from `setup()` only updates the field — it does **not**
    re-register the interval, so polling stays disabled.

    The header comment for `call_setup` explicitly says the poller starts first "allowing setup to cancel it if
    desired." So if you really need a runtime decision inside `setup()` to change the cadence, the supported
    pattern is `stop_poller()` → `set_update_interval(ms)` → `start_poller()`. Setting the interval before
    registration (Option 2 above, or via the constructor in Option 1) is much cleaner.

```cpp
// Option 3: if you want the component to behave like a plain Component (no polling),
// inherit from Component instead — that's the new explicit way to express "no polling."
class MyComponent : public Component {
  // ...
};
```

If you see `Update Interval: never` in your device's startup log and the component used to poll, you're hitting this case — pick option 1 or 2.

## Finding Code That Needs Updates

```bash
# Find subclasses of PollingComponent (also catches forward declarations and
# struct/class variations on the same line).
grep -rEn 'class .* PollingComponent|struct .* PollingComponent|: *public *PollingComponent' your_component/

# Find no-arg PollingComponent constructor calls (likely affected)
grep -rEn 'PollingComponent\(\)' your_component/

# Find whether set_update_interval is ever called
grep -rn 'set_update_interval' your_component/
```

If your component has `PollingComponent()` (no argument) and no `set_update_interval()` call anywhere, you'll need to add one of the three options above before 2026.5.0.

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15832](https://github.com/esphome/esphome/pull/15832) — Default PollingComponent() to not run when codegen is bypassed
- [PR #15831](https://github.com/esphome/esphome/pull/15831) — Prerequisite: encode the old runtime coerce as a compile-time no-op
- [PR #15799](https://github.com/esphome/esphome/pull/15799) — Earlier scheduler hardening that made the old default actually mean 1 ms
