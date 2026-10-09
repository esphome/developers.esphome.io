---
title: "InternalGPIOPin Is the Platform Pin Class Instead of a Virtual Base"
date: 2026-10-09
authors: bdraco
---

`InternalGPIOPin` is no longer an abstract class. It is now a type alias for the one pin class each platform provides (`esp32::ESP32InternalGPIOPin`, `esp8266::ESP8266GPIOPin`, `rp2::RP2GPIOPin`, `libretiny::ArduinoInternalGPIOPin`, `zephyr::ZephyrGPIOPin` or `host::HostGPIOPin`), so every call through an `InternalGPIOPin *` is a direct call. `GPIOPin` is unchanged and still virtual.

This is a **developer breaking change** for external components in **ESPHome 2026.11.0 and later**.

<!-- excerpt -->

## Background

**[PR #20455](https://github.com/esphome/esphome/pull/20455): Bind InternalGPIOPin to the platform pin class instead of a virtual base**

Every image contains exactly one internal pin implementation, chosen by the platform at build time. `InternalGPIOPin` was still an abstract class on top of it, so `get_pin()`, `is_inverted()`, `to_isr()`, `attach_interrupt()` and `detach_interrupt()` all went through a vtable for no reason, and the compiler could not inline the trivial getters. Preferences and the OTA backend had the same shape and were already converted to a concept-checked alias; this change applies the same pattern to pins.

`GPIOPin` is a different case and stays virtual. Which class sits behind a `GPIOPin *` is decided per configuration between the internal pin and the I/O expander pins (pcf8574, mcp23xxx, sx1509 and others), so that polymorphism is real.

### Flash and RAM

Measured on esp32-idf test configurations:

| Configuration | Flash before | Flash after | RAM |
| --- | --- | --- | --- |
| gpio switch, output and binary sensor | 200439 | 200375 | unchanged |
| pulse_counter | 197927 | 197867 | unchanged |
| dht | 199351 | 197819 | 8 bytes less |
| deep_sleep, timer only, no pins | 198079 | 198131 | unchanged |

Components that drive a pin many times, like dht's bit-banged read, gain the most. The last row is the one configuration that grows: ESP32 used to leave its pin source out of a build with no pins, and the direct calls now need those methods to link, so the file is always compiled and the linker keeps only what is referenced.

## What's Changing

- `esphome/core/gpio.h` includes the platform's pin header and declares `using InternalGPIOPin = <platform class>;`, checked by a `static_assert` on the new `InternalGPIOPinContract` concept.
- `GPIOPin`, the `gpio::Flags` enum, `ISRInternalGPIOPin` and the concept live in the new `esphome/core/gpio_pin.h`. Including `esphome/core/gpio.h` or `esphome/core/hal.h` still gives you everything it did before.
- The platform pin classes derive from `GPIOPin` directly and are `final`. The protected hook that takes a `void (*)(void *)` callback is now named `attach_interrupt_()`; the public `attach_interrupt<T>()` template is unchanged.
- `GPIOPin::is_internal()` now carries a rule: only the platform pin class behind the alias may return `true`, because callers `static_cast` to `InternalGPIOPin` on it.
- The `USE_ESP32_INTERNAL_GPIO` define is gone.

## Who This Affects

**External components that:**

- Derive a class from `InternalGPIOPin`, for example a pin implementation for a platform ESPHome does not ship, or a dummy pin in a unit test.
- Derive from `InternalGPIOPin` only to reach the protected `attach_interrupt` overload that takes a `void (*)(void *)`.
- Derive from `GPIOPin` and return `true` from `is_internal()`.

**Components that take an `InternalGPIOPin *` or a `GPIOPin *` are not affected.** Setters such as `set_pin(InternalGPIOPin *pin)`, calls like `pin->get_pin()` or `pin->attach_interrupt(...)`, and I/O expander pins that derive from `GPIOPin` compile unchanged. **Standard YAML configurations are not affected.**

## Migration Guide

### A subclass of InternalGPIOPin

The class is `final`, so this no longer compiles:

```cpp
// Before
class MyPin : public InternalGPIOPin {
  ...
};
```

A pin implementation for a new platform belongs next to the existing ones: add the class to the platform component and bind it in the platform chain in `esphome/core/gpio.h`. A test that only needs some internal pin can use the alias directly, which is the host pin in host builds:

```cpp
// After, in a host unit test
InternalGPIOPin pin;
component.set_pin(&pin);
```

### Reaching the raw attach_interrupt

Some components derived from `InternalGPIOPin` only to make the protected overload visible:

```cpp
// Before
struct ExposeInternalPin : public InternalGPIOPin {
  using InternalGPIOPin::attach_interrupt;
};
static_cast<ExposeInternalPin *>(pin)->attach_interrupt(my_isr, arg, gpio::INTERRUPT_ANY_EDGE);
```

The public template already takes any pointer type, so call it directly:

```cpp
// After
pin->attach_interrupt(my_isr, arg, gpio::INTERRUPT_ANY_EDGE);
```

### A GPIOPin subclass that returns true from is_internal()

Return `false`. Callers that see `true` cast the pointer to the platform pin class, so any other class returning `true` is undefined behavior.

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 11, 0)
// InternalGPIOPin is the platform class; use the alias directly
#else
// InternalGPIOPin is an abstract base; a subclass still works here
#endif
```

## Timeline

- **ESPHome 2026.11.0 (November 2026):** `InternalGPIOPin` becomes the platform pin class
- No deprecation period: a `final` class cannot keep a subclass compiling

## Finding Code That Needs Updates

```bash
# Subclasses of InternalGPIOPin and is_internal() overrides
grep -rn 'public InternalGPIOPin\|public esphome::InternalGPIOPin\|is_internal() override' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #20455: Bind InternalGPIOPin to the platform pin class instead of a virtual base](https://github.com/esphome/esphome/pull/20455)
