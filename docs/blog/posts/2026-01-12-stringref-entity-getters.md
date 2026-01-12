---
date: 2026-01-12
authors:
  - bdraco
comments: true
---

# Entity Getters Now Return StringRef

Several entity component getters now return `StringRef` instead of `const char*` or `std::string`. This improves safety by eliminating null pointer crashes and provides a modern C++ API.

This is a **breaking change** for external components in **ESPHome 2026.1.0 and later**.

<!-- more -->

## Background

These PRs modernize entity getters to return `StringRef`, a lightweight string reference class that signals static lifetime semantics:

**[PR #13092](https://github.com/esphome/esphome/pull/13092): Fan - `get_preset_mode()`**
Returns `StringRef` instead of `const char*`. Adds `has_preset_mode()` helper.

**[PR #13095](https://github.com/esphome/esphome/pull/13095): Select - `current_option()`**
Returns `StringRef` instead of `const char*`.

**[PR #13103](https://github.com/esphome/esphome/pull/13103): Climate - `get_custom_fan_mode()`, `get_custom_preset()`**
Returns `StringRef` instead of `const char*`. Adds `has_custom_fan_mode()` and `has_custom_preset()` helpers.

**[PR #13104](https://github.com/esphome/esphome/pull/13104): Event - `get_last_event_type()`**
Returns `StringRef` instead of `const char*`. Adds `has_event()` helper.

**[PR #13105](https://github.com/esphome/esphome/pull/13105): Light - `LightEffect::get_name()`, `LightState::get_effect_name()`**
Returns `StringRef` instead of `const char*` and `std::string` respectively.

## What's Changing

### Return type changes

| Component | Method | Before | After |
|-----------|--------|--------|-------|
| Fan | `get_preset_mode()` | `const char*` | `StringRef` |
| Select | `current_option()` | `const char*` | `StringRef` |
| Climate | `get_custom_fan_mode()` | `const char*` | `StringRef` |
| Climate | `get_custom_preset()` | `const char*` | `StringRef` |
| Event | `get_last_event_type()` | `const char*` | `StringRef` |
| Light | `LightEffect::get_name()` | `const char*` | `StringRef` |
| Light | `LightState::get_effect_name()` | `std::string` | `StringRef` |

### Behavior changes

- **Empty state**: Returns empty `StringRef` instead of `nullptr` when not set
- **Safety**: `==` comparisons are always safe (no null pointer crashes)
- **Implicit conversion**: `StringRef` converts to `std::string` automatically

## Who This Affects

- External components that call these getter methods
- YAML lambdas that check for null or use `strcmp()`

**Standard YAML configurations are not affected.**

## Migration Guide

### 1. Null checks (Required)

The old pattern of checking for `nullptr` must be replaced:

```cpp
// Before - checking for nullptr
const char *preset = fan->get_preset_mode();
if (preset != nullptr) {
  // use preset
}

// After - use empty() or has_*() helpers
StringRef preset = fan->get_preset_mode();
if (!preset.empty()) {
  // use preset
}

// Or use the new helper methods where available
if (fan->has_preset_mode()) {
  StringRef preset = fan->get_preset_mode();
}
```

### 2. String comparisons (Simplified)

The `==` operator now works directly and is safe even when empty:

```cpp
// Before - strcmp required (crashes if nullptr!)
const char *preset = fan->get_preset_mode();
if (preset != nullptr && strcmp(preset, "auto") == 0) {
  // matched
}

// After - direct comparison (always safe)
if (fan->get_preset_mode() == "auto") {
  // matched
}
```

### 3. Logging (Updated format)

Use `%.*s` format specifier for proper StringRef logging:

```cpp
// Before
ESP_LOGD(TAG, "Preset: %s", fan->get_preset_mode());

// After
StringRef preset = fan->get_preset_mode();
ESP_LOGD(TAG, "Preset: %.*s", (int) preset.size(), preset.c_str());

// Or use c_str() directly (StringRef is null-terminated)
ESP_LOGD(TAG, "Preset: %s", fan->get_preset_mode().c_str());
```

### 4. Storing as std::string

`StringRef` converts implicitly to `std::string`:

```cpp
// Before
const char *preset = fan->get_preset_mode();
std::string stored = preset ? preset : "";

// After - implicit conversion
std::string stored = fan->get_preset_mode();
```

### 5. Passing to C functions

Use `.c_str()` when passing to functions expecting `const char*`:

```cpp
// StringRef is null-terminated, so c_str() is safe
some_c_function(fan->get_preset_mode().c_str());
```

### 6. YAML lambda updates

```yaml
# Before - null check pattern
lambda: |-
  auto preset = id(my_fan).get_preset_mode();
  if (preset != nullptr && strcmp(preset, "auto") == 0) {
    return true;
  }
  return false;

# After - direct comparison
lambda: |-
  return id(my_fan).get_preset_mode() == "auto";
```

## StringRef Quick Reference

`StringRef` is a lightweight reference to a string owned elsewhere:

```cpp
StringRef ref = fan->get_preset_mode();

ref.empty()      // true if empty (replaces nullptr check)
ref.size()       // string length
ref.c_str()      // null-terminated C string pointer
ref.str()        // convert to std::string
ref == "value"   // compare with string literal
ref == other_ref // compare with another StringRef
```

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 1, 0)
  // New API - StringRef
  if (!fan->get_preset_mode().empty()) {
    ESP_LOGD(TAG, "Preset: %s", fan->get_preset_mode().c_str());
  }
#else
  // Old API - const char*
  const char *preset = fan->get_preset_mode();
  if (preset != nullptr) {
    ESP_LOGD(TAG, "Preset: %s", preset);
  }
#endif
```

## Timeline

- **ESPHome 2026.1.0 (January 2026):** StringRef returns are active
- No deprecation period - this is a signature change

## Finding Code That Needs Updates

```bash
# Find null pointer checks on these methods
grep -rn "get_preset_mode().*nullptr" your_component/
grep -rn "current_option().*nullptr" your_component/
grep -rn "get_custom_fan_mode().*nullptr" your_component/
grep -rn "get_custom_preset().*nullptr" your_component/
grep -rn "get_last_event_type().*nullptr" your_component/
grep -rn "get_effect_name().*nullptr" your_component/

# Find strcmp usage
grep -rn "strcmp.*get_preset_mode" your_component/
grep -rn "strcmp.*current_option" your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [StringRef source code](https://github.com/esphome/esphome/blob/dev/esphome/core/string_ref.h)
- [PR #13092: Fan](https://github.com/esphome/esphome/pull/13092)
- [PR #13095: Select](https://github.com/esphome/esphome/pull/13095)
- [PR #13103: Climate](https://github.com/esphome/esphome/pull/13103)
- [PR #13104: Event](https://github.com/esphome/esphome/pull/13104)
- [PR #13105: Light](https://github.com/esphome/esphome/pull/13105)
