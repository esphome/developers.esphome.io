---
date: 2026-02-12
authors:
  - bdraco
comments: true
---

# Entity Preferences: Use make_entity_preference() Instead of get_preference_hash()

`get_preference_hash()` is deprecated. Use the new `make_entity_preference<T>()` method to create preference objects for storing entity state. This prepares for fixing preference hash collisions that cause entities to overwrite each other's stored data.

This is a **breaking change** for external components in **ESPHome 2026.2.0 and later**.

<!-- more -->

## Background

**[PR #13505](https://github.com/esphome/esphome/pull/13505): Encapsulate entity preference creation to prepare for hash migration**

`get_preference_hash()` uses `fnv1_hash` on the sanitized object_id, which can collide when different entity names sanitize to the same string:

- "Living Room" and "living_room" both become "living_room"
- UTF-8 names like "温度" and "湿度" both become "__" (underscores)

This causes entities to overwrite each other's stored preferences. See [backlog#85](https://github.com/esphome/backlog/issues/85).

The new `make_entity_preference<T>()` method centralizes preference creation so that when the hash algorithm is fixed in a future release, migration logic goes in one place instead of 28+ call sites. **External components that continue using `get_preference_hash()` directly will not have their preferences automatically migrated**, meaning users will lose saved state (calibration values, restore states, etc.).

## What's Changing

`get_preference_hash()` is marked `ESPDEPRECATED` and will be removed in 2027.1.0. A new `make_entity_preference<T>()` template method on `EntityBase` replaces the two-step pattern of hashing + creating a preference object:

```cpp
// Before - two-step pattern (deprecated)
this->pref_ = global_preferences->make_preference<float>(this->get_preference_hash());

// After - single call
this->pref_ = this->make_entity_preference<float>();
```

## Who This Affects

External components that call `get_preference_hash()` or `get_object_id_hash()` and pass the result to `global_preferences->make_preference<T>()`. This is a common pattern — any component that saves/restores entity state (restore modes, calibration values, last-known values) likely uses it.

Real-world examples of affected external components:

- Components using `get_preference_hash()` directly ([example](https://github.com/standsi/esphome-external-components/issues/3)):
  ```cpp
  this->rtc_ = global_preferences->make_preference<RestoreState>(this->get_preference_hash());
  ```
- Components using the even older `get_object_id_hash()` ([example](https://github.com/GrKoR/esphome_aux_ac_component/issues/201)):
  ```cpp
  ESPPreferenceObject storage = global_preferences->make_preference<MyData>(this->get_object_id_hash(), true);
  ```

**Standard YAML configurations are not affected.**

## Migration Guide

### Simple case — storing entity state

```cpp
// Before
this->pref_ = global_preferences->make_preference<float>(this->get_preference_hash());

// After
this->pref_ = this->make_entity_preference<float>();
```

### With a version constant — invalidating old data when struct layout changes

```cpp
// Before
this->rtc_ = global_preferences->make_preference<MyRestoreState>(
    this->get_preference_hash() ^ RESTORE_STATE_VERSION);

// After
this->rtc_ = this->make_entity_preference<MyRestoreState>(RESTORE_STATE_VERSION);
```

The version parameter is XORed with the preference key internally, matching the previous `^ version` pattern.

### Cross-entity — using another entity's preference

```cpp
// Before
this->pref_ = global_preferences->make_preference<float>(
    this->some_number_->get_preference_hash());

// After
this->pref_ = this->some_number_->make_entity_preference<float>();
```

### Using get_object_id_hash() — same collision problem

Some older components use `get_object_id_hash()` instead of `get_preference_hash()`. This has the same collision issue and should also be migrated:

```cpp
// Before
this->pref_ = global_preferences->make_preference<MyData>(this->get_object_id_hash());

// After
this->pref_ = this->make_entity_preference<MyData>();
```

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 2, 0)
this->pref_ = this->make_entity_preference<float>();
#else
this->pref_ = global_preferences->make_preference<float>(this->get_preference_hash());
#endif
```

## Timeline

- **ESPHome 2026.2.0 (February 2026):** `get_preference_hash()` deprecated, `make_entity_preference<T>()` available
- **ESPHome 2027.1.0 (January 2027):** `get_preference_hash()` removed

## Finding Code That Needs Updates

```bash
# Find get_preference_hash() usage
grep -rn 'get_preference_hash' your_component/

# Find get_object_id_hash() usage (older pattern, same problem)
grep -rn 'get_object_id_hash' your_component/

# Find direct make_preference calls (should use make_entity_preference instead)
grep -rn 'global_preferences->make_preference' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #13505: Encapsulate entity preference creation](https://github.com/esphome/esphome/pull/13505)
- [Backlog #85: Fix preference hash collisions](https://github.com/esphome/backlog/issues/85)
