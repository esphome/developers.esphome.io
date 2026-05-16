---
date: 2026-05-14
authors:
  - bdraco
comments: true
---

# ClimateTraits Boolean Accessors Removed in Favor of Feature Flags

The ten deprecated `ClimateTraits::get/set_supports_*` accessors have been removed. External climate components must migrate to the `add_feature_flags()` / `has_feature_flags()` API introduced in 2025.11.0 — the 6-month deprecation window has elapsed.

This is a **breaking change** for external components in **ESPHome 2026.5.0 and later**.

<!-- more -->

## Background

**[PR #16289](https://github.com/esphome/esphome/pull/16289): Remove deprecations scheduled for 2026.5.0**

When `ClimateTraits` migrated to a packed bitmask in 2025.11.0 ([blog post](2025-11-07-climate-entity-optimizations.md)), the old boolean getter/setter pairs were kept as thin shims and marked `ESPDEPRECATED("...", "2025.11.0")` to give external components a 6-month window. That window has now closed and the shims are gone.

The replacement API has been the canonical way to express climate capabilities since 2025.11.0, and every in-tree climate component (heat-pump IR codecs, mini-split bridges, thermostat platform, etc.) has been on it for months.

## What's Changing

The following ten methods have been removed from `ClimateTraits`:

| Removed method | Replacement flag |
|---|---|
| `set_supports_current_temperature(bool)` | `add_feature_flags(climate::CLIMATE_SUPPORTS_CURRENT_TEMPERATURE)` |
| `get_supports_current_temperature()` | `has_feature_flags(climate::CLIMATE_SUPPORTS_CURRENT_TEMPERATURE)` |
| `set_supports_current_humidity(bool)` | `add_feature_flags(climate::CLIMATE_SUPPORTS_CURRENT_HUMIDITY)` |
| `get_supports_current_humidity()` | `has_feature_flags(climate::CLIMATE_SUPPORTS_CURRENT_HUMIDITY)` |
| `set_supports_two_point_target_temperature(bool)` | `add_feature_flags(climate::CLIMATE_REQUIRES_TWO_POINT_TARGET_TEMPERATURE)` |
| `get_supports_two_point_target_temperature()` | `has_feature_flags(climate::CLIMATE_REQUIRES_TWO_POINT_TARGET_TEMPERATURE)` |
| `set_supports_target_humidity(bool)` | `add_feature_flags(climate::CLIMATE_SUPPORTS_TARGET_HUMIDITY)` |
| `get_supports_target_humidity()` | `has_feature_flags(climate::CLIMATE_SUPPORTS_TARGET_HUMIDITY)` |
| `set_supports_action(bool)` | `add_feature_flags(climate::CLIMATE_SUPPORTS_ACTION)` |
| `get_supports_action()` | `has_feature_flags(climate::CLIMATE_SUPPORTS_ACTION)` |

### Watch for `two_point_target_temperature`

`set_supports_two_point_target_temperature(true)` maps to **`CLIMATE_REQUIRES_TWO_POINT_TARGET_TEMPERATURE`**, not `CLIMATE_SUPPORTS_TWO_POINT_TARGET_TEMPERATURE`. The bitmask flag name reflects the actual semantic — when set, the climate device *requires* both `target_temperature_low` and `target_temperature_high` to be specified instead of a single `target_temperature`. Most external HVAC components want this flag.

## Who This Affects

**External climate components in C++** that still call the old accessors. The repo-wide search for external usage found ~20+ such components — heat-pump IR drivers, mini-split bridges, brand-specific climate integrations (Haier, Daikin IR, Ecodan, Sanyou, Sharp, Mill Heat, …).

**YAML configurations are not affected.** Built-in climate platforms migrated in 2025.11.0 and any user-facing config keys are unchanged.

## Migration Guide

```cpp
// Before (no longer compiles)
ClimateTraits traits;
traits.set_supports_current_temperature(true);
traits.set_supports_action(true);
traits.set_supports_two_point_target_temperature(true);

if (traits.get_supports_action()) {
  // ...
}
```

```cpp
// After
ClimateTraits traits;
traits.add_feature_flags(climate::CLIMATE_SUPPORTS_CURRENT_TEMPERATURE);
traits.add_feature_flags(climate::CLIMATE_SUPPORTS_ACTION);
traits.add_feature_flags(climate::CLIMATE_REQUIRES_TWO_POINT_TARGET_TEMPERATURE);

if (traits.has_feature_flags(climate::CLIMATE_SUPPORTS_ACTION)) {
  // ...
}
```

`add_feature_flags()` accepts a bitwise OR of multiple flags, so a long sequence of individual calls can be condensed:

```cpp
traits.add_feature_flags(
    climate::CLIMATE_SUPPORTS_CURRENT_TEMPERATURE |
    climate::CLIMATE_SUPPORTS_CURRENT_HUMIDITY |
    climate::CLIMATE_SUPPORTS_TARGET_HUMIDITY |
    climate::CLIMATE_SUPPORTS_ACTION);
```

`has_feature_flags()` returns true only when *all* requested flags are set, which is the usual intent for capability checks. Pass a single flag to test for one.

## Timeline

- **2025.11.0:** Feature-flag API added; boolean accessors marked `ESPDEPRECATED`.
- **2026.5.0:** Boolean accessors removed.

## References

- [PR #16289](https://github.com/esphome/esphome/pull/16289) — Remove climate / ektf2232 deprecations
- [2025.11.0 Climate optimizations blog post](2025-11-07-climate-entity-optimizations.md) — the deprecation that started the clock
- [2026.4.0 Climate fan custom mode storage blog post](2026-04-09-climate-fan-custom-mode-storage.md) — related climate-API tightening
