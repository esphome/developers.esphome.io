---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# ESP8266 PROGMEM: Icon and Device Class Getter Migration

Icon and device class strings are now stored in PROGMEM on ESP8266, making the old `get_icon_ref()`, `get_icon()`, `get_device_class_ref()`, and `get_device_class()` methods unable to return valid C string pointers on that platform. New buffer-based APIs `get_icon_to()` and `get_device_class_to()` replace them. The old methods are deprecated on all platforms and will produce a `static_assert` error on ESP8266.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14437](https://github.com/esphome/esphome/pull/14437): Move icon strings to PROGMEM on ESP8266**
**[PR #14443](https://github.com/esphome/esphome/pull/14443): Move device class strings to PROGMEM on ESP8266**

On ESP8266, RAM is extremely limited. Icon and device class strings — which are set at compile time and never change — were consuming valuable heap RAM. Moving them to PROGMEM (flash) frees this RAM, but PROGMEM strings cannot be accessed through normal C string pointers on ESP8266. The old getter methods returned references or pointers to these strings, which is fundamentally incompatible with PROGMEM storage.

The new buffer-based APIs copy the string from PROGMEM into a caller-provided buffer, which works on all platforms.

## What's Changing

### Deprecated methods (all platforms, removal 2026.9.0)

| Method | Replacement |
|--------|------------|
| `get_icon_ref()` | `get_icon_to(buffer)` |
| `get_icon()` | `get_icon_to(buffer)` |
| `get_device_class_ref()` | `get_device_class_to(buffer)` |
| `get_device_class()` | `get_device_class_to(buffer)` |

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

`MAX_ICON_LENGTH` is 64 bytes (63 characters + null terminator). Icon strings longer than 63 characters will produce a compile-time error.

## Who This Affects

**External components that:**

- Call `get_icon_ref()`, `get_icon()`, `get_device_class_ref()`, or `get_device_class()` on any entity
- Target ESP8266 (compile error) or any platform (deprecation warning)

**Standard YAML configurations are not affected.**

## Migration Guide

### Basic migration

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
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14437: Move icon strings to PROGMEM on ESP8266](https://github.com/esphome/esphome/pull/14437)
- [PR #14443: Move device class strings to PROGMEM on ESP8266](https://github.com/esphome/esphome/pull/14443)
