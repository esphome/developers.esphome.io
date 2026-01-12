---
date: 2026-01-12
authors:
  - bdraco
comments: true
---

# Stack-Based Formatting Helpers Replace Heap-Allocating Functions

Several string formatting helpers that returned `std::string` are now soft-deprecated in favor of stack-based alternatives. This prevents heap fragmentation on long-running ESP devices.

This is a **breaking change** for external components in **ESPHome 2026.1.0 and later**.

<!-- more -->

## Background

ESP devices run for months with small heaps shared between Wi-Fi, BLE, LWIP, and application code. Over time, repeated allocations of different sizes fragment the heap. Failures occur when the largest contiguous block shrinks, even if total free heap remains large. For this reason, ESPHome treats runtime heap allocation in hot paths as a reliability bug.

These PRs soft-deprecate heap-allocating helpers and migrate internal callers:

**[PR #13156](https://github.com/esphome/esphome/pull/13156): Core helper deprecations**
Soft-deprecates `format_hex()` and `format_hex_pretty()` in favor of buffer-based alternatives.

**[PR #13157](https://github.com/esphome/esphome/pull/13157): MAC address helpers**
Soft-deprecates `get_mac_address()` and `get_mac_address_pretty()`.

**[PR #13158](https://github.com/esphome/esphome/pull/13158): format_hex_pretty and MideaData**
Migrates `format_hex_pretty()` callers; deprecates `MideaData::to_string()`.

**[PR #13159](https://github.com/esphome/esphome/pull/13159): value_accuracy_to_string**
Migrates 22 call sites from `value_accuracy_to_string()` to `value_accuracy_to_buf()`.

**[PR #12799](https://github.com/esphome/esphome/pull/12799): ABBWelcome**
Replaces `ABBWelcomeData::to_string()` with `ABBWelcomeData::format_to()`.

**[PR #12629](https://github.com/esphome/esphome/pull/12629): get_object_id**
Deprecates `get_object_id()` in favor of `get_object_id_to()`.

## What's Changing

### Deprecated functions and replacements

| Deprecated Function | Replacement | Buffer Size Constant |
|---------------------|-------------|----------------------|
| `format_hex()` | `format_hex_to()` | `2 * data.size() + 1` |
| `format_hex_pretty()` | `format_hex_pretty_to()` | `3 * data.size()` |
| `get_mac_address()` | `get_mac_address_into_buffer()` | `MAC_ADDRESS_BUFFER_SIZE` (13) |
| `get_mac_address_pretty()` | `get_mac_address_pretty_into_buffer()` | `MAC_ADDRESS_PRETTY_BUFFER_SIZE` (18) |
| `value_accuracy_to_string()` | `value_accuracy_to_buf()` | `VALUE_ACCURACY_MAX_LEN` (64) |
| `get_object_id()` | `get_object_id_to()` | `OBJECT_ID_MAX_LEN` (128) |
| `MideaData::to_string()` | `MideaData::to_str()` | `MideaData::TO_STR_BUFFER_SIZE` |
| `ABBWelcomeData::to_string()` | `ABBWelcomeData::format_to()` | `ABBWelcomeData::FORMAT_BUFFER_SIZE` (192) |

## Who This Affects

- External components using any of the deprecated functions
- YAML lambdas that call these functions

**Standard YAML configurations are not affected.**

## Migration Guide

### 1. format_hex()

```cpp
// Before - heap allocation
std::string hex = format_hex(data);
ESP_LOGD(TAG, "Data: %s", hex.c_str());

// After - stack buffer
char hex[64];  // size = 2 * data.size() + 1
ESP_LOGD(TAG, "Data: %s", format_hex_to(hex, data));
```

### 2. format_hex_pretty()

```cpp
// Before - heap allocation
std::string hex = format_hex_pretty(data);
ESP_LOGD(TAG, "Data: %s", hex.c_str());

// After - stack buffer
char hex[96];  // size = 3 * data.size()
ESP_LOGD(TAG, "Data: %s", format_hex_pretty_to(hex, data));
```

### 3. get_mac_address()

```cpp
// Before - heap allocation
std::string mac = get_mac_address();
ESP_LOGD(TAG, "MAC: %s", mac.c_str());

// After - stack buffer
char mac[MAC_ADDRESS_BUFFER_SIZE];
get_mac_address_into_buffer(mac);
ESP_LOGD(TAG, "MAC: %s", mac);
```

### 4. get_mac_address_pretty()

```cpp
// Before - heap allocation
std::string mac = get_mac_address_pretty();
ESP_LOGD(TAG, "MAC: %s", mac.c_str());

// After - stack buffer
char mac[MAC_ADDRESS_PRETTY_BUFFER_SIZE];
get_mac_address_pretty_into_buffer(mac);
ESP_LOGD(TAG, "MAC: %s", mac);
```

### 5. value_accuracy_to_string()

```cpp
// Before - heap allocation
std::string value = value_accuracy_to_string(sensor_value, accuracy);
ESP_LOGD(TAG, "Value: %s", value.c_str());

// After - stack buffer
char value[VALUE_ACCURACY_MAX_LEN];
value_accuracy_to_buf(value, sensor_value, accuracy);
ESP_LOGD(TAG, "Value: %s", value);

// With unit of measurement
char value_uom[VALUE_ACCURACY_MAX_LEN];
value_accuracy_with_uom_to_buf(value_uom, sensor_value, accuracy, "C");
```

### 6. get_object_id()

```cpp
// Before - heap allocation
std::string id = sensor->get_object_id();
ESP_LOGD(TAG, "ID: %s", id.c_str());

// After - stack buffer (returns StringRef wrapping the buffer)
char buf[OBJECT_ID_MAX_LEN];
StringRef id = sensor->get_object_id_to(buf);
ESP_LOGD(TAG, "ID: %s", id.c_str());

// Or use get_name() for logging (often better)
ESP_LOGD(TAG, "Name: %s", sensor->get_name().c_str());
```

### 7. MideaData::to_string()

```cpp
// Before - heap allocation
std::string str = midea_data.to_string();
ESP_LOGD(TAG, "Data: %s", str.c_str());

// After - stack buffer
char str[MideaData::TO_STR_BUFFER_SIZE];
ESP_LOGD(TAG, "Data: %s", midea_data.to_str(str));
```

### 8. ABBWelcomeData::to_string()

```cpp
// Before - heap allocation
std::string str = abb_data.to_string();
ESP_LOGD(TAG, "Data: %s", str.c_str());

// After - stack buffer
char str[ABBWelcomeData::FORMAT_BUFFER_SIZE];
abb_data.format_to(str);
ESP_LOGD(TAG, "Data: %s", str);
```

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 1, 0)
  // New API - stack-based
  char mac[MAC_ADDRESS_PRETTY_BUFFER_SIZE];
  get_mac_address_pretty_into_buffer(mac);
  ESP_LOGD(TAG, "MAC: %s", mac);
#else
  // Old API - heap-allocating
  ESP_LOGD(TAG, "MAC: %s", get_mac_address_pretty().c_str());
#endif
```

## Timeline

- **ESPHome 2026.1.0 (January 2026):** Deprecation warnings active
- **ESPHome 2026.7.0 (July 2026):** `get_object_id()` removed; other deprecated functions may be removed

## Finding Code That Needs Updates

```bash
# Find deprecated function calls
grep -rn "format_hex(" your_component/
grep -rn "format_hex_pretty(" your_component/
grep -rn "get_mac_address(" your_component/
grep -rn "get_mac_address_pretty(" your_component/
grep -rn "value_accuracy_to_string(" your_component/
grep -rn "get_object_id(" your_component/
grep -rn "\.to_string(" your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [Memory Management Guidelines](https://developers.esphome.io/contributing/code/#memory-management-and-heap-allocation)
- [PR #13156: Core helpers](https://github.com/esphome/esphome/pull/13156)
- [PR #13157: MAC address](https://github.com/esphome/esphome/pull/13157)
- [PR #13158: format_hex_pretty](https://github.com/esphome/esphome/pull/13158)
- [PR #13159: value_accuracy](https://github.com/esphome/esphome/pull/13159)
- [PR #12799: ABBWelcome](https://github.com/esphome/esphome/pull/12799)
- [PR #12629: get_object_id](https://github.com/esphome/esphome/pull/12629)
