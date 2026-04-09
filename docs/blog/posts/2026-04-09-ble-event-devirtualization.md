---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# BLE Event Handler Dispatch Devirtualized

Virtual handler interfaces (`GAPEventHandler`, `GAPScanEventHandler`, `GATTcEventHandler`, `GATTsEventHandler`, `BLEStatusEventHandler`) have been replaced with callback-based dispatch. External components that inherit from these interfaces must update their registration approach.

This is a **developer breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

**[PR #15310](https://github.com/esphome/esphome/pull/15310): Devirtualize BLE event handler dispatch**

The previous virtual handler pattern required vtable lookups and multiple-inheritance this-pointer adjustment thunks on every BLE event dispatch. The new approach uses `StaticCallbackManager` with lambda callbacks, eliminating vtable overhead. Each lambda captures a single pointer (fits in `Callback` inline storage, no heap allocation).

**Before (virtual dispatch):**
```
ESP32BLE::loop()
  → vtable load → indirect call → thunk this-adjust → gap_scan_event_handler()
```

**After (callback dispatch):**
```
ESP32BLE::loop()
  → StaticCallbackManager::call() → Callback::fn_(ctx_, args) → direct call
```

## What's Changing

The following virtual handler base classes are removed:

- `GAPEventHandler`
- `GAPScanEventHandler`
- `GATTcEventHandler`
- `GATTsEventHandler`
- `BLEStatusEventHandler`

Registration now uses `add_*_callback()` methods with lambdas instead of `register_*_handler()` with object pointers. The Python `register_*` helper functions are unchanged — they generate lambda-based callbacks internally.

## Who This Affects

**External ESP32 BLE components that inherit from the virtual handler classes.**

## Migration Guide

### C++ changes

1. Remove the handler base class from your inheritance list
2. Remove `override` from handler methods

```cpp
// Before
class MyComponent : public Component, public GAPScanEventHandler {
  void gap_scan_event_handler(const BLEScanResult &scan_result) override;
};

// After
class MyComponent : public Component {
  void gap_scan_event_handler(const BLEScanResult &scan_result);
};
```

### Python codegen

The Python `register_*` helper functions are unchanged — no Python changes needed:

```python
# This still works — generates lambda-based callbacks internally
esp32_ble.register_gap_scan_event_handler(parent, var)
```

## Supporting Multiple ESPHome Versions

```cpp
// Before 2026.4.0, inherit from the handler class
// After 2026.4.0, just declare the method

#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
class MyComponent : public Component {
#else
class MyComponent : public Component, public GAPScanEventHandler {
#endif
  void gap_scan_event_handler(const BLEScanResult &scan_result)
#if ESPHOME_VERSION_CODE < VERSION_CODE(2026, 4, 0)
    override
#endif
  ;
};
```

## Timeline

- **ESPHome 2026.4.0 (April 2026):** Virtual handler classes removed
- No deprecation period — this is a class removal

## Finding Code That Needs Updates

```bash
# Find handler class inheritance
grep -rn 'GAPEventHandler\|GAPScanEventHandler\|GATTcEventHandler\|GATTsEventHandler\|BLEStatusEventHandler' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15310: Devirtualize BLE event handler dispatch](https://github.com/esphome/esphome/pull/15310)
