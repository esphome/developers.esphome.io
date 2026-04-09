---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# wake_loop Moved from Socket Component into Core

`wake_loop_threadsafe()` and related wake primitives have moved from the socket component into core. The `require_wake_loop_threadsafe()` opt-in is deprecated (now a no-op) — wake works unconditionally on all platforms.

This is a **developer breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

**[PR #15446](https://github.com/esphome/esphome/pull/15446): Move wake_loop out of socket component into core**

The wake mechanism originally lived in the socket component because the first implementation used a UDP loopback socket. Since then, every platform has moved to nearly-free primitives (FreeRTOS task notifications, `esp_schedule()`, ARM `__sev()`), and the socket dependency was unnecessary complexity: 12 components needed `socket.require_wake_loop_threadsafe()`, `#ifdef USE_WAKE_LOOP_THREADSAFE` guards were needed at every call site, and platforms without networking had silent degradation (up to ~16ms latency).

Now it just works — no opt-in, no defines, no guards.

### Platform wake mechanisms

| Platform | Mechanism |
|----------|-----------|
| ESP32 | FreeRTOS task notifications (ISR-safe) |
| LibreTiny | FreeRTOS task notifications |
| ESP8266 | `esp_schedule()` (IRAM-safe) |
| RP2040 | `__sev()` / `__wfe()` (ARM CPU instructions) |
| Host | UDP loopback socket + `select()` |

## What's Changing

### Removed defines

- `USE_WAKE_LOOP_THREADSAFE` — no longer needed, wake is always available
- `USE_SOCKET_SELECT_SUPPORT` — replaced by `USE_HOST` where needed

### Deprecated function

`socket::require_wake_loop_threadsafe()` is deprecated (warns, no-op). Remove calls to it.

### No more `#ifdef` guards

```cpp
// Before
#ifdef USE_WAKE_LOOP_THREADSAFE
App.wake_loop_threadsafe();
#endif

// After
App.wake_loop_threadsafe();
```

### Socket AUTO_LOAD removed

Components no longer need to declare socket as a dependency just for wake functionality:

```python
# Before
DEPENDENCIES = ["socket"]  # just for wake_loop

# After — remove if socket was only needed for wake
# DEPENDENCIES = []
```

## Who This Affects

1. **External components calling `socket::require_wake_loop_threadsafe()`** — remove the call
2. **External components using `#ifdef USE_WAKE_LOOP_THREADSAFE`** — remove the guard
3. **External components with socket dependency only for wake** — remove the dependency
4. **External components checking `USE_SOCKET_SELECT_SUPPORT`** — use `USE_HOST` instead

## Migration Guide

```cpp
// Before
#include "esphome/components/socket/socket.h"

void setup() override {
  socket::require_wake_loop_threadsafe();
}

void some_isr_or_thread() {
#ifdef USE_WAKE_LOOP_THREADSAFE
  App.wake_loop_threadsafe();
#endif
}
```

```cpp
// After
void some_isr_or_thread() {
  App.wake_loop_threadsafe();
}
```

```python
# Before
DEPENDENCIES = ["socket"]

async def to_code(config):
    cg.add(socket_ns.require_wake_loop_threadsafe())

# After
async def to_code(config):
    pass  # wake is always available, no opt-in needed
```

## Timeline

- **ESPHome 2026.4.0 (April 2026):** Wake moved to core, `require_wake_loop_threadsafe()` deprecated
- `USE_WAKE_LOOP_THREADSAFE` and `USE_SOCKET_SELECT_SUPPORT` defines removed immediately

## Finding Code That Needs Updates

```bash
# Find require_wake_loop_threadsafe calls
grep -rn 'require_wake_loop_threadsafe' your_component/

# Find #ifdef guards
grep -rn 'USE_WAKE_LOOP_THREADSAFE' your_component/

# Find USE_SOCKET_SELECT_SUPPORT
grep -rn 'USE_SOCKET_SELECT_SUPPORT' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15446: Move wake_loop out of socket component into core](https://github.com/esphome/esphome/pull/15446)
