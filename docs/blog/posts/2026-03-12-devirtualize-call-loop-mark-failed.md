---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# call_loop() and mark_failed() Are No Longer Virtual

`Component::call_loop()` and `Component::mark_failed()` are no longer virtual methods. External components that override either method must remove the `override` keyword. This saves ~800+ bytes of flash globally.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14083](https://github.com/esphome/esphome/pull/14083): Devirtualize call_loop() and mark_failed() in Component**

Both methods were virtual since the original 2019 codebase, designed to let intermediate base classes inject behavior between the framework and the user's `loop()` without requiring `super.loop()` calls. Two components historically used these overrides:

1. **`MQTTComponent::call_loop()`** — removed in [#13356](https://github.com/esphome/esphome/pull/13356) (Jan 2026) when MQTT was restructured
2. **`ESP32BLE::mark_failed()`** — removed in [#4173](https://github.com/esphome/esphome/pull/4173) (Jan 2023) when BLE was refactored to use event handlers

After those architectural improvements, zero overrides remained. Making these methods non-virtual eliminates one vtable slot per method from every `Component`-derived class (~100+ vtables in a typical build), saving **~800+ bytes of flash**.

## What's Changing

```cpp
// Before (virtual)
class Component {
 public:
  virtual void call_loop();
  virtual void mark_failed();
};

// After (non-virtual)
class Component {
 public:
  void call_loop();
  void mark_failed();
};
```

Any class that declares `call_loop() override` or `mark_failed() override` will fail to compile.

## Who This Affects

External components that override `call_loop()` or `mark_failed()`. No known external components currently override either method — they were virtual with zero overrides in the wild.

**Standard YAML configurations are not affected.**

## Migration Guide

### Remove the override keyword

```cpp
// Before — fails to compile
void call_loop() override { /* ... */ }
void mark_failed() override { /* ... */ }

// After
// These methods can no longer be overridden.
// Use loop() for custom loop logic, or call mark_failed() without overriding it.
```

### If you need custom loop injection

Override `loop()` directly — that method remains virtual:

```cpp
void loop() override {
  // Your custom logic here
  // No need to call super
}
```

### If you need custom failure handling

React to failure in your own logic rather than overriding `mark_failed()`:

```cpp
void loop() override {
  if (this->is_failed()) {
    // Handle failure state
    return;
  }
  // Normal logic
}
```

## Supporting Multiple ESPHome Versions

Since `override` on a non-virtual method is a compile error, you need a version guard:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
// These methods are no longer virtual — do not override
#else
void call_loop() override { /* ... */ }
void mark_failed() override { /* ... */ }
#endif
```

## Timeline

- **ESPHome 2026.3.0 (March 2026):** `call_loop()` and `mark_failed()` are no longer virtual — `override` keyword causes compile error

## Finding Code That Needs Updates

```bash
# Find call_loop() overrides
grep -rn 'call_loop().*override' your_component/

# Find mark_failed() overrides
grep -rn 'mark_failed().*override' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14083: Devirtualize call_loop() and mark_failed() in Component](https://github.com/esphome/esphome/pull/14083)
