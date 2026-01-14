---
date: 2026-01-13
authors:
  - bdraco
comments: true
---

# Scheduler String-Based API Deprecation

The scheduler's `std::string`-based APIs (`set_timeout`, `set_interval`, `set_retry`, `defer`, and their cancel counterparts) are now deprecated. Use `const char*` string literals or `uint32_t` numeric IDs instead.

This deprecation affects **ESPHome 2026.1.0 and later**, with removal planned for **2026.7.0**.

<!-- more -->

## What changed

The scheduler now uses FNV-1a hashing internally, eliminating heap allocation for timeout/interval names. The `std::string` overloads still work but trigger deprecation warnings and will be removed in 2026.7.0.

## Migration options

### Option 1: Use string literals (recommended for most cases)

```cpp
// ❌ Before - heap allocation
this->set_timeout("update", 1000, [this]() { this->update(); });
this->cancel_timeout("update");

// ✅ After - zero allocation (string literal)
this->set_timeout("update", 1000, [this]() { this->update(); });  // Same!
this->cancel_timeout("update");  // Same!
```

If you're already using string literals, no change is needed - the `const char*` overload is selected automatically.

### Option 2: Use numeric IDs (best for dynamic cases)

```cpp
// ❌ Before - heap allocation with str_sprintf
static uint32_t action_id = 0;
std::string name = str_sprintf("action_%u", action_id++);
this->set_timeout(name, 1000, callback);
this->cancel_timeout(name);

// ✅ After - zero allocation with numeric ID
static uint32_t action_id = 0;
uint32_t id = action_id++;
this->set_timeout(id, 1000, callback);
this->cancel_timeout(id);
```

## Critical: Don't mix string and numeric APIs

A timeout set with `std::string` **cannot** be cancelled with `const char*` or `uint32_t`, and vice versa. They use separate internal namespaces:

```cpp
// ❌ BROKEN - mixing APIs
this->set_timeout(std::string("update"), 1000, callback);
this->cancel_timeout("update");  // Won't cancel! Different namespace

// ✅ CORRECT - consistent API usage
this->set_timeout("update", 1000, callback);
this->cancel_timeout("update");  // Works
```

## All deprecated methods

Component helper methods (used via `this->set_timeout(...)` in your component):

| Deprecated | Replacement |
|------------|-------------|
| `set_timeout(std::string, timeout, func)` | `set_timeout(const char*, timeout, func)` or `set_timeout(uint32_t, timeout, func)` |
| `cancel_timeout(std::string)` | `cancel_timeout(const char*)` or `cancel_timeout(uint32_t)` |
| `set_interval(std::string, interval, func)` | `set_interval(const char*, interval, func)` or `set_interval(uint32_t, interval, func)` |
| `cancel_interval(std::string)` | `cancel_interval(const char*)` or `cancel_interval(uint32_t)` |
| `set_retry(std::string, wait, attempts, func)` | `set_retry(const char*, wait, attempts, func)` or `set_retry(uint32_t, wait, attempts, func)` |
| `cancel_retry(std::string)` | `cancel_retry(const char*)` or `cancel_retry(uint32_t)` |
| `defer(std::string, func)` | `defer(const char*, func)` *(no `uint32_t` overload available)* |
| `cancel_defer(std::string)` | `cancel_defer(const char*)` *(no `uint32_t` overload available)* |

Note: Unlike `set_timeout`, `set_interval`, and `set_retry`, the `defer`/`cancel_defer` helpers currently only support `const char*` identifiers and do **not** have `uint32_t` overloads.
## Deprecation warnings

You'll see warnings like:

```
warning: 'void esphome::Scheduler::set_timeout(Component*, const std::string&, uint32_t, std::function<void()>)' is deprecated: Use const char* or uint32_t overload instead. Removed in 2026.7.0
```

## Finding code that needs updates

```bash
# Find std::string usage in scheduler calls
grep -rn "set_timeout.*std::string\|str_sprintf.*set_timeout" your_component/
grep -rn "set_interval.*std::string\|str_sprintf.*set_interval" your_component/
grep -rn "set_retry.*std::string\|str_sprintf.*set_retry" your_component/
```

## Why this change

- **Eliminates heap fragmentation**: `std::string` names caused heap allocations on every timeout
- **Zero-allocation path**: `const char*` and `uint32_t` overloads have no heap overhead
- **Compact storage**: 4-byte hash/ID instead of string pointer + allocation

## Reference Pull Request

- [esphome/esphome#13200](https://github.com/esphome/esphome/pull/13200)

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)
