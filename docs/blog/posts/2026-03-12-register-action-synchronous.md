---
date: 2026-03-12
authors:
  - bdraco
comments: true
---

# register_action Now Requires Explicit synchronous= Parameter

All `register_action()` calls now require an explicit `synchronous=True` or `synchronous=False` parameter. This enables the StringRef optimization for synchronous actions (zero-copy string argument passing) while ensuring asynchronous actions safely use owning `std::string` to prevent dangling references. Existing external components will continue to work but will see a warning at config time until updated.

This is a **breaking change** for external components in **ESPHome 2026.3.0 and later**.

<!-- more -->

## Background

**[PR #14606](https://github.com/esphome/esphome/pull/14606): Require explicit synchronous= for register_action**

The `synchronous` flag controls whether trigger arguments (especially strings) use zero-copy `StringRef` or owning `std::string`. Previously, all actions defaulted to `synchronous=False` (owning `std::string`), which is safe but allocates on the heap. The vast majority of actions (~440 out of ~450) are synchronous and can safely use `StringRef` instead, avoiding heap allocation entirely.

By requiring the parameter explicitly, the codebase documents the async contract of every action, and synchronous actions automatically benefit from zero-copy string passing.

## What's Changing

`register_action()` now emits a config-time warning if `synchronous=` is not passed explicitly. The safe default (`synchronous=False`) is still applied, so **existing external components continue to work** — they will just see a warning until updated.

```python
# Before — works but now warns
@automation.register_action("my_comp.do_thing", DoThingAction, DO_THING_SCHEMA)

# After — no warning
@automation.register_action(
    "my_comp.do_thing", DoThingAction, DO_THING_SCHEMA, synchronous=True,
)
```

## Who This Affects

**External components that call `register_action()` without the `synchronous=` parameter.**

**Standard YAML configurations are not affected.**

## Migration Guide

### How to determine the correct value

The question to ask is: **Does `play_next_()` always run before the initial `play()`/`play_complex()` call returns?**

- **Yes → `synchronous=True`** — Trigger arguments are only referenced during the call. StringRef is safe. This is the case for the vast majority of actions.
- **No → `synchronous=False`** — Trigger arguments must outlive the call. Owning `std::string` is required.

### How to tell if play_next_() is deferred

Look at the C++ Action class. `play_next_()` is deferred if any of these apply:

1. The action schedules a **timer/timeout** and calls `play_next_()` from the callback (e.g. `DelayAction`)
2. The action stores args and calls `play_next_()` from a **`Component::loop()`** override (e.g. `WaitUntilAction`)
3. The action registers an **event callback** and calls `play_next_()` from it (e.g. `BLEClientWriteAction` calling from `gattc_event_handler`)

If the action just calls a method and returns (the vast majority of actions), it is synchronous.

### Migration example

```python
# Before
@automation.register_action("my_comp.do_thing", DoThingAction, DO_THING_SCHEMA)
async def do_thing_to_code(config, action_id, template_arg, args):
    ...

# After — most actions are synchronous
@automation.register_action(
    "my_comp.do_thing", DoThingAction, DO_THING_SCHEMA, synchronous=True,
)
async def do_thing_to_code(config, action_id, template_arg, args):
    ...
```

### Reference: Actions that are asynchronous

Only 8 actions in the entire ESPHome codebase are `synchronous=False`:

| Action | Reason |
|--------|--------|
| `delay` | Timer callback |
| `wait_until` | Component loop polling |
| `script.wait` | Component loop polling |
| `espnow.send` / `espnow.broadcast` | Send completion callback |
| `ble_client.connect` / `ble_client.disconnect` / `ble_client.ble_write` | GATTC event callback |
| `wifi.configure` | Component loop + timeout |

All other actions (~440) are `synchronous=True`. If your action simply calls a method and returns, it is synchronous.

## Supporting Multiple ESPHome Versions

The `synchronous=` parameter is new in 2026.3.0. On older versions, passing it raises a `TypeError`. To support both:

```python
import esphome.automation as automation
import inspect

_supports_synchronous = "synchronous" in inspect.signature(
    automation.register_action
).parameters

def _register_action(name, action_type, schema, **kwargs):
    if _supports_synchronous:
        kwargs.setdefault("synchronous", True)
    return automation.register_action(name, action_type, schema, **kwargs)

@_register_action("my_comp.do_thing", DoThingAction, DO_THING_SCHEMA)
```

If you only need to support ESPHome 2026.3.0+, just pass the parameter directly.

## Timeline

- **ESPHome 2026.3.0 (March 2026):** Warning emitted when `synchronous=` is omitted
- Existing components continue to work with the safe default (`synchronous=False`)

## Finding Code That Needs Updates

```bash
# Find register_action calls without synchronous=
grep -rn 'register_action' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #14606: Require explicit synchronous= for register_action](https://github.com/esphome/esphome/pull/14606)
