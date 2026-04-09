---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# Sensor .raw_state Deprecated in Favor of get_raw_state()

Direct access to the sensor `.raw_state` member is now deprecated. Use `get_raw_state()` instead. The `.raw_state` member will be removed in **ESPHome 2026.10.0**.

This is a **developer breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

**[PR #15094](https://github.com/esphome/esphome/pull/15094): Deprecate .raw_state, guard raw_callback_ behind USE_SENSOR_FILTER**

This follows the same pattern as the [text_sensor `.raw_state` deprecation](https://github.com/esphome/esphome/pull/12246). Accessor methods allow future optimizations to the internal storage without breaking callers.

Additionally, `raw_callback_` is now guarded behind `USE_SENSOR_FILTER`, saving 4 bytes per sensor instance when no filters are configured.

## What's Changing

```cpp
// Before
float raw = id(my_sensor).raw_state;

// After
float raw = id(my_sensor).get_raw_state();
```

The `.state` member is **not** deprecated — it remains a valid public member. However, examples in the docs now show `get_state()` to encourage the accessor pattern.

## Who This Affects

**External components and lambda users that directly access `.raw_state` on sensor instances.**

The deprecated member still works but emits a compiler warning. It will be removed in 2026.10.0.

## Migration Guide

Replace all direct `.raw_state` access with `get_raw_state()`:

```cpp
// Before
float raw = id(my_sensor).raw_state;
float current = this->raw_state;

// After
float raw = id(my_sensor).get_raw_state();
float current = this->get_raw_state();
```

**Important:** Nothing outside of `Sensor::publish_state()` should ever write to `raw_state`. If your component does this, it is a bug — use `publish_state()` instead.

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
float raw = id(my_sensor).get_raw_state();
#else
float raw = id(my_sensor).raw_state;
#endif
```

Note: `get_raw_state()` existed before this PR (it was defined in `.cpp`), so you may be able to use it on older versions as well.

## Timeline

- **ESPHome 2026.4.0 (April 2026):** `.raw_state` deprecated with compiler warning
- **ESPHome 2026.10.0 (October 2026):** `.raw_state` member removed

## Finding Code That Needs Updates

```bash
# Find direct .raw_state access in your component
grep -rn '\.raw_state' your_component/
grep -rn '->raw_state' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15094: Deprecate .raw_state, guard raw_callback_ behind USE_SENSOR_FILTER](https://github.com/esphome/esphome/pull/15094)
