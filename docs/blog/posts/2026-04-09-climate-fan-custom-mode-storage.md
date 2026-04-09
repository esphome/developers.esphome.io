---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# Climate and Fan Custom Mode Vectors Moved to Entity

Custom mode vectors (`custom_fan_modes`, `custom_presets` for climate; `preset_modes` for fan) are now stored on the entity base class instead of being rebuilt inside traits on every call. The old `ClimateTraits` and `FanTraits` setter methods are deprecated.

This is a **breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

- **[PR #15206](https://github.com/esphome/esphome/pull/15206):** Climate — Store custom mode vectors on Climate entity
- **[PR #15209](https://github.com/esphome/esphome/pull/15209):** Fan — Store preset mode vector on Fan entity

`ClimateTraits` and `FanTraits` contained `std::vector` members that were reconstructed on every traits call. Climate uses `traits()` and Fan uses `get_traits()` — both are called during `publish_state()` and `control()`, the hottest paths in these components. This caused **heap allocations on every state update**. On long-running ESP devices, repeated allocations of different sizes fragment the heap and can lead to crashes.

Moving the vectors to the entity base class eliminates all heap allocation from traits copies.

## What's Changing

### Climate

Custom fan modes and custom presets are now set directly on the `Climate` entity:

```cpp
// Before — set on traits in traits() override
climate::ClimateTraits traits() override {
  auto traits = climate::ClimateTraits();
  traits.set_supported_custom_fan_modes({"Low", "Medium", "High"});
  traits.set_supported_custom_presets({"Eco", "Sleep"});
  return traits;
}

// After — set once during setup or codegen
void setup() override {
  this->set_custom_fan_modes({"Low", "Medium", "High"});
  this->set_custom_presets({"Eco", "Sleep"});
}
```

The old `ClimateTraits::set_supported_custom_fan_modes()` and `ClimateTraits::set_supported_custom_presets()` methods still work but are deprecated and will be removed in **2026.11.0**.

### Fan

Preset modes are now set directly on the `Fan` entity:

```cpp
// Before — set on traits in traits() override
fan::FanTraits get_traits() override {
  return fan::FanTraits(true, true, true, this->preset_modes_);
}

// After — set once during setup or codegen
void setup() override {
  this->set_preset_modes({"Auto", "Sleep", "Nature"});
}
```

The old `FanTraits::set_supported_preset_modes()` methods still work but are deprecated and will be removed in **2026.11.0**.

## Who This Affects

**External climate components** (~35 affected) that call `ClimateTraits::set_supported_custom_fan_modes()` or `ClimateTraits::set_supported_custom_presets()`.

**External fan components** (~15 affected) that pass preset modes through `FanTraits` constructors or call `FanTraits::set_supported_preset_modes()`.

## Migration Guide

### Climate

```cpp
// Before — in traits() override, called on every publish_state()
climate::ClimateTraits traits() override {
  auto traits = climate::ClimateTraits();
  traits.set_supported_custom_fan_modes({"Low", "Medium", "High"});
  traits.set_supported_custom_presets({"Eco", "Sleep"});
  // ... other traits
  return traits;
}

// After — set once, traits() gets them automatically
void setup() override {
  this->set_custom_fan_modes({"Low", "Medium", "High"});
  this->set_custom_presets({"Eco", "Sleep"});
}

climate::ClimateTraits traits() override {
  auto traits = climate::ClimateTraits();
  // custom_fan_modes and custom_presets are wired automatically
  // ... other traits
  return traits;
}
```

### Fan

```cpp
// Before
fan::FanTraits get_traits() override {
  return fan::FanTraits(true, true, true, this->preset_modes_);
}

// After
void setup() override {
  this->set_preset_modes({"Auto", "Sleep", "Nature"});
}

fan::FanTraits get_traits() override {
  return fan::FanTraits(true, true, true);
}
```

### Python codegen

```python
# Before — setting custom modes via traits in C++ generated code
cg.add(traits.set_supported_custom_fan_modes(modes))

# After — setting custom modes directly on the entity
cg.add(var.set_custom_fan_modes(modes))
```

## Timeline

- **ESPHome 2026.4.0 (April 2026):** Old traits setters deprecated
- **ESPHome 2026.11.0 (November 2026):** Deprecated setters removed, traits become trivially copyable

## Finding Code That Needs Updates

```bash
# Climate — find traits-based custom mode setters
grep -rn 'set_supported_custom_fan_modes\|set_supported_custom_presets' your_component/

# Fan — find traits-based preset mode setters
grep -rn 'set_supported_preset_modes' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15206: Climate — Store custom mode vectors on Climate entity](https://github.com/esphome/esphome/pull/15206)
- [PR #15209: Fan — Store preset mode vector on Fan entity](https://github.com/esphome/esphome/pull/15209)
