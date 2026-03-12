---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# Icon and Device Class Getter Migration

The `get_icon_ref()`, `get_icon()`, `get_device_class_ref()`, and `get_device_class()` methods are deprecated on **all platforms** and replaced by new buffer-based APIs `get_icon_to()` and `get_device_class_to()`. On ESP8266, the old methods produce a `static_assert` error because the underlying strings have been moved to PROGMEM and cannot be accessed through normal C string pointers. On other platforms, the old methods continue to work but emit deprecation warnings and will be removed in 2026.9.0.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14171](https://github.com/esphome/esphome/pull/14171): Pack entity string properties into PROGMEM-indexed fields**
**[PR #14437](https://github.com/esphome/esphome/pull/14437): Move icon strings to PROGMEM on ESP8266**
**[PR #14443](https://github.com/esphome/esphome/pull/14443): Move device class strings to PROGMEM on ESP8266**

Icon and device class strings are set at compile time and never change. PR #14171 packed these properties into PROGMEM-indexed `uint8_t` fields on `EntityBase`, replacing per-entity `const char*` pointers and the `EntityBase_DeviceClass`/`EntityBase_UnitOfMeasurement` mixin classes. Most entity types already had `device_class` and `unit_of_measurement` on the entity itself — the exception was `NumberTraits`, which previously inherited the mixin classes. `NumberTraits` no longer provides these accessors; use `number->get_device_class_ref()` / `number->get_unit_of_measurement_ref()` instead of `number->traits.get_*_ref()`.

The old getter methods returned references or pointers to these strings, which required them to be stored as regular C strings in RAM. The new buffer-based APIs copy the string into a caller-provided buffer, which works regardless of where the string is stored.

On ESP8266, PRs #14437 and #14443 also move the strings into PROGMEM (flash), freeing valuable heap RAM. Since PROGMEM strings cannot be accessed through normal C string pointers on ESP8266, the old methods produce a hard `static_assert` error on that platform rather than a deprecation warning.

## What's Changing

### Deprecated methods (all platforms, removal 2026.9.0)

| Method | Replacement |
|--------|------------|
| `get_icon_ref()` | `get_icon_to(buffer)` |
| `get_icon()` | `get_icon_to(buffer)` |
| `get_device_class_ref()` | `get_device_class_to(buffer)` |
| `get_device_class()` | `get_device_class_to(buffer)` |

### NumberTraits: device_class and unit_of_measurement moved to entity

`NumberTraits` no longer provides `get_device_class()`, `get_device_class_ref()`, or `get_unit_of_measurement_ref()`. These are now accessed directly on the `Number` entity, consistent with all other entity types:

| Before | After |
|--------|-------|
| `number->traits.get_device_class()` | `number->get_device_class_to(buffer)` |
| `number->traits.get_device_class_ref()` | `number->get_device_class_to(buffer)` |
| `number->traits.get_unit_of_measurement_ref()` | `number->get_unit_of_measurement_ref()` |

### EntityBase setters removed and packed into configure_entity_()

The following `EntityBase` setters have been removed and packed into the existing `configure_entity_()` call:

- `set_name()`
- `set_icon()`
- `set_device_class()`
- `set_unit_of_measurement()`
- `set_internal()`
- `set_disabled_by_default()`
- `set_entity_category()`

Additionally, `set_device()` has been renamed to `set_device_()` and made `protected`.

These were codegen-only setters — calling them at runtime was unsafe and could silently corrupt state or crash the device (undefined behavior). If you were calling `set_icon()` from lambdas to dynamically change icons at runtime, move the icon logic to the Home Assistant side (e.g., using template sensors with `icon` templates).

See [PR #14171](https://github.com/esphome/esphome/pull/14171), [PR #14437](https://github.com/esphome/esphome/pull/14437), [PR #14443](https://github.com/esphome/esphome/pull/14443), and [PR #14564](https://github.com/esphome/esphome/pull/14564).

### ESP8266-specific

On ESP8266, using any of the deprecated methods produces a `static_assert` error at compile time — they cannot work because the underlying strings are in PROGMEM.

### New APIs

```cpp
// Icon — copies into buffer, returns pointer to buffer (or nullptr if no icon set)
char icon_buf[MAX_ICON_LENGTH];
const char *icon = entity->get_icon_to(icon_buf);

// Device class — same pattern
char dc_buf[MAX_DEVICE_CLASS_LENGTH];
const char *dc = entity->get_device_class_to(dc_buf);
```

`MAX_ICON_LENGTH` and `MAX_DEVICE_CLASS_LENGTH` are both 64 bytes (63 characters + null terminator). Strings longer than 63 characters will produce a compile-time error.

## Who This Affects

**External components that:**

- Call `get_icon_ref()`, `get_icon()`, `get_device_class_ref()`, or `get_device_class()` on any entity — deprecation warning on all platforms, hard compile error on ESP8266
- Access `device_class` or `unit_of_measurement` through `NumberTraits` — moved to `Number` entity directly
- Call `set_icon()`, `set_device_class()`, `set_unit_of_measurement()`, or other removed EntityBase setters at runtime

**Standard YAML configurations are not affected.**

## Migration Guide

### Entity base migration

```cpp
// Before
const auto &icon = entity->get_icon_ref();
const auto &dc = entity->get_device_class_ref();

// After
char icon_buf[MAX_ICON_LENGTH];
const char *icon = entity->get_icon_to(icon_buf);

char dc_buf[MAX_DEVICE_CLASS_LENGTH];
const char *dc = entity->get_device_class_to(dc_buf);
```

### NumberTraits migration

```cpp
// Before — accessed through traits (only Number had this pattern)
auto dc = number->traits.get_device_class();       // or get_device_class_ref()
auto uom = number->traits.get_unit_of_measurement_ref();

// After — accessed directly on entity, consistent with all other entity types
char dc_buf[MAX_DEVICE_CLASS_LENGTH];
const char *dc = number->get_device_class_to(dc_buf);
const auto &uom = number->get_unit_of_measurement_ref();
```

### Checking if icon/device class is set

```cpp
// Before
const auto &icon = entity->get_icon_ref();
if (!icon.empty()) {
  // use icon
}

// After
char icon_buf[MAX_ICON_LENGTH];
const char *icon = entity->get_icon_to(icon_buf);
if (icon != nullptr) {
  // use icon
}
```

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
  char icon_buf[MAX_ICON_LENGTH];
  const char *icon = entity->get_icon_to(icon_buf);
#else
  const auto &icon = entity->get_icon_ref();
#endif
```

## Timeline

- **ESPHome 2026.3.0 (March 2026):** Old methods deprecated, `static_assert` on ESP8266, new buffer APIs available
- **ESPHome 2026.9.0 (September 2026):** Old methods removed on all platforms

## Finding Code That Needs Updates

```bash
# Find deprecated method usage
grep -rn 'get_icon_ref\|get_icon()' your_component/
grep -rn 'get_device_class_ref\|get_device_class()' your_component/

# Find NumberTraits accessors that moved to entity
grep -rn 'traits\.get_device_class\|traits\.get_unit_of_measurement' your_component/

# Find removed EntityBase setters
grep -rn 'set_icon\|set_device_class\|set_unit_of_measurement\|set_internal\|set_disabled_by_default\|set_entity_category\|set_name(' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14171: Pack entity string properties into PROGMEM-indexed fields](https://github.com/esphome/esphome/pull/14171)
- [PR #14437: Move icon strings to PROGMEM on ESP8266](https://github.com/esphome/esphome/pull/14437)
- [PR #14443: Move device class strings to PROGMEM on ESP8266](https://github.com/esphome/esphome/pull/14443)
- [PR #14564: Pack entity flags into configure_entity_() and protect setters](https://github.com/esphome/esphome/pull/14564)
