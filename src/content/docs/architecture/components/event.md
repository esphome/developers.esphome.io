---
title: "Event"
---

The `event` component is one of ESPHome's core [entity](/architecture/components/index) types. An event is
*stateless*: rather than tracking a value like a [sensor](/architecture/components/sensor) does, it simply fires
discrete, named occurrences - a doorbell press, a remote's "long press" action, a button's double-click. The
front-end never commands an event; there is nothing to turn on or set. Your component calls `trigger()` whenever the
real-world occurrence happens, and the entity briefly reports "this named event just happened" to the front-end.

This makes `event` different from both a [binary sensor](/architecture/components/binary_sensor) (which has a
persistent ON/OFF state) and a [sensor](/architecture/components/sensor) (which has a persistent numeric state): an
event has no ongoing state to query beyond "what was the last event type, and when."

Like the other entity types, `event` is a *platform* base. Individual components (for example `uart` or a physical
button driver) register an event and call `trigger()` with one of a fixed set of event type strings whenever
something happens.

## Python

An event platform lives in an `event.py` file (or an `event/__init__.py` package) inside your component's directory.
This file name tells ESPHome that the component provides an `event` platform, allowing the user to configure it
under the `event:` block:

```yaml
event:
  - platform: my_component
    name: "My Button"
    event_types:
      - "single_press"
      - "double_press"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import event

my_event_ns = cg.esphome_ns.namespace("my_event")
MyEvent = my_event_ns.class_("MyEvent", event.Event, cg.Component)
```

Note that `MyEvent` inherits from both `event.Event` and a component base (`cg.Component` here).

### Configuration schema

Use the `event.event_schema()` helper. It returns a schema pre-populated with the options common to every event -
`name`, `id`, `icon`, `entity_category`, `device_class` and the `on_event` automation - and lets you pass defaults
for your device:

```python
CONFIG_SCHEMA = event.event_schema(MyEvent).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyEvent`) as the first argument tells the helper which class to declare the ID for, so you do
not need a separate `cv.GenerateID()`. Unlike `sensor_schema()`, `event_schema()` does not take the list of event
types your device supports - that is application-specific, so components typically declare their own
`CONF_EVENT_TYPES` option (or hard-code the list) and pass it separately to `new_event()`.

### Code generation

In `to_code`, use the `event.new_event()` helper, passing the list of event type strings the entity supports as the
`event_types` keyword argument. It calls `cg.new_Pvariable()` for you *and* generates the code to register those
event types and apply the common options from the configuration:

```python
async def to_code(config):
    var = await event.new_event(config, event_types=["single_press", "double_press"])
    await cg.register_component(var, config)
```

If your component owns an event as a child (rather than *being* an event), use
`await event.register_event(var, config, event_types=[...])` instead, having declared the ID yourself.

## C++

The C++ class inherits from `event::Event` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/event/event.h"

namespace esphome::my_event {

class MyEvent : public event::Event, public Component {
 public:
  void loop() override;
};

}  // namespace esphome::my_event
```

### Firing events

`event::Event` is emit-only: there is no `control()` to override and nothing for the front-end to command. Your only
job is to call `trigger()` with one of the configured event type strings whenever the real-world occurrence happens:

```cpp
void MyEvent::loop() {
  if (this->button_was_pressed_()) {
    this->trigger("single_press");
  }
}
```

`trigger()` validates that the given string is one of the event types registered via `set_event_types()`, stores it
as the "last event type", and notifies the front-end. If the string does not match a registered type, it logs an
error and does nothing - so the strings you pass to `trigger()` must exactly match the `event_types` you supplied in
Python.

### Events with values

An event can carry typed values, such as the steps of a rotary dimmer. Declare them with the `variables` keyword
argument of `new_event()` or `register_event()`. Each entry is `"name": "type"` or a dict with `type`, optionally
`event_types` (the types that carry the variable) and, for a `string`, `max_length`:

```python
async def to_code(config):
    var = await event.new_event(
        config,
        event_types=["press", "rotate_left", "rotate_right"],
        variables={
            "number_of_presses": {"type": "int", "event_types": ["press"]},
            "steps": {"type": "int", "event_types": ["rotate_left", "rotate_right"]},
        },
    )
    await cg.register_component(var, config)
```

The types are `bool`, `int` (`int32_t`), `float` and `string` (`max_length` in bytes of UTF-8, default 64, at most 127).
An event has at most 16 variables, and an event with variables at most 127 event types. Names follow the rules of an ID
(`cv.validate_id_name`) and must not be one of the attribute names Home Assistant sets itself, such as `friendly_name`.
`new_event()` raises `cv.Invalid` otherwise. If your users declare variables in YAML, validate them in `CONFIG_SCHEMA`
with `event.validate_variables` and `event.check_variables(variables, event_types)`, as the template event does.
`check_variables()` raises `cv.Invalid` and returns nothing, so call it from a validator that returns the config. Users
set the values with `data:` of `event.trigger`, and each `on_event` automation gets every variable by its name.

In C++, pass each value with the index of its variable, its place in `variables`:

```cpp
enum DimmerVariable : uint8_t { DIMMER_NUMBER_OF_PRESSES, DIMMER_STEPS };  // order of variables= in __init__.py

void MyEvent::loop() {
  const int32_t steps = this->read_steps_();
  if (steps > 0) {
    this->trigger("rotate_right", {{DIMMER_STEPS, steps}});
  } else if (steps < 0) {
    // The event type gives the direction, so the variable holds the number of steps
    this->trigger("rotate_left", {{DIMMER_STEPS, -steps}});
  }
}
```

- A value is a `bool`, an integer, an enum of at most 32 bits, a `float`, or a text as `StringRef`, `const char *` or
  `std::string`. A `uint32_t`, a 64-bit integer or a wider enum needs a cast to `int32_t`. A `float` variable also takes
  an integer. `trigger()` copies a text into the event's data, so a temporary buffer is fine. A text must be valid
  UTF-8; pass binary data as hex, for example with `format_hex_to()`.
- `trigger()` checks the event type first; an unknown type changes nothing. It stores each value that fits and logs
  the others: an error for an unknown index, a variable the event type does not carry or a wrong type, a warning for
  a text longer than `max_length`. A text is never cut. The event fires with the values that fit.
- A variable without a value is missing from the event. An event keeps the values of its last trigger only, and
  `set_event_types()` clears them.
- On an event with variables, `set_event_types()` rejects a list of more than 127 types: it logs an error and keeps the
  old list and values.
- The `event_types` of a variable are matched by name: after `set_event_types()` the variable still goes with the types
  of those names, in any order, and no other type carries it.
- `get_last_event_data()` returns an `event::EventData`: `size()` is the number of variables, `has(i)` whether the
  last event set variable `i`, and `get_bool(i)`, `get_int(i)`, `get_float(i)` and `get_string(i)` read it as
  `false`, `0`, `NAN` or an empty `StringRef` when it is missing or has another type. The `StringRef` points into the
  event's data and changes with the next trigger. `variable(i)` (for `i` below `size()`; not checked) returns the
  declaration with its `name` and `type`; on ESP8266 the name is in flash, so use `LOG_STR_ARG()` and the `_P` functions
  such as `ESPHOME_strlen_P()`.
- `trigger()` with values and `get_last_event_data()` exist only under `USE_EVENT_DATA`, which codegen defines when at
  least one event of the build declares variables. Call them directly only if every build of your component creates such
  an event; if the event or its variables are optional, guard the calls with `#ifdef USE_EVENT_DATA`.

### Useful members

- `trigger(const std::string &event_type)`: fires the named event, notifying the front-end.
- `trigger(const char *event_type, std::initializer_list<EventArg> args)`: fires the named event with values. Exists
  only under `USE_EVENT_DATA`.
- `get_last_event_data()`: the values of the last event. Exists only under `USE_EVENT_DATA`.
- `get_last_event_type()`: returns the most recently triggered event type as a `StringRef`, or an empty one if
  nothing has fired yet.
- `has_event()`: whether any event has been triggered since boot.
- `get_event_types()`: the list of event type strings this entity supports.
- `LOG_EVENT(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the event's name, icon and
  device class in the standard format.

## Exposing multiple events from one component

Hardware often has more than one thing that can fire an event - a remote with several buttons, or a keypad hub with
one event entity per physical key. There are two established ways to model this. Both are valid and both are widely
used in-tree - which one fits depends on how the hardware itself is shaped, so read the two together and pick the one
that describes your device more honestly.

### A hub plus a `type` on the platform

With a top-level hub already configured, add one `event:` entry per button, distinguished by `type`, via
`cv.typed_schema()` with `key=CONF_TYPE`. Since `event_schema()` does not carry `event_types` (that stays a separate
keyword argument to `new_event()`), keep a small lookup so each button gets the right list:

```yaml
remote_hub:
  id: the_remote

event:
  - platform: remote_hub
    type: button_1
    name: "Button 1"
  - platform: remote_hub
    type: button_2
    name: "Button 2"
```

```python
from esphome.const import CONF_TYPE
from .. import CONF_REMOTE_HUB_ID, RemoteHub, RemoteHubButtonEvent

_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_REMOTE_HUB_ID): cv.use_id(RemoteHub)})
_EVENT_TYPES = {
    "button_1": ["single_press", "double_press", "long_press"],
    "button_2": ["single_press", "double_press"],
}
CONFIG_SCHEMA = cv.typed_schema(
    {
        "button_1": event.event_schema(RemoteHubButtonEvent).extend(_HUB_ID_SCHEMA),
        "button_2": event.event_schema(RemoteHubButtonEvent).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await event.new_event(config, event_types=_EVENT_TYPES[config[CONF_TYPE]])
    await cg.register_component(var, config)
    await cg.register_parented(var, config[CONF_REMOTE_HUB_ID])
```

`cv.typed_schema()` puts the matched key back into `config[CONF_TYPE]`, so `to_code` can look up the right
`event_types` for this entry. Each button is a first-class platform entry with the full option set, and adding
another button later is purely additive.

### Sub-configs on a single platform entry

Some components instead nest each button as an optional sub-key under one platform entry (`button_1:`, `button_2:`
under a single `- platform: remote_hub`), each an inline `event_schema()` called without a class argument - just
like `sensor_schema()`, `event_schema()` accepts being called with no class. `event_types` still has to be supplied
explicitly per button when calling `new_event()`:

```python
CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(RemoteHub),
        cv.Optional("button_1"): event.event_schema(),
        cv.Optional("button_2"): event.event_schema(),
    }
).extend(cv.COMPONENT_SCHEMA)

async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    if button_1_config := config.get("button_1"):
        types = ["single_press", "double_press", "long_press"]
        evt = await event.new_event(button_1_config, event_types=types)
        cg.add(var.set_button_1_event(evt))
```

No `SUB_EVENT` macro exists, so declare the pointer members and setters by hand, and null-check them before calling
`trigger()` - the user may configure only some of the buttons:

```cpp
class RemoteHub : public Component {
 public:
  void set_button_1_event(event::Event *e) { this->button_1_event_ = e; }
  void set_button_2_event(event::Event *e) { this->button_2_event_ = e; }
 protected:
  event::Event *button_1_event_{nullptr};
  event::Event *button_2_event_{nullptr};
};
```

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its buttons, so let the hardware decide:

- **Sub-configs** fit when the buttons are facets of one inseparable set that a single remote or keypad exposes
  together. A small, fixed set of buttons read from a single transaction mirrors what the device actually reports, and
  keeps one physical device to one YAML block, which is easier to read.
- **A hub plus `type`** fits when the buttons are genuinely independent things that happen to share a connection. If a
  hub component already exists because the device or transport must be configured once and shared, then each button
  being its own entry is the more natural fit - especially when the set is large or open-ended, or when different
  buttons need different event types or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component) for a fully worked example of both patterns.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
