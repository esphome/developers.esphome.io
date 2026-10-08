---
title: "Lock"
---

The `lock` component is one of ESPHome's core [entity](/architecture/components/index) types. A lock is conceptually a
[switch](/architecture/components/switch) with a richer set of states: instead of a plain ON/OFF, it reports one of
several `LockState` values (`LOCKED`, `UNLOCKED`, `JAMMED`, `LOCKING`, `UNLOCKING`, and optionally `OPENING`/`OPEN`), and
in addition to locking/unlocking it can optionally support a separate "open" action to unlatch a door.

Like the other entity types, `lock` is a *platform* base. Individual components (for example `template`, `copy` or an
output-driven relay) register a lock and implement the logic that actually drives the hardware.

## Python

A lock platform lives in a `lock.py` file (or a `lock/__init__.py` package) inside your component's directory. This
file name tells ESPHome that the component provides a `lock` platform, allowing the user to configure it under the
`lock:` block:

```yaml
lock:
  - platform: my_component
    name: "My Lock"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import lock

my_lock_ns = cg.esphome_ns.namespace("my_lock")
MyLock = my_lock_ns.class_("MyLock", lock.Lock, cg.Component)
```

Note that `MyLock` inherits from both `lock.Lock` and a component base (`cg.Component` here).

### Configuration schema

Use the `lock.lock_schema()` helper. It returns a schema pre-populated with all of the options common to every lock -
`name`, `id`, `icon`, `entity_category`, the `on_lock` / `on_unlock` automations, and so on - and lets you pass defaults
for your device:

```python
CONFIG_SCHEMA = lock.lock_schema(MyLock).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyLock`) as the first argument tells the helper which class to declare the ID for, so you do not
need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `lock.new_lock()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code to
apply the common lock options from the configuration:

```python
async def to_code(config):
    var = await lock.new_lock(config)
    await cg.register_component(var, config)

    cg.add(var.traits.set_supports_open(True))
```

If your component owns a lock as a child (rather than *being* a lock), use `await lock.register_lock(var, config)`
instead, having declared the ID yourself.

## C++

The C++ class inherits from `lock::Lock` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/lock/lock.h"

namespace esphome::my_lock {

class MyLock : public lock::Lock, public Component {
 public:
  void setup() override { this->traits.set_supports_open(true); }
  void dump_config() override;

 protected:
  void control(const lock::LockCall &call) override;
};

}  // namespace esphome::my_lock
```

### Handling control calls

The front-end calls the public `lock()` / `unlock()` / `open()` methods. `lock()` and `unlock()` each build a
`LockCall` requesting the corresponding `LockState` and dispatch it to your protected virtual `control()` override,
which is the one method you *must* implement. Read the requested state off the call, drive the hardware, and then call
`publish_state()` yourself to report what was actually achieved:

```cpp
void MyLock::control(const lock::LockCall &call) {
  if (!call.get_state().has_value())
    return;

  auto state = *call.get_state();
  if (state == lock::LOCK_STATE_LOCKED) {
    this->write_lock_hardware_();
  } else if (state == lock::LOCK_STATE_UNLOCKED) {
    this->write_unlock_hardware_();
  }

  this->publish_state(state);
}
```

A few important details:

- `LockCall::get_state()` returns an `optional<LockState>` - always check `has_value()` before dereferencing, since a
  call may not carry a state change in every case.
- You should call `publish_state()` yourself once the hardware has been driven; the base class does *not* do this for
  you. This lets you report intermediate states (`LOCKING`/`UNLOCKING`) or a `JAMMED` failure instead of blindly
  echoing back the requested state.
- `open()` is handled separately: if `traits.get_supports_open()` is `true`, it calls the protected `open_latch()`
  method (which defaults to simply calling `unlock()`) - override `open_latch()` if opening needs to do something
  different from unlocking.
- Only advertise support for `open()` (via `traits.set_supports_open(true)`) if your hardware genuinely has a separate
  unlatch action.

### Useful members

- `state`: the current reported `LockState`.
- `traits`: a `LockTraits` instance describing what the lock supports (`set_supports_open()`, `set_requires_code()`,
  `set_assumed_state()`, `set_supported_states()`).
- `make_call()`: build a `LockCall` targeting this lock, useful for issuing a control call programmatically (for
  example from a lambda).
- `add_on_state_callback(F &&callback)`: register a `void(LockState)` callback to run whenever the lock's state
  changes.
- `LOG_LOCK(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the lock in the standard format.

## Exposing multiple locks from one component

Hardware often controls more than one lock - a multi-door access controller, for example, might drive a front door
lock and a back door lock over the same bus. There are two established ways to model this.

### A hub plus a `type` on the platform

If your component already has a top-level hub, let the user add one `lock:` entry per door, distinguished by a
`type` key via `cv.typed_schema()`:

```yaml
lock:
  - platform: my_hub
    type: front_door
    name: "Front Door"
  - platform: my_hub
    type: back_door
    name: "Back Door"
```

```python
CONFIG_SCHEMA = cv.typed_schema(
    {
        "front_door": lock.lock_schema(MyHubLock).extend(_HUB_ID_SCHEMA),
        "back_door": lock.lock_schema(MyHubLock).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)


async def to_code(config):
    var = await lock.new_lock(config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

Each door is a first-class platform entry with the full set of per-entity options, and adding a new door later is
purely additive.

### Sub-configs on a single platform entry

Some components instead nest optional locks under one platform entry, each an inline
`cv.Optional(CONF_FRONT_DOOR): lock.lock_schema()` - note `lock_schema()` called *without* a class argument. There is
no `SUB_LOCK` macro (`SUB_*` exists only for `binary_sensor`, `button`, `number`, `select`, `sensor`, `switch` and
`text_sensor`), so declare the pointer member and setter by hand, and null-check before controlling it since the
user may configure only one door:

```cpp
class MyComponent final : public Component {
 public:
  void set_front_door_lock(lock::Lock *front_door_lock) { this->front_door_lock_ = front_door_lock; }

 protected:
  lock::Lock *front_door_lock_{nullptr};
};
```

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example of both patterns, including the matching Python schema and `to_code`.

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its locks, so let the hardware decide:

- **Sub-configs** fit when the locks are a small, fixed set driven by a single device - for example one access
  controller with a front door output and a back door output wired to the same board. This keeps one physical device
  to one YAML block.
- **A hub plus `type`** fits when the locks are independent things that happen to share a connection - especially
  when a hub component already exists because the device or transport must be configured once, or when the set of
  doors is large, open-ended, or different doors need different C++ classes or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.
In a new component with no hub, sub-configs are usually the smaller change.

For everything else, the component implements the usual set of methods [as described here](/architecture/components/index#common-methods).
