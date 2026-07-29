---
title: "Select"
---

The `select` component is one of ESPHome's core [entity](/architecture/components/index) types. A select offers the
user a fixed list of string options - a mode, a preset, a channel - and lets them pick one from the front-end (Home
Assistant, the web server, MQTT, etc.). It is conceptually similar to a [text sensor](/architecture/components/text_sensor),
except that it can also be *written to*: in addition to reporting which option is currently active, it accepts a new
option chosen by the user and drives some piece of hardware or internal state in response.

Like the other entity types, `select` is a *platform* base. Individual components (for example a fan's preset mode,
or an amplifier's input source) register a select and implement the logic that applies the chosen option.

## Python

A select platform lives in a `select.py` file (or a `select/__init__.py` package) inside your component's directory.
This file name tells ESPHome that the component provides a `select` platform, allowing the user to configure it under
the `select:` block:

```yaml
select:
  - platform: my_component
    name: "My Select"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import select

my_select_ns = cg.esphome_ns.namespace("my_select")
MySelect = my_select_ns.class_("MySelect", select.Select, cg.Component)
```

Note that `MySelect` inherits from both `select.Select` and a component base (`cg.Component` here).

### Configuration schema

Use the `select.select_schema()` helper. It returns a schema pre-populated with all of the options common to every
select - `name`, `id`, `icon`, `entity_category`, the `on_value` automation, and so on:

```python
CONFIG_SCHEMA = select.select_schema(MySelect).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MySelect`) as the first argument tells the helper which class to declare the ID for, so you do
not need a separate `cv.GenerateID()`. Note that `select_schema()` does not itself carry the list of options - like a
number's bounds, the option list is usually only known once you're generating code for a specific instance, so it is
supplied to `new_select()`/`register_select()` instead.

### Code generation

In `to_code`, use the `select.new_select()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code
to apply the common select options from the configuration. You must supply the list of `options` as a keyword
argument:

```python
async def to_code(config):
    var = await select.new_select(config, options=["Option A", "Option B", "Option C"])
    await cg.register_component(var, config)
```

If your component owns a select as a child (rather than *being* a select), use
`await select.register_select(var, config, options=[...])` instead, having declared the ID yourself.

## C++

The C++ class inherits from `select::Select` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/select/select.h"

namespace esphome::my_select {

class MySelect : public select::Select, public Component {
 public:
  void dump_config() override;

 protected:
  void control(const std::string &value) override;
};

}  // namespace esphome::my_select
```

### Handling the new option

At least one of the two `control()` overloads must be implemented: `control(size_t index)` or
`control(const std::string &value)`. Overriding the index-based version is preferred where practical, since it avoids
string comparisons/conversions, but overriding the string-based version is usually simplest and is what most
components do. Whichever one you override, drive the hardware and then call `publish_state()` to acknowledge the
option that was actually applied:

```cpp
void MySelect::control(const std::string &value) {
  // Drive the hardware here (send a command, store a setting, etc.)
  this->write_hardware_(value);

  // Acknowledge the new option back to the front-end.
  this->publish_state(value);
}
```

A few important details:

- `control()` is only called with a value that is already a member of the configured `options:` list, so you do not
  need to re-validate it yourself.
- You should call `publish_state()` yourself once the hardware has been driven; the base class does *not* do this for
  you. `publish_state()` is overloaded for `const std::string &`, `const char *` and `size_t` (index), so you can
  report whichever form is most convenient.
- If you only override `control(size_t index)`, the base class's default `control(const std::string &)`
  implementation looks up the index for you via `index_of()` and forwards to it - so most components only need to
  implement one of the two.

### Useful members

- `traits`: the `SelectTraits` object holding the list of `options`, set for you via `new_select()`/`register_select()`.
- `current_option()`: returns the currently active option as a `StringRef`, or an empty one if no state has been
  published yet.
- `active_index()`: returns an `optional<size_t>` with the index of the currently active option.
- `has_option(...)` / `has_index(...)`: check whether a given option/index is valid for this select.
- `LOG_SELECT(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the select in the standard
  format.

## Exposing multiple selects from one component

Hardware often exposes more than one choice to make - a hub might expose an operating mode selector and a
sensitivity preset selector, each with its own list of options. There are two established ways to model this. Both
are valid and both are widely used in-tree - which one fits depends on how the hardware itself is shaped.

### A hub plus a `type` on the platform

If your component already has a top-level hub - configured once to describe the device or connection - you can let
the user add *one `select:` entry per choice*, distinguished by a `type` key, using `cv.typed_schema()` with
`key=CONF_TYPE`. Because `select.select_schema()` does not carry the option list, it is supplied per type in
`to_code`:

```yaml
sensor_hub:
  id: the_hub

select:
  - platform: sensor_hub
    type: mode
    name: "Operating Mode"
  - platform: sensor_hub
    type: sensitivity
    name: "Sensitivity"
```

```python
from esphome.const import CONF_TYPE

from .. import CONF_SENSOR_HUB_ID, SensorHub, sensor_hub_ns

_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_SENSOR_HUB_ID): cv.use_id(SensorHub)})

CONFIG_SCHEMA = cv.typed_schema(
    {
        "mode": select.select_schema(ModeSelect).extend(_HUB_ID_SCHEMA),
        "sensitivity": select.select_schema(SensitivitySelect).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)


async def to_code(config):
    options = {
        "mode": ["Auto", "Manual"],
        "sensitivity": ["Low", "Medium", "High"],
    }[config[CONF_TYPE]]
    var = await select.new_select(config, options=options)
    await cg.register_parented(var, config[CONF_SENSOR_HUB_ID])
```

What this shape gives you:

- Each selector is a first-class platform entry, so it picks up the full set of per-entity options naturally.
- Adding a new selector later is purely additive - one more key in the `typed_schema` - with no reshaping of the
  existing schema and no change to existing user configurations.
- Different selectors can use different C++ classes and their own option lists.

### Sub-configs on a single platform entry

Many existing components instead nest optional selectors under one platform entry. Like `switch.switch_schema()`,
`select.select_schema()` always requires a class, so this pattern still declares a dedicated class per selector - it
is just folded under one entry as an optional key. The `select` platform of `es8388` does this for its DAC output
routing and ADC input source selectors:

```yaml
select:
  - platform: es8388
    es8388_id: my_es8388
    dac_output:
      name: "DAC Output"
    adc_input_mic:
      name: "ADC Input Mic"
```

On the C++ side, use the `SUB_SELECT(name)` macro from `select.h`, which generates a protected `name##_select_`
member (defaulted to `nullptr`) and a public `set_##name##_select()` setter:

```cpp
class ES8388 : public Component {
 public:
  SUB_SELECT(dac_output)
  SUB_SELECT(adc_input_mic)
};
```

Always null-check before use - the user may have configured only one of them.

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its selectors, so let the hardware decide:

- **Sub-configs** fit when the selectors are a small, fixed set that belong to a single chip - one physical device to
  one YAML block, which is easier to read.
- **A hub plus `type`** fits when the selectors are genuinely independent things that happen to share a connection.
  If a hub component already exists because the device or transport must be configured once and shared, then each
  selector being its own entry is the more natural fit - especially when the set is large or open-ended, or when
  different selectors need different option lists or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example of both patterns.

For everything else, the component implements the usual set of methods [as described here](/architecture/components/index#common-methods).
