---
title: "Text"
---

The `text` component is one of ESPHome's core [entity](/architecture/components/index) types. A text entity holds a
single user-editable string - a hostname, an API key, a free-form label - that the user can set from the front-end
(Home Assistant, the web server, MQTT, etc.). Do not confuse it with [text sensor](/architecture/components/text_sensor):
a text sensor only *reports* a string chosen by the component, while a `text` entity can also be *written to* by the
user, and the component drives some piece of hardware or internal state in response.

Like the other entity types, `text` is a *platform* base. Individual components (for example a device that stores a
configurable label or credential) register a text entity and implement the logic that applies the new string.

## Python

A text platform lives in a `text.py` file (or a `text/__init__.py` package) inside your component's directory. This
file name tells ESPHome that the component provides a `text` platform, allowing the user to configure it under the
`text:` block:

```yaml
text:
  - platform: my_component
    name: "My Text"
    mode: text
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import text

my_text_ns = cg.esphome_ns.namespace("my_text")
MyText = my_text_ns.class_("MyText", text.Text, cg.Component)
```

Note that `MyText` inherits from both `text.Text` and a component base (`cg.Component` here).

### Configuration schema

Use the `text.text_schema()` helper. It returns a schema pre-populated with all of the options common to every text
entity - `name`, `id`, `icon`, `entity_category`, `mode`, the `on_value` automation, and so on:

```python
CONFIG_SCHEMA = text.text_schema(MyText, mode="TEXT").extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyText`) as the first argument tells the helper which class to declare the ID for, so you do not
need a separate `cv.GenerateID()`. Unlike `switch_schema()`, the base schema requires `mode:` to be present in the
configuration; passing `mode=` to `text_schema()` (as above) supplies a default so the user does not have to specify
it themselves. `min_length`, `max_length` and `pattern` are *not* part of the schema at all - like a number's bounds,
they are supplied later, in `to_code`.

### Code generation

In `to_code`, use the `text.new_text()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code to
apply the common text options from the configuration. `min_length`, `max_length` and `pattern` are optional keyword
arguments (defaulting to `0`, `255` and no pattern):

```python
async def to_code(config):
    var = await text.new_text(config, min_length=0, max_length=32)
    await cg.register_component(var, config)
```

If your component owns a text entity as a child (rather than *being* one), use
`await text.register_text(var, config, min_length=..., max_length=..., pattern=...)` instead, having declared the ID
yourself.

## C++

The C++ class inherits from `text::Text` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/text/text.h"

namespace esphome::my_text {

class MyText : public text::Text, public Component {
 public:
  void dump_config() override;

 protected:
  void control(const std::string &value) override;
};

}  // namespace esphome::my_text
```

### Handling the new value

The one method you *must* implement is `control()`. It is called by the front-end when the user (or an automation)
sets a new string. Your implementation drives the hardware and then calls `publish_state()` to acknowledge the value
that was actually applied:

```cpp
void MyText::control(const std::string &value) {
  // Drive the hardware here (store a setting, send a command, etc.)
  this->write_hardware_(value);

  // Acknowledge the new value back to the front-end.
  this->publish_state(value);
}
```

A few important details:

- `control()` is only called with a value that has already been checked against the configured `min_length:` and
  `max_length:`; `TextCall` drops a call violating either, with a warning, before it reaches you.
- `pattern:` is **not** enforced on-device. It is forwarded to the front-end as metadata for client-side validation
  only, so nothing validates it before `control()` runs. If your hardware depends on the format, check it yourself.
- You should call `publish_state()` yourself once the hardware has been driven; the base class does *not* do this for
  you. This lets you report the *actual* stored value, which may differ from the requested one.
- If the entity's `mode:` is `PASSWORD`, `publish_state()` automatically redacts the value in the logs (via
  `LOG_SECRET`) - you do not need to handle that yourself.

### Useful members

- `state`: the current reported string.
- `traits`: the `TextTraits` object holding `min_length`/`max_length`/`pattern`/`mode` (`TextMode::TEXT_MODE_TEXT` or
  `TEXT_MODE_PASSWORD`).
- `publish_state(const std::string &)`: report a new value to the front-end (stores `state`, fires callbacks).
- `LOG_TEXT(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the text entity in the standard
  format.

## Exposing multiple texts from one component

Hardware often exposes more than one free-form string - a network sign controller, for example, might let you set
both its Wi-Fi SSID and a scrolling banner message. As with sensors, there are two established ways to model this.
Both are valid and both are widely used in-tree - which one fits depends on how the hardware itself is shaped.

### A hub plus a `type` on the platform

If your component already has a top-level hub, let the user add one `text:` entry per field, distinguished by a
`type` key via `cv.typed_schema()`:

```yaml
text:
  - platform: my_hub
    type: ssid
    name: "SSID"
  - platform: my_hub
    type: banner
    name: "Banner Message"
```

```python
CONFIG_SCHEMA = cv.typed_schema(
    {
        "ssid": text.text_schema(MyHubSSIDText, mode="TEXT").extend(_HUB_ID_SCHEMA),
        "banner": text.text_schema(MyHubBannerText, mode="TEXT").extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)


async def to_code(config):
    var = await text.new_text(config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

What this shape gives you:

- Each field is a first-class platform entry, so it picks up the full set of per-entity options naturally.
- Adding a new field later is purely additive - one more key in the `typed_schema` - with no reshaping of the
  existing schema and no change to existing user configurations.

### Sub-configs on a single platform entry

Some components instead nest optional fields under one platform entry, each an inline
`cv.Optional(CONF_SSID): text.text_schema(mode="TEXT")` - note `text_schema()` called *without* a class argument.
There is no `SUB_TEXT` macro (`SUB_*` exists only for `binary_sensor`, `button`, `number`, `select`, `sensor`,
`switch` and `text_sensor`), so declare the pointer member and setter by hand, and null-check before publishing since
the user may configure only one field:

```cpp
class MyComponent final : public Component {
 public:
  void set_ssid_text(text::Text *ssid_text) { this->ssid_text_ = ssid_text; }

 protected:
  text::Text *ssid_text_{nullptr};
};
```

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example of both patterns, including the matching Python schema and `to_code`.

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its fields, so let the hardware decide:

- **Sub-configs** fit when the fields are a small, fixed set that belong to a single device - one physical device to
  one YAML block, which is easier to read.
- **A hub plus `type`** fits when the fields are genuinely independent things that happen to share a connection. If a
  hub component already exists because the device or transport must be configured once and shared, then each field
  being its own entry is the more natural fit - especially when the set is large or open-ended, or when different
  fields need different update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.

For everything else, the component implements the usual set of methods [as described here](/architecture/components/index#common-methods).
