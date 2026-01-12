---
date: 2026-01-12
authors:
  - bdraco
comments: true
---

# GPIOPin::dump_summary() Now Uses Buffer-Based API

The `GPIOPin::dump_summary()` virtual method now writes to a caller-provided buffer instead of returning `std::string`. This eliminates heap allocations during configuration dumps.

This is a **breaking change** for external components that implement custom GPIO pins in **ESPHome 2026.1.0 and later**.

<!-- more -->

## Background

**[PR #12760](https://github.com/esphome/esphome/pull/12760): Avoid heap allocation in dump_summary**

The old API returned `std::string`, causing heap allocations during `dump_config()` calls. The new buffer-based API writes directly to a stack buffer, saving ~3,600 bytes of flash on ESP8266 and eliminating runtime heap allocations.

## What's Changing

```cpp
// Before - returns heap-allocated string
virtual std::string dump_summary() const;

// After - writes to caller-provided buffer
virtual size_t dump_summary(char *buffer, size_t len) const;
```

The new method:
- Takes a buffer pointer and length
- Writes the summary string to the buffer
- Returns the number of bytes written (excluding null terminator)

## Who This Affects

External components that implement custom GPIO pin classes by overriding `dump_summary()`.

**22+ built-in implementations were updated**, including:
- Platform GPIO: ESP32, ESP8266, RP2040, Host, LibreTiny, Zephyr
- I/O Expanders: PCF8574, PCA9554, PCA6416A, MCP23016, MCP23XXX, TCA9555, XL9535, SX1509, MAX6956, CH422G
- Shift Registers: SN74HC165, SN74HC595
- Specialized: PI4IOE5V6408, MPR121, WeiKai, SPI NullPin

**Standard YAML configurations are not affected.**

## Migration Guide

### Update your dump_summary() override

```cpp
// Before
class MyGPIOPin : public GPIOPin {
 public:
  std::string dump_summary() const override {
    char buffer[32];
    snprintf(buffer, sizeof(buffer), "MY_GPIO%02d", this->pin_);
    return buffer;
  }
};

// After
class MyGPIOPin : public GPIOPin {
 public:
  size_t dump_summary(char *buffer, size_t len) const override {
    return snprintf(buffer, len, "MY_GPIO%02d", this->pin_);
  }
};
```

### Key differences

1. **Return type**: `size_t` (bytes written) instead of `std::string`
2. **Parameters**: Takes `char *buffer` and `size_t len`
3. **Writing**: Use `snprintf()` directly to the provided buffer
4. **No allocation**: No `std::string` construction needed

### Example with mode information

```cpp
size_t MyGPIOPin::dump_summary(char *buffer, size_t len) const override {
  return snprintf(buffer, len, "MY_GPIO%02d (%s, %s)",
                  this->pin_,
                  this->inverted_ ? "INVERTED" : "",
                  this->mode_ == gpio::FLAG_INPUT ? "INPUT" : "OUTPUT");
}
```

## Backward Compatibility

The old `std::string dump_summary() const` method is deprecated but still works during the transition period. If you override only the old method, a bridge implementation will call it and copy the result to the buffer.

However, this bridge causes unnecessary heap allocation, defeating the purpose of the change. Update to the new signature for optimal performance.

## Supporting Multiple ESPHome Versions

```cpp
class MyGPIOPin : public GPIOPin {
 public:
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 1, 0)
  size_t dump_summary(char *buffer, size_t len) const override {
    return snprintf(buffer, len, "MY_GPIO%02d", this->pin_);
  }
#else
  std::string dump_summary() const override {
    char buffer[32];
    snprintf(buffer, sizeof(buffer), "MY_GPIO%02d", this->pin_);
    return buffer;
  }
#endif
};
```

## Timeline

- **ESPHome 2026.1.0 (January 2026):** New buffer-based API is active; old method deprecated
- **ESPHome 2026.7.0 (July 2026):** Old `std::string dump_summary()` method removed

## Finding Code That Needs Updates

```bash
# Find dump_summary overrides returning std::string
grep -rn "std::string dump_summary" your_component/

# Find GPIOPin subclasses
grep -rn "class.*: public.*GPIOPin" your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [GPIO Component Documentation](https://esphome.io/components/output/gpio.html)
- [PR #12760](https://github.com/esphome/esphome/pull/12760)
