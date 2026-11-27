---
title: "Entity Keys Hash the Raw Name: Use get_entity_key()"
date: 2026-11-27
authors: bdraco
---

The entity key sent to API clients is now the FNV-1 hash of the raw entity name instead of the sanitized object_id. `get_entity_key()` returns it, and `get_object_id_hash()` is deprecated.

This is a **breaking change** for external components in **ESPHome 2026.12.0 and later**.

<!-- excerpt -->

## Background

**[PR #23400](https://github.com/esphome/esphome/pull/23400): Hash entity keys from the raw name again**

The key used to be the hash of the sanitized object_id, so names that sanitize to the same string got the same key. Two UTF-8 names in Cyrillic or Chinese of the same length both sanitize to underscores, and Home Assistant could not tell their states apart ([#10283](https://github.com/esphome/esphome/issues/10283), [#16781](https://github.com/esphome/esphome/issues/16781)). Hashing the raw name gives each name its own key.

This was first merged for 2026.8.0 and held back because Home Assistant tracked entities by the key. Home Assistant 2026.9.0 matches entities by their unique_id, so the change is back. **Users must update Home Assistant to 2026.9.0 or newer before updating their devices.**

## What Changed

- `EntityBase::get_entity_key()` is new and returns the key API clients see.
- `EntityBase::get_object_id_hash()` is deprecated. It keeps returning the old sanitized object_id hash, which is no longer the API key.
- `make_entity_preference<T>()` uses the new key on ESP32, LibreTiny, host and Zephyr, and moves data stored under the old key the first time it runs. ESP8266 and RP2040 keep the old key.
- Configs without MQTT or prometheus accept names that only collided after sanitizing. MQTT and prometheus still build topics and labels from the object_id, so configs that use them still reject such names.

## Who This Affects

External components that use `get_object_id_hash()` to identify an entity, for example to match the key in an API message or to look up an entity:

```cpp
// Before
if (entity->get_object_id_hash() == key)
// After
if (entity->get_entity_key() == key)
```

External components that build a preference key from `get_object_id_hash()` or `get_preference_hash()` keep reading their existing data, but it is never migrated. Switch to `make_entity_preference<T>()`, which uses the new key and moves the stored data:

```cpp
// Before
this->pref_ = global_preferences->make_preference<bool>(this->get_object_id_hash());
// After
this->pref_ = this->make_entity_preference<bool>();
```

See [Entity Preferences: Use make_entity_preference() Instead of get_preference_hash()](/blog/2026/02/12/entity-preferences-use-make_entity_preference-instead-of-get_preference_hash/) for the preference patterns.

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 12, 0)
  uint32_t key = entity->get_entity_key();
#else
  uint32_t key = entity->get_object_id_hash();
#endif
```

## Timeline

- **ESPHome 2026.12.0 (December 2026):** `get_entity_key()` available, `get_object_id_hash()` deprecated
- **ESPHome 2027.1.0 (January 2027):** `get_preference_hash()` removed, as announced in February
- **ESPHome 2027.6.0 (June 2027):** `get_object_id_hash()` removed

## Finding Code That Needs Updates

```bash
grep -rn 'get_object_id_hash\|get_preference_hash' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)
