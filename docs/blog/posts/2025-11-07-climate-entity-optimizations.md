---
date: 2025-11-07
authors:
  - bdraco
comments: true
---

# Climate Entity Class: FiniteSetMask and Flash Storage Optimizations

ESPHome 2025.11.0 introduces significant memory optimizations to the `Climate` entity class that affect external components implementing custom climate devices.

<!-- more -->

## Background

Two related PRs optimize the Climate entity class:

**[PR #11466](https://github.com/esphome/esphome/pull/11466): Replace std::set with FiniteSetMask**
Replaces `std::set<EnumType>` with `FiniteSetMask` for storing climate trait enums (modes, fan modes, swing modes, presets). Real device measurements show ~440 bytes heap savings per climate entity, plus 2,587 bytes flash savings and elimination of red-black tree code (~4KB).

**[PR #11621](https://github.com/esphome/esphome/pull/11621): Store Custom Modes in Flash**
Changes custom fan mode and preset storage from `std::vector<std::string>` to `std::vector<const char*>`, storing strings in flash. Saves ~48 bytes per ClimateCall and ~24 bytes per custom mode/preset string (24 bytes std::string overhead + string length).

## What's Changing

### For ESPHome 2025.11.0 and Later

**Trait Storage Changes (Breaking - [PR #11466](https://github.com/esphome/esphome/pull/11466)):**
```cpp
// OLD - std::set for enums
void set_supported_modes(const std::set<climate::ClimateMode> &modes);
std::set<climate::ClimateMode> modes_;

// NEW - FiniteSetMask for enums
void set_supported_modes(climate::ClimateModeMask modes);
climate::ClimateModeMask modes_;
```

**Custom Mode Storage Changes (Breaking - [PR #11621](https://github.com/esphome/esphome/pull/11621)):**
```cpp
// OLD - std::string heap storage
void add_supported_custom_fan_mode(const std::string &mode);
std::set<std::string> custom_fan_modes_;

// NEW - const char* flash storage
void set_supported_custom_fan_modes(std::initializer_list<const char *> modes);
std::vector<const char *> custom_fan_modes_;
```

## Who This Affects

This affects **external components** that:

- Implement custom Climate entities in C++
- Store or manipulate climate trait sets (modes, fan modes, swing modes, presets)
- Use custom fan modes or custom presets
- Access custom mode members directly (now private, must use accessor methods)

**Standard YAML configurations are not affected** and require no changes.

## Migration Guide

### 1. Update Trait Function Signatures (Required Now)

**For all four enum mask types:**
```cpp
// OLD
void set_supported_modes(const std::set<climate::ClimateMode> &modes);
void set_supported_fan_modes(const std::set<climate::ClimateFanMode> &modes);
void set_supported_swing_modes(const std::set<climate::ClimateSwingMode> &modes);
void set_supported_presets(const std::set<climate::ClimatePreset> &presets);

// NEW
void set_supported_modes(climate::ClimateModeMask modes);
void set_supported_fan_modes(climate::ClimateFanModeMask modes);
void set_supported_swing_modes(climate::ClimateSwingModeMask modes);
void set_supported_presets(climate::ClimatePresetMask presets);
```

### 2. Update Member Variables (Required Now)

**Enum masks:**
```cpp
// OLD
std::set<climate::ClimateMode> modes_;
std::set<climate::ClimateFanMode> fan_modes_;
std::set<climate::ClimateSwingMode> swing_modes_;
std::set<climate::ClimatePreset> presets_;

// NEW
climate::ClimateModeMask modes_;
climate::ClimateFanModeMask fan_modes_;
climate::ClimateSwingModeMask swing_modes_;
climate::ClimatePresetMask presets_;
```

**Custom modes (heap → flash storage):**
```cpp
// OLD - std::set in heap
std::set<std::string> custom_fan_modes_;
std::set<std::string> custom_presets_;

// NEW - const char* in flash
std::vector<const char *> custom_fan_modes_;
std::vector<const char *> custom_presets_;
```

### 3. Update Trait API Calls (Required Now)

**Checking for enum modes (FiniteSetMask API):**
```cpp
// OLD - std::set API
if (modes_.find(CLIMATE_MODE_HEAT) != modes_.end()) { ... }

// NEW - count() method (std::set-compatible)
if (modes_.count(CLIMATE_MODE_HEAT)) { ... }
```

**Setting custom modes:**
```cpp
// OLD - incremental add
traits.add_supported_custom_fan_mode("Turbo");
traits.add_supported_custom_fan_mode("Silent");

// NEW - set all at once with string literals
traits.set_supported_custom_fan_modes({"Turbo", "Silent"});
traits.set_supported_custom_presets({"Eco", "Comfort", "Boost"});
```

### 4. Update ClimateCall Usage in control() Methods

**ClimateCall getters now return const char* directly:**
```cpp
// OLD - optional<std::string>
if (call.get_custom_preset().has_value()) {
  std::string preset = *call.get_custom_preset();
  if (preset == "Turbo") {
    // ...
  }
}

// NEW - const char* with has_*() helper
if (call.has_custom_preset()) {
  const char *preset = call.get_custom_preset();
  if (strcmp(preset, "Turbo") == 0) {
    // ...
  }
}
```

### 5. Use Protected Setters for Custom Modes (Required)

**Custom mode members are now private** - use protected setter methods in derived classes:

```cpp
// OLD - direct member assignment (NO LONGER COMPILES)
this->custom_fan_mode = "Turbo";     // ERROR: member is private
this->custom_preset = nullptr;       // ERROR: member is private

// NEW - use protected setter methods
this->set_custom_fan_mode_("Turbo");  // Validates against traits
this->clear_custom_preset_();         // Clear custom preset

// Setting primary modes (automatically clears custom modes)
this->set_fan_mode_(CLIMATE_FAN_HIGH);     // Clears custom_fan_mode_
this->set_preset_(CLIMATE_PRESET_AWAY);    // Clears custom_preset_
```

**Why private?** Climate devices require mutual exclusion between primary modes (e.g., `CLIMATE_FAN_HIGH`) and custom modes (e.g., `"Turbo"`). Private members with protected setters enforce this automatically, preventing bugs.

**Protected setter methods available:**
- `bool set_fan_mode_(ClimateFanMode mode)` - Set fan mode, clear custom fan mode
- `bool set_custom_fan_mode_(const char *mode)` - Set custom fan mode, clear fan_mode
- `void clear_custom_fan_mode_()` - Clear custom fan mode
- `bool set_preset_(ClimatePreset preset)` - Set preset, clear custom preset
- `bool set_custom_preset_(const char *preset)` - Set custom preset, clear preset
- `void clear_custom_preset_()` - Clear custom preset

### 6. Use Accessor Methods for Reading State

**Reading custom modes from Climate object:**
```cpp
// OLD - direct member access (NO LONGER COMPILES)
if (climate->custom_fan_mode.has_value()) {
  resp.set_custom_fan_mode(climate->custom_fan_mode.value());
}

// NEW - use accessor methods
if (climate->has_custom_fan_mode()) {
  resp.set_custom_fan_mode(climate->get_custom_fan_mode());
}
```

**Public accessor methods on Climate class:**
- `bool has_custom_fan_mode() const` - Check if custom fan mode is active
- `const char *get_custom_fan_mode() const` - Get custom fan mode (read-only)
- `bool has_custom_preset() const` - Check if custom preset is active
- `const char *get_custom_preset() const` - Get custom preset (read-only)

### 7. Remove Unnecessary Includes

```cpp
// Remove:
#include <set>
```

## FiniteSetMask API Compatibility

The `FiniteSetMask` API is mostly compatible with `std::set`:

**Compatible methods:**
- `.insert(value)` - Add mode
- `.count(value)` - Check if mode exists (returns 0 or 1)
- `.erase(value)` - Remove mode
- `.size()`, `.empty()`, `.clear()` - Same as std::set
- Range-based for loops work identically

**Differences:**
- `.find()` is not available - use `.count()` instead
- Iterators are available but behave slightly differently

## Complete Migration Example

**Before:**
```cpp
#include <set>

class MyClimate : public Climate {
 public:
  void set_modes(const std::set<climate::ClimateMode> &modes) {
    this->modes_ = modes;
  }

  climate::ClimateTraits traits() override {
    auto traits = climate::ClimateTraits();
    traits.set_supported_modes(this->modes_);
    traits.add_supported_custom_fan_mode("Turbo");
    traits.add_supported_custom_fan_mode("Silent");
    return traits;
  }

  void control(const climate::ClimateCall &call) override {
    if (call.get_custom_fan_mode().has_value()) {
      std::string mode = *call.get_custom_fan_mode();
      if (mode == "Turbo") {
        this->custom_fan_mode = "Turbo";
      }
    }
  }

 protected:
  std::set<climate::ClimateMode> modes_;
};
```

**After:**
```cpp
// No <set> include needed

class MyClimate : public Climate {
 public:
  void set_modes(climate::ClimateModeMask modes) {
    this->modes_ = modes;
  }

  climate::ClimateTraits traits() override {
    auto traits = climate::ClimateTraits();
    traits.set_supported_modes(this->modes_);
    traits.set_supported_custom_fan_modes({"Turbo", "Silent"});
    return traits;
  }

  void control(const climate::ClimateCall &call) override {
    if (call.has_custom_fan_mode()) {
      const char *mode = call.get_custom_fan_mode();
      if (strcmp(mode, "Turbo") == 0) {
        this->set_custom_fan_mode_("Turbo");  // Use protected setter
      }
    }
  }

 protected:
  climate::ClimateModeMask modes_;
};
```

## Lifetime Safety for Custom Modes

All `const char*` pointers must point to memory that lives for the component's lifetime:

**Safe patterns:**
```cpp
// 1. String literals (preferred)
traits.set_supported_custom_fan_modes({"Turbo", "Silent", "Eco"});

// 2. Static constants
static const char *const MODE_TURBO = "Turbo";
traits.set_supported_custom_fan_modes({MODE_TURBO});

// 3. C arrays
static constexpr const char *const FAN_MODES[] = {"Low", "Medium", "High"};
traits.set_supported_custom_fan_modes(FAN_MODES);

// 4. Extracting from existing persistent storage (e.g., std::map keys)
std::vector<const char *> preset_ptrs;
for (const auto &entry : this->custom_preset_config_) {
  preset_ptrs.push_back(entry.first.c_str());  // Map key lives with component
}
traits.set_supported_custom_presets(preset_ptrs);
```

**Unsafe patterns (DO NOT USE):**
```cpp
// WRONG - temporary string
std::string temp = "Mode";
traits.set_supported_custom_fan_modes({temp.c_str()});  // Dangling pointer!

// WRONG - local array
const char *modes[] = {"Mode1", "Mode2"};
traits.set_supported_custom_fan_modes(modes);  // Array destroyed after function!
```

The protected setters (`set_custom_fan_mode_()`, `set_custom_preset_()`) validate that pointers exist in the traits, ensuring they point to persistent memory.

## Timeline

- **ESPHome 2025.11.0 (November 2025):**
  - Both changes are active (breaking changes)
  - External components must update to new APIs

## Finding Code That Needs Updates

Search your external component code for these patterns:

```bash
# Find std::set usage for climate enums
grep -r 'std::set<.*Climate' --include='*.cpp' --include='*.h'

# Find add_supported_custom usage (removed API)
grep -r 'add_supported_custom' --include='*.cpp' --include='*.h'

# Find direct custom mode member access (now private)
grep -r '->custom_fan_mode' --include='*.cpp' --include='*.h'
grep -r '->custom_preset' --include='*.cpp' --include='*.h'

# Find optional<std::string> custom mode usage
grep -r 'optional<std::string>.*custom' --include='*.cpp' --include='*.h'
```

## Questions?

If you have questions about these changes or need help migrating your external component, please ask in the [ESPHome Discord](https://discord.gg/KhAMKrd) or open a [discussion on GitHub](https://github.com/esphome/esphome/discussions).

## Related Documentation

- [Climate Component Documentation](https://esphome.io/components/climate/index.html)
- [PR #11466: FiniteSetMask for Trait Storage](https://github.com/esphome/esphome/pull/11466)
- [PR #11621: Store Custom Modes in Flash](https://github.com/esphome/esphome/pull/11621)
