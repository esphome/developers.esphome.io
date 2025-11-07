---
date: 2025-11-07
authors:
  - bdraco
comments: true
---

# Fan Entity Class: Preset Mode Flash Storage and Order Preservation

ESPHome 2025.11.0 introduces a memory optimization to the `Fan` entity class that also changes how preset modes are ordered. This affects external components implementing custom fan devices and may change the display order of preset modes in Home Assistant.

<!-- more -->

## Background

**[PR #11483](https://github.com/esphome/esphome/pull/11483): Store Preset Modes in Flash**
Changes preset mode storage from `std::set<std::string>` (heap, alphabetically sorted) to `std::vector<const char*>` (flash, preserves YAML order). Saves at least 24 bytes overhead (more for longer strings) plus ~70+ bytes with preset modes. Strings move from heap to flash memory.

## What's Changing

### For ESPHome 2025.11.0 and Later

**Storage Changes (Breaking - [PR #11483](https://github.com/esphome/esphome/pull/11483)):**
```cpp
// OLD - std::set in heap, alphabetically sorted
std::set<std::string> preset_modes_;
traits.set_supported_preset_modes(modes);  // std::set parameter

// NEW - std::vector of const char* in flash, preserves order
std::vector<const char *> preset_modes_;
traits.set_supported_preset_modes({"Low", "Medium", "High"});  // initializer_list
```

**User-Facing Change:**
Preset modes now appear in Home Assistant in the **order you define them in YAML**, not alphabetically. This makes Fan consistent with all other components (select options, climate presets, etc.).

## Who This Affects

**External components** that:
- Explicitly create `std::set<std::string>` and pass it to `set_supported_preset_modes()` in C++
- Store or manipulate fan preset mode lists in member variables

**Note:** Most components already use the correct syntax since Python code generation produces initializer lists like `traits.set_supported_preset_modes({"Low", "Medium", "High"})`. This only affects external components that manually create sets in C++ code.

**YAML users** may notice:
- Preset mode order in Home Assistant changes to match YAML order instead of alphabetical
- This is a **behavioral change** - you now control the display order

**Standard YAML configurations** work without code changes, but the display order may change.

## User-Facing Behavior Change

### Preset Mode Display Order

Previously, fan preset modes were **always sorted alphabetically** regardless of YAML order (only fan presets had this limitation). Now they preserve YAML order like all other components.

**Example YAML:**
```yaml
fan:
  - platform: template
    name: "Bedroom Fan"
    preset_modes:
      - "Turbo"
      - "Normal"
      - "Sleep"
```

**Before (alphabetical sort):** Normal → Sleep → Turbo
**After (YAML order):** Turbo → Normal → Sleep

**Action:** If you want a specific order in Home Assistant, arrange preset modes in your YAML in that order.

## Migration Guide for External Components

### 1. Update Container Type (Required Now)

```cpp
// OLD
#include <set>
std::set<std::string> preset_modes_;

// NEW
#include <vector>
std::vector<const char *> preset_modes_;
```

### 2. Update Setter Signatures (Required Now)

```cpp
// OLD
void set_preset_modes(const std::set<std::string> &presets) {
  this->preset_modes_ = presets;
}

// NEW - use initializer list for string literals
void set_preset_modes(std::initializer_list<const char *> presets) {
  this->preset_modes_ = presets;
}
```

### 3. Update Trait Calls (If You Explicitly Created Sets)

**Note:** Most components already pass initializer lists directly and don't need changes. This only affects code that explicitly creates `std::set` variables.

```cpp
// OLD - explicitly creating std::set (uncommon)
std::set<std::string> modes = {"Low", "Medium", "High"};
traits.set_supported_preset_modes(modes);

// NEW - initializer list with string literals (most components already did this)
traits.set_supported_preset_modes({"Low", "Medium", "High"});
```

### 4. Update Lookups (Required Now)

```cpp
// OLD - std::set::find
if (this->preset_modes_.find(mode) != this->preset_modes_.end()) {
  // mode is supported
}

// NEW - linear search with strcmp
bool found = false;
for (const char *m : this->preset_modes_) {
  if (strcmp(m, mode.c_str()) == 0) {
    found = true;
    break;
  }
}
if (found) {
  // mode is supported
}

// Or use std::find_if (cleaner but adds STL overhead)
auto it = std::find_if(this->preset_modes_.begin(), this->preset_modes_.end(),
                       [&mode](const char *m) { return strcmp(m, mode.c_str()) == 0; });
if (it != this->preset_modes_.end()) {
  // mode is supported
}
```

**Note:** `std::find_if` is cleaner but adds STL template overhead. For ESP8266 devices with tight flash constraints, prefer the manual loop approach.

### 5. Remove Unnecessary Includes

```cpp
// Remove:
#include <set>
```

## Complete Migration Example

**Before:**
```cpp
#include <set>

class MyFan : public fan::Fan {
 public:
  void set_preset_modes(const std::set<std::string> &modes) {
    this->preset_modes_ = modes;
  }

  fan::FanTraits get_traits() override {
    auto traits = fan::FanTraits();
    traits.set_supported_preset_modes(this->preset_modes_);
    return traits;
  }

  void control(const fan::FanCall &call) override {
    if (!call.get_preset_mode().empty()) {
      std::string mode = call.get_preset_mode();
      if (this->preset_modes_.find(mode) != this->preset_modes_.end()) {
        // Set mode
      }
    }
  }

 protected:
  std::set<std::string> preset_modes_;
};
```

**After:**
```cpp
#include <vector>

class MyFan : public fan::Fan {
 public:
  void set_preset_modes(std::initializer_list<const char *> modes) {
    this->preset_modes_ = modes;
  }

  fan::FanTraits get_traits() override {
    auto traits = fan::FanTraits();
    traits.set_supported_preset_modes(this->preset_modes_);
    return traits;
  }

  void control(const fan::FanCall &call) override {
    if (!call.get_preset_mode().empty()) {
      const std::string &mode = call.get_preset_mode();
      auto it = std::find_if(this->preset_modes_.begin(), this->preset_modes_.end(),
                             [&mode](const char *m) { return strcmp(m, mode.c_str()) == 0; });
      if (it != this->preset_modes_.end()) {
        // Set mode
      }
    }
  }

 protected:
  std::vector<const char *> preset_modes_;
};
```

## Lifetime Safety for Preset Modes

All `const char*` pointers must point to memory that lives for the component's lifetime:

**Safe patterns:**
```cpp
// 1. String literals (preferred) - stored in flash
traits.set_supported_preset_modes({"Low", "Medium", "High"});

// 2. Static constants
static const char *const PRESET_LOW = "Low";
traits.set_supported_preset_modes({PRESET_LOW});

// 3. C arrays
static constexpr const char *const PRESETS[] = {"Low", "Medium", "High"};
traits.set_supported_preset_modes({PRESETS[0], PRESETS[1], PRESETS[2]});
```

**Unsafe patterns (DO NOT USE):**
```cpp
// WRONG - temporary string
std::string temp = "Low";
traits.set_supported_preset_modes({temp.c_str()});  // Dangling pointer!

// WRONG - local array
const char *modes[] = {"Low", "High"};
traits.set_supported_preset_modes({modes[0], modes[1]});  // Array destroyed!
```

**For dynamic modes (rare):**
```cpp
#include "esphome/core/helpers.h"

class MyFan : public fan::Fan {
 protected:
  // Storage for strings (must persist)
  FixedVector<std::string> preset_strings_;
  // Pointers into preset_strings_
  std::vector<const char *> preset_modes_;

  void setup() override {
    // Read dynamic presets
    this->preset_strings_.init(mode_count);
    for (size_t i = 0; i < mode_count; i++) {
      this->preset_strings_.push_back(this->read_mode_from_device(i));
    }

    // Build pointer array
    this->preset_modes_.clear();
    for (const auto &s : this->preset_strings_) {
      this->preset_modes_.push_back(s.c_str());
    }

    // Set traits
    this->traits_.set_supported_preset_modes(this->preset_modes_);
  }
};
```

## Timeline

- **ESPHome 2025.11.0 (November 2025):**
  - Storage change is active (breaking change for external components)
  - Preset mode order changes to YAML order (user-facing behavior change)

## Finding Code That Needs Updates

Search your external component code for these patterns:

```bash
# Find std::set usage for fan preset modes
grep -r 'std::set<.*string>.*preset' --include='*.cpp' --include='*.h'

# Find set_supported_preset_modes calls
grep -r 'set_supported_preset_modes' --include='*.cpp' --include='*.h'

# Find preset_modes_ member variables
grep -r 'preset_modes_' --include='*.cpp' --include='*.h'
```

## Questions?

If you have questions about these changes or need help migrating your external component, please ask in the [ESPHome Discord](https://discord.gg/KhAMKrd) or open a [discussion on GitHub](https://github.com/esphome/esphome/discussions).

## Related Documentation

- [Fan Component Documentation](https://esphome.io/components/fan/index.html)
- [PR #11483: Store Preset Modes in Flash](https://github.com/esphome/esphome/pull/11483)
