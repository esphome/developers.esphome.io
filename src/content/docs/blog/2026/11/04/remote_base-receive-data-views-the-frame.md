---
title: "remote_base RemoteReceiveData Views the Frame Through a Span"
date: 2026-11-04
authors: bdraco
---

`RemoteReceiveData` now views a received frame through a `std::span`, so a receiver can hand frames to listeners and
dumpers straight from its own capture buffer. `get_raw_data()` returns that span instead of a reference to a vector.
External components that read `get_raw_data()` as a vector need a small change.

This is a **developer breaking change** for external components in **ESPHome 2026.12.0 and later**.

<!-- excerpt -->

## Background

**[PR #22269](https://github.com/esphome/esphome/pull/22269): Dispatch received frames from a span**

Every receiver had to copy each frame into the base class `temp_` vector before listeners and dumpers could see it.
A receiver with its own capture buffer, such as the BK72xx timer-sampled receiver, then needed a second buffer the
size of the largest frame just for that copy. With the frame viewed through a span, the receiver dispatches its own
buffer directly.

## What's Changing

1. `RemoteReceiveData::get_raw_data()` returns `remote_base::RawTimingsView` (`std::span<const int32_t>`) instead of
   `const remote_base::RawTimings &`.
1. `RemoteReceiverBase` gains `call_listeners_dumpers_(RawTimingsView)` for a receiver that dispatches its own buffer.
   The existing `call_listeners_dumpers_()` still dispatches `temp_`.

## Who This Affects

External components that:

- bind the result of `get_raw_data()` to `auto &` or to a `std::vector` reference
- pass it to a function taking `const std::vector<int32_t> &`
- call vector-only members on it, such as `at()`

**YAML configurations and `on_raw` lambdas are not affected**: `x` in `on_raw` is still a `std::vector<int32_t>`.

## Migration Guide

```cpp
// Before
const remote_base::RawTimings &timings = data.get_raw_data();
// After: view the frame
remote_base::RawTimingsView timings = data.get_raw_data();
// After: keep a copy
remote_base::RawTimings timings(data.get_raw_data().begin(), data.get_raw_data().end());
```

A helper that took `const RawTimings &` can take `RawTimingsView` instead; a vector still converts to it.

## Supporting Multiple ESPHome Versions

`auto timings = data.get_raw_data();` compiles on both, as a copy of the vector before 2026.12.0 and a span from
2026.12.0. Indexing, `size()`, `empty()` and range-for work on both.

## Timeline

- **ESPHome 2026.12.0 (December 2026):** `get_raw_data()` returns a span. No deprecation period: a return type cannot
  be overloaded.

## Finding Code That Needs Updates

```bash
grep -rn 'get_raw_data()' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #22269: Dispatch received frames from a span](https://github.com/esphome/esphome/pull/22269)
- [Infrared and RF frames with remote_base](/architecture/components/remote_base/)
