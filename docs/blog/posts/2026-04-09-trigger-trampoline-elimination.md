---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# Trigger Trampolines Eliminated with build_callback_automation

Common entity trigger classes have been replaced with lightweight forwarder structs that fit inline in the callback system. The new `build_callback_automation()` API eliminates per-trigger object allocations. Several entity callback signatures have also changed to pass state as an argument.

This is a **developer breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

**[PR #15174](https://github.com/esphome/esphome/pull/15174): Eliminate trigger trampolines with deduplicated forwarder structs**
**[PR #15198](https://github.com/esphome/esphome/pull/15198): alarm_control_panel — Migrate triggers to callback automation**
**[PR #15199](https://github.com/esphome/esphome/pull/15199): lock — Migrate LockStateTrigger to callback automation**
**[PR #15200](https://github.com/esphome/esphome/pull/15200): media_player — Migrate triggers to callback automation**

Previously, each automation trigger created a separate C++ object that existed solely to forward a callback to an `Automation`. For example:

```
button press → callback → ButtonPressTrigger::trigger() → Automation::trigger()
```

Now a lightweight forwarder struct collapses this into the callback itself:

```
button press → callback → TriggerForwarder::operator()() → Automation::trigger()
```

The forwarder fits in the `Callback::ctx_` field — no additional storage needed.

### Memory savings

| Config | Platform | RAM Saved | Flash Saved |
|--------|----------|-----------|-------------|
| ratgdo (garage door) | ESP8266 | **88 bytes** | **224 bytes** |
| multi-sensor device | ESP32-IDF | **208 bytes** | **280 bytes** |

## What's Changing

### 1. Trigger classes removed

The following trigger classes are removed and replaced with forwarder structs:

**Core entities (PR #15174):**

- `ButtonPressTrigger`
- `SensorStateTrigger`, `SensorRawStateTrigger`
- `PressTrigger`, `ReleaseTrigger`, `StateTrigger`, `StateChangeTrigger` (binary_sensor)
- `SwitchStateTrigger`, `SwitchTurnOnTrigger`, `SwitchTurnOffTrigger`
- `TextSensorStateTrigger`, `TextSensorStateRawTrigger`
- `NumberStateTrigger`
- `EventTrigger`

**alarm_control_panel (PR #15198):**

- `StateTrigger`, `ClearedTrigger`, `ChimeTrigger`, `ReadyTrigger`
- `TriggeredTrigger`, `ArmingTrigger`, `PendingTrigger`, `ArmedHomeTrigger`, `ArmedNightTrigger`, `ArmedAwayTrigger`, `DisarmedTrigger`

**lock (PR #15199):**

- `LockStateTrigger<State>`, `LockLockTrigger`, `LockUnlockTrigger`

**media_player (PR #15200):**

- `StateTrigger`, `MediaPlayerStateTrigger<State>`, `IdleTrigger`, `PlayTrigger`, `PauseTrigger`, `AnnouncementTrigger`, `OnTrigger`, `OffTrigger`

### 2. Callback signatures changed

Several entity callback signatures changed to pass state as an argument, enabling single-pointer forwarders:

```cpp
// alarm_control_panel — Before
void add_on_state_callback(std::function<void()> &&callback);
// After
template<typename F> void add_on_state_callback(F &&callback);
// Callback signature: void(AlarmControlPanelState)

// lock — Before
void add_on_state_callback(std::function<void()> &&callback);
// After
template<typename F> void add_on_state_callback(F &&callback);
// Callback signature: void(LockState)

// media_player — Before
void add_on_state_callback(std::function<void()> &&callback);
// After
template<typename F> void add_on_state_callback(F &&callback);
// Callback signature: void(MediaPlayerState)
```

### 3. Automation::trigger_ field removed

The `trigger_` protected field on `Automation` (set in constructor, never read) has been removed.

## Who This Affects

1. **External components that instantiate removed trigger classes** — must migrate to `build_callback_automation()` or register callbacks directly
2. **External components registering callbacks on alarm_control_panel, lock, or media_player** — must update callback signature to accept the state parameter
3. **External components accessing `Automation::trigger_`** — this field no longer exists

## Migration Guide

### Callback signature changes

```cpp
// alarm_control_panel — Before
panel->add_on_state_callback([this]() {
  auto state = this->panel_->get_state();
  // ...
});

// After
panel->add_on_state_callback([this](AlarmControlPanelState state) {
  // state is passed directly, no need to call get_state()
});
```

```cpp
// lock — Before
lock->add_on_state_callback([this]() {
  auto state = this->lock_->state;
  // ...
});

// After
lock->add_on_state_callback([this](LockState state) {
  // state is passed directly
});
```

```cpp
// media_player — Before
player->add_on_state_callback([this]() {
  auto state = this->player_->state;
  // ...
});

// After
player->add_on_state_callback([this](MediaPlayerState state) {
  // state is passed directly
});
```

### Python codegen migration

If your external component uses `build_automation()` with any of the removed trigger classes, migrate to `build_callback_automation()`:

```python
# Before
from esphome import automation

TurnOnTrigger = my_ns.class_("TurnOnTrigger", automation.Trigger.template())

CONFIG_SCHEMA = cv.Schema({
    cv.Optional(CONF_ON_TURN_ON): automation.validate_automation(
        {cv.GenerateID(CONF_TRIGGER_ID): cv.declare_id(TurnOnTrigger)}
    ),
})

async def to_code(config):
    for conf in config.get(CONF_ON_TURN_ON, []):
        trigger = cg.new_Pvariable(conf[CONF_TRIGGER_ID], var)
        await automation.build_automation(trigger, [], conf)
```

```python
# After — no trigger class needed, no CONF_TRIGGER_ID in schema
from esphome import automation

CONFIG_SCHEMA = cv.Schema({
    cv.Optional(CONF_ON_TURN_ON): automation.validate_automation({}),
})

async def to_code(config):
    for conf in config.get(CONF_ON_TURN_ON, []):
        await automation.build_callback_automation(
            var, "add_on_state_callback", [(bool, "x")], conf
        )
```

`build_automation()` and all `Trigger` subclasses remain available for triggers that need mutable state beyond a single `Automation*` pointer.

## Timeline

- **ESPHome 2026.4.0 (April 2026):** Trigger classes removed, callback signatures changed
- No deprecation period — these are signature changes and class removals

## Finding Code That Needs Updates

```bash
# Find references to removed trigger classes
grep -rn 'ButtonPressTrigger\|SensorStateTrigger\|PressTrigger\|ReleaseTrigger' your_component/
grep -rn 'SwitchStateTrigger\|TextSensorStateTrigger\|NumberStateTrigger' your_component/
grep -rn 'LockStateTrigger\|LockLockTrigger\|LockUnlockTrigger' your_component/
grep -rn 'MediaPlayerStateTrigger\|IdleTrigger\|PlayTrigger' your_component/

# Find alarm_control_panel/lock/media_player callback registrations
grep -rn 'add_on_state_callback' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15174: Eliminate trigger trampolines with deduplicated forwarder structs](https://github.com/esphome/esphome/pull/15174)
- [PR #15198: alarm_control_panel — Migrate triggers to callback automation](https://github.com/esphome/esphome/pull/15198)
- [PR #15199: lock — Migrate LockStateTrigger to callback automation](https://github.com/esphome/esphome/pull/15199)
- [PR #15200: media_player — Migrate triggers to callback automation](https://github.com/esphome/esphome/pull/15200)
