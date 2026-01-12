---
date: 2026-01-12
authors:
  - bdraco
comments: true
---

# Build Info and compilation_time API Changes

The `App.get_compilation_time()` method is deprecated in favor of new constexpr methods. The `compilation_time` field in the native API now updates on every compile.

This is a **breaking change** for external components in **ESPHome 2026.1.0 and later**.

<!-- more -->

## Background

**[PR #12425](https://github.com/esphome/esphome/pull/12425): Add build info to image**

This PR modernizes the build info API with compile-time evaluated methods and fixes the inconsistent `compilation_time` behavior.

## What's Changing

### Deprecated Methods

```cpp
// Deprecated - removal in 2026.7.0
std::string App.get_compilation_time();

// Removed immediately
const StringRef &App.get_compilation_time_ref();
```

### New Methods

```cpp
// New - compile-time evaluated
constexpr time_t App.get_build_time();           // Unix timestamp
constexpr uint32_t App.get_config_hash();        // FNV-1a config hash
constexpr uint32_t App.get_config_version_hash(); // Config + version hash

// New - formatted string output
void App.get_build_time_string(std::span<char, BUILD_TIME_STR_SIZE> buffer);  // "2026-01-12 14:30:45 +0000"
```

### API compilation_time Behavior

The `compilation_time` field in the native API DeviceInfoResponse now updates on **every compile**, not just when `main.cpp` changes.

## Who This Affects

External components that:
- Call `App.get_compilation_time()` or `App.get_compilation_time_ref()`
- Use compilation time for preference hashing
- Depend on `compilation_time` staying constant across builds

**Standard YAML configurations are not affected.**

## Migration Guide

### 1. Getting build time for display

```cpp
// Before
ESP_LOGI(TAG, "Built: %s", App.get_compilation_time());

// After - use buffer
char build_time[Application::BUILD_TIME_STR_SIZE];
App.get_build_time_string(build_time);
ESP_LOGI(TAG, "Built: %s", build_time);
```

### 2. Getting build time as timestamp

```cpp
// Before - parsed the string
const char *time_str = App.get_compilation_time();
// ... parse string to get time

// After - direct timestamp (constexpr)
time_t build_time = App.get_build_time();
```

### 3. Hashing for preferences

```cpp
// Before - runtime hash of string
uint32_t hash = fnv1_hash(App.get_compilation_time_ref());

// After - compile-time evaluated hash
uint32_t hash = App.get_config_version_hash();  // Includes ESPHome version
// or
uint32_t hash = App.get_config_hash();  // Config only
```

### 4. Checking if config changed

```cpp
// The new hashes are constexpr - no runtime cost
constexpr uint32_t CONFIG_HASH = App.get_config_hash();

// Use for preference invalidation
if (stored_hash != CONFIG_HASH) {
  // Config changed, reset preferences
}
```

## New API Details

### get_build_time()

Returns the build time as a Unix timestamp (`time_t`). This is `constexpr`, meaning it's evaluated at compile time with zero runtime cost.

```cpp
time_t build = App.get_build_time();
// Example: 1736694645 (Unix timestamp)
```

### get_config_hash()

Returns a 32-bit FNV-1a hash of the configuration. Changes when the YAML config changes. Also `constexpr`.

```cpp
uint32_t hash = App.get_config_hash();
// Example: 0xABCD1234
```

### get_config_version_hash()

Combines the config hash with the ESPHome version. Changes when either config or ESPHome version changes. Useful for preference invalidation.

```cpp
uint32_t hash = App.get_config_version_hash();
```

### get_build_time_string()

Writes a formatted build time string to a buffer. Format: `"YYYY-MM-DD HH:MM:SS +ZZZZ"` (ISO 8601 style).

```cpp
char buffer[Application::BUILD_TIME_STR_SIZE];  // 26 bytes
App.get_build_time_string(buffer);
// buffer now contains "2026-01-12 14:30:45 +0000"
```

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 1, 0)
  // New API
  char build_time[Application::BUILD_TIME_STR_SIZE];
  App.get_build_time_string(build_time);
  ESP_LOGI(TAG, "Built: %s", build_time);
#else
  // Old API
  ESP_LOGI(TAG, "Built: %s", App.get_compilation_time());
#endif
```

## Timeline

- **ESPHome 2026.1.0 (January 2026):** New methods available; `get_compilation_time()` deprecated
- **ESPHome 2026.7.0 (July 2026):** `get_compilation_time()` removed

## Finding Code That Needs Updates

```bash
# Find compilation time usage
grep -rn "get_compilation_time" your_component/

# Find any App.get_ calls related to build info
grep -rn "App\.get_" your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [Native API Component](https://esphome.io/components/api.html)
- [PR #12425](https://github.com/esphome/esphome/pull/12425)
