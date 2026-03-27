---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# get_loop_priority() Now Conditionally Compiled with USE_LOOP_PRIORITY

The `get_loop_priority()` virtual method on `Component` is now only available when `USE_LOOP_PRIORITY` is defined. This define is only set on RP2040, the only platform where loop priority has an effect. External components that override `get_loop_priority()` must guard the override with `#ifdef USE_LOOP_PRIORITY`.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14210](https://github.com/esphome/esphome/pull/14210): Conditionally compile get_loop_priority with USE_LOOP_PRIORITY**

The `get_loop_priority()` virtual method existed on all platforms, but only had an effect on RP2040 — it controls the order in which components' `loop()` methods are called. On ESP32, ESP8266, and LibreTiny, WiFi and Ethernet no longer block during setup (since [PR #9823](https://github.com/esphome/esphome/pull/9823)), making loop priority ordering unnecessary. The method was dead code on those platforms but still consumed a vtable entry in every `Component` subclass.

By guarding the method behind `#ifdef USE_LOOP_PRIORITY`, non-RP2040 platforms eliminate one vtable entry per component and the insertion sort during `Application::setup()`.

## What's Changing

The `get_loop_priority()` virtual method declaration and implementation are now guarded behind `#ifdef USE_LOOP_PRIORITY`. This define is only set on RP2040.

```cpp
// In Component (esphome/core/component.h)
class Component {
 public:
#ifdef USE_LOOP_PRIORITY
  virtual float get_loop_priority() const;
#endif
};
```

On ESP32, ESP8266, and LibreTiny, the method does not exist at all. Overriding it without the guard produces a compile error.

## Who This Affects

**External components that override `get_loop_priority()`.**

The override was already a no-op on ESP32/ESP8266/LibreTiny — it only has a functional effect on RP2040. Adding the `#ifdef` guard makes this explicit.

**Standard YAML configurations are not affected.**

## Migration Guide

```cpp
// Before
class MyComponent : public Component {
 public:
  float get_loop_priority() const override { return 10.0f; }
};

// After
class MyComponent : public Component {
 public:
#ifdef USE_LOOP_PRIORITY
  float get_loop_priority() const override { return 10.0f; }
#endif
};
```

## Supporting Multiple ESPHome Versions

The `#ifdef` guard alone is the simplest approach and works on all versions:

```cpp
// Safe on all versions
#ifdef USE_LOOP_PRIORITY
  float get_loop_priority() const override { return 10.0f; }
#endif
```

On ESPHome < 2026.3.0, `USE_LOOP_PRIORITY` is not defined on any platform, so the `#ifdef` block is skipped. This is fine because the override was a no-op on non-RP2040 platforms anyway.

If you need the override to remain active on older ESPHome versions:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
#ifdef USE_LOOP_PRIORITY
  float get_loop_priority() const override { return 10.0f; }
#endif
#else
  float get_loop_priority() const override { return 10.0f; }
#endif
```

## Timeline

- **ESPHome 2026.3.0 (March 2026):** `get_loop_priority()` conditionally compiled
- No deprecation period — the method was dead code on affected platforms

## Finding Code That Needs Updates

```bash
# Find get_loop_priority overrides
grep -rn 'get_loop_priority' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14210: Conditionally compile get_loop_priority](https://github.com/esphome/esphome/pull/14210)
