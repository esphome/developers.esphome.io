---
date: 2025-11-07
authors:
  - bdraco
comments: true
---

# Event Entity Class: Memory Optimizations

ESPHome 2025.11.0 introduces memory optimizations to the `Event` entity class that reduce heap usage and store event type strings in flash. These changes affect external components implementing custom event devices.

<!-- more -->

## Background

### Motivation

Event components use a set of valid event type strings to validate triggers. Using `std::set<std::string>` for this small list (typically 1-5 event types) wastes significant memory:

- **std::set overhead**: ~80 bytes of base red-black tree structure
- **Per-member overhead**: Each string requires tree node allocation (~24+ bytes)
- **std::string overhead**: Each string allocates on heap (~24 bytes overhead + string content)
- **Performance overhead**: O(log n) tree traversal for lookups, even for tiny datasets

For typical event use cases with 1-5 event types, a simple vector with linear search is both faster and uses far less memory. Linear search on 1-5 items is faster than tree traversal due to better cache locality.

Additionally, storing event type strings as `const char *` pointers to string literals moves the data from heap to flash (ESP32) or rodata (ESP8266), further reducing memory pressure.

### Changes

Event type storage has been optimized through two PRs to eliminate memory overhead and move strings to flash:

**[PR #11463](https://github.com/esphome/esphome/pull/11463): `std::set<std::string>` → `FixedVector<std::string>`**
- Eliminated ~80 bytes std::set base overhead
- Eliminated per-member tree node overhead (~24+ bytes per event type)
- Single allocation, no reallocation overhead

**[PR #11767](https://github.com/esphome/esphome/pull/11767): `FixedVector<std::string>` → `FixedVector<const char *>`**
- Eliminates std::string heap allocations (~24 bytes overhead + content per event type)
- **ESP32**: Event type strings stored in flash (ROM), freeing heap
- **ESP8266**: Event type strings in rodata section (still RAM, but eliminates std::string overhead)
- Uses `FixedVector<const char *>` (same as Select entity pattern - returned by const reference, never by value)

**Combined result:** Event types changed from `std::set<std::string>` → `FixedVector<const char *>`

**Performance:** O(n) linear search with strcmp, faster than O(log n) tree traversal for typical 1-5 event types due to cache locality.

## What's Changing

### For ESPHome 2025.11.0 and Later

**Event Type Storage Changes (Breaking - two PRs in same release):**

```cpp
// OLD (before 2025.11.0) - std::set<std::string> in heap
#include <set>
std::set<std::string> event_types = {"button_press", "button_release"};
event->set_event_types(event_types);
std::set<std::string> types = event->get_event_types();

// NEW (2025.11.0) - FixedVector<const char *> (initializer list still works!)
event->set_event_types({"button_press", "button_release"});
const FixedVector<const char *> &types = event->get_event_types();
```

**Note:** If your external component was already updated for the intermediate `FixedVector<std::string>` change, you'll need to update again for `FixedVector<const char *>`. Most components using initializer list syntax require minimal changes.

## Who This Affects

**Event Type Changes (PR #11767) - External components need updates:**

- **Breaking change:** `set_event_types()` now requires `const char *` strings (string literals)
- **Breaking change:** `get_event_types()` now returns `const FixedVector<const char *> &` instead of `std::set<std::string>`
- **Breaking change:** `last_event_type` is now private - use `get_last_event_type()` accessor instead
- Most components already pass string literal initializer lists like `{"button_press", "button_release"}` which continue to work
- Setter accepts `initializer_list`, `FixedVector`, or `std::vector` of `const char *` (same as Select options pattern)
- Loop variables must change from `const std::string &` to `const char *`
- Event type comparisons must use `strcmp()` instead of `==` operator
- No core ESPHome components needed changes (all used initializer list syntax)

**Standard YAML configurations** work without code changes.

## Migration Guide for External Components

### 1. Update Container Types (If Storing Event Types)

```cpp
// OLD
#include <set>
std::set<std::string> event_types_;

// NEW - Use FixedVector (most common)
FixedVector<const char *> event_types_;

// OR - Use std::vector if you need copyability
#include <vector>
std::vector<const char *> event_types_;
```

### 2. Update Setter Calls

**Most components already use string literals and won't need changes:**

```cpp
// STILL WORKS - string literal initializer list (most common, no changes needed)
event->set_event_types({"button_press", "button_release"});

// OLD - explicitly creating std::set<std::string> (will fail to compile)
std::set<std::string> types = {"button_press", "button_release"};
event->set_event_types(types);  // Deleted overload, no longer supported
```

**Note:** Accepts initializer list, `FixedVector<const char *>`, or `std::vector<const char *>`. Same pattern as Select options.

### 3. Update Getter Usage (Required If You Call get_event_types())

```cpp
// OLD - returns std::set<std::string> by value
std::set<std::string> types = event->get_event_types();
for (const std::string &type : types) {
  ESP_LOGD("event", "Type: %s", type.c_str());
}

// NEW - returns const FixedVector<const char *> &
const FixedVector<const char *> &types = event->get_event_types();
for (const char *type : types) {
  ESP_LOGD("event", "Type: %s", type);
}

// Or use auto
const auto &types = event->get_event_types();
for (const char *type : types) {
  ESP_LOGD("event", "Type: %s", type);
}
```

### 4. Update last_event_type Access (If You Access This Field)

```cpp
// OLD - direct field access
if (event->last_event_type != nullptr) {
  ESP_LOGD("event", "Last: %s", event->last_event_type);
}

// NEW - use getter
if (event->get_last_event_type() != nullptr) {
  ESP_LOGD("event", "Last: %s", event->get_last_event_type());
}
```

**Why this change?** Moving `last_event_type` to private with controlled access ensures pointer lifetime safety. The field is now guaranteed to always point to a string in `types_` (or be nullptr), preventing dangling pointer bugs when event types are reconfigured.

### 5. Update Event Type Lookups (If You Check Valid Types Manually)

```cpp
// OLD - std::set::find with std::string
auto types = event->get_event_types();
if (types.find("button_press") != types.end()) {
  // Type is valid
}

// NEW - linear search with strcmp
const auto &types = event->get_event_types();
bool found = false;
for (const char *type : types) {
  if (strcmp(type, "button_press") == 0) {
    found = true;
    break;
  }
}

// OR - use std::find_if with strcmp
#include <algorithm>
const auto &types = event->get_event_types();
auto it = std::find_if(types.begin(), types.end(),
  [](const char *t) { return strcmp(t, "button_press") == 0; });
if (it != types.end()) {
  // Type is valid
}
```

**Note:** For typical event use cases (1-5 event types), linear search with strcmp is faster than std::set due to better cache locality.

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

  void iterate_types() {
    for (const std::string &type : this->get_event_types()) {
      ESP_LOGD("event", "Type: %s", type.c_str());
    }
  }

  void log_last_event() {
    if (this->last_event_type != nullptr) {
      ESP_LOGD("event", "Last event: %s", this->last_event_type);
    }
  }
};
```

**After:**
```cpp
#include <cstring>

class MyEvent : public event::Event {
 public:
  void setup() override {
    // String literals work directly (most common pattern)
    this->set_event_types({"motion_detected", "motion_cleared"});
  }

  void check_valid_type(const std::string &type) {
    const auto &types = this->get_event_types();
    bool found = false;
    for (const char *t : types) {
      if (strcmp(t, type.c_str()) == 0) {
        found = true;
        break;
      }
    }
    if (found) {
      ESP_LOGD("event", "Valid type: %s", type.c_str());
    }
  }

  void iterate_types() {
    // Loop variable changed to const char *
    for (const char *type : this->get_event_types()) {
      ESP_LOGD("event", "Type: %s", type);  // No .c_str() needed
    }
  }

  void log_last_event() {
    // Use getter instead of direct field access
    if (this->get_last_event_type() != nullptr) {
      ESP_LOGD("event", "Last event: %s", this->get_last_event_type());
    }
  }
};
```

## `FixedVector<const char *>` Benefits

For typical event use cases (1-5 event types):

- **Memory**: Eliminates ~80 bytes std::set overhead + per-node overhead + std::string overhead
- **Lookup speed**: O(n) linear search with strcmp, faster than O(log n) tree traversal for small n due to cache locality
- **Flash storage**: String literals stored in flash (ESP32) or rodata (ESP8266), not heap
- **Single allocation**: FixedVector allocates once at runtime initialization, no reallocation overhead

### Platform-Specific Benefits

**ESP32 (IDF and Arduino):**
- Event type strings stored in flash memory (ROM)
- Zero heap usage for event type strings
- Maximum heap available for other operations

**ESP8266:**
- Event type strings in rodata section (still occupies RAM)
- Eliminates std::string heap overhead (~24 bytes per string + content)
- Reduces heap fragmentation

## Timeline

- **ESPHome 2025.11.0 (November 2025):**
  - Both optimizations active in same release
  - [PR #11463](https://github.com/esphome/esphome/pull/11463): `std::set<std::string>` → `FixedVector<std::string>`
  - [PR #11767](https://github.com/esphome/esphome/pull/11767): `FixedVector<std::string>` → `FixedVector<const char *>`
  - External components only need to migrate once (from `std::set<std::string>` to `FixedVector<const char *>`)

## Finding Code That Needs Updates

Search your external component code for these patterns:

```bash
# Find std::set usage for event types
grep -r 'std::set<.*string>.*event' --include='*.cpp' --include='*.h'

# Find set_event_types calls
grep -r 'set_event_types' --include='*.cpp' --include='*.h'

# Find get_event_types calls
grep -r 'get_event_types' --include='*.cpp' --include='*.h'

# Find event type lookups with std::string
grep -r 'for.*std::string.*get_event_types' --include='*.cpp' --include='*.h'

# Find std::string comparisons that might need strcmp
grep -r 'event_type.*==' --include='*.cpp' --include='*.h'

# Find direct last_event_type field access
grep -r '->last_event_type\|\.last_event_type' --include='*.cpp' --include='*.h'
```

## Questions?

If you have questions about these changes or need help migrating your external component, please ask in the [ESPHome Discord](https://discord.gg/KhAMKrd) or open a [discussion on GitHub](https://github.com/esphome/esphome/discussions).

## Related Documentation

- [Event Component Documentation](https://esphome.io/components/event/index.html)
- [PR #11463: Replace std::set with FixedVector for event type storage](https://github.com/esphome/esphome/pull/11463)
- [PR #11767: Store event types in flash memory](https://github.com/esphome/esphome/pull/11767)
