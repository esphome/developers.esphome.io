# Implementing Automations

ESPHome automations consist of three building blocks:

- **Triggers** fire when something happens (state change, button press, etc.)
- **Actions** do something (set a value, call a service, etc.)
- **Conditions** check whether something is true (is the component on? is the value above a threshold?)

This page covers how to implement all three in a component.

## Triggers

There are two ways to connect a trigger to an automation. Use the **callback method** (preferred) for simple cases where the forwarder only needs a single pointer. Use the **Trigger class method** when the forwarder needs extra state beyond a single pointer.

### Callback method (preferred)

The callback method eliminates a separate Trigger C++ class entirely. Instead, a lightweight forwarder struct is registered directly as a callback on the parent component. The forwarder must be **pointer-sized** (a single `Automation*` field) so it fits inline in `Callback::ctx_` without heap allocation.

Built-in forwarders in `esphome/core/automation.h`:

| Forwarder | Callback signature | Behavior |
|-----------|-------------------|----------|
| `TriggerForwarder<Ts...>` | `void(Ts...)` | Forwards all args to `Automation<Ts...>::trigger()` |
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
async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    for conf in config.get(CONF_ON_STATE, []):
        await automation.build_callback_automation(
            var, "add_on_state_callback", [(float, "x")], conf
        )
```

The arguments to `build_callback_automation`:

1. `parent` -- the component variable
2. `callback_method` -- name of the C++ method to register the callback (e.g. `"add_on_state_callback"`)
3. `args` -- template args as `[(type, name)]` tuples, exposed as variables in the automation
4. `config` -- the automation config dict
5. `forwarder` (optional) -- override the default `TriggerForwarder<Ts...>`

For boolean filtering (e.g. `on_turn_on` / `on_turn_off`), pass a forwarder:

```python
for conf_key, forwarder in (
    (CONF_ON_TURN_ON, automation.TriggerOnTrueForwarder),
    (CONF_ON_TURN_OFF, automation.TriggerOnFalseForwarder),
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
  template<typename F> void add_on_state_callback(F &&callback) {
    this->state_callback_.add(std::forward<F>(callback));
  }

 protected:
  CallbackManager<void(float)> state_callback_;
};
```

When the state changes, call the callback:

```cpp
void MyComponent::publish_state(float value) {
  this->state_ = value;
  this->state_callback_.call(value);
}
```

#### Custom forwarders

For state-specific filtering (e.g. trigger only when entering a particular enum state), define a custom forwarder in the component's `automation.h`:

```cpp
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

Use this when the forwarder needs **more than one pointer** of state (e.g. both an entity pointer and an automation pointer), which would exceed `sizeof(void*)` and cause heap allocation. Examples include triggers that need to track previous state for edge detection, or triggers that need to call methods on the parent entity.

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
async def to_code(config):
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

The trigger registers a callback that calls `this->trigger()`, which forwards to the `Automation` object. This works but allocates a separate trigger object in BSS that exists solely to forward the callback.

### When to use which method

| Scenario | Method | Why |
|----------|--------|-----|
| Simple forwarding (no filtering or extra state) | Callback | No C++ class needed, saves RAM |
| Boolean filtering (`on_press` / `on_release`) | Callback with `TriggerOnTrueForwarder` / `TriggerOnFalseForwarder` | Built-in, no C++ class needed |
| Enum state filtering (trigger on specific state) | Callback with custom forwarder | Single pointer, compiler deduplicates |
| Edge detection (need previous state) | Trigger class | Forwarder would need 2+ pointers |
| Complex logic (timing, multi-click, debounce) | Trigger class | Needs additional state fields |

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

Set `synchronous=True` if the action completes immediately (no async operations like delays or waits).

### C++

```cpp
template<typename... Ts> class MyAction : public Action<Ts...> {
 public:
  explicit MyAction(MyComponent *parent) : parent_(parent) {}

  void play(const Ts &...x) override {
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
  TEMPLATABLE_VALUE(float, value)

  void play(const Ts &...x) override {
    this->parent_->set_value(this->value_.value(x...));
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
  bool check(const Ts &...x) override { return this->parent_->is_active(); }

 protected:
  MyComponent *parent_;
};
```
