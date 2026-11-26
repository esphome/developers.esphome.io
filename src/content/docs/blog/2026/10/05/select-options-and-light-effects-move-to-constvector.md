---
title: "Select Options and Light Effects Move to ConstVector"
date: 2026-10-05
authors: bdraco
---

ESPHome 2026.10.0 stores select options and light effects in flash tables generated at build time instead of copying them onto the heap at boot. The getters now return a `ConstVector` view instead of a `FixedVector`. Code that binds the result with `auto` and uses the common read only members keeps working; code that names the old type, or calls `front()`, `back()`, `capacity()` or `full()`, needs a small change.

This is a **breaking change** for external components in **ESPHome 2026.10.0 and later**.

<!-- excerpt -->

## Background

Select options and light effects are fixed when the firmware is built, but both were copied into a heap `FixedVector` during `setup()`. On ESP8266 the list literal that codegen passed in also sat in `.rodata`, which is RAM there, so each list cost RAM twice. The API also built a temporary heap vector of effect names every time Home Assistant listed a light.

Codegen now emits each list as a table in flash, and the entity keeps a small `ConstVector` view of it (a pointer and a size). Selects with identical option lists share one table.

### Changes

- [PR #20117](https://github.com/esphome/esphome/pull/20117): select options are stored in a shared flash table; adds the core `ConstVector<T, Owning>` type.
- [PR #20204](https://github.com/esphome/esphome/pull/20204): light effects are stored in a flash table, and the API lists effect names straight from it.

## What's Changing

### Select

```cpp
// OLD
const FixedVector<const char *> &get_options() const;

// NEW
const SelectOptions &get_options() const;  // SelectOptions = ConstVector<const char *, true>
```

All `set_options(...)` overloads keep their behavior: they copy the list you pass, so runtime option lists from lambdas or external components work exactly as before. `SelectTraits` stays non copyable, as it was with `FixedVector`. A new `set_options_static(table, count)` is used by generated code only.

### Light

```cpp
// OLD
const FixedVector<LightEffect *> &get_effects() const;
void add_effects(const std::initializer_list<LightEffect *> &effects);

// NEW
const ConstVector<LightEffect *> &get_effects() const;
void add_effects(LightEffect *const *effects, size_t count);  // generated code only
```

`add_effects()` is only called by generated code; no external callers were found.

## Who This Affects

**Standard YAML configurations** need no changes.

**Lambdas and external components** keep working if they use any of these, which covers every use found in a GitHub code search:

- `const auto &opts = id(my_select).traits.get_options();` and `const auto &effects = id(my_light).get_effects();`
- range based `for`, `size()`, `empty()`, `[]`, `at()`, `data()`
- `std::find(list.begin(), list.end(), value)`, including `const auto *it = std::find(...)`: the iterators are raw pointers, as they were with `FixedVector`

**Code that breaks** is code that spells out the old type:

```cpp
// OLD - no longer compiles
const FixedVector<const char *> &opts = id(my_select).traits.get_options();
const FixedVector<LightEffect *> &effects = id(my_light).get_effects();

// NEW - let the compiler pick the type
const auto &opts = id(my_select).traits.get_options();
const auto &effects = id(my_light).get_effects();
```

`ConstVector` also drops the `front()`, `back()`, `capacity()` and `full()` members that `FixedVector` had, so calls to them fail even when the result is bound with `auto`. For a non empty list, use `list[0]` instead of `front()` and `list[list.size() - 1]` instead of `back()`. The list never grows after it is set, so `capacity()` is the same as `size()` and `full()` is always true.

```cpp
// OLD - no longer compiles
const char *first = id(my_select).traits.get_options().front();

// NEW
const auto &opts = id(my_select).traits.get_options();
const char *first = opts[0];  // check opts.empty() first if the list can be empty
```

Copying the light effect list into a local variable (`const auto effects = id(my_light).get_effects();`) failed to compile since `FixedVector` was introduced; it compiles again now, because the light effect view is a cheap, non owning copy of a flash table. Copying a select's options is still not allowed, since a select may own a runtime copy.

## ConstVector

`ConstVector<T>` in `esphome/core/helpers.h` is a read only view of a table: a pointer and a size, with raw pointer iterators. The owning variant, `ConstVector<T, true>`, can also hold a heap copy for lists set at runtime; it marks ownership in the top bit of the size, so it stays a pointer and a size (8 bytes on 32 bit targets). Element types must be whole words (pointers or other 32 bit values), because ESP8266 can only read flash with aligned 32 bit loads.

Other entity lists set at build time can move to `ConstVector` the same way.

## Finding Code That Needs Updates

```bash
grep -rnE 'FixedVector<[[:space:]]*(const char|LightEffect)[[:space:]]*\*[[:space:]]*>|get_(options|effects)\(\)\.(front|back|capacity|full)\(' --include='*.cpp' --include='*.h' --include='*.yaml'
```

The pattern also matches `FixedVector<const char *>` uses unrelated to selects, such as event types; only the ones holding select options need changing. It does not catch `front()` or `back()` called on a variable that holds the list, so check those by hand.

## Timeline

- **ESPHome 2026.10.0:** select options (#20117) and light effects (#20204) use `ConstVector`.

## Questions?

If you have questions about these changes or need help migrating your external component, please ask in the [ESPHome Discord](https://discord.gg/KhAMKrd) or open a [discussion on GitHub](https://github.com/esphome/esphome/discussions).
