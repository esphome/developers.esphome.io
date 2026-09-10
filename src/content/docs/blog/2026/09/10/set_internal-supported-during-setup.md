---
title: "set_internal() Supported During Setup"
date: 2026-09-10
authors: bdraco
---

`EntityBase::set_internal()` is no longer deprecated. It may be called before setup finishes, for example from `on_boot` at the default priority or from a component's `setup()` that runs above `setup_priority::AFTER_WIFI`. Calls after setup log an error and are ignored.

This applies to **ESPHome 2026.10.0 and later**.

<!-- excerpt -->

## Background

**[PR #19069](https://github.com/esphome/esphome/pull/19069): Support set_internal() during setup, reject calls after setup**

The setter was deprecated in 2026.3.0 because changing the flag at an arbitrary time is undefined; MQTT caches it during its own setup and API clients are never told about a later change. The flag is only read during setup by MQTT (`AFTER_CONNECTION`) and by the API camera listener (`AFTER_WIFI`); every other consumer reads it on demand. A call made before those run is therefore safe, and the setter now enforces that boundary instead of being removed.

## Usage

Decide once per boot, for example from a stored setting:

```yaml
esphome:
  on_boot:
    then:
      - lambda: |-
          bool single_unit = id(setup_pref).load();
          id(hp2_temperature).set_internal(single_unit);
          id(hp2_power).set_internal(single_unit);
```

## Limitations

- No consumer is notified of a change, so the flag can only be decided once per boot.
- A call from a priority below `AFTER_WIFI` still passes the guard, but MQTT and the API camera listener have already read the flag and keep the old value.
- Un-hiding an entity declared `internal: true` in YAML skips the duplicate name check codegen runs for exposed entities, so a name collision can surface at runtime. Entities with only an `id:` are forced internal and use the id as their name.
- Zigbee codegen skips YAML internal entities entirely, so un-hiding cannot add them to Zigbee.
