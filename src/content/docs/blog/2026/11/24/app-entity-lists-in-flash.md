---
title: "App Entity Lists Kept in Flash"
date: 2026-11-24
authors: bdraco
---

`App`'s lists of entities, devices and areas are now constant arrays in flash, emitted by code generation, instead of
lists filled in RAM at boot. Components that create entities at run time now reserve slots for them in code generation
with `cg.reserve_runtime_entities()`. The `App.register_<entity>()`, `register_device()` and `register_area()` methods
are removed, and the `App.get_<entities>()` getters return a view instead of a reference to a `StaticVector`.

This is a **developer breaking change** for external components in **ESPHome 2026.12.0 and later**.

<!-- excerpt -->

## Background

**[PR #23234](https://github.com/esphome/esphome/pull/23234): Keep App entity, device and area lists in flash**

Code generation knows every entity in the configuration, so keeping a copy of each list in RAM wasted memory. On the
configurations measured, the change saves 64 to 152 bytes of RAM and 228 to 420 bytes of flash.

Adding entities at run time was never supported. Since the lists were sized from code generation, an entity added at
run time has been silently dropped, and some external components worked around that by overriding the
`ESPHOME_ENTITY_*_COUNT` defines. That breaks whenever core changes, so there is now a supported way to do it.

## What's Changing

- `App.get_sensors()`, `get_binary_sensors()` and the other entity getters, plus `get_devices()` and `get_areas()`,
  return an `AppList` by value. It supports range-for, `size()`, `empty()` and `operator[]`, and yields `T *`.
- `App.register_<entity>(obj)` and `App.register_<entity>(obj, name, hash, fields)` are removed.
- `App.register_device()` and `App.register_area()` are removed; devices and areas come only from the `devices:` and
  `areas:` lists in YAML.
- `cg.reserve_runtime_entities(platform, count)` is new. After it, `App.register_<entity>(obj, name)` exists for that
  platform.
- `ESPHOME_ENTITY_<X>_COUNT` counts entities from YAML only. Overriding it no longer adds capacity.

## Who This Affects

**External components that:**

- Create entities at run time and call `App.register_<entity>()`: compile error until they reserve slots
- Override `ESPHOME_ENTITY_*_COUNT`: no longer has any effect
- Emit `cg.App.register_<entity>(...)`, `register_device()` or `register_area()` from Python: compile error
- Keep a reference to a getter's result (`auto &sensors = App.get_sensors();`) or use `StaticVector` members such as
  `data()`: compile error

Loops such as `for (auto *s : App.get_sensors())` and indexing keep working, in components and in YAML lambdas.

## Migration Guide

### Entities created at run time

```python
# Before: no reservation, entity count define overridden
cg.add_define("ESPHOME_ENTITY_SENSOR_COUNT", 32)

# After
cg.reserve_runtime_entities("sensor", 8)
```

```cpp
// Before
App.register_sensor(s);

// After: names the entity and computes its key
App.register_sensor(s, "Discovered temperature");
```

Without a reservation any `register_<entity>()` call fails with
`Call cg.reserve_runtime_entities("sensor", n) in to_code to register entities at run time`. Entities registered after
the reserved slots are full are dropped. See [Entities Created at Run Time](/architecture/components/advanced/#entities-created-at-run-time).

### Entities from YAML

Use the platform helpers (`await sensor.register_sensor(var, config)`, `await sensor.new_sensor(config)` and so on)
instead of emitting `App.register_<entity>()` yourself; they add the entity to the list.

### Getters

```cpp
// Before
const auto &sensors = App.get_sensors();

// After
auto sensors = App.get_sensors();
```

## Supporting Multiple ESPHome Versions

```python
if hasattr(cg, "reserve_runtime_entities"):
    cg.reserve_runtime_entities("sensor", 8)
```

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 12, 0)
App.register_sensor(s, "Discovered temperature");
#else
App.register_sensor(s);
#endif
```

## Timeline

- **ESPHome 2026.12.0 (December 2026):** lists in flash, `cg.reserve_runtime_entities()` added, the register methods
  removed

## Finding Code That Needs Updates

```bash
grep -rnE "App\.register_|register_device|register_area|ESPHOME_ENTITY_[A-Z_]+_COUNT|auto &.*App\.get_" your_component/
```

## Questions?

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #23234: Keep App entity, device and area lists in flash](https://github.com/esphome/esphome/pull/23234)
- [Entities Created at Run Time](/architecture/components/advanced/#entities-created-at-run-time)
