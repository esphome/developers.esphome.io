---
date: 2025-11-20
authors:
  - bdraco
comments: true
---

# Network get_use_address() Optimization

The `network::get_use_address()` function has been optimized to return `const char*` instead of `std::string` to reduce memory overhead. This eliminates unnecessary string copies when accessing the device's network address.

This is a **breaking change** for external components that call `network::get_use_address()` in **ESPHome 2025.11.0 and later**.

<!-- more -->

## What needs to change

External components must remove `.c_str()` calls when using `get_use_address()`:

```cpp
// ❌ Before 2025.11
ESP_LOGCONFIG(TAG, "  Address: %s:%u",
              esphome::network::get_use_address().c_str(), this->port_);

// ✅ After 2025.11
ESP_LOGCONFIG(TAG, "  Address: %s:%u",
              esphome::network::get_use_address(), this->port_);
```

## Compilation errors

External components using `.c_str()` will fail with:

```
error: member reference base type 'const char *' is not a structure or union
  esphome::network::get_use_address().c_str()
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^~~~~~~
```

The fix is simple: remove `.c_str()`.

## Common usage patterns

### Logging (most common)

```cpp
// Before 2025.11
ESP_LOGD(TAG, "Connecting to %s",
         esphome::network::get_use_address().c_str());

// After 2025.11
ESP_LOGD(TAG, "Connecting to %s",
         esphome::network::get_use_address());
```

### Storing the address

If you need to store the address in a `std::string`:

```cpp
// Before 2025.11
std::string address = esphome::network::get_use_address();

// After 2025.11 (still works - implicit conversion)
std::string address = esphome::network::get_use_address();

// After 2025.11 (more efficient if you don't need mutation)
const char *address = esphome::network::get_use_address();
```

### Passing to functions

```cpp
// Before 2025.11
this->client_->connect(esphome::network::get_use_address().c_str(), port);

// After 2025.11
this->client_->connect(esphome::network::get_use_address(), port);
```

## Supporting multiple ESPHome versions

If your external component needs to support both old and new ESPHome versions:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2025, 11, 0)
  ESP_LOGCONFIG(TAG, "  Address: %s:%u",
                esphome::network::get_use_address(), this->port_);
#else
  ESP_LOGCONFIG(TAG, "  Address: %s:%u",
                esphome::network::get_use_address().c_str(), this->port_);
#endif
```

### Cleaner version with macro

For components with many uses:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2025, 11, 0)
  #define GET_USE_ADDRESS() esphome::network::get_use_address()
#else
  #define GET_USE_ADDRESS() esphome::network::get_use_address().c_str()
#endif

// Then use throughout your code:
ESP_LOGCONFIG(TAG, "  Address: %s:%u", GET_USE_ADDRESS(), this->port_);
```

## Affected components

This change affects the following network components:

- `wifi` - `wifi::get_use_address()`
- `ethernet` - `ethernet::get_use_address()`
- `openthread` - `openthread::get_use_address()`

All three now return `const char*` instead of `const std::string&`.

## Why this change

The previous implementation returned a `std::string` reference, but the string itself was stored internally. This meant:

1. **Unnecessary heap allocation** - Each `get_use_address()` result was a string object
2. **Copy overhead** - Using `.c_str()` implied there was a string to convert from
3. **Memory waste** - The address is typically a static configuration value

By returning `const char*` directly:

- **Zero allocations** - No string objects created when reading the address
- **Simpler API** - Direct use in logging and C-style string functions
- **Memory savings** - Eliminates string object overhead (typically 24 bytes per instance)

## Real-world example

Here's the fix applied to [esphome-stream-server](https://github.com/oxan/esphome-stream-server/pull/58):

```cpp
void StreamServerComponent::dump_config() {
    ESP_LOGCONFIG(TAG, "Stream Server:");
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2025, 11, 0)
    ESP_LOGCONFIG(TAG, "  Address: %s:%u",
                  esphome::network::get_use_address(), this->port_);
#else
    ESP_LOGCONFIG(TAG, "  Address: %s:%u",
                  esphome::network::get_use_address().c_str(), this->port_);
#endif
    // ... rest of dump_config
}
```

## Finding code that needs updates

```bash
# Find uses of get_use_address().c_str()
grep -rn "get_use_address()\.c_str()" your_component/

# Check for all get_use_address() calls to review
grep -rn "get_use_address()" your_component/
```

## Reference Pull Request

- [esphome/esphome#11707](https://github.com/esphome/esphome/pull/11707)

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)
