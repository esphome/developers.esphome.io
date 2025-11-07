---
date: 2025-11-07
authors:
  - bdraco
comments: true
---

# Select Entity Class: Index-Based Operations and Flash Storage

ESPHome 2025.11.0 introduces significant optimizations to the `Select` entity class that reduce memory usage and improve performance. These changes affect external components that implement custom select entities.

<!-- more -->

## Background

Two related PRs optimize the Select entity class:

**[PR #11623](https://github.com/esphome/esphome/pull/11623): Index-Based Operations**
Refactors Select to use indices internally instead of strings, eliminating redundant string storage and operations. The public `state` member is deprecated and will be removed in ESPHome 2026.5.0 (6-month migration window). This saves ~32 bytes per SelectCall operation immediately, and will save at least 28 bytes per Select instance after the deprecated `.state` member is removed (28 bytes std::string overhead + string length).

**[PR #11514](https://github.com/esphome/esphome/pull/11514): Store Options in Flash**
Changes option storage from heap-allocated `std::vector<std::string>` to flash-stored `FixedVector<const char*>`. Real device measurements show 164-7428 bytes saved, scaling with the total number of options across all select entities. More selects or more options per select means greater savings.

## What's Changing

### For ESPHome 2025.11.0 and Later

**Storage Changes (Breaking - [PR #11514](https://github.com/esphome/esphome/pull/11514)):**
```cpp
// OLD - heap-allocated strings
std::vector<std::string> options;
traits.set_options(options);

// NEW - flash-stored string literals
traits.set_options({"Option 1", "Option 2", "Option 3"});
```

**State Access Changes (Deprecation - [PR #11623](https://github.com/esphome/esphome/pull/11623)):**
```cpp
// OLD - deprecated, shows warnings (works until 2026.5.0)
std::string current = my_select->state;

// NEW - required after 2026.5.0
const char *current = my_select->current_option();
```

## Who This Affects

This affects **external components** that:

- Manually call `set_options()` on SelectTraits in C++ code (Python code generation already uses the correct syntax)
- Access the `.state` member of Select objects
- Iterate over or compare select options

**Standard YAML configurations are not affected** - Python code generation already produces initializer lists, so no YAML changes are needed. This only impacts external components that create select entities entirely in C++.

## Migration Guide

### 1. Setting Options (Required Now)

**In setup() methods:**
```cpp
// OLD
std::vector<std::string> options = {"Low", "Medium", "High"};
this->traits.set_options(options);

// NEW - use initializer list with string literals
this->traits.set_options({"Low", "Medium", "High"});
```

**For runtime-determined options** (rare), you must store the strings persistently:
```cpp
#include "esphome/core/helpers.h"  // For FixedVector

class MySelect : public select::Select {
 protected:
  // Storage for actual string data (must persist for lifetime)
  std::vector<std::string> stored_options_;
  // Pointers into stored_options_
  FixedVector<const char*> option_ptrs_;

  void setup() override {
    // Read dynamic options from device/config (truly runtime-determined)
    uint8_t mode_count = this->read_mode_count_from_device();
    this->stored_options_.resize(mode_count);
    for (uint8_t i = 0; i < mode_count; i++) {
      this->stored_options_[i] = this->read_mode_name_from_device(i);
    }

    // Build pointer array pointing into stored_options_
    this->option_ptrs_.init(this->stored_options_.size());
    for (const auto &opt : this->stored_options_) {
      this->option_ptrs_.push_back(opt.c_str());
    }

    // Set the traits (pointers remain valid because stored_options_ persists)
    this->traits.set_options(this->option_ptrs_);
  }
};
```

### 2. Accessing Options (Required Now)

**Reading the options list:**
```cpp
// OLD - copying (deleted copy constructor)
auto options = traits.get_options();

// NEW - use const reference
const auto &options = traits.get_options();

// Individual options are now const char*
const char *option = options[0];  // Not std::string

// If you need std::string:
std::string str = std::string(options[0]);
```

### 3. Reading Current Selection (Deprecated, Remove by 2026.5.0)

**In YAML lambdas:**
```yaml
# OLD - shows deprecation warning (works until 2026.5.0)
lambda: 'return id(my_select).state == "option1";'

# NEW - required after 2026.5.0, use strcmp()
lambda: 'return strcmp(id(my_select).current_option(), "option1") == 0;'

# Or convert to std::string if you prefer == operator (less efficient)
lambda: 'return std::string(id(my_select).current_option()) == "option1";'
```

**In C++ code:**
```cpp
// OLD - deprecated (works until 2026.5.0)
std::string current = my_select->state;
ESP_LOGD(TAG, "Current: %s", my_select->state.c_str());

// NEW - required after 2026.5.0
const char *current = my_select->current_option();
ESP_LOGD(TAG, "Current: %s", current);

// If you need std::string:
std::string current = my_select->current_option();  // Implicit conversion
```

### 4. Publishing State (New Methods Available)

**Prefer index-based operations:**
```cpp
// OLD - string-based (still works but less efficient)
this->publish_state("option1");

// NEW - index-based (more efficient)
this->publish_state(0);  // Publish by index
```

### 5. String Comparisons

**When comparing options:**
```cpp
// OLD - std::string comparison
if (options[i] == "value") { }

// NEW - use strcmp()
if (strcmp(options[i], "value") == 0) { }

// BETTER - use Select helper methods
auto idx = this->index_of(value);
if (idx.has_value()) {
  this->publish_state(idx.value());
}
```

### 6. Overriding control() Method (Required)

**IMPORTANT:** You **must** override at least one `control()` method. If you override neither, they will call each other infinitely.

```cpp
class MySelect : public select::Select {
 protected:
  // Option 1: String-based control (still works, but less efficient)
  void control(const std::string &value) override {
    // This version receives the string value
    auto idx = this->index_of(value);  // strcmp lookup needed
    if (idx.has_value()) {
      this->send_to_device(idx.value());
    }
  }

  // Option 2: Index-based control (preferred, more efficient)
  void control(size_t index) override {
    // This version receives the index directly
    this->send_to_device(index);  // No lookup needed
  }
};
```

**Which to override?**
- Override `control(size_t index)` (preferred) - avoids string conversions and lookups
- Override `control(const std::string &value)` - if you need the actual string value
- Override both (rare) - if you need different handling for each case

## Supporting Multiple ESPHome Versions

### .state Member Access (Deprecated but Still Exists)

The `.state` member still exists until 2026.5.0, so you can use version guards:

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2025, 11, 0)
  const char *current = my_select->current_option();
#else
  const char *current = my_select->state.c_str();
#endif
```

### Options Storage (Hard Breaking Change)

The old `set_options(std::vector<std::string>)` API was completely removed in [PR #11514](https://github.com/esphome/esphome/pull/11514). Version guards are **not possible** because the old API no longer exists.

External components must either:
- Update to the new API to support ESPHome 2025.11.0+
- Pin to ESPHome versions before 2025.11.0 if they can't update yet

There is no way to support both old and new ESPHome versions for options storage without maintaining separate branches.

## Timeline

- **ESPHome 2025.11.0 (November 2025):**
  - Options storage change is active (breaking change)
  - `.state` member deprecated but still works with warnings
  - New `current_option()` method available

- **ESPHome 2026.5.0 (May 2026):**
  - `.state` member will be removed
  - Must use `current_option()` method

## Finding Code That Needs Updates

Search your external component code for these patterns:

```bash
# Find .state member access
grep -r '\.state' --include='*.cpp' --include='*.h'

# Find set_options() calls
grep -r 'set_options' --include='*.cpp' --include='*.h'

# Find vector<string> option storage
grep -r 'vector<.*string>' --include='*.cpp' --include='*.h'
```

## Questions?

If you have questions about these changes or need help migrating your external component, please ask in the [ESPHome Discord](https://discord.gg/KhAMKrd) or open a [discussion on GitHub](https://github.com/esphome/esphome/discussions).

## Related Documentation

- [Select Component Documentation](https://esphome.io/components/select/index.html)
- [PR #11623: Index-Based Operations](https://github.com/esphome/esphome/pull/11623)
- [PR #11514: Store Options in Flash](https://github.com/esphome/esphome/pull/11514)
