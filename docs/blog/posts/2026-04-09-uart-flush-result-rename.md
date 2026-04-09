---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# FlushResult Renamed to UARTFlushResult

The `FlushResult` enum introduced in ESPHome 2026.3.0 has been renamed to `UARTFlushResult` with prefixed enum values to follow ESPHome's naming conventions and avoid macro collisions.

This is a **breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

**[PR #15101](https://github.com/esphome/esphome/pull/15101): Rename FlushResult to UARTFlushResult with UART_FLUSH_RESULT_ prefix**

The original `FlushResult::SUCCESS` value collided with the Realtek RTL SDK's `#define SUCCESS 0` macro, requiring ugly `#pragma push_macro` workarounds. Renaming to `UARTFlushResult` with `UART_FLUSH_RESULT_` prefixed values follows ESPHome's conventional component-prefix naming style (matching `UARTParityOptions` / `UART_CONFIG_PARITY_NONE`) and eliminates the collision entirely.

## What's Changing

| Before | After |
|---|---|
| `FlushResult` | `UARTFlushResult` |
| `FlushResult::SUCCESS` | `UARTFlushResult::UART_FLUSH_RESULT_SUCCESS` |
| `FlushResult::TIMEOUT` | `UARTFlushResult::UART_FLUSH_RESULT_TIMEOUT` |
| `FlushResult::FAILED` | `UARTFlushResult::UART_FLUSH_RESULT_FAILED` |
| `FlushResult::ASSUMED_SUCCESS` | `UARTFlushResult::UART_FLUSH_RESULT_ASSUMED_SUCCESS` |

## Who This Affects

**External components that implement `UARTComponent::flush()` and reference the `FlushResult` type or enum values.**

This only affects components updated for the 2026.3.0 `flush()` return type change. If you haven't updated your `flush()` override yet, see the [2026.3.0 UART flush blog post](2026-03-12-uart-flush-result.md) first.

## Migration Guide

```cpp
// Before (2026.3.0)
FlushResult flush() override {
  // ...
  return FlushResult::ASSUMED_SUCCESS;
}

// After (2026.4.0)
UARTFlushResult flush() override {
  // ...
  return UARTFlushResult::UART_FLUSH_RESULT_ASSUMED_SUCCESS;
}
```

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
UARTFlushResult flush() override {
  // ...
  return UARTFlushResult::UART_FLUSH_RESULT_ASSUMED_SUCCESS;
}
#elif ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 3, 0)
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

- **ESPHome 2026.3.0 (March 2026):** `FlushResult` introduced
- **ESPHome 2026.4.0 (April 2026):** Renamed to `UARTFlushResult` with prefixed values
- No deprecation period — this is a rename of a type introduced one release ago

## Finding Code That Needs Updates

```bash
# Find FlushResult references in your component
grep -rn 'FlushResult' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15101: Rename FlushResult to UARTFlushResult](https://github.com/esphome/esphome/pull/15101)
- [PR #14608: UART flush() return type change (2026.3.0)](https://github.com/esphome/esphome/pull/14608)
