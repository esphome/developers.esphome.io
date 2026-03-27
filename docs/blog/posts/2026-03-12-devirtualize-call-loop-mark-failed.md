---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# call_loop(), mark_failed(), and call_dump_config() Are No Longer Virtual

`Component::call_loop()`, `Component::mark_failed()`, and `Component::call_dump_config()` are no longer virtual methods. External components that override any of these methods must remove them entirely and move logic to `loop()` or `dump_config()`. This saves 800+ bytes of flash globally from vtable elimination.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14083](https://github.com/esphome/esphome/pull/14083): Devirtualize call_loop() and mark_failed() in Component**
**[PR #14355](https://github.com/esphome/esphome/pull/14355): Devirtualize call_dump_config()**

These methods were virtual since the original 2019 codebase, designed to let intermediate base classes inject behavior between the framework and the user's `loop()` / `dump_config()` without requiring base class calls. The components that historically used these overrides have all been refactored:

1. **`MQTTComponent::call_loop()`** — removed in [#13356](https://github.com/esphome/esphome/pull/13356) (Jan 2026) when MQTT was restructured
2. **`ESP32BLE::mark_failed()`** — removed in [#4173](https://github.com/esphome/esphome/pull/4173) (Jan 2023) when BLE was refactored to use event handlers
3. **`MQTTComponent::call_dump_config()`** — removed in [#14355](https://github.com/esphome/esphome/pull/14355); the override incorrectly skipped `dump_config()` for internal entities

After those architectural improvements, zero overrides remained. Making these methods non-virtual eliminates one vtable slot per method from every `Component`-derived class (~100+ vtables in a typical build), saving **800+ bytes of flash**.

## What's Changing

```cpp
// Before (virtual)
class Component {
 public:
  virtual void call_loop();
  virtual void mark_failed();
  virtual void call_dump_config();
};

// After (non-virtual)
class Component {
 public:
  void call_loop();
  void mark_failed();
  void call_dump_config();
};
```

Any class that declares `call_loop() override`, `mark_failed() override`, or `call_dump_config() override` will fail to compile.

## Who This Affects

External components that override `call_loop()`, `mark_failed()`, or `call_dump_config()`. No known external components currently override any of these methods — they were virtual with zero overrides in the wild.

**Standard YAML configurations are not affected.**

## Migration Guide

### Remove overrides and move logic to loop()/dump_config()

Simply removing the `override` keyword is not enough — a same-named non-virtual method in a derived class will never be called by the framework (calls through `Component*` always dispatch to `Component::call_loop()`). You must **remove the method entirely** and move logic to the appropriate virtual hook.

```cpp
// Before — fails to compile
class MyComponent : public Component {
 public:
  void call_loop() override {
    // Custom per-loop logic
  }
  void call_dump_config() override {
    // Custom config output
  }
  void mark_failed() override {
    // Custom failure handling
  }
};

// After — use loop(), dump_config(), and is_failed() instead
class MyComponent : public Component {
 public:
  void loop() override {
    // Former call_loop() logic goes here
    if (this->is_failed()) {
      // Former mark_failed() follow-up handling goes here
      return;
    }
  }
  void dump_config() override {
    // Former call_dump_config() logic goes here
  }
};
```

## Supporting Multiple ESPHome Versions

Since `override` on a non-virtual method is a compile error, you need a version guard:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
// These methods are no longer virtual — do not override
#else
void call_loop() override { /* ... */ }
void mark_failed() override { /* ... */ }
void call_dump_config() override { /* ... */ }
#endif
```

## Timeline

- **ESPHome 2026.3.0 (March 2026):** `call_loop()`, `mark_failed()`, and `call_dump_config()` are no longer virtual — `override` keyword causes compile error

## Finding Code That Needs Updates

```bash
# Find call_loop() overrides
grep -rn 'call_loop().*override' your_component/

# Find mark_failed() overrides
grep -rn 'mark_failed().*override' your_component/

# Find call_dump_config() overrides
grep -rn 'call_dump_config().*override' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14083: Devirtualize call_loop() and mark_failed() in Component](https://github.com/esphome/esphome/pull/14083)
- [PR #14355: Devirtualize call_dump_config()](https://github.com/esphome/esphome/pull/14355)
