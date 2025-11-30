---
date: 2025-11-20
authors:
  - bdraco
comments: true
---

# Network get_use_address() Optimization

The `network::get_use_address()` function has been optimized to return `const char*` instead of `const std::string&` to reduce memory overhead. This eliminates unnecessary string object storage when accessing the device's network address.

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

> **Note:** `esphome::network::get_use_address()` is a wrapper function that delegates to the appropriate component-specific function (`wifi::get_use_address()`, `ethernet::get_use_address()`, or `openthread::get_use_address()`) depending on your network configuration. Most external components should use the `network::` wrapper for generic code. Only use component-specific functions if your code explicitly depends on a particular network type.

## Why this change

The previous implementation stored the address internally as a `std::string` and returned a reference to it. This meant:

1. **Unnecessary string object overhead** - The address was stored as a `std::string`, even though it is typically a static configuration value set once during setup
2. **Extra memory usage** - The `std::string` object itself uses heap memory plus object overhead (typically 24-32 bytes)
3. **API complexity** - Callers needed to use `.c_str()` to access the raw address for logging, even though no conversion or copy was performed

By returning `const char*` directly and storing the address as a pointer to flash memory (RODATA):

- **Zero string object overhead** - No `std::string` objects are created or stored for the address
- **Simpler API** - The address can be used directly in logging and C-style string functions
- **Memory savings** - Eliminates the `std::string` overhead, saving 32-72 bytes of RAM per network component

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
