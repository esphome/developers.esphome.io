---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# TemplatableFn: 4-Byte Templatable Storage for Trivially Copyable Types

The `TEMPLATABLE_VALUE` macro now uses `TemplatableFn` (4 bytes) instead of `TemplatableValue` (8 bytes) for trivially copyable types like `float`, `uint32_t`, `bool`, and enums. External components that call macro-generated setters with raw C++ constants instead of going through `cg.templatable()` will fail to compile.

This is a **breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

**[PR #15545](https://github.com/esphome/esphome/pull/15545): Add TemplatableFn for 4-byte function-pointer templatable storage**

Every action in ESPHome uses `TEMPLATABLE_VALUE` to store values that can be either constants or lambdas. Previously, each field used `TemplatableValue` (8 bytes: a value slot + function pointer). For trivially copyable types, the value slot is unnecessary — a stateless lambda returning a constant compiles to a plain function pointer and costs only 4 bytes.

With ~340 `TEMPLATABLE_VALUE` fields across the codebase for trivially copyable types, this saves ~1,360 bytes of RAM.

## Three-Tier Design

| Type | Size (32-bit) | Use Case |
|------|--------------|----------|
| `TemplatableFn<T, Ts...>` | **4 bytes** | Function pointer only. Used by `TEMPLATABLE_VALUE` macro for trivially copyable types. |
| `TemplatableValue<T, Ts...>` | **8 bytes** | Value OR function pointer. Full backward compat — accepts raw constants. |
| `TemplatableValue<std::string, Ts...>` | **8 bytes** | Full implementation with string paths, stateful lambdas. Unchanged. |

The `TEMPLATABLE_VALUE` macro automatically selects the type via `TemplatableStorage<T, Ts...>`:

- **Trivially copyable types** (`float`, `uint32_t`, `bool`, enums, pointers) → `TemplatableFn` (4 bytes)
- **Non-trivially copyable types** (`std::string`, `std::vector<uint8_t>`) → `TemplatableValue` (8 bytes)

## Who This Affects

### 1. External components calling TEMPLATABLE_VALUE setters with raw values

If your Python codegen calls a macro-generated setter directly with a raw C++ constant instead of going through `cg.templatable()`, it will fail to compile:

```python
# This will fail — raw value passed to TemplatableFn setter
cg.add(action.set_brightness(0.5))

# This works — cg.templatable wraps constants in stateless lambdas
cg.add(action.set_brightness(await cg.templatable(config[CONF_BRIGHTNESS], [], float)))
```

### 2. External components using TemplatableValue for non-string types with stateful lambdas

`TemplatableValue<T, Ts...>` for non-string types no longer accepts stateful lambdas (lambdas with captures). A GitHub code search found no external components using this pattern. If needed, use `std::function<T(Ts...)>` directly.

## Migration Guide

### Fix codegen: route values through cg.templatable()

```python
# Before — raw value passed to setter (broken)
cg.add(action.set_value(config[CONF_VALUE]))

# After — value wrapped via cg.templatable (correct)
# args is the list of template arguments, e.g. [(float, "x")] or []
template_ = await cg.templatable(config[CONF_VALUE], args, int)
cg.add(action.set_value(template_))
```

This was technically incorrect before — the setter is part of the codegen API and should only receive values produced by `cg.templatable()`. The fix is straightforward.

### Optional: migrate direct TemplatableValue usage to TemplatableFn

If your component uses `TemplatableValue` directly (not via the macro), it continues to work without changes. To opt into the 4-byte savings:

```cpp
// Before (8 bytes, still works)
TemplatableValue<float, float> min_{NAN};

// After (4 bytes)
TemplatableFn<float, float> min_{[](float) -> float { return NAN; }};
```

```cpp
// Before (8 bytes, still works)
TemplatableValue<uint16_t> port_{80};

// After (4 bytes)
TemplatableFn<uint16_t> port_{[]() -> uint16_t { return 80; }};
```

`TemplatableFn` has the same API as `TemplatableValue` (`has_value()`, `value()`, `optional_value()`, `value_or()`), so no other code changes are needed.

### Stateful lambdas on non-string types

```cpp
// Before (hidden heap allocation via TemplatableValue)
int captured = 42;
TemplatableValue<int> val = [captured]() { return captured; };

// After (explicit about the allocation)
std::function<int()> val = [captured]() { return captured; };
```

`TemplatableValue<std::string, Ts...>` still supports stateful lambdas — no changes needed for string types.

## Timeline

- **ESPHome 2026.4.0 (April 2026):** `TEMPLATABLE_VALUE` macro uses `TemplatableFn` for trivially copyable types
- No deprecation period for the macro change — `TemplatableValue` used directly is fully backward compatible

## Finding Code That Needs Updates

```bash
# Find TEMPLATABLE_VALUE setters called without cg.templatable()
grep -rn 'cg.add.*set_.*config\[' your_component/__init__.py

# Find TemplatableValue usage that could migrate to TemplatableFn
grep -rn 'TemplatableValue' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15545: Add TemplatableFn for 4-byte function-pointer templatable storage](https://github.com/esphome/esphome/pull/15545)
