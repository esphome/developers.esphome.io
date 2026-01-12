---
date: 2026-01-12
authors:
  - bdraco
comments: true
---

# Listener Interface Pattern for OTA and Alarm Control Panel

The OTA component now uses a listener interface instead of `std::function` callbacks. The alarm control panel component has removed per-state callback methods in favor of a unified state callback.

This is a **breaking change** for external components in **ESPHome 2026.1.0 and later**.

<!-- more -->

## Background

**[PR #12167](https://github.com/esphome/esphome/pull/12167): OTA listener interface**
Replaces `std::function` callbacks with an `OTAStateListener` interface. Saves 352 bytes flash; listener pointers use 4 bytes vs 16+ bytes for `std::function`.

**[PR #12171](https://github.com/esphome/esphome/pull/12171): Alarm control panel callback consolidation**
Removes 7 per-state callbacks in favor of a unified state callback. Saves 176 bytes flash on ESP8266.

## What's Changing

### OTA Component

```cpp
// Before - std::function callback
ota->add_on_state_callback([](ota::OTAState state, float progress, uint8_t error) {
  // handle state
});

// After - listener interface
class MyComponent : public ota::OTAStateListener {
 public:
  void on_ota_state(ota::OTAState state, float progress, uint8_t error) override {
    // handle state
  }
};

// Registration
ota->add_state_listener(this);
```

### Alarm Control Panel

```cpp
// Before - per-state callbacks (removed)
alarm->add_on_triggered_callback([]() { /* triggered */ });
alarm->add_on_arming_callback([]() { /* arming */ });
alarm->add_on_pending_callback([]() { /* pending */ });
alarm->add_on_armed_home_callback([]() { /* armed home */ });
alarm->add_on_armed_night_callback([]() { /* armed night */ });
alarm->add_on_armed_away_callback([]() { /* armed away */ });
alarm->add_on_disarmed_callback([]() { /* disarmed */ });

// After - unified state callback (check get_state() inside)
alarm->add_on_state_callback([this]() {
  if (this->alarm_->get_state() == alarm_control_panel::ACP_STATE_TRIGGERED) {
    // triggered
  }
});
```

## Who This Affects

- External components using OTA state callbacks
- External components using alarm control panel per-state callbacks

**Standard YAML configurations are not affected.**

## Migration Guide

### OTA: Listener Interface

#### 1. Implement the listener interface

```cpp
#include "esphome/components/ota/ota_backend.h"

class MyComponent : public Component, public ota::OTAStateListener {
 public:
  void set_ota_parent(ota::OTAComponent *parent) { this->ota_parent_ = parent; }

  void setup() override {
    // Register with OTA component (parent set via Python codegen)
    if (this->ota_parent_ != nullptr) {
      this->ota_parent_->add_state_listener(this);
    }
  }

  void on_ota_state(ota::OTAState state, float progress, uint8_t error) override {
    switch (state) {
      case ota::OTA_STARTED:
        ESP_LOGI(TAG, "OTA started");
        break;
      case ota::OTA_IN_PROGRESS:
        ESP_LOGI(TAG, "OTA progress: %.1f%%", progress * 100);
        break;
      case ota::OTA_COMPLETED:
        ESP_LOGI(TAG, "OTA completed");
        break;
      case ota::OTA_ERROR:
        ESP_LOGE(TAG, "OTA error: %d", error);
        break;
      default:
        break;
    }
  }

 protected:
  ota::OTAComponent *ota_parent_{nullptr};
};
```

#### 2. Python code generation

```python
# In __init__.py
import esphome.codegen as cg
from esphome.components import ota

CONF_OTA_ID = "ota_id"

CONFIG_SCHEMA = cv.Schema({
    # ... your config ...
    cv.Optional(CONF_OTA_ID): cv.use_id(ota.OTAComponent),
}).extend(cv.COMPONENT_SCHEMA)

async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    # Request OTA listener support
    await ota.request_ota_state_listeners()

    # Link to OTA component if specified
    if CONF_OTA_ID in config:
        ota_component = await cg.get_variable(config[CONF_OTA_ID])
        cg.add(var.set_ota_parent(ota_component))
```

### Alarm Control Panel: Unified Callback

#### Replace per-state callbacks

```cpp
// Before - multiple callbacks
alarm->add_on_triggered_callback([]() { handle_triggered(); });
alarm->add_on_arming_callback([]() { handle_arming(); });
alarm->add_on_disarmed_callback([]() { handle_disarmed(); });

// After - single callback that checks get_state()
alarm->add_on_state_callback([this]() {
  using namespace alarm_control_panel;
  switch (this->alarm_->get_state()) {
    case ACP_STATE_TRIGGERED:
      handle_triggered();
      break;
    case ACP_STATE_ARMING:
      handle_arming();
      break;
    case ACP_STATE_DISARMED:
      handle_disarmed();
      break;
    default:
      break;
  }
});
```

#### Available states

```cpp
namespace alarm_control_panel {
  ACP_STATE_DISARMED
  ACP_STATE_ARMED_HOME
  ACP_STATE_ARMED_AWAY
  ACP_STATE_ARMED_NIGHT
  ACP_STATE_ARMED_VACATION
  ACP_STATE_ARMED_CUSTOM_BYPASS
  ACP_STATE_PENDING
  ACP_STATE_ARMING
  ACP_STATE_DISARMING
  ACP_STATE_TRIGGERED
}
```

## Supporting Multiple ESPHome Versions

### OTA

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 1, 0)
// New API - listener interface
class MyComponent : public Component, public ota::OTAStateListener {
 public:
  void set_ota(ota::OTAComponent *ota) { this->ota_ = ota; }
  void setup() override {
    if (this->ota_) this->ota_->add_state_listener(this);
  }
  void on_ota_state(ota::OTAState state, float progress, uint8_t error) override {
    // handle state
  }
 protected:
  ota::OTAComponent *ota_{nullptr};
};
#else
// Old API - std::function callback (also requires OTA component pointer)
class MyComponent : public Component {
 public:
  void set_ota(ota::OTAComponent *ota) { this->ota_ = ota; }
  void setup() override {
    if (this->ota_) {
      this->ota_->add_on_state_callback(
        [](ota::OTAState state, float progress, uint8_t error) {
          // handle state
        });
    }
  }
 protected:
  ota::OTAComponent *ota_{nullptr};
};
#endif
```

### Alarm Control Panel

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 1, 0)
// New API - unified callback (check get_state() inside)
alarm->add_on_state_callback([this]() {
  if (this->alarm_->get_state() == ACP_STATE_TRIGGERED) {
    // handle triggered
  }
});
#else
// Old API - per-state callback
alarm->add_on_triggered_callback([]() {
  // handle triggered
});
#endif
```

## Timeline

- **ESPHome 2026.1.0 (January 2026):** New APIs active, old methods removed
- No deprecation period - methods removed directly

## Finding Code That Needs Updates

```bash
# Find OTA callback usage
grep -rn "add_on_state_callback.*OTAState" your_component/
grep -rn "ota.*add_on_state_callback" your_component/

# Find alarm per-state callbacks
grep -rn "add_on_triggered_callback" your_component/
grep -rn "add_on_arming_callback" your_component/
grep -rn "add_on_pending_callback" your_component/
grep -rn "add_on_armed_.*_callback" your_component/
grep -rn "add_on_disarmed_callback" your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [OTA Component](https://esphome.io/components/ota.html)
- [Alarm Control Panel](https://esphome.io/components/alarm_control_panel/index.html)
- [PR #12167: OTA listener](https://github.com/esphome/esphome/pull/12167)
- [PR #12171: Alarm callbacks](https://github.com/esphome/esphome/pull/12171)
