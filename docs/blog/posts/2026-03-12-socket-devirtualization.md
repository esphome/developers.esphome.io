---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# Socket Abstraction Layer Devirtualized

The `socket::Socket` and `socket::ListenSocket` types have been changed from virtual base classes to concrete type aliases. Listen sockets now use the `ListenSocket` type instead of `Socket`. These changes save 1,020–3,228 bytes of flash across platforms by eliminating virtual dispatch overhead.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14398](https://github.com/esphome/esphome/pull/14398): Devirtualize socket abstraction layer**

ESPHome's socket abstraction previously used virtual base classes (`socket::Socket`) even though only one socket implementation is active per build (selected at compile time via `#ifdef`). Since there's no runtime polymorphism needed, the virtual dispatch was pure overhead — each socket method call went through a vtable indirection, and the compiler couldn't inline the implementations.

By converting to concrete type aliases, the compiler can fully inline socket methods (read/write/writev) into callers, eliminating vtable overhead on the hot path.

### Flash savings

| Platform | Savings |
|----------|---------|
| ESP32 | 3,228 bytes (0.21%) |
| ESP8266 | 1,020 bytes (0.25%) |
| RP2040 | 2,836 bytes (0.71%) |

## What's Changing

### Type changes

`socket::Socket` and `socket::ListenSocket` are now type aliases for the platform-specific concrete implementation instead of virtual base classes.

Listen sockets returned by `socket_ip_loop_monitored()` and similar factory functions now return `std::unique_ptr<ListenSocket>` instead of `std::unique_ptr<Socket>`.

## Who This Affects

**External components that:**

- Create TCP server sockets using `socket::socket_ip_loop_monitored()` or similar factory functions and store them as `std::unique_ptr<socket::Socket>`

**Standard YAML configurations are not affected.**

## Migration Guide

### Listen socket type

```cpp
// Before
std::unique_ptr<socket::Socket> server_;

void setup() override {
  server_ = socket::socket_ip_loop_monitored(SOCK_STREAM, 0);
}

// After
std::unique_ptr<socket::ListenSocket> server_;

void setup() override {
  server_ = socket::socket_ip_loop_monitored(SOCK_STREAM, 0);
}
```

### Client sockets

Client sockets returned by `accept()` still use `std::unique_ptr<socket::Socket>` — no change needed for client socket handling.

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
  std::unique_ptr<socket::ListenSocket> server_;
#else
  std::unique_ptr<socket::Socket> server_;
#endif
```

Note: On ESP32 and LibreTiny in 2026.3.0, `ListenSocket` is a type alias for `Socket`, so `std::unique_ptr<socket::Socket>` would still compile. However, using `ListenSocket` is the correct forward-compatible approach.

## Timeline

- **ESPHome 2026.3.0 (March 2026):** Socket types devirtualized
- No deprecation period — this is a refactor with minimal external impact

## Finding Code That Needs Updates

```bash
# Find socket::Socket used for listen sockets
grep -rn 'unique_ptr.*socket::Socket.*server\|socket_ip_loop_monitored' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14398: Devirtualize socket abstraction layer](https://github.com/esphome/esphome/pull/14398)
