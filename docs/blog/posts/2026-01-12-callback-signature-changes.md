---
date: 2026-01-12
authors:
  - bdraco
comments: true
---

# Callback Signature Changes for text_sensor, text, and select

The callback signatures for `text_sensor`, `text`, and `select` components have been updated to reduce heap allocations. The `select` component callback signature has changed significantly.

This is a **breaking change** for external components in **ESPHome 2026.1.0 and later**.

<!-- more -->

## Background

These PRs optimize state callbacks to reduce heap churn:

**[PR #12503](https://github.com/esphome/esphome/pull/12503): text_sensor**
Changes callback from `void(std::string)` to `void(const std::string &)`.

**[PR #12504](https://github.com/esphome/esphome/pull/12504): text**
Changes callback from `void(std::string)` to `void(const std::string &)`.

**[PR #12505](https://github.com/esphome/esphome/pull/12505): select**
Changes callback from `void(std::string, size_t)` to `void(size_t)` - string parameter removed entirely.

## What's Changing

### text_sensor and text (Minor change)

```cpp
// Before - passed by value (copies string)
std::function<void(std::string)>

// After - passed by const reference (no copy)
std::function<void(const std::string &)>
```

### select (Significant change)

```cpp
// Before - received string and index
std::function<void(std::string, size_t)>

// After - receives index only
std::function<void(size_t)>
```

## Who This Affects

### text_sensor and text

**Most code requires no changes.** Lambda callbacks continue working with either signature:

```cpp
// Both still work:
sensor->add_on_state_callback([](const std::string &value) { ... });
sensor->add_on_state_callback([](std::string value) { ... });  // Still works (copy made)
```

**Breaking case:** Explicitly-typed `std::function` variables must be updated. This is extremely rare in practice.

### select

**All callbacks must be updated.** The string parameter has been removed entirely.

**Standard YAML configurations are not affected** - `on_value` triggers in YAML still receive both `x` (string) and `index`.

## Migration Guide

### text_sensor and text (if using explicit types)

```cpp
// Before
std::function<void(std::string)> callback = [](std::string value) {
  ESP_LOGD(TAG, "Value: %s", value.c_str());
};
text_sensor->add_on_state_callback(callback);

// After
std::function<void(const std::string &)> callback = [](const std::string &value) {
  ESP_LOGD(TAG, "Value: %s", value.c_str());
};
text_sensor->add_on_state_callback(callback);
```

### select (Required update)

```cpp
// Before - received string and index
this->select_->add_on_state_callback([](const std::string &value, size_t index) {
  ESP_LOGD(TAG, "Selected: %s (index %zu)", value.c_str(), index);
});

// After - receives index only
this->select_->add_on_state_callback([this](size_t index) {
  // Get string from index if needed
  const char *value = this->select_->option_at(index);
  ESP_LOGD(TAG, "Selected: %s (index %zu)", value, index);
});

// Or if you only need the index (common case)
this->select_->add_on_state_callback([this](size_t index) {
  this->handle_selection(index);
});
```

### Getting the selected option string from index

If your callback needs the option string, retrieve it from the select entity:

```cpp
this->select_->add_on_state_callback([this](size_t index) {
  // Option 1: Use option_at()
  const char *value = this->select_->option_at(index);
  if (value != nullptr) {
    // use value
  }

  // Option 2: Use traits directly
  const auto &options = this->select_->traits.get_options();
  if (index < options.size()) {
    const char *value = options[index];
    // use value
  }
});
```

## Supporting Multiple ESPHome Versions

### text_sensor and text

```cpp
// Lambda callbacks work unchanged for both versions
text_sensor->add_on_state_callback([](const std::string &value) {
  ESP_LOGD(TAG, "Value: %s", value.c_str());
});
```

### select

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 1, 0)
  // New API - index only
  this->select_->add_on_state_callback([this](size_t index) {
    const char *value = this->select_->option_at(index);
    if (value != nullptr) {
      ESP_LOGD(TAG, "Selected: %s", value);
    }
  });
#else
  // Old API - string and index
  this->select_->add_on_state_callback([](const std::string &value, size_t index) {
    ESP_LOGD(TAG, "Selected: %s", value.c_str());
  });
#endif
```

## Timeline

- **ESPHome 2026.1.0 (January 2026):** New callback signatures active
- No deprecation period for `select` - signature changed directly

## Finding Code That Needs Updates

```bash
# Find select callbacks with old signature
grep -rn "add_on_state_callback.*std::string.*size_t" your_component/

# Find explicitly-typed function objects
grep -rn "std::function<void(std::string)>" your_component/

# Find all state callback registrations
grep -rn "add_on_state_callback" your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [Text Sensor Component](https://esphome.io/components/text_sensor/index.html)
- [Text Component](https://esphome.io/components/text/index.html)
- [Select Component](https://esphome.io/components/select/index.html)
- [PR #12503: text_sensor](https://github.com/esphome/esphome/pull/12503)
- [PR #12504: text](https://github.com/esphome/esphome/pull/12504)
- [PR #12505: select](https://github.com/esphome/esphome/pull/12505)
