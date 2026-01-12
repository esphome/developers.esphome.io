---
date: 2026-01-12
authors:
  - bdraco
comments: true
---

# USE_ESP_IDF Deprecated in Favor of USE_ESP32

The `USE_ESP_IDF` C++ define and related Python APIs are deprecated. Since Arduino-ESP32 is built on ESP-IDF, all IDF APIs are available on ESP32 regardless of framework selection.

This is a **breaking change** for external components in **ESPHome 2026.1.0 and later**.

<!-- more -->

## Background

**[PR #12673](https://github.com/esphome/esphome/pull/12673): Replace USE_ESP_IDF with USE_ESP32 across components**

The ESP32 Arduino framework is built on top of ESP-IDF, so ESP-IDF APIs are always available when targeting ESP32. This change simplifies framework checks by unifying on platform detection rather than framework detection.

## What's Changing

### C++ Defines

```cpp
// Before - framework check
#ifdef USE_ESP_IDF
  // This code was only included for IDF builds
#endif

// After - platform check
#ifdef USE_ESP32
  // This code is included for all ESP32 builds
#endif
```

### Python Configuration

```python
# Before - framework validation (deprecated)
CONFIG_SCHEMA = cv.All(
    my_schema,
    cv.only_with_esp_idf,  # Deprecated
)

# After - platform validation
CONFIG_SCHEMA = cv.All(
    my_schema,
    cv.only_on_esp32,
)
```

### Python Code

```python
# Before - framework check (deprecated)
if CORE.using_esp_idf:
    # code for IDF framework

# After - platform check
if CORE.is_esp32:
    # code for all ESP32 builds
```

## Who This Affects

External components that:
- Use `#ifdef USE_ESP_IDF` in C++ code
- Use `CORE.using_esp_idf` in Python code
- Use `cv.only_with_esp_idf` validator

**Standard YAML configurations are not affected.**

## Migration Guide

### 1. C++ ifdef checks

```cpp
// Before
#ifdef USE_ESP_IDF
#include "esp_wifi.h"
void init_wifi() {
  esp_wifi_init(...);
}
#endif

// After
#ifdef USE_ESP32
#include "esp_wifi.h"
void init_wifi() {
  esp_wifi_init(...);
}
#endif
```

### 2. Python configuration validation

```python
# Before
import esphome.config_validation as cv

CONFIG_SCHEMA = cv.All(
    cv.Schema({...}),
    cv.only_with_esp_idf,
)

# After
CONFIG_SCHEMA = cv.All(
    cv.Schema({...}),
    cv.only_on_esp32,
)
```

### 3. Python platform checks

```python
# Before
from esphome.core import CORE

async def to_code(config):
    if CORE.using_esp_idf:
        # IDF-specific code

# After
async def to_code(config):
    if CORE.is_esp32:
        # ESP32 code (works with both Arduino and IDF)
```

### 4. Framework-specific code (rare)

If you genuinely need framework-specific code (not just platform-specific):

```python
# If you need to differentiate Arduino vs pure IDF
if CORE.is_esp32 and not CORE.using_arduino:
    # Pure ESP-IDF only (no Arduino layer)
elif CORE.is_esp32 and CORE.using_arduino:
    # Arduino framework on ESP32
```

```cpp
// C++ framework check (rare) - use explicit framework defines
#ifdef USE_ESP32_FRAMEWORK_ESP_IDF
  // Pure ESP-IDF framework
#elif defined(USE_ESP32_FRAMEWORK_ARDUINO)
  // Arduino framework on ESP32
#endif
```

## Why This Change

1. **Arduino-ESP32 is built on ESP-IDF** - All ESP-IDF APIs are available regardless of framework selection
2. **Simplifies code** - Most `USE_ESP_IDF` checks were really platform checks, not framework checks
3. **Reduces confusion** - The distinction between "ESP-IDF framework" and "ESP-IDF APIs" caused confusion
4. **Unified behavior** - Components now work consistently across both frameworks

## Supporting Multiple ESPHome Versions

### C++

```cpp
// USE_ESP32 has been available for a long time
// Simply replace USE_ESP_IDF with USE_ESP32
#ifdef USE_ESP32
  // ESP32 code
#endif
```

### Python

```python
from esphome.core import CORE

# CORE.is_esp32 has been available for a long time
if CORE.is_esp32:
    # code
```

## Timeline

- **ESPHome 2026.1.0 (January 2026):** Deprecation warnings active
- **ESPHome 2026.6.0 (June 2026):** Deprecated APIs removed

## Finding Code That Needs Updates

```bash
# Find C++ USE_ESP_IDF usage
grep -rn "USE_ESP_IDF" your_component/

# Find Python using_esp_idf usage
grep -rn "using_esp_idf" your_component/

# Find Python only_with_esp_idf usage
grep -rn "only_with_esp_idf" your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [ESP32 Platform](https://esphome.io/components/esp32.html)
- [PR #12673](https://github.com/esphome/esphome/pull/12673)
