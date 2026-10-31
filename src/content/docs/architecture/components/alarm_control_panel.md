---
title: "Alarm Control Panel"
---

The `alarm_control_panel` component is one of ESPHome's core [entity](/architecture/components/index) types. An
alarm control panel represents a security system: it can be armed in several different modes (home, away, night,
vacation), disarmed, and it reports intermediate states like pending or triggered. Unlike a
[switch](/architecture/components/switch), which only toggles between two states, an alarm control panel exposes a
small state machine and, optionally, a numeric code the user must supply to arm or disarm it.

Like the other entity types, `alarm_control_panel` is a *platform* base. Individual components (for example
`template`) register an alarm control panel and implement the logic that actually decides whether an arm/disarm
request is accepted.

## Python

An alarm control panel platform lives in an `alarm_control_panel.py` file (or an `alarm_control_panel/__init__.py`
package) inside your component's directory. This file name tells ESPHome that the component provides an
`alarm_control_panel` platform, allowing the user to configure it under the `alarm_control_panel:` block:

```yaml
alarm_control_panel:
  - platform: my_component
    name: "My Alarm Panel"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import alarm_control_panel

my_alarm_ns = cg.esphome_ns.namespace("my_alarm")
MyAlarm = my_alarm_ns.class_("MyAlarm", alarm_control_panel.AlarmControlPanel, cg.Component)
```

Note that `MyAlarm` inherits from both `alarm_control_panel.AlarmControlPanel` and a component base (`cg.Component`
here).

### Configuration schema

Use the `alarm_control_panel.alarm_control_panel_schema()` helper. It returns a schema pre-populated with the
options common to every alarm control panel - `name`, `id`, `icon`, `entity_category`, and the `on_state` /
`on_triggered` / `on_arming` / `on_pending` / `on_armed_home` / `on_armed_night` / `on_armed_away` / `on_disarmed` /
`on_cleared` / `on_chime` / `on_ready` automations - and lets you pass defaults for your device:

```python
CONFIG_SCHEMA = alarm_control_panel.alarm_control_panel_schema(MyAlarm).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyAlarm`) as the first argument tells the helper which class to declare the ID for, so you do
not need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `alarm_control_panel.new_alarm_control_panel()` helper. It calls `cg.new_Pvariable()` for you
*and* generates all the code to apply the common options and callback automations from the configuration:

```python
async def to_code(config):
    var = await alarm_control_panel.new_alarm_control_panel(config)
    await cg.register_component(var, config)
```

If your component owns an alarm control panel as a child (rather than *being* one), use
`await alarm_control_panel.register_alarm_control_panel(var, config)` instead, having declared the ID yourself.

## C++

The C++ class inherits from `alarm_control_panel::AlarmControlPanel` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/alarm_control_panel/alarm_control_panel.h"

namespace esphome::my_alarm {

class MyAlarm : public alarm_control_panel::AlarmControlPanel, public Component {
 public:
  uint32_t get_supported_features() const override;
  bool get_requires_code() const override { return !this->code_.empty(); }
  bool get_requires_code_to_arm() const override { return this->requires_code_to_arm_; }

  void set_code(const std::string &code) { this->code_ = code; }
  void set_requires_code_to_arm(bool code_to_arm) { this->requires_code_to_arm_ = code_to_arm; }

 protected:
  void control(const alarm_control_panel::AlarmControlPanelCall &call) override;
  bool is_code_valid_(const optional<std::string> &code);

  std::string code_{};
  bool requires_code_to_arm_{false};
};

}  // namespace esphome::my_alarm
```

### Reporting capabilities

Before the front-end will offer arm-home/arm-night/etc. buttons, it needs to know which modes your panel supports.
Implement `get_supported_features()` returning an OR of `AlarmControlPanelFeature` flags
(`ACP_FEAT_ARM_HOME`, `ACP_FEAT_ARM_AWAY`, `ACP_FEAT_ARM_NIGHT`, `ACP_FEAT_ARM_VACATION`,
`ACP_FEAT_ARM_CUSTOM_BYPASS`, `ACP_FEAT_TRIGGER`), and `get_requires_code()` / `get_requires_code_to_arm()` to tell
the front-end whether a code is needed to disarm, and whether that same code is also needed to arm.

### Handling commands

The one method you *must* implement is `control()`. The front-end (or an automation) builds an
`AlarmControlPanelCall` - via helpers like `arm_away()`, `arm_home()`, `disarm()` on the entity itself, or directly
via `make_call()` - and the base class dispatches it here. The base class checks only that the state transition is
legal and supported; **it never looks at the code**, so enforcing it is entirely your job. Inspect `call.get_state()`
for the requested state:

```cpp
// Takes the optional itself, so an absent code is handled here rather than
// by the caller. Returns true when no code is configured at all.
bool MyAlarm::is_code_valid_(const optional<std::string> &code) {
  if (this->code_.empty())
    return true;
  return code.has_value() && *code == this->code_;
}

void MyAlarm::control(const alarm_control_panel::AlarmControlPanelCall &call) {
  if (!call.get_state().has_value())
    return;

  switch (*call.get_state()) {
    case alarm_control_panel::ACP_STATE_ARMED_AWAY:
    case alarm_control_panel::ACP_STATE_ARMED_HOME:
      // Arming only needs a code when the user asked for one.
      if (this->requires_code_to_arm_ && !this->is_code_valid_(call.get_code())) {
        ESP_LOGW(TAG, "Not arming: code doesn't match");
        return;
      }
      this->arm_hardware_(*call.get_state());
      break;

    case alarm_control_panel::ACP_STATE_DISARMED:
      // Disarming always needs a valid code when one is configured.
      if (!this->is_code_valid_(call.get_code())) {
        ESP_LOGW(TAG, "Not disarming: code doesn't match");
        return;
      }
      this->disarm_hardware_();
      break;

    default:
      break;
  }
}
```

A few important details:

- `AlarmControlPanelCall`'s getters (`get_state()`, `get_code()`) return `optional<T>`. The base class's
  `validate_()` only rejects illegal or unsupported state transitions (arming when not disarmed, arming a mode absent
  from `get_supported_features()`, and so on). It does **not** check the code, so `control()` can be reached with no
  code, or the wrong one, even when `get_requires_code_to_arm()` is true.
- Because of that, check the code against the `optional` itself rather than only when it has a value. A guard like
  `if (call.get_code().has_value() && !valid)` silently lets a code-less disarm straight through. Log a warning when
  you reject a command, otherwise the command vanishes with no indication of why.
- Once your hardware has actually reached the new state (which may take time - e.g. an exit delay before fully
  arming), call `publish_state(AlarmControlPanelState)` yourself to report it. The base class does not do this for
  you, which lets you model intermediate states like `ACP_STATE_ARMING` or `ACP_STATE_PENDING` before settling on
  the final one.
- To report an alarm being triggered outside of a direct command (e.g. a sensor opened while armed), call
  `publish_state(alarm_control_panel::ACP_STATE_TRIGGERED)` directly - this does not go through `control()`.

### Useful members

- `get_state()`: the current `AlarmControlPanelState` (`DISARMED` / `ARMED_HOME` / `ARMED_AWAY` / `ARMED_NIGHT` /
  `ARMED_VACATION` / `ARMED_CUSTOM_BYPASS` / `PENDING` / `ARMING` / `DISARMING` / `TRIGGERED`).
- `publish_state(AlarmControlPanelState)`: reports a new state to the front-end and fires the `on_state` /
  `on_triggered` / etc. callbacks.
- `is_state_armed(state)`: convenience check for whether a given state counts as "armed".
- `add_on_cleared_callback()` / `add_on_chime_callback()` / `add_on_ready_callback()`: register callbacks for
  events that are not simple state transitions - leaving the triggered state, a chime zone opening, or the panel's
  overall "ready to arm" status changing.

## Exposing multiple alarm control panels from one component

Hardware sometimes splits a security system into more than one armable area - a panel with separate partitions for
"downstairs" and "upstairs", each armed and disarmed independently. There are two established ways to model this.

### A hub plus a `type` on the platform

With a top-level hub already configured, add one `alarm_control_panel:` entry per partition, distinguished by
`type`, via `cv.typed_schema()` with `key=CONF_TYPE`:

```yaml
security_panel:
  id: the_panel

alarm_control_panel:
  - platform: security_panel
    type: partition_1
    name: "Downstairs"
  - platform: security_panel
    type: partition_2
    name: "Upstairs"
```

```python
from esphome.const import CONF_TYPE
from .. import CONF_SECURITY_PANEL_ID, SecurityPanel, SecurityPanelPartition

_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_SECURITY_PANEL_ID): cv.use_id(SecurityPanel)})
_PARTITION_SCHEMA = alarm_control_panel.alarm_control_panel_schema(SecurityPanelPartition)
CONFIG_SCHEMA = cv.typed_schema(
    {
        "partition_1": _PARTITION_SCHEMA.extend(_HUB_ID_SCHEMA),
        "partition_2": _PARTITION_SCHEMA.extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await alarm_control_panel.new_alarm_control_panel(config)
    await cg.register_component(var, config)
    await cg.register_parented(var, config[CONF_SECURITY_PANEL_ID])
```

Each partition is a first-class platform entry with the full option set, adding another partition later is purely
additive, and different partitions can use different C++ classes if their capabilities diverge (for example one
partition that requires a code and one that does not).

### Sub-configs on a single platform entry

Some components instead nest each partition as an optional sub-key under one platform entry (`partition_1:`,
`partition_2:` under a single `- platform: security_panel`). Unlike `sensor_schema()`,
`alarm_control_panel_schema()` requires a class argument, so each sub-config still passes one explicitly, typically
the same shared class:

```python
CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(SecurityPanel),
        cv.Optional("partition_1"): alarm_control_panel.alarm_control_panel_schema(SecurityPanelPartition),
        cv.Optional("partition_2"): alarm_control_panel.alarm_control_panel_schema(SecurityPanelPartition),
    }
).extend(cv.COMPONENT_SCHEMA)
```

No `SUB_ALARM_CONTROL_PANEL` macro exists, so declare the pointer members and setters by hand, and null-check them
before use - the user may configure only one partition:

```cpp
class SecurityPanel : public Component {
 public:
  void set_partition_1_panel(alarm_control_panel::AlarmControlPanel *p) { this->partition_1_panel_ = p; }
  void set_partition_2_panel(alarm_control_panel::AlarmControlPanel *p) { this->partition_2_panel_ = p; }
 protected:
  alarm_control_panel::AlarmControlPanel *partition_1_panel_{nullptr};
  alarm_control_panel::AlarmControlPanel *partition_2_panel_{nullptr};
};
```

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its partitions, so let the hardware decide:

- **Sub-configs** fit when the partitions are a small, fixed set reported by a single panel in one transaction - for
  example a two-partition board that always reports both areas together. This keeps one physical panel to one YAML
  block.
- **A hub plus `type`** fits when the partitions are independent things that happen to share a connection -
  especially when a hub component already exists because the device or transport must be configured once, or when
  the set of partitions is large, open-ended, or different partitions need different C++ classes or update
  strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.
In a new component with no hub, sub-configs are usually the smaller change.

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component) for a fully worked example of both patterns.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
