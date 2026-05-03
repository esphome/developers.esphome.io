---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# LogListener Virtual Interface Replaced with LogCallback

The `logger::LogListener` abstract class has been removed. Components that receive log messages must now register a callback with `logger::global_logger->add_log_callback(instance, callback)` instead of inheriting from `LogListener` and calling `add_log_listener()`.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14084](https://github.com/esphome/esphome/pull/14084): Replace LogListener virtual interface with LogCallback struct**

The `LogListener` pattern required every log-receiving class to inherit from `LogListener` and implement its pure virtual `on_log()` method. This added a vtable sub-table, thunk code, and constructor overhead to every implementer — all unnecessary since the call pattern is a simple function dispatch.

The replacement uses a `LogCallback` struct containing a function pointer + instance pointer. Non-capturing lambdas at registration sites decay to plain function pointers at compile time, producing zero closure overhead.

**Savings:** 112 bytes of flash saved across the built-in implementers (APIServer, WebServer, MQTTClientComponent, Syslog), with net zero heap change.

## What's Changing

The `LogListener` class and `add_log_listener()` method are removed entirely:

```cpp
// Removed
class LogListener {
 public:
  virtual void on_log(uint8_t level, const char *tag,
                      const char *message, size_t message_len) = 0;
};

// Removed
void Logger::add_log_listener(LogListener *listener);
```

Replaced by:

```cpp
// New
struct LogCallback {
  void *instance;
  void (*callback)(void *instance, uint8_t level, const char *tag,
                   const char *message, size_t message_len);
};

void Logger::add_log_callback(void *instance,
    void (*callback)(void *, uint8_t, const char *, const char *, size_t));
```

## Who This Affects

External components that inherit from `logger::LogListener` to receive log messages. Common use cases include custom log forwarders, remote logging over serial/network, and debug components.

**Standard YAML configurations are not affected.**

## Migration Guide

### Replace LogListener inheritance with add_log_callback()

```cpp
// Before
#include "esphome/components/logger/logger.h"

class MyLogForwarder : public Component, public logger::LogListener {
 public:
  void setup() override {
    if (logger::global_logger != nullptr)
      logger::global_logger->add_log_listener(this);
  }

  void on_log(uint8_t level, const char *tag,
              const char *message, size_t message_len) override {
    // Forward log message
    this->send_log(level, tag, message, message_len);
  }
};

// After
#include "esphome/components/logger/logger.h"

class MyLogForwarder : public Component {
 public:
  void setup() override {
    if (logger::global_logger != nullptr)
      logger::global_logger->add_log_callback(
          this,
          [](void *self, uint8_t level, const char *tag,
             const char *message, size_t message_len) {
            static_cast<MyLogForwarder *>(self)->on_log(
                level, tag, message, message_len);
          });
  }

  void on_log(uint8_t level, const char *tag,
              const char *message, size_t message_len) {
    // Forward log message (no longer 'override')
    this->send_log(level, tag, message, message_len);
  }
};
```

Key changes:

1. Remove `, public logger::LogListener` from the class declaration
2. Replace `add_log_listener(this)` with `add_log_callback(this, lambda)`
3. The lambda must be non-capturing (use the `void *self` parameter instead)
4. Remove `override` from `on_log()` — it's now a regular method

## Supporting Multiple ESPHome Versions

```cpp
void setup() override {
  if (logger::global_logger != nullptr) {
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
    logger::global_logger->add_log_callback(
        this,
        [](void *self, uint8_t level, const char *tag,
           const char *message, size_t message_len) {
          static_cast<MyLogForwarder *>(self)->on_log(
              level, tag, message, message_len);
        });
#else
    logger::global_logger->add_log_listener(this);
#endif
  }
}
```

When using the version guard, keep the `LogListener` inheritance behind the same guard:

```cpp
class MyLogForwarder : public Component
#if ESPHOME_VERSION_CODE < VERSION_CODE(2026, 3, 0)
    , public logger::LogListener
#endif
{
  // ...
};
```

## Timeline

- **ESPHome 2026.3.0 (March 2026):** `LogListener` class and `add_log_listener()` removed, `add_log_callback(instance, callback)` available

## Finding Code That Needs Updates

```bash
# Find LogListener inheritance
grep -rn 'LogListener' your_component/

# Find add_log_listener calls
grep -rn 'add_log_listener' your_component/

# Find on_log overrides
grep -rn 'on_log.*override' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14084: Replace LogListener virtual interface with LogCallback struct](https://github.com/esphome/esphome/pull/14084)
