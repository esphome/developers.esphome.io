---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# UART flush() Now Returns FlushResult

The `UARTComponent::flush()` method return type has changed from `void` to `FlushResult`. External components that subclass `UARTComponent` and override `flush()` must update their override to return a `FlushResult` value.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14608](https://github.com/esphome/esphome/pull/14608): Return flush result, expose timeout via config**

`flush()` previously returned `void`, providing no way for callers to distinguish a successful TX drain from a driver failure or timeout. The new `FlushResult` enum allows callers to handle these cases appropriately.

## What's Changing

```cpp
// Before
virtual void flush() = 0;

// After
virtual FlushResult flush() = 0;
```

### FlushResult enum values

| Value | Meaning |
|-------|---------|
| `SUCCESS` | Confirmed: all bytes left the TX FIFO (IDF only) |
| `TIMEOUT` | Confirmed: timed out before TX completed (IDF only) |
| `FAILED` | Confirmed: driver or hardware error (IDF only) |
| `ASSUMED_SUCCESS` | Platform cannot report a result; success is assumed (ESP8266, RP2040, LibreTiny, Host) |

## Who This Affects

**External components that subclass `UARTComponent` and override `flush()`.**

**Standard YAML configurations are not affected.**

## Migration Guide

```cpp
// Before
void flush() override {
  // ...
}

// After
FlushResult flush() override {
  // ...
  return FlushResult::ASSUMED_SUCCESS;
}
```

Use `ASSUMED_SUCCESS` if your platform cannot confirm the TX drain completed. Use `SUCCESS`, `TIMEOUT`, or `FAILED` if your implementation can report the actual result.

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
FlushResult flush() override {
  // ...
  return FlushResult::ASSUMED_SUCCESS;
}
#else
void flush() override {
  // ...
}
#endif
```

## Timeline

- **ESPHome 2026.3.0 (March 2026):** Return type changed
- No deprecation period — this is a signature change

## Finding Code That Needs Updates

```bash
# Find flush() overrides in your component
grep -rn 'void flush()' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14608: Return flush result, expose timeout via config](https://github.com/esphome/esphome/pull/14608)
