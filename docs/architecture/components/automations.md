# Implementing Automations

ESPHome automations consist of three building blocks:

- **Triggers** fire when something happens (state change, button press, etc.)
- **Actions** do something (set a value, call a service, etc.)
- **Conditions** check whether something is true (is the component on? is the value above a threshold?)

This page covers how to implement all three in a component.

!!! note

    All Python examples below assume the standard ESPHome imports (`esphome.codegen as cg`, `esphome.config_validation as cv`, relevant constants from `esphome.const`, etc.) are already present.

## Triggers

There are two ways to connect a trigger to an automation. Use the **callback method** (preferred) for simple cases where the forwarder only needs a single pointer. Use the **Trigger class method** when the forwarder needs extra state beyond a single pointer.

### Callback method (preferred)

The callback method eliminates a separate Trigger C++ class entirely. Instead, a lightweight forwarder struct is registered directly as a callback on the parent component. The forwarder must be **pointer-sized** (a single `Automation*` field) so it fits inline in `Callback::ctx_` without heap allocation.

Built-in forwarders in `esphome/core/automation.h`:

| Forwarder | Callback signature | Behavior |
|-----------|-------------------|----------|
| `TriggerForwarder<Ts...>` | `void(const Ts&...)` | Forwards all args to `Automation<Ts...>::trigger()` |
| `TriggerOnTrueForwarder` | `void(bool)` | Triggers `Automation<>` only when `true` |
| `TriggerOnFalseForwarder` | `void(bool)` | Triggers `Automation<>` only when `false` |

#### Python

No trigger class declaration is needed. The schema uses an empty dict:

```python
from esphome import automation

CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(): cv.declare_id(MyComponent),
    cv.Optional(CONF_ON_STATE): automation.validate_automation({}),
}).extend(cv.COMPONENT_SCHEMA)
```

In `to_code`, use `build_callback_automation`:

```python
async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    for conf in config.get(CONF_ON_STATE, []):
        await automation.build_callback_automation(
            var, "add_on_state_callback", [(bool, "x")], conf
        )
```

The arguments to `build_callback_automation`:

1. `parent` -- the component variable
2. `callback_method` -- name of the C++ method to register the callback (e.g. `"add_on_state_callback"`)
3. `args` -- template args as `[(type, name)]` tuples, exposed as variables in the user's `then:` block. This controls the `Automation<Ts...>` template parameters, **not** the callback signature. When using a custom forwarder, the forwarder's `operator()` signature must match the callback, but `args` can differ (e.g. `args=[]` with `TriggerOnTrueForwarder` which receives `bool` but triggers `Automation<>`)
4. `config` -- the automation config dict
5. `forwarder` (optional) -- override the default `TriggerForwarder<Ts...>`

For boolean filtering (e.g. `on_press` / `on_release` on a `void(bool)` callback), pass a forwarder. Note that the forwarder receives the `bool` from the callback but triggers `Automation<>` with no args:

```python
for conf_key, forwarder in (
    (CONF_ON_PRESS, automation.TriggerOnTrueForwarder),
    (CONF_ON_RELEASE, automation.TriggerOnFalseForwarder),
):
    for conf in config.get(conf_key, []):
        await automation.build_callback_automation(
            var, "add_on_state_callback", [], conf, forwarder=forwarder
        )
```

#### C++

No C++ trigger class is needed -- the component just needs the callback registration method:

```cpp
class MyComponent : public Component {
 public:
  // Templatized to accept both std::function and lightweight forwarder structs
  template<typename F> void add_on_state_callback(F &&callback) {
    this->state_callback_.add(std::forward<F>(callback));
  }

 protected:
  CallbackManager<void(bool)> state_callback_;
};
```

When the state changes, call the callback:

```cpp
void MyComponent::publish_state(bool value) {
  this->state_ = value;
  this->state_callback_.call(value);
}
```

#### Custom forwarders

For state-specific filtering (e.g. trigger only when entering a particular enum state), define a custom forwarder in the component's `automation.h`. The forwarder receives the enum value as a callback argument and only triggers when it matches the compile-time template parameter:

```cpp
#include "esphome/core/automation.h"

// Must be pointer-sized (single Automation* field) to avoid heap allocation.
template<MyState State> struct StateEnterForwarder {
  Automation<> *automation;
  void operator()(MyState state) const {
    if (state == State)
      this->automation->trigger();
  }
};

static_assert(sizeof(StateEnterForwarder<MY_STATE_ACTIVE>) <= sizeof(void *));
static_assert(std::is_trivially_copyable_v<StateEnterForwarder<MY_STATE_ACTIVE>>);
```

Then in Python:

```python
StateEnterForwarder = my_ns.class_("StateEnterForwarder")

# In to_code:
await automation.build_callback_automation(
    var, "add_on_state_callback", [], conf,
    forwarder=StateEnterForwarder.template(cg.RawExpression("MY_STATE_ACTIVE")),
)
```

### Trigger class method

Use this when the trigger needs **more than one pointer** of state (e.g. both an entity pointer and tracked previous state), which would exceed `sizeof(void*)` and cause heap allocation if used as a forwarder. Examples include triggers that need to track previous state for edge detection, or triggers with timing logic.

#### Python

Declare the trigger class and reference it in the schema:

```python
StateTrigger = my_ns.class_(
    "StateTrigger", automation.Trigger.template(bool)
)

CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(): cv.declare_id(MyComponent),
    cv.Optional(CONF_ON_STATE): automation.validate_automation(
        {
            cv.GenerateID(CONF_TRIGGER_ID): cv.declare_id(StateTrigger),
        }
    ),
}).extend(cv.COMPONENT_SCHEMA)
```

In `to_code`, use `build_automation`:

```python
async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    for conf in config.get(CONF_ON_STATE, []):
        trigger = cg.new_Pvariable(conf[CONF_TRIGGER_ID], var)
        await automation.build_automation(trigger, [(bool, "x")], conf)
```

#### C++

Define the trigger class in `automation.h`:

```cpp
class StateTrigger : public Trigger<bool> {
 public:
  explicit StateTrigger(MyComponent *parent) {
    parent->add_on_state_callback([this](bool state) { this->trigger(state); });
  }
};
```

The trigger registers a callback that calls `this->trigger()`, which forwards to the `Automation` object. This works but allocates a separate trigger object in static storage (via placement new) that exists solely to forward the callback.

### When to use which method

| Scenario | Method | Example |
|----------|--------|---------|
| Simple forwarding | Callback | [`button on_press`](https://github.com/esphome/esphome/blob/dev/esphome/components/button/__init__.py) -- `TriggerForwarder<>` forwards directly |
| Boolean filtering | Callback with built-in forwarder | [`binary_sensor on_press/on_release`](https://github.com/esphome/esphome/blob/dev/esphome/components/binary_sensor/__init__.py) -- `TriggerOnTrueForwarder` / `TriggerOnFalseForwarder` |
| Enum state filtering | Callback with custom forwarder | [`lock on_lock/on_unlock`](https://github.com/esphome/esphome/pull/15199) -- `LockStateForwarder<State>` checks enum, single pointer (pending #15199) |
| Edge detection | Trigger class | [`fan on_turn_on/on_turn_off`](https://github.com/esphome/esphome/blob/dev/esphome/components/fan/automation.h) -- `FanTurnOnTrigger` stores `fan_` + `last_on_` to detect transitions |
| Complex logic | Trigger class | [`binary_sensor on_multi_click`](https://github.com/esphome/esphome/blob/dev/esphome/components/binary_sensor/automation.h) -- `MultiClickTrigger` with timing, cooldown, and state machine |

## Actions

Actions are template classes that perform an operation when invoked by an automation.

### Python

```python
MyAction = my_ns.class_("MyAction", automation.Action)

@automation.register_action(
    "my_component.do_something",
    MyAction,
    cv.Schema({cv.GenerateID(): cv.use_id(MyComponent)}),
    synchronous=True,
)
async def my_action_to_code(config, action_id, template_arg, args):
    parent = await cg.get_variable(config[CONF_ID])
    return cg.new_Pvariable(action_id, template_arg, parent)
```

Set `synchronous=True` if the action completes immediately (no async operations like delays or waits). Set `synchronous=False` if the action defers `play_next_()` to a later point (e.g. after a delay or async operation completes).

### C++

```cpp
template<typename... Ts> class MyAction : public Action<Ts...> {
 public:
  explicit MyAction(MyComponent *parent) : parent_(parent) {}

  void play(const Ts &...) override {
    this->parent_->do_something();
  }

 protected:
  MyComponent *parent_;
};
```

For actions that accept templatable values from the user config:

```cpp
template<typename... Ts> class SetValueAction : public Action<Ts...> {
 public:
  explicit SetValueAction(MyComponent *parent) : parent_(parent) {}
  TEMPLATABLE_VALUE(bool, state)

  void play(const Ts &...x) override {
    this->parent_->set_state(this->state_.value(x...));
  }

 protected:
  MyComponent *parent_;
};
```

## Conditions

Conditions are template classes that return a boolean to control automation flow.

### Python

```python
MyCondition = my_ns.class_("MyCondition", automation.Condition)

@automation.register_condition(
    "my_component.is_active",
    MyCondition,
    cv.Schema({cv.GenerateID(): cv.use_id(MyComponent)}),
)
async def my_condition_to_code(config, condition_id, template_arg, args):
    parent = await cg.get_variable(config[CONF_ID])
    return cg.new_Pvariable(condition_id, template_arg, parent)
```

### C++

```cpp
template<typename... Ts> class MyCondition : public Condition<Ts...> {
 public:
  explicit MyCondition(MyComponent *parent) : parent_(parent) {}
  bool check(const Ts &...) override { return this->parent_->is_active(); }

 protected:
  MyComponent *parent_;
};
```
