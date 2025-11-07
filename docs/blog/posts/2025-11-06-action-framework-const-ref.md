---
date: 2025-11-06
authors:
  - bdraco
comments: true
---

# Action Framework Performance Optimization

The core automation framework (actions, triggers, and conditions) has been optimized to use const references instead of pass-by-value for parameter passing. This reduces memory allocations by 83% in the automation execution path.

This is a **breaking change** for external components with custom actions or conditions in **ESPHome 2025.11.0 and later**.

## What needs to change

External components must update their action/condition method signatures to use const references:

```cpp
// ❌ Before
template<typename... Ts>
class MyAction : public Action<Ts...> {
  void play(Ts... x) override {
    // ...
  }
};

// ✅ After
template<typename... Ts>
class MyAction : public Action<Ts...> {
  void play(const Ts&... x) override {  // ← Add const&
    // ... (no other changes needed)
  }
};
```

## All signatures to update

- `void play(Ts... x)` → `void play(const Ts&... x)`
- `void play_complex(Ts... x)` → `void play_complex(const Ts&... x)`
- `bool check(Ts... x)` → `bool check(const Ts&... x)`

## Compilation errors

External components will fail to compile with clear error messages pointing to the methods that need updating:

```
error: no declaration matches 'void MyAction::play(Ts ...)'
note: candidate is: 'void MyAction::play(const Ts& ...)'
```

## Finding code that needs updates

```bash
# Find actions/conditions that need updating
grep -rn "void play(Ts\.\.\. \w\+) override" your_component/
grep -rn "void play_complex(Ts\.\.\. \w\+) override" your_component/
grep -rn "bool check(Ts\.\.\. \w\+) override" your_component/
```

## Supporting multiple ESPHome versions

If your external component needs to support both old and new ESPHome versions:

```cpp
// Use version guards for compatibility
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2025, 11, 0)
  void play(const Ts&... x) override {
    // Implementation
  }
#else
  void play(Ts... x) override {
    // Implementation
  }
#endif
```

## Why this change

Previously, the automation framework made **6 copies** of every argument as it passed through the call chain. For `std::string` arguments (like logger messages), this meant 6 heap allocations per trigger event.

The change eliminates these copies, resulting in **83% fewer heap allocations** at runtime.

## No logic changes required

This is a purely mechanical change - you only need to update method signatures. Your implementation logic does not need to change.

## Reference Pull Request

- [esphome/esphome#11704](https://github.com/esphome/esphome/pull/11704)

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)
