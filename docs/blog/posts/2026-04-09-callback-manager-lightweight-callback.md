---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# CallbackManager: std::function Replaced with Lightweight Callback

`CallbackManager` and `LazyCallbackManager` now use a lightweight 8-byte `Callback` struct instead of `std::function` (16 bytes). External components that define their own callback registration methods using `std::function` should update to templates for optimal performance.

This is a **breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

**[PR #14853](https://github.com/esphome/esphome/pull/14853): Replace std::function with lightweight Callback in CallbackManager**

`std::function` has significant overhead on embedded targets: 16 bytes per instance on 32-bit platforms, plus heap allocation for captured lambdas. The new `Callback` struct uses C++20 `if constexpr` to store small trivially-copyable callables (like `[this]` lambdas) inline within the `Callback` object, alongside a function pointer, avoiding heap allocation while keeping the total size at 8 bytes.

### Measured savings

| Platform | Config | Flash Delta | Heap Delta |
|---|---|---|---|
| ESP8266 | minimal | **-160 B** | |
| ESP8266 | ratgdo (cover + sensors) | **-592 B** | **+142 B free** |
| ESP8266 | MQTT + web_server + many entities | **-832 B** | **+488 B free** |
| ESP32 IDF | large (climate, BLE, web_server) | **-456 B** | |
| ESP32 IDF | minimal | **-212 B** | **+72 B free** |

## What's Changing

All callback registration methods (`add_on_*_callback`, `add_*_callback`, `register_listener`, etc.) on entity base classes and components are now templates instead of taking `std::function`.

```cpp
// Before
void add_on_state_callback(std::function<void(float)> &&callback) {
  this->state_callback_.add(std::move(callback));
}

// After
template<typename F> void add_on_state_callback(F &&callback) {
  this->state_callback_.add(std::forward<F>(callback));
}
```

## Who This Affects

**External components that define their own callback registration methods taking `std::function`.**

Existing code **continues to compile and work correctly**. However, unconverted methods use a less efficient heap-allocation path: the lambda gets wrapped in `std::function` before reaching `CallbackManager::add()`, which then heap-allocates it. Previously the `std::function` was stored directly in the vector element with no extra allocation.

**Callers of entity callbacks (registering callbacks on ESPHome entities) need no changes.**

## Migration Guide

Convert callback registration methods from `std::function` to templates:

```cpp
// Before (still compiles, but now less efficient than before)
// your_component.h
class MyComponent : public Component {
 public:
  void add_on_data_callback(std::function<void(float)> &&callback) {
    this->data_callback_.add(std::move(callback));
  }
 protected:
  CallbackManager<void(float)> data_callback_;
};
```

```cpp
// After (optimal — inline storage, zero heap allocation for [this] lambdas)
// your_component.h
class MyComponent : public Component {
 public:
  template<typename F> void add_on_data_callback(F &&callback) {
    this->data_callback_.add(std::forward<F>(callback));
  }
 protected:
  CallbackManager<void(float)> data_callback_;
};
```

If you had a separate `.cpp` definition, move the body inline into the header and remove the `.cpp` definition (templates must be defined in headers).

## Supporting Multiple ESPHome Versions

The template approach is backward compatible — it works on older ESPHome versions too, since the template accepts `std::function` as well as raw lambdas. No version guard needed.

## Timeline

- **ESPHome 2026.4.0 (April 2026):** `CallbackManager` uses `Callback` instead of `std::function`
- No deprecation period — existing code still compiles but uses a less efficient path

## Finding Code That Needs Updates

```bash
# Find callback registration methods that still use std::function
grep -rn 'std::function.*&&.*callback' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14853: Replace std::function with lightweight Callback in CallbackManager](https://github.com/esphome/esphome/pull/14853)
