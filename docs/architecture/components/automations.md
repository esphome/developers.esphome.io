# Implementing Automations

We have an example, minimal component which implements an Action, a Condition and a Trigger
[here](https://github.com/esphome/starter-components/tree/main/components/empty_automation).

Let's take a closer look at this example.

## Python

In addition to the usual requisite imports, we have:

```python
from esphome import automation
```

This allows us to use some functions we'll need for validation and code generation later on.

```python
empty_automation_ns = cg.esphome_ns.namespace("empty_automation")
EmptyAutomation = empty_automation_ns.class_("EmptyAutomation", cg.Component)
EmptyAutomationSetStateAction = empty_automation_ns.class_(
    "EmptyAutomationSetStateAction", automation.Action
)
EmptyAutomationCondition = empty_automation_ns.class_(
    "EmptyAutomationCondition", automation.Condition
)
StateTrigger = empty_automation_ns.class_(
    "StateTrigger", automation.Trigger.template(bool)
)

```

This is some boilerplate code which allows ESPHome code generation to understand the namespace and class names that the
component will use:

- The namespace and class for the component which will implement the automations
- A class to be used to implement each automation:
    - Action
    - Condition
    - Trigger

```python
CONFIG_SCHEMA = ...
```

This defines the configuration schema for the component as discussed [here](index.md#configuration-validation).
In particular, note that the schema includes:
```python
cv.Optional(CONF_ON_STATE): automation.validate_automation(...)
```
Of note:

- This allows the user to define an automation which will be triggered any time the component's "state" changes. In
  this case, the automation is called "on_state".
- `cv.GenerateID(CONF_TRIGGER_ID): cv.declare_id(StateTrigger)` identifies the list of actions the component should
  "trigger" as appropriate.

In addition to `CONFIG_SCHEMA`, we define two additional schemas:

- `EMPTY_AUTOMATION_ACTION_SCHEMA`: Will be used to validate the action (`empty_automation.set_state`) when the user
  calls it.
- `EMPTY_AUTOMATION_CONDITION_SCHEMA`: Will be used to validate the conditions when invoked by the user:
  either `empty_automation.component_off` or `empty_automation.component_on`.

After defining the various schemas we need for our component and its automations, we must register them so that they
can be understood by the parser and codegen.

```python
@automation.register_action(
    "empty_automation.set_state",
    EmptyAutomationSetStateAction,
    EMPTY_AUTOMATION_ACTION_SCHEMA,
)
# ...
@automation.register_condition(
    "empty_automation.component_off",
    EmptyAutomationCondition,
    EMPTY_AUTOMATION_CONDITION_SCHEMA,
)
```

...registers the action and the condition. Note that each contains the name of the automation, the class that defines
what the automation will do, and finally the schema used for validation.

In addition, note that each automation has a `to_code` function used for code generation:

```python
async def empty_automation_set_state_to_code(...):
# ...
async def empty_automation_component_on_to_code(...):
```

Finally, we have the `to_code` function for the component itself, just as discussed [here](index.md#code-generation).

## C++

The C++ class for this example component is quite simple.

```c
class EmptyAutomation : public Component { ... };
```

As mentioned [here](/contributing/code/#c), all components/platforms must inherit from either `Component` or
`PollingComponent`; our example here is no different.

The component also also implements two additional methods:

- The `void set_state(bool state)` method simply allows setting the state of the component.
- The `void add_on_state_callback(std::function<void(bool)> &&callback)` method allows adding the actions which will be
  triggered when the state of the component changes.

In addition to the component's class, additional classes which implement the various automations are defined in
`automation.h`:

- `EmptyAutomationSetStateAction`
- `EmptyAutomationCondition`
- `StateTrigger`

```c
template<typename... Ts> class EmptyAutomationSetStateAction : public Action<Ts...> {
 public:
  explicit EmptyAutomationSetStateAction(EmptyAutomation *ea) : ea_(ea) {}
  TEMPLATABLE_VALUE(bool, state)

  void play(Ts... x) override {
    auto val = this->state_.value(x...);
    this->ea_->set_state(val);
  }

 protected:
  EmptyAutomation *ea_;
};

template<typename... Ts> class EmptyAutomationCondition : public Condition<Ts...> {
 public:
  EmptyAutomationCondition(EmptyAutomation *parent, bool state) : parent_(parent), state_(state) {}
  bool check(Ts... x) override { return this->parent_->state == this->state_; }

 protected:
  EmptyAutomation *parent_;
  bool state_;
};
```

Actions and Conditions are implemented as template classes which are instantiated with pointers to their "parent" (the
instance of the component on which they will act).

In this particular component:

- The action accepts a templatable value--the state--which the component will be set to when the action is called.
- The condition accepts an additional parameter which determines whether it will test for the "off" or "on" state,
allowing it to be reused for both conditions (`component_off` and `component_on`).

```c
class StateTrigger : public Trigger<bool> {
 public:
  explicit StateTrigger(EmptyAutomation *parent) {
    parent->add_on_state_callback([this](bool state) { this->trigger(state); });
  }
};
```

Finally, `StateTrigger` is a simple class which does little more than call the trigger when it's instantiated.
