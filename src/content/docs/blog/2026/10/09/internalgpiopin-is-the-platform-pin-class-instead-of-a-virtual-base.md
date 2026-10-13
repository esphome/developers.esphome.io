---
title: "InternalGPIOPin Is the Platform Pin Class Instead of a Virtual Base"
date: 2026-10-09
authors: bdraco
---

`InternalGPIOPin` is no longer an abstract class. It is now a type alias for the one pin class each platform provides (`esp32::ESP32InternalGPIOPin`, `esp8266::ESP8266GPIOPin`, `rp2::RP2GPIOPin`, `libretiny::ArduinoInternalGPIOPin`, `zephyr::ZephyrGPIOPin` or `host::HostGPIOPin`), so every call through an `InternalGPIOPin *` is a direct call. `GPIOPin` keeps its virtual interface.

This is a **developer breaking change** for external components in **ESPHome 2026.11.0 and later**.

<!-- excerpt -->

## Background

**[PR #20455](https://github.com/esphome/esphome/pull/20455): Bind InternalGPIOPin to the platform pin class instead of a virtual base**

Every image contains exactly one internal pin implementation, chosen by the platform at build time. `InternalGPIOPin` was still an abstract class on top of it, so `get_pin()`, `is_inverted()`, `to_isr()`, `attach_interrupt()` and `detach_interrupt()` all went through a vtable for no reason, and the compiler could not inline the trivial getters. Preferences and the OTA backend had the same shape and were already converted to a concept-checked alias; this change applies the same pattern to pins.

`GPIOPin` is a different case and stays virtual. Which class sits behind a `GPIOPin *` is decided per configuration between the internal pin and the I/O expander pins (pcf8574, mcp23xxx, sx1509 and others), so that polymorphism is real.

### Flash and RAM

Measured on esp32-idf builds of the test configurations, plus a timer-only deep_sleep configuration with no pins:

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
- The platform pin classes, which were already `final`, derive from `GPIOPin` directly. The protected hook that takes a `void (*)(void *)` callback is now named `attach_interrupt_()`; the public `attach_interrupt<T>()` template is unchanged.
- `GPIOPin::is_internal()` now carries a rule: only the platform pin class behind the alias may return `true`, because callers `static_cast` to `InternalGPIOPin` on it.
- The `USE_ESP32_INTERNAL_GPIO` define is gone.

## Who This Affects

**External components that:**

- Derive a class from `InternalGPIOPin`, for example a pin implementation for a platform ESPHome does not ship, or a dummy pin in a unit test.
- Derive from `InternalGPIOPin` only to reach the protected `attach_interrupt` overload that takes a `void (*)(void *)`.
- Derive from `GPIOPin` and return `true` from `is_internal()`.
- Forward declare it with `class InternalGPIOPin;` instead of including `esphome/core/gpio.h`.

**Components that take an `InternalGPIOPin *` or a `GPIOPin *` are not affected** unless they forward declare it. Setters such as `set_pin(InternalGPIOPin *pin)`, calls like `pin->get_pin()` or `pin->attach_interrupt(...)`, and I/O expander pins that derive from `GPIOPin` compile unchanged. **Standard YAML configurations are not affected.**

## Migration Guide

### A subclass of InternalGPIOPin

Before, `InternalGPIOPin` was an abstract class and an external component could provide its own pin implementation behind it. The name now resolves to the platform's pin class, which was already `final`, so a subclass fails with an error such as `base 'HostGPIOPin' is marked 'final'`. Such a pin can derive from `GPIOPin` instead, which works everywhere a component takes a `GPIOPin *` but offers no interrupt API. A project that already overrides a platform component through `external_components` can instead supply its class as that platform's pin class, which the alias then picks up, or the platform can be contributed to ESPHome itself.

### Reaching the raw attach_interrupt

The public `attach_interrupt<T>()` template and the protected hook that takes a `void (*)(void *)` shared one name. A call with a plain `void *` callback picked the protected overload and failed to compile, so some components derived from `InternalGPIOPin` only to make it visible:

```cpp
// Before
struct ExposeInternalPin : public InternalGPIOPin {
  using InternalGPIOPin::attach_interrupt;
};
static_cast<ExposeInternalPin *>(pin)->attach_interrupt(my_isr, arg, gpio::INTERRUPT_ANY_EDGE);
```

The hook is now `attach_interrupt_()`, so the template is the only `attach_interrupt` and takes the `void *` form as well (`T` deduces to `void`). Call it directly:

```cpp
// After
pin->attach_interrupt(my_isr, arg, gpio::INTERRUPT_ANY_EDGE);
```

### A forward declaration of InternalGPIOPin

A header that only holds pin pointers could declare the class instead of including its header. The name is now an alias, and declaring it as a class fails. On ESP8266, for example, GCC reports `error: using typedef-name 'using InternalGPIOPin = class esphome::esp8266::ESP8266GPIOPin' after 'class'` when `esphome/core/gpio.h` was already included, or `error: conflicting declaration 'using InternalGPIOPin = class esphome::esp8266::ESP8266GPIOPin'` in `gpio.h` when the forward declaration comes first:

```cpp
// Before
namespace esphome {
class InternalGPIOPin;
}  // namespace esphome
```

Include the header instead; this works on every ESPHome version, so no version guard is needed:

```cpp
// After
#include "esphome/core/gpio.h"
```

### A GPIOPin subclass that returns true from is_internal()

Return `false`. Callers that see `true` cast the pointer to the platform pin class, so any other class returning `true` is undefined behavior.

## Supporting Multiple ESPHome Versions

The raw `attach_interrupt` call is the one place a version guard is needed, and only when the callback must keep its `void *` signature:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 11, 0)
pin->attach_interrupt(my_isr, arg, gpio::INTERRUPT_ANY_EDGE);
#else
struct ExposeInternalPin : public InternalGPIOPin {
  using InternalGPIOPin::attach_interrupt;
};
static_cast<ExposeInternalPin *>(pin)->attach_interrupt(my_isr, arg, gpio::INTERRUPT_ANY_EDGE);
#endif
```

A typed callback avoids the guard altogether, because the public template has accepted it on every version:

```cpp
static void my_isr(MyComponent *self);
pin->attach_interrupt(my_isr, this, gpio::INTERRUPT_ANY_EDGE);
```

## Timeline

- **ESPHome 2026.11.0 (November 2026):** `InternalGPIOPin` becomes the platform pin class
- No deprecation period: once the name refers to a `final` class, nothing can keep a subclass of it compiling

## Finding Code That Needs Updates

```bash
# List every reference, then check the base lists: a class that names InternalGPIOPin
# as any of its bases is affected, as is a GPIOPin subclass whose is_internal() returns true
# and any `class InternalGPIOPin;` forward declaration
grep -rn 'InternalGPIOPin\|is_internal() override' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #20455: Bind InternalGPIOPin to the platform pin class instead of a virtual base](https://github.com/esphome/esphome/pull/20455)
