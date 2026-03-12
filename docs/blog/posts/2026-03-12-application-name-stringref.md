---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# Application Name and Friendly Name Now Return StringRef

`App.get_name()` and `App.get_friendly_name()` now return `const StringRef &` instead of `const std::string &`. Most code compiles unchanged because `StringRef` provides `.c_str()`, `.size()`, `.empty()`, and implicit conversion to `std::string`. However, binding the result to `const std::string &` silently creates a heap-allocated temporary — update these references to `const auto &` to avoid the allocation.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14532](https://github.com/esphome/esphome/pull/14532): Application name and friendly_name return StringRef**

The application name and friendly name are set once at boot and never change. Storing them as `std::string` wastes heap memory for the string object overhead and its dynamic allocation. `StringRef` is a lightweight reference to a string with static lifetime — it avoids the heap allocation entirely.

### Memory savings

| Platform | Flash savings | RAM savings |
|----------|--------------|-------------|
| ESP8266 | 752 bytes | 176 bytes |
| RP2040 | 2,508 bytes | — |

## What's Changing

```cpp
// Before
const std::string &get_name() const;
const std::string &get_friendly_name() const;

// After
const StringRef &get_name() const;
const StringRef &get_friendly_name() const;
```

`StringRef` provides:

- `.c_str()` — null-terminated C string pointer
- `.size()` — string length
- `.empty()` — true if empty
- `operator std::string()` — implicit conversion to `std::string`
- `operator==` — comparison with string literals and other strings

**Most code compiles unchanged.** The key issue is when the return value is bound to `const std::string &` — this triggers an implicit conversion that heap-allocates a temporary `std::string`.

## Who This Affects

**External components that:**

- Store `App.get_name()` or `App.get_friendly_name()` in a `const std::string &` variable
- Pass the result to functions expecting `const std::string &` (triggers implicit conversion)

**Standard YAML configurations are not affected.**

## Migration Guide

### Fix silent heap allocation

```cpp
// Before — compiles but silently heap-allocates a temporary:
const std::string &name = App.get_name();

// After — zero allocation:
const auto &name = App.get_name();
```

### Passing to functions expecting std::string

If you need to pass the name to a function that takes `const std::string &`, the implicit conversion works but allocates. If the function also accepts `const char *`, prefer `.c_str()`:

```cpp
// Heap-allocates (implicit conversion to std::string)
some_function_taking_string(App.get_name());

// Zero allocation
some_function_taking_cstr(App.get_name().c_str());
```

### Logging

```cpp
// Works — c_str() returns null-terminated string
ESP_LOGD(TAG, "Name: %s", App.get_name().c_str());
```

## Supporting Multiple ESPHome Versions

Using `const auto &` works on all versions — it binds to `const std::string &` on older versions and `const StringRef &` on 2026.3.0+:

```cpp
// Safe on all versions
const auto &name = App.get_name();
ESP_LOGD(TAG, "Name: %s", name.c_str());
```

If you need to explicitly handle both:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
  const StringRef &name = App.get_name();
#else
  const std::string &name = App.get_name();
#endif
```

## Timeline

- **ESPHome 2026.3.0 (March 2026):** Return type changed
- No deprecation period — this is a signature change

## Finding Code That Needs Updates

```bash
# Find std::string references to App.get_name()
grep -rn 'std::string.*get_name\|std::string.*get_friendly_name' your_component/

# Find any usage of App.get_name() or App.get_friendly_name()
grep -rn 'App\.get_name\|App\.get_friendly_name\|get_name()\.c_str\|get_friendly_name()\.c_str' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14532: Application name and friendly_name return StringRef](https://github.com/esphome/esphome/pull/14532)
- [StringRef source code](https://github.com/esphome/esphome/blob/dev/esphome/core/string_ref.h)
