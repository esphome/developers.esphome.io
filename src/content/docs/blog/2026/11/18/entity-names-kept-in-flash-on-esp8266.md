---
title: "Entity Names Kept in Flash on ESP8266"
date: 2026-11-18
authors: bdraco
---

Entity names are now stored in flash on ESP8266 instead of RAM. `EntityBase::get_name()` is deprecated on **all platforms** and replaced by `get_name_to()` for a copy of the name and `get_log_name()` for logging. It keeps working everywhere with a deprecation warning until it is removed in 2027.5.0. On ESP8266 the first call for an entity makes a RAM copy of its name and keeps it, so callers pay back the RAM this change saves for that entity.

This is a **developer breaking change** for external components in **ESPHome 2026.11.0 and later**.

<!-- excerpt -->

## Background

**[PR #20423](https://github.com/esphome/esphome/pull/20423): Keep entity names in flash on ESP8266**

On ESP8266, string literals are copied into RAM at boot, so every entity name used RAM for the life of the device. Code generation now wraps names in `ESPHOME_PSTR`, which keeps them in flash on ESP8266 and changes nothing on other platforms. A device with 27 entities saves 316 bytes of RAM.

Flash on ESP8266 can only be read in aligned 32 bit words. Code that reads a name one byte at a time (`strcmp`, `memcpy`, `std::string`, iterating, hashing) crashes there with a load or store exception. Passing the name to a `%s` log argument is safe, because the logger reads flash strings correctly. The same approach was used for icons and device classes in [Icon and Device Class Getter Migration](/blog/2026/03/12/icon-and-device-class-getter-migration/).

## What's Changing

### Deprecated methods (all platforms, removal 2027.5.0)

| Method | Replacement |
| -------- | ------------ |
| `get_name()` used in a log call | `LOG_STR_ARG(get_log_name())` |
| `get_name()` for anything else | `get_name_to(buffer)` |
| `name_.c_str()` from a subclass | `LOG_STR_ARG(get_log_name())` |

### `name_` is now a `ProgmemStringRef`

The protected `EntityBase::name_` member is now a `ProgmemStringRef`: a pointer and a length with no operations that read the characters. Comparing it, copying it or reading its characters no longer compiles, on any platform, so these mistakes are caught at build time instead of crashing on ESP8266. Its `c_str()` still works with a deprecation warning, for subclasses that log `this->name_.c_str()`, and will be removed in 2027.5.0.

### New APIs

```cpp
// Logging: no copy, safe on every platform
ESP_LOGD(TAG, "'%s' updated", LOG_STR_ARG(this->get_log_name()));

// A copy of the name: copied out of flash on ESP8266, returned directly elsewhere
char name_buf[ENTITY_NAME_BUF_SIZE];
StringRef name = entity->get_name_to(name_buf);

// Write the name into a larger buffer, returns the length written
size_t len = entity->write_name_to(buf, sizeof(buf));

// Compare the name without copying it
if (entity->name_equals(other)) {
  // ...
}
```

`ENTITY_NAME_BUF_SIZE` is 121 bytes, since entity names are limited to 120 bytes.

### `MQTTComponent::friendly_name_()` deprecated

The protected `MQTTComponent::friendly_name_()` helper is deprecated in favor of `log_name_()`, which returns a `const LogString *` for log calls. Like `get_name()`, it keeps working until it is removed in 2027.5.0, and on ESP8266 it uses the same RAM copy.

### `Sprinkler::valve_name()` deprecated

`Sprinkler::valve_name()` returned a pointer to the valve's name, which is now in flash on ESP8266. Like `get_name()`, it is deprecated until 2027.5.0, and on ESP8266 it uses the same RAM copy. Use `valve_log_name()` for logging, or `valve_switch(n)->get_name_to(buffer)` for a copy.

## Who This Affects

**External components that:**

- Call `get_name()` on any entity: deprecation warning on all platforms
- Read `this->name_` from an entity subclass: deprecation warning for `c_str()`, compile error for anything else
- Call `friendly_name_()` from an `MQTTComponent` subclass
- Call `Sprinkler::valve_name()`

**Lambdas in YAML configurations** that call `get_name()` on an entity (for example `id(my_sensor).get_name()`) need the same change.

## Migration Guide

```cpp
// Before
ESP_LOGD(TAG, "'%s' updated", this->get_name().c_str());
ESP_LOGD(TAG, "'%s' updated", this->name_.c_str());
this->send_name_(sensor->get_name());
bool match = sensor->get_name() == other;

// After
ESP_LOGD(TAG, "'%s' updated", LOG_STR_ARG(this->get_log_name()));
char name_buf[ENTITY_NAME_BUF_SIZE];
this->send_name_(sensor->get_name_to(name_buf));
bool match = sensor->name_equals(other);
```

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 11, 0)
  ESP_LOGD(TAG, "'%s' updated", LOG_STR_ARG(this->get_log_name()));
#else
  ESP_LOGD(TAG, "'%s' updated", this->get_name().c_str());
#endif
```

## Timeline

- **ESPHome 2026.11.0 (November 2026):** `get_name()`, `MQTTComponent::friendly_name_()`, `Sprinkler::valve_name()` and `ProgmemStringRef::c_str()` deprecated, new APIs available
- **ESPHome 2027.5.0 (May 2027):** `get_name()`, `MQTTComponent::friendly_name_()`, `Sprinkler::valve_name()` and `ProgmemStringRef::c_str()` removed on all platforms

## Finding Code That Needs Updates

```bash
grep -rn 'get_name()' your_component/
grep -rn 'name_\.c_str()\|friendly_name_()\|valve_name(' your_component/
```

`get_name()` also exists on unrelated classes such as `Application`, `Device` and light effects; only the entity method changes.

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #20423: Keep entity names in flash on ESP8266](https://github.com/esphome/esphome/pull/20423)
- [Icon and Device Class Getter Migration](/blog/2026/03/12/icon-and-device-class-getter-migration/)
