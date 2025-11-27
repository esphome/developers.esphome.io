---
date: 2025-11-07
authors:
  - bdraco
comments: true
---

# Light Entity Class: Memory Optimizations

ESPHome 2025.11.0 introduces memory optimizations to the `Light` entity class that reduce both heap and flash usage. These changes affect external components implementing custom light devices and effects.

<!-- more -->

## Background

### Motivation

Light components are among the most commonly used in ESPHome, and their memory footprint directly impacts available heap for runtime operations. On ESP8266 devices with only ~40KB of usable heap, every optimization matters:

- **Effect names** were stored as `std::string` objects on the heap, consuming allocation overhead (typically 24+ bytes) plus the string data for each effect
- **Color mode sets** used `std::set<ColorMode>` with red-black tree structure, consuming ~80 bytes of base overhead plus additional overhead for each member (2-4 modes typical)
- Light components often have multiple effects (5-10 common) and support several color modes, making this overhead multiply across each light entity

Moving effect names to flash and color modes to a 2-byte bitmask frees heap memory for runtime operations like network buffers, API operations, and component state. The bitmask also provides much faster O(1) lookups compared to the red-black tree's more expensive O(log n) operations.

### Changes

Two optimization PRs improved Light entity memory usage:

**[PR #11487](https://github.com/esphome/esphome/pull/11487): Store Effect Names in Flash**
Changes effect name storage from `std::string` (heap) to `const char*` (flash). Saves string allocation overhead plus string data for each effect.

**[PR #11348](https://github.com/esphome/esphome/pull/11348): Use Bitmask for Color Modes**
Changes color mode storage from `std::set<ColorMode>` (red-black tree on heap) to `ColorModeMask` (uint16_t bitmask, 2 bytes). Saves ~80 bytes of base `std::set` overhead plus per-member overhead. Provides much faster O(1) lookups.

## What's Changing

### For ESPHome 2025.11.0 and Later

**Effect Name Storage Changes (Breaking - [PR #11487](https://github.com/esphome/esphome/pull/11487)):**
```cpp
// OLD - std::string in heap
class MyEffect : public LightEffect {
 public:
  explicit MyEffect(const std::string &name) : LightEffect(name) {}
};

// NEW - const char* in flash
class MyEffect : public LightEffect {
 public:
  explicit MyEffect(const char *name) : LightEffect(name) {}
};
```

**Color Mode Storage Changes (Mostly Backward Compatible - [PR #11348](https://github.com/esphome/esphome/pull/11348)):**
```cpp
// OLD - std::set in heap
#include <set>
std::set<ColorMode> modes = {ColorMode::RGB, ColorMode::WHITE};
traits.set_supported_color_modes(modes);
bool supports = traits.get_supported_color_modes().count(ColorMode::RGB);

// NEW - ColorModeMask bitmask (but old syntax still works!)
#include "color_mode.h"
traits.set_supported_color_modes({ColorMode::RGB, ColorMode::WHITE});
bool supports = traits.get_supported_color_modes().count(ColorMode::RGB);  // .count() still works
```

## Who This Affects

**Effect Name Changes (PR #11487) - External components likely affected:**

- Any custom `LightEffect` subclasses need constructor updates from `std::string` to `const char*`
- Any code that calls `get_name()` on effects

**Color Mode Changes (PR #11348) - External components mostly backward compatible:**

- `ColorModeMask` provides backward compatibility with `std::set` API (has `.count()`, `.insert()`, `.erase()`, `.size()`, `.empty()`)
- Most components already pass initializer lists like `{ColorMode::RGB, ColorMode::WHITE}` which continue to work
- No core components needed changes, so external components are unlikely to need changes
- **Breaking edge case:** Explicitly passing `std::set<ColorMode>` to `set_supported_color_modes()` will fail to compile (but this pattern was not used in any core components)

**Standard YAML configurations** work without code changes.

## Migration Guide for External Components

### Part 1: Effect Name Changes

#### 1. Update Effect Constructors (Required Now)

```cpp
// OLD
#include <string>

class MyEffect : public LightEffect {
 public:
  explicit MyEffect(const std::string &name) : LightEffect(name) {}
};

// NEW - use const char*
class MyEffect : public LightEffect {
 public:
  explicit MyEffect(const char *name) : LightEffect(name) {}
};
```

#### 2. Update Effect get_name() Usage (Required Now)

```cpp
// OLD - returns const std::string&
const std::string &name = effect->get_name();
if (name == "My Effect") { }

// NEW - returns const char*
const char *name = effect->get_name();
if (strcmp(name, "My Effect") == 0) { }
```

#### 3. Remove Unnecessary String Includes

```cpp
// Remove if only used for effect names:
#include <string>
```

### Part 2: Color Mode Changes

#### 1. Update Container Types (Required Now)

```cpp
// OLD
#include <set>
std::set<ColorMode> modes_;

// NEW
#include "esphome/components/light/color_mode.h"
ColorModeMask modes_;
```

#### 2. Update Setter Calls (Only If You Explicitly Created std::set Variables)

**Note:** Most components already pass initializer lists directly and don't need changes. This only affects code that explicitly creates `std::set` variables (which no core components did).

```cpp
// OLD - explicitly creating std::set (uncommon, will fail to compile)
std::set<ColorMode> modes = {ColorMode::RGB, ColorMode::WHITE};
traits.set_supported_color_modes(modes);  // No longer has std::set overload

// NEW - initializer list (most components already did this)
traits.set_supported_color_modes({ColorMode::RGB, ColorMode::WHITE});

// OR - change std::set to ColorModeMask
ColorModeMask modes({ColorMode::RGB, ColorMode::WHITE});
traits.set_supported_color_modes(modes);  // Works
```

#### 3. Lookups Work Without Changes

**Note:** `ColorModeMask` provides `.count()` for backward compatibility, so no changes are required.

```cpp
// Works exactly as before - no changes needed
if (traits.get_supported_color_modes().count(ColorMode::RGB)) {
  // mode is supported
}
```

#### 4. Update Capability Checks (Optional - But Recommended)

**Note:** The old manual loop still works due to iterator compatibility, but using `supports_color_capability()` is cleaner.

```cpp
// OLD - manual loop (still works)
bool has_brightness = false;
for (auto mode : traits.get_supported_color_modes()) {
  if (mode & ColorCapability::BRIGHTNESS) {
    has_brightness = true;
    break;
  }
}

// NEW - recommended approach
bool has_brightness = traits.supports_color_capability(ColorCapability::BRIGHTNESS);
```

## Complete Migration Examples

### Example 1: Custom Effect

**Before:**
```cpp
#include <string>

class RainbowEffect : public LightEffect {
 public:
  explicit RainbowEffect(const std::string &name) : LightEffect(name) {}

  void apply() override {
    const std::string &name = this->get_name();
    ESP_LOGD("effect", "Applying %s", name.c_str());
    // Effect implementation
  }
};
```

**After:**
```cpp
class RainbowEffect : public LightEffect {
 public:
  explicit RainbowEffect(const char *name) : LightEffect(name) {}

  void apply() override {
    const char *name = this->get_name();
    ESP_LOGD("effect", "Applying %s", name);
    // Effect implementation
  }
};
```

### Example 2: Custom Light Component

**Before:**
```cpp
#include <set>

class MyLight : public LightOutput {
 public:
  LightTraits get_traits() override {
    auto traits = LightTraits();
    std::set<ColorMode> modes = {ColorMode::RGB, ColorMode::WHITE};
    traits.set_supported_color_modes(modes);
    return traits;
  }

  void check_mode_support(ColorMode mode) {
    auto modes = this->get_traits().get_supported_color_modes();
    if (modes.count(mode)) {
      // Mode is supported
    }
  }
};
```

**After:**
```cpp
#include "esphome/components/light/color_mode.h"

class MyLight : public LightOutput {
 public:
  LightTraits get_traits() override {
    auto traits = LightTraits();
    traits.set_supported_color_modes({ColorMode::RGB, ColorMode::WHITE});
    return traits;
  }

  void check_mode_support(ColorMode mode) {
    auto modes = this->get_traits().get_supported_color_modes();
    if (modes.count(mode)) {
      // Mode is supported (no changes needed - .count() still works!)
    }
  }
};
```

## Lifetime Safety for Effect Names

All `const char*` pointers must point to memory that lives for the effect's lifetime:

**Safe patterns:**
```cpp
// 1. String literals (preferred) - stored in flash
auto effect = new MyEffect("Rainbow");

// 2. Static constants
static const char *const EFFECT_NAME = "Rainbow";
auto effect = new MyEffect(EFFECT_NAME);

// 3. C arrays
static constexpr const char *const EFFECT_NAMES[] = {"Rainbow", "Pulse"};
auto effect = new MyEffect(EFFECT_NAMES[0]);
```

**Unsafe patterns (DO NOT USE):**
```cpp
// WRONG - temporary string
std::string temp = "Rainbow";
auto effect = new MyEffect(temp.c_str());  // Dangling pointer!

// WRONG - local array
const char name[] = "Rainbow";
auto effect = new MyEffect(name);  // Array destroyed!
```

## ColorModeMask Details

### Performance Benefits

`ColorModeMask` uses a 2-byte (uint16_t) bitmask instead of a red-black tree:

- **Memory**: 2 bytes vs ~80 bytes base overhead + per-member overhead
- **Lookup speed**: O(1) single bitwise AND operation vs O(log n) tree traversal
- **Cache efficiency**: Fits in CPU cache vs pointer chasing through tree nodes

For typical light use cases (2-4 color modes, frequent lookups), this provides significant performance and memory improvements.

### Iterator Support

`ColorModeMask` provides iterator support for compatibility with API encoding:

```cpp
ColorModeMask modes({ColorMode::RGB, ColorMode::WHITE});

// Range-based for loop
for (auto mode : modes) {
  ESP_LOGD("light", "Supported mode: %d", static_cast<int>(mode));
}

// Manual iteration
for (auto it = modes.begin(); it != modes.end(); ++it) {
  ColorMode mode = *it;
}
```

### Size and Emptiness Checks

```cpp
ColorModeMask modes({ColorMode::RGB, ColorMode::WHITE});

size_t count = modes.size();  // Returns 2
bool is_empty = modes.empty();  // Returns false
```

### Raw Bitmask Access

For advanced use cases (e.g., API encoding):

```cpp
ColorModeMask modes({ColorMode::RGB, ColorMode::WHITE});
uint16_t raw_mask = modes.get_mask();  // Get raw bitmask value
```

## Timeline

- **ESPHome 2025.11.0 (November 2025):**
  - Effect name changes are active (breaking for custom effects)
  - Color mode changes are active (backward compatible - no changes required)

## Finding Code That Needs Updates

Search your external component code for these patterns:

```bash
# Find std::string usage for effect names
grep -r 'LightEffect.*std::string' --include='*.cpp' --include='*.h'

# Find std::set usage for color modes
grep -r 'std::set<ColorMode>' --include='*.cpp' --include='*.h'

# Find .count() method calls on color modes
grep -r 'get_supported_color_modes.*count' --include='*.cpp' --include='*.h'

# Find set_supported_color_modes calls
grep -r 'set_supported_color_modes' --include='*.cpp' --include='*.h'
```

## Questions?

If you have questions about these changes or need help migrating your external component, please ask in the [ESPHome Discord](https://discord.gg/KhAMKrd) or open a [discussion on GitHub](https://github.com/esphome/esphome/discussions).

## Related Documentation

- [Light Component Documentation](https://esphome.io/components/light/index.html)
- [PR #11487: Store Effect Names in Flash](https://github.com/esphome/esphome/pull/11487)
- [PR #11348: Use Bitmask for Color Modes](https://github.com/esphome/esphome/pull/11348)
