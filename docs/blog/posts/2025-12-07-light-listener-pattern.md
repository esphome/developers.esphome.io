---
date: 2025-12-07
authors:
  - bdraco
comments: true
---

# Light State Callbacks: Listener Pattern Migration

The light component's callback system has been refactored to use a listener interface pattern with lazy allocation. This replaces the previous `CallbackManager<void()>` approach with explicit listener interfaces that only allocate memory when callbacks are actually registered.

This is a **breaking change** for external components that register light state callbacks in **ESPHome 2025.12.0 and later**.

<!-- more -->

## What needs to change

External components must migrate from callback lambdas to implementing listener interfaces:

```cpp
// Before 2025.12
light_state->add_new_remote_values_callback([this]() {
  this->on_light_update();
});

light_state->add_new_target_state_reached_callback([this]() {
  this->on_target_reached();
});

// After 2025.12
// 1. Inherit from the listener interface(s)
class MyComponent : public light::LightRemoteValuesListener,
                    public light::LightTargetStateReachedListener {
  // 2. Implement the required methods
  void on_light_remote_values_update() override {
    this->on_light_update();
  }

  void on_light_target_state_reached() override {
    this->on_target_reached();
  }

  void setup() override {
    // 3. Register as a listener
    light_state->add_remote_values_listener(this);
    light_state->add_target_state_reached_listener(this);
  }
};
```

## New listener interfaces

Two new abstract base classes are available in the `esphome::light` namespace:

```cpp
namespace esphome::light {

// For notifications when light values change remotely (e.g., from API/MQTT)
class LightRemoteValuesListener {
 public:
  virtual void on_light_remote_values_update() = 0;
};

// For notifications when light reaches its target state
class LightTargetStateReachedListener {
 public:
  virtual void on_light_target_state_reached() = 0;
};

}  // namespace esphome::light
```

## API changes summary

| Old Method | New Method |
|------------|------------|
| `add_new_remote_values_callback(std::function<void()> &&)` | `add_remote_values_listener(LightRemoteValuesListener *)` |
| `add_new_target_state_reached_callback(std::function<void()> &&)` | `add_target_state_reached_listener(LightTargetStateReachedListener *)` |

## Compilation errors

External components using the old callback API will fail with:

```
error: 'class esphome::light::LightState' has no member named 'add_new_remote_values_callback'
```

or:

```
error: 'class esphome::light::LightState' has no member named 'add_new_target_state_reached_callback'
```

## Complete migration example

Here's an example based on a HomeKit light integration that synchronizes state:

**Before:**
```cpp
class HomeKitLight {
 public:
  void setup(light::LightState *light) {
    this->light_ = light;
    light->add_new_target_state_reached_callback([this]() {
      this->on_entity_update();
    });
  }

 protected:
  void on_entity_update() {
    // Sync state to HomeKit
  }

  light::LightState *light_;
};
```

**After:**
```cpp
#include "esphome/components/light/light_state.h"

class HomeKitLight : public light::LightTargetStateReachedListener {
 public:
  void setup(light::LightState *light) {
    this->light_ = light;
    light->add_target_state_reached_listener(this);
  }

  void on_light_target_state_reached() override {
    this->on_entity_update();
  }

 protected:
  void on_entity_update() {
    // Sync state to HomeKit
  }

  light::LightState *light_;
};
```

## Supporting multiple ESPHome versions

If your external component needs to support both old and new ESPHome versions:

```cpp
#include "esphome/components/light/light_state.h"

#if ESPHOME_VERSION_CODE >= VERSION_CODE(2025, 12, 0)
class MyLightComponent : public light::LightTargetStateReachedListener {
#else
class MyLightComponent {
#endif
 public:
  void setup(light::LightState *light) {
    this->light_ = light;
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2025, 12, 0)
    light->add_target_state_reached_listener(this);
#else
    light->add_new_target_state_reached_callback([this]() {
      this->on_light_target_state_reached();
    });
#endif
  }

#if ESPHOME_VERSION_CODE >= VERSION_CODE(2025, 12, 0)
  void on_light_target_state_reached() override {
#else
  void on_light_target_state_reached() {
#endif
    // Handle state change
  }

 protected:
  light::LightState *light_;
};
```

## Why this change

The previous `CallbackManager<void()>` approach had several drawbacks:

1. **Memory overhead** - `std::function` objects consume memory even when empty (~16 bytes per callback manager)
2. **Always allocated** - Callback storage was allocated regardless of whether callbacks were registered
3. **Indirect calls** - `std::function` adds indirection overhead for every callback invocation

The new listener pattern provides:

- **Lazy allocation** - Memory is only allocated when listeners are actually registered
- **Direct virtual calls** - More efficient than `std::function` indirection
- **Explicit interfaces** - Clear contracts for what notifications are available
- **Memory savings** - ~16 bytes saved per light when callbacks are unused (null pointer vs. empty CallbackManager)

## Finding code that needs updates

```bash
# Find uses of the old callback methods
grep -rn "add_new_remote_values_callback" your_component/
grep -rn "add_new_target_state_reached_callback" your_component/

# Find all light state interactions to review
grep -rn "LightState" your_component/
```

## Reference Pull Request

- [esphome/esphome#12166](https://github.com/esphome/esphome/pull/12166)

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)
