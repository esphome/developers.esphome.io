---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# PollingComponent::set_update_interval Devirtualized

The `virtual` keyword has been removed from `PollingComponent::set_update_interval()`. External components that override this method on a `PollingComponent` subclass will no longer have their override called.

This is a **developer breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

**[PR #14938](https://github.com/esphome/esphome/pull/14938): Devirtualize PollingComponent::set_update_interval**

No component in the ESPHome tree actually overrides `set_update_interval` on `PollingComponent`. The only apparent override was in `sds011`, which extends `Component` (not `PollingComponent`), so it was just a name-hiding no-op. Removing the `virtual` keyword allows the compiler to inline the setter at all call sites, saving ~88 bytes of flash and eliminating a vtable entry.

## What's Changing

```cpp
// Before
class PollingComponent : public Component {
 public:
  virtual void set_update_interval(uint32_t update_interval) {
    this->update_interval_ = update_interval;
  }
};

// After
class PollingComponent : public Component {
 public:
  void set_update_interval(uint32_t update_interval) {
    this->update_interval_ = update_interval;
  }
};
```

## Who This Affects

**External components that override `set_update_interval()` on a `PollingComponent` subclass.** A GitHub code search found no known components doing this — the override mechanism was dead code in practice.

**Standard YAML configurations are not affected.**

## Migration Guide

If your component overrides `set_update_interval` to perform custom logic when the interval changes, you have two options:

1. **Use a setter with a different name** that calls the base method:

```cpp
// Before
void set_update_interval(uint32_t interval) override {
  PollingComponent::set_update_interval(interval);
  this->reconfigure_timer(interval);
}

// After
void set_custom_interval(uint32_t interval) {
  this->set_update_interval(interval);
  this->reconfigure_timer(interval);
}
```

2. **Handle the logic in `setup()`** if you only need to act on the initial interval.

## Timeline

- **ESPHome 2026.4.0 (April 2026):** `virtual` keyword removed
- No deprecation period — this was dead code with no known overrides

## Finding Code That Needs Updates

```bash
# Find set_update_interval overrides in your component
grep -rn 'set_update_interval.*override' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14938: Devirtualize PollingComponent::set_update_interval](https://github.com/esphome/esphome/pull/14938)
