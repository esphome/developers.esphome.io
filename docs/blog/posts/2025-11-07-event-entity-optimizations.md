---
date: 2025-11-07
authors:
  - bdraco
comments: true
---

# Event Entity Class: Memory Optimizations

ESPHome 2025.11.0 introduces memory optimizations to the `Event` entity class that reduce heap usage. These changes affect external components implementing custom event devices.

<!-- more -->

## Background

### Motivation

Event components use a set of valid event type strings to validate triggers. Using `std::set<std::string>` for this small list (typically 1-5 event types) wastes significant memory:

- **std::set overhead**: ~80 bytes of base red-black tree structure
- **Per-member overhead**: Each string requires tree node allocation (~24+ bytes) plus string data
- **Performance overhead**: O(log n) tree traversal for lookups, even for tiny datasets

For typical event use cases with 1-5 event types, a simple vector with linear search is both faster and uses far less memory. Linear search on 1-5 items is faster than tree traversal due to better cache locality.

### Changes

**[PR #11463](https://github.com/esphome/esphome/pull/11463): Replace std::set with FixedVector**

Changes event type storage from `std::set<std::string>` (red-black tree on heap) to `FixedVector<std::string>` (single allocation, no reallocation overhead). Saves ~80 bytes of base std::set overhead plus per-member node overhead.

## What's Changing

### For ESPHome 2025.11.0 and Later

**Event Type Storage Changes (Mostly Backward Compatible - [PR #11463](https://github.com/esphome/esphome/pull/11463)):**

```cpp
// OLD - std::set in heap
#include <set>
std::set<std::string> event_types = {"button_press", "button_release"};
event->set_event_types(event_types);
std::set<std::string> types = event->get_event_types();

// NEW - FixedVector (but initializer list still works!)
#include "esphome/core/helpers.h"
event->set_event_types({"button_press", "button_release"});
const FixedVector<std::string> &types = event->get_event_types();
```

## Who This Affects

**Event Type Changes (PR #11463) - External components mostly backward compatible:**
- Most components already pass initializer lists like `{"button_press", "button_release"}` which continue to work
- `set_event_types()` accepts `std::initializer_list<std::string>` which works with both explicit sets and brace initialization
- No core components needed changes, so external components are unlikely to need changes
- **Breaking edge case:** Explicitly passing `std::set<std::string>` to `set_event_types()` will fail to compile (no longer has std::set overload)
- **Breaking change:** `get_event_types()` now returns `const FixedVector<std::string> &` instead of `std::set<std::string>` by value
- Event type lookups now use linear search instead of std::set::find()

**Standard YAML configurations** work without code changes.

## Migration Guide for External Components

### 1. Update Container Types (If Storing Event Types)

```cpp
// OLD
#include <set>
std::set<std::string> event_types_;

// NEW
#include "esphome/core/helpers.h"
FixedVector<std::string> event_types_;
```

### 2. Update Setter Calls (Only If You Explicitly Created std::set Variables)

**Note:** Most components already pass initializer lists directly and don't need changes. This only affects code that explicitly creates `std::set` variables (which no core components did).

```cpp
// OLD - explicitly creating std::set (uncommon, will fail to compile)
std::set<std::string> types = {"button_press", "button_release"};
event->set_event_types(types);  // No longer has std::set overload

// NEW - initializer list (most components already did this)
event->set_event_types({"button_press", "button_release"});

// OR - use FixedVector
FixedVector<std::string> types;
types.init(2);
types.push_back("button_press");
types.push_back("button_release");
event->set_event_types(types);  // Still works if you convert to initializer_list
```

### 3. Update Getter Usage (Required If You Call get_event_types())

```cpp
// OLD - returns std::set by value
std::set<std::string> types = event->get_event_types();
for (const auto &type : types) {
  // Use type
}

// NEW - returns const FixedVector<std::string> &
const FixedVector<std::string> &types = event->get_event_types();
for (const auto &type : types) {
  // Use type (same iteration syntax)
}
```

### 4. Update Event Type Lookups (If You Check Valid Types Manually)

```cpp
// OLD - std::set::find
auto types = event->get_event_types();
if (types.find("button_press") != types.end()) {
  // Type is valid
}

// NEW - linear search (or use std::find)
const auto &types = event->get_event_types();
bool found = false;
for (const auto &type : types) {
  if (type == "button_press") {
    found = true;
    break;
  }
}

// OR - use std::find from <algorithm>
#include <algorithm>
const auto &types = event->get_event_types();
if (std::find(types.begin(), types.end(), "button_press") != types.end()) {
  // Type is valid
}
```

**Note:** For typical event use cases (1-5 event types), linear search is faster than std::set due to better cache locality.

## Complete Migration Example

### Custom Event Component

**Before:**
```cpp
#include <set>

class MyEvent : public event::Event {
 public:
  void setup() override {
    std::set<std::string> types = {"motion_detected", "motion_cleared"};
    this->set_event_types(types);
  }

  void check_valid_type(const std::string &type) {
    auto types = this->get_event_types();
    if (types.find(type) != types.end()) {
      ESP_LOGD("event", "Valid type: %s", type.c_str());
    }
  }
};
```

**After:**
```cpp
#include "esphome/core/helpers.h"

class MyEvent : public event::Event {
 public:
  void setup() override {
    this->set_event_types({"motion_detected", "motion_cleared"});
  }

  void check_valid_type(const std::string &type) {
    const auto &types = this->get_event_types();
    bool found = std::find(types.begin(), types.end(), type) != types.end();
    if (found) {
      ESP_LOGD("event", "Valid type: %s", type.c_str());
    }
  }
};
```

## FixedVector Details

### What is FixedVector?

`FixedVector` is a helper class from `esphome/core/helpers.h` that:

- Allocates memory once during initialization (no reallocation overhead)
- Provides vector-like interface (`push_back()`, `begin()`, `end()`, `size()`)
- Eliminates STL reallocation machinery (no `_M_realloc_insert` bloat)
- Compatible with initializer_list construction

```cpp
FixedVector<std::string> types;
types.init(3);  // Pre-allocate space for 3 elements
types.push_back("type1");
types.push_back("type2");
types.push_back("type3");

// Iteration works the same as std::vector
for (const auto &type : types) {
  ESP_LOGD("event", "Type: %s", type.c_str());
}
```

### Performance Benefits

For typical event use cases (1-5 event types):

- **Memory**: Single allocation vs ~80 bytes base overhead + per-node overhead
- **Lookup speed**: O(n) linear search, but faster than O(log n) tree traversal for small n due to cache locality
- **No reallocation**: FixedVector size is set once, no STL reallocation overhead

## Timeline

- **ESPHome 2025.11.0 (November 2025):**
  - Event type storage changes are active
  - Mostly backward compatible (only breaks explicit std::set<std::string> passing)

## Finding Code That Needs Updates

Search your external component code for these patterns:

```bash
# Find std::set usage for event types
grep -r 'std::set<.*string>.*event' --include='*.cpp' --include='*.h'

# Find set_event_types calls
grep -r 'set_event_types' --include='*.cpp' --include='*.h'

# Find get_event_types calls
grep -r 'get_event_types' --include='*.cpp' --include='*.h'

# Find event type lookups
grep -r 'types.*find\|event.*find' --include='*.cpp' --include='*.h'
```

## Questions?

If you have questions about these changes or need help migrating your external component, please ask in the [ESPHome Discord](https://discord.gg/KhAMKrd) or open a [discussion on GitHub](https://github.com/esphome/esphome/discussions).

## Related Documentation

- [Event Component Documentation](https://esphome.io/components/event/index.html)
- [PR #11463: Replace std::set with FixedVector](https://github.com/esphome/esphome/pull/11463)
