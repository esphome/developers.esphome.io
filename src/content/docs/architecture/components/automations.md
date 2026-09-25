---
title: "Implementing Automations"
---

ESPHome automations consist of three building blocks:

- **Triggers** fire when something happens (state change, button press, etc.)
- **Actions** do something (set a value, call a service, etc.)
- **Conditions** check whether something is true (is the component on? is the value above a threshold?)

This page covers how to implement all three in a component. For a minimal working example, see the [empty_automation starter component](https://github.com/esphome/starter-components/tree/main/components/empty_automation).

> [!NOTE]
> **Mark primitives `final`**
>
>
> The `Action`, `Trigger`, and `Condition` subclasses shown below are leaf classes — nothing in ESPHome derives from them — so they are marked `final`. See [Marking leaf classes as `final`](/contributing/code/#marking-leaf-classes-as-final) for the rationale.

> [!NOTE]
>
> All Python examples below assume the standard ESPHome imports are present: `esphome.codegen as cg`, `esphome.config_validation as cv`, relevant constants from `esphome.const`, and typing imports (`ConfigType` from `esphome.types`, `MockObj` from `esphome.cpp_generator`, `TemplateArgsType` from `esphome.automation`).

## Triggers

There are two ways to connect a trigger to an automation. Use the **callback method** (preferred) for simple cases where the forwarder only needs a single pointer. Use the **Trigger class method** when the forwarder needs extra state beyond a single pointer.

### Callback method (preferred)

The callback method eliminates a separate Trigger C++ class entirely. Instead, a lightweight forwarder struct is registered directly as a callback on the parent component. The forwarder must be **pointer-sized** (a single `Automation*` field) so it fits inline in `Callback::ctx_` without heap allocation.

Built-in forwarders in `esphome/core/automation.h`:

| Forwarder | Callback signature | Behavior |
| ----------- | ------------------- | ---------- |
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
1. `callback_method` -- name of the C++ method to register the callback (e.g. `"add_on_state_callback"`)
1. `args` -- template args as `[(type, name)]` tuples, exposed as variables in the user's `then:` block. This controls the `Automation<Ts...>` template parameters, **not** the callback signature. When using a custom forwarder, the forwarder's `operator()` signature must match the callback, but `args` can differ (e.g. `args=[]` with `TriggerOnTrueForwarder` which receives `bool` but triggers `Automation<>`)
1. `config` -- the automation config dict
1. `forwarder` (optional) -- override the default `TriggerForwarder<Ts...>`

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

#### Reshaped arguments and filters

When the parent callback's parameters are not the automation's arguments, or the trigger should only fire for some of them, use `build_trigger_callback`. It builds the automation and returns a capture-less lambda that calls `trigger()`; being empty, the lambda is stored inline by `Callback` and `std::function` alike, so no forwarder struct and no Trigger class are needed.

```python
for conf in config.get(CONF_ON_MESSAGE, []):
    callback = await automation.build_trigger_callback(
        [(cg.std_string, "x")],
        conf,
        params=[(cg.std_string, "topic"), (cg.std_string, "payload")],
        forward=["payload"],
        when=automation.ApplyCall("payload == {}", ((CONF_PAYLOAD, cg.std_string),))
        if CONF_PAYLOAD in conf
        else None,
    )
    cg.add(var.subscribe(conf[CONF_TOPIC], callback, conf[CONF_QOS]))
```

- `params` are the parent callback's parameters as `[(type, name)]`, rendered as `const T &`.
- `forward` are the expressions passed to `trigger()`; the default is the parameter names. Pass the parent or a lookup on it here.
- `when` is a filter the callback returns early on: a plain string, or an `ApplyCall` that compares against config values as conditions do.

The registration call is written by the component, so extra constant arguments such as a topic and qos are ordinary call arguments. For a callback registered with no extra arguments, `build_callback_automation` accepts the same `params`, `forward` and `when` keywords and generates the lambda instead of a forwarder. The generated code for the example above:

```cpp
mqtt_client->subscribe("livingroom/ota_mode", [](const std::string &topic, const std::string &payload) -> void {
    if (!(payload == "ON"))
      return;
    ::automation_id->trigger(payload);
}, 1);
```

### Trigger class method

Use this when the trigger needs **mutable state beyond a single `Automation*` pointer** (e.g. tracked previous state for edge detection, or timing logic). A forwarder struct must be pointer-sized with only an `Automation*` field, so any additional state requires a full `Trigger` subclass.

#### Python

Declare the trigger class and reference it in the schema:

```python
TurnOnTrigger = my_ns.class_(
    "TurnOnTrigger", automation.Trigger.template()
)

CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(): cv.declare_id(MyComponent),
    cv.Optional(CONF_ON_TURN_ON): automation.validate_automation(
        {
            cv.GenerateID(CONF_TRIGGER_ID): cv.declare_id(TurnOnTrigger),
        }
    ),
}).extend(cv.COMPONENT_SCHEMA)
```

In `to_code`, use `build_automation`:

```python
async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    for conf in config.get(CONF_ON_TURN_ON, []):
        trigger = cg.new_Pvariable(conf[CONF_TRIGGER_ID], var)
        await automation.build_automation(trigger, [], conf)
```

#### C++

Define the trigger class in `automation.h`. This example fires only on the off-to-on transition, requiring mutable state (`last_on_`) that cannot be stored in a pointer-sized forwarder:

```cpp
class TurnOnTrigger final : public Trigger<> {
 public:
  explicit TurnOnTrigger(MyComponent *parent) : parent_(parent) {
    parent->add_on_state_callback([this](bool state) {
      if (state && !this->last_on_)
        this->trigger();
      this->last_on_ = state;
    });
    this->last_on_ = parent->get_state();
  }

 protected:
  MyComponent *parent_;
  bool last_on_;
};
```

The trigger needs to track mutable state (`last_on_`) across callback invocations. A forwarder struct must contain only a single `Automation*` field -- it cannot store extra state. When the trigger logic requires additional fields, use a `Trigger` subclass instead. The `Trigger` base class manages the connection to the `Automation` object.

### When to use which method

| Scenario | Method | Example |
| ---------- | -------- | --------- |
| Simple forwarding | Callback | [`button on_press`](https://github.com/esphome/esphome/blob/dev/esphome/components/button/__init__.py) -- `TriggerForwarder<>` forwards directly |
| Boolean filtering | Callback with built-in forwarder | [`binary_sensor on_press/on_release`](https://github.com/esphome/esphome/blob/dev/esphome/components/binary_sensor/__init__.py) -- `TriggerOnTrueForwarder` / `TriggerOnFalseForwarder` |
| Enum state filtering | Callback with custom forwarder | `lock on_lock/on_unlock` -- `LockStateForwarder<State>` checks enum, single pointer ([esphome/esphome#15199](https://github.com/esphome/esphome/pull/15199), pending) |
| Different callback arguments or a constant filter | Callback with `build_trigger_callback` | [`mqtt on_message`](https://github.com/esphome/esphome/blob/dev/esphome/components/mqtt/__init__.py) -- forwards the payload only, filtered on the configured payload |
| Extra state needed | Trigger class | [`fan on_turn_on`](https://github.com/esphome/esphome/blob/dev/esphome/components/fan/automation.h) -- `FanTurnOnTrigger` tracks `last_on_` for edge detection (mutable state, can't be a forwarder) |
| Complex logic (timing, state machine) | Trigger class | [`binary_sensor on_multi_click`](https://github.com/esphome/esphome/blob/dev/esphome/components/binary_sensor/automation.h) -- `MultiClickTrigger` with timing, cooldown, and multiple state fields |

## Actions

Actions are template classes that perform an operation when invoked by an automation.

### Actions that only forward values

Most actions do nothing but pass configured values on to their parent. Register those with `automation.register_apply_action`; no C++ class and no builder are written, and the action is always synchronous:

```python
automation.register_apply_action(
    "my_component.set_gains",
    cv.Schema({
        cv.Required(CONF_ID): cv.use_id(MyComponent),
        cv.Required(CONF_KP): cv.templatable(cv.float_),
        cv.Optional(CONF_KI): cv.templatable(cv.float_),
    }),
    automation.ApplyField(CONF_KP, "set_kp", cg.float_),
    automation.ApplyField(CONF_KI, "set_ki", cg.float_),
)
```

The action is the core `ApplyAction<Ts...>`, which stores one function pointer. Code generation folds the parent and every configured field into one stateless function: constants become immediates, user lambdas are called inline with the trigger arguments, and an absent optional key emits nothing, so the action costs one pointer however many fields it has. With `kp: 1.5` in the config the generated function body is `my_component->set_kp(1.5f);`.

- `ApplyField(conf_key, target, type_)` forwards one key:
  - `target` is a setter name, or a statement template when it contains `{}` (for example `"position = {}"`; double a literal brace).
  - `type_` is the C++ type a user lambda must return. A plain string is raw C++ type text and may use `{parent}` when the type is only known per instance.
  - `conf_key` may be a tuple of keys to read a nested section.
  - `std::string` constants are emitted as a plain literal, or as `progmem_string(ESPHOME_F(...))` on ESP8266 so the literal stays in flash.
  - `const_fn=` renders a constant when `cg.safe_exp` is not the right spelling; it receives the action config and the value. A `!lambda` value bypasses it, so the target must also accept a plain `type_` argument.
- `ApplyCall("set_range({}, {})", ((CONF_LOW, cg.float_), (CONF_HIGH, cg.float_)))` folds several keys into one statement; each arg may carry a third `const_fn` element. It is skipped when none of the keys is set and a partial set is a config error. A call with no keys, such as `ApplyCall("stop()")` or a trailing `ApplyCall("publish_state()")`, is always emitted, in the order given.
- `call="make_call"` is for actions that build a call object: every statement, follow-up calls included, targets the call object returned by `parent->make_call()`, and `perform()` on it is appended last.

`cover.control` and `cover.template.publish` in the ESPHome repository are in-tree examples. The hand-written class below is for actions whose `play()` has logic beyond forwarding values.

### Python

```python
MyAction = my_ns.class_("MyAction", automation.Action)

@automation.register_action(
    "my_component.do_something",
    MyAction,
    cv.Schema({cv.GenerateID(): cv.use_id(MyComponent)}),
    synchronous=True,
)
async def my_action_to_code(
    config: ConfigType, action_id: MockObj, template_arg: MockObj, args: TemplateArgsType
) -> MockObj:
    parent = await cg.get_variable(config[CONF_ID])
    return cg.new_Pvariable(action_id, template_arg, parent)
```

Set `synchronous=True` if the action completes immediately (no async operations like delays or waits). Set `synchronous=False` if the action defers `play_next_()` to a later point (e.g. after a delay or async operation completes).

### C++

```cpp
template<typename... Ts> class MyAction final : public Action<Ts...> {
 public:
  explicit MyAction(MyComponent *parent) : parent_(parent) {}

  void play(const Ts &...) override {
    this->parent_->do_something();
  }

 protected:
  MyComponent *parent_;
};
```

For a hand-written action class that accepts templatable values:

```cpp
template<typename... Ts> class SetValueAction final : public Action<Ts...> {
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

Values passed to a `TEMPLATABLE_VALUE` setter from Python codegen should always be wrapped with `cg.templatable()`, even when the value is a literal constant. The setter's storage is `TemplatableFn` for trivially copyable types (`bool`, `int`, `float`, enums, pointers) and `TemplatableValue` otherwise; `TemplatableFn` holds only a function pointer and will not accept a raw C++ value, so failing to wrap compiles on 2026.3.x and earlier only when the setter type is `TemplatableValue`, which accepts raw constants:

```python
@automation.register_action(
    "my_component.set_state",
    SetValueAction,
    cv.Schema({
        cv.GenerateID(): cv.use_id(MyComponent),
        cv.Required(CONF_STATE): cv.templatable(cv.boolean),
    }),
    synchronous=True,
)
async def set_state_to_code(
    config: ConfigType, action_id: MockObj, template_arg: MockObj, args: TemplateArgsType
) -> MockObj:
    parent = await cg.get_variable(config[CONF_ID])
    var = cg.new_Pvariable(action_id, template_arg, parent)
    template_ = await cg.templatable(config[CONF_STATE], args, cg.bool_)
    cg.add(var.set_state(template_))
    return var
```

Same imports as the earlier Python snippets on this page apply (`cg`, `cv`, `automation`, constants, typing aliases); `CONF_STATE` and `SetValueAction` are defined by the component itself.

Passing a raw value such as `cg.add(var.set_state(config[CONF_STATE]))` worked on 2026.3.x and earlier for literal constants but fails to compile on 2026.4.0 and later, because trivially copyable types use `TemplatableFn` (pointer-sized function-pointer storage, 4 bytes on 32-bit platforms), for which implicit conversion from raw values is not possible. See the [TemplatableFn blog post](/blog/2026/04/09/templatablefn-4-byte-templatable-storage-for-trivially-copyable-types/) for details.

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
async def my_condition_to_code(
    config: ConfigType, condition_id: MockObj, template_arg: MockObj, args: TemplateArgsType
) -> MockObj:
    parent = await cg.get_variable(config[CONF_ID])
    return cg.new_Pvariable(condition_id, template_arg, parent)
```

### C++

```cpp
template<typename... Ts> class MyCondition final : public Condition<Ts...> {
 public:
  explicit MyCondition(MyComponent *parent) : parent_(parent) {}
  bool check(const Ts &...) override { return this->parent_->is_active(); }

 protected:
  MyComponent *parent_;
};
```
