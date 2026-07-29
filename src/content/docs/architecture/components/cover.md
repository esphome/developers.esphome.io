---
title: "Cover"
---

The `cover` component is one of ESPHome's core [entity](/architecture/components/index) types. A cover represents
anything that opens and closes and can be moved to a position - a garage door, a blind, a curtain, an awning, and so
on. It is a *controllable* entity: in addition to reporting its current position (and, optionally, tilt) it accepts
open/close/stop/toggle commands and can be asked to move to a specific position from the front-end (Home Assistant,
the web server, MQTT, etc.).

Like the other entity types, `cover` is a *platform* base. Individual components (for example a garage door relay, a
shutter motor controller, or a curtain motor) register a cover and implement the logic that actually drives the
hardware.

We have an [example, minimal cover component](https://github.com/esphome/starter-components/tree/main/components/empty_cover)
which is a good starting point.

## Python

A cover platform lives in a `cover.py` file (or a `cover/__init__.py` package) inside your component's directory. This
file name tells ESPHome that the component provides a `cover` platform, allowing the user to configure it under the
`cover:` block:

```yaml
cover:
  - platform: my_component
    name: "My Cover"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import cover

my_cover_ns = cg.esphome_ns.namespace("my_cover")
MyCover = my_cover_ns.class_("MyCover", cover.Cover, cg.Component)
```

Note that `MyCover` inherits from both `cover.Cover` and a component base (`cg.Component` here).

### Configuration schema

Use the `cover.cover_schema()` helper. It returns a schema pre-populated with all of the options common to every
cover - `name`, `id`, `icon`, `device_class`, `entity_category`, the `on_opened` / `on_closed` / `on_opening` /
`on_closing` / `on_idle` automations, and so on:

```python
CONFIG_SCHEMA = cover.cover_schema(MyCover).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyCover`) as the first argument tells the helper which class to declare the ID for, so you do not
need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `cover.new_cover()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the code to
apply the common cover options from the configuration:

```python
async def to_code(config):
    var = await cover.new_cover(config)
    await cg.register_component(var, config)
```

If your component owns a cover as a child (rather than *being* a cover), use `await cover.register_cover(var, config)`
instead, having declared the ID yourself.

## C++

The C++ class inherits from `cover::Cover` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/cover/cover.h"

namespace esphome::my_cover {

class MyCover : public cover::Cover, public Component {
 public:
  void dump_config() override;
  cover::CoverTraits get_traits() override;

 protected:
  void control(const cover::CoverCall &call) override;
};

}  // namespace esphome::my_cover
```

### Command flow

Unlike a [switch](/architecture/components/switch), where the front-end calls a single public setter, a cover command
is built up as a `CoverCall` object: the front-end (or your own code) calls `make_call()` to get one, sets whichever
fields it wants to change (`set_position()`, `set_tilt()`, `set_command_open()`, `set_stop()`, ...), and then calls
`perform()` on it. This in turn dispatches to your protected virtual `control()` method with the finished call.

The two methods you *must* implement are `control(const CoverCall &call)` and `get_traits()`.

```cpp
void MyCover::control(const CoverCall &call) {
  if (call.get_stop()) {
    this->stop_hardware_();
    this->current_operation = COVER_OPERATION_IDLE;
    this->publish_state();
  }

  if (call.get_position().has_value()) {
    float pos = *call.get_position();
    this->move_to_position_(pos);
    this->position = pos;
    this->publish_state();
  }

  if (call.get_tilt().has_value()) {
    this->tilt = *call.get_tilt();
    this->publish_state();
  }
}

cover::CoverTraits MyCover::get_traits() {
  auto traits = cover::CoverTraits();
  traits.set_supports_position(true);
  traits.set_supports_tilt(false);
  traits.set_is_assumed_state(false);
  return traits;
}
```

A few important details:

- Inspect `call.get_position()`, `call.get_tilt()` and `call.get_stop()` to find out what the caller actually asked
  for; only the fields the caller set will be present (`get_position()`/`get_tilt()` are `optional<float>`, so check
  `has_value()` before dereferencing).
- `get_position()` and `get_tilt()` range from `0.0` (`COVER_CLOSED`) to `1.0` (`COVER_OPEN`) - use these constants
  rather than the raw literals where it improves readability.
- After driving the hardware, update `this->position` (and `this->tilt`, if supported) and set `this->current_operation`
  before calling `publish_state()`, so the front-end sees an accurate, up-to-date state.
- `get_traits()` tells the front-end what the cover can do - whether it supports a continuous `position`, `tilt`,
  being stopped mid-move, or only reports an *assumed* state (see below). Report only the capabilities your hardware
  actually has; the front-end adapts its UI accordingly (e.g. a cover that only supports open/close shows simple
  buttons instead of a position slider).

### Assumed state

If your cover cannot read back the real hardware position (so the reported position is only what ESPHome last
commanded), set `traits.set_is_assumed_state(true)` in `get_traits()`. The front-end will then show separate open/close
controls rather than trusting the reported position as ground truth.

### Useful members

- `position`: the current reported position, `0.0` (closed) to `1.0` (open). Use `COVER_OPEN` / `COVER_CLOSED` for the
  extremes.
- `tilt`: the current reported tilt, on the same `0.0`-`1.0` scale.
- `current_operation`: one of `COVER_OPERATION_IDLE`, `COVER_OPERATION_OPENING`, `COVER_OPERATION_CLOSING`.
- `is_fully_open()` / `is_fully_closed()`: convenience helpers comparing `position` against `1.0` / `0.0`.
- `publish_state(bool save = true)`: report the current `position`/`tilt`/`current_operation` to the front-end; pass
  `save = false` to skip persisting the state to flash.
- `LOG_COVER(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the cover in the standard format.

## Exposing multiple covers from one component

Hardware sometimes drives more than one cover from a single controller - a multi-channel blind/shutter controller hub
might expose a roller shade on one channel and a tilting venetian blind on another. There are two established ways to
model this. Both are valid and both are widely used in-tree - which one fits depends on how the hardware itself is
shaped, so read the two together and pick the one that describes your device more honestly.

### A hub plus a `type` on the platform

If your component has a top-level hub, let the user add *one `cover:` entry per channel*, distinguished by a `type`
key, using `cv.typed_schema()` with `key=CONF_TYPE`:

```yaml
my_hub:
  id: the_hub
cover:
  - platform: my_hub
    type: roller
    name: "Living Room Blind"
  - platform: my_hub
    type: venetian
    name: "Kitchen Blind"
```

```python
_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_MY_HUB_ID): cv.use_id(MyHub)})
CONFIG_SCHEMA = cv.typed_schema(
    {
        "roller": cover.cover_schema(MyHubRollerCover).extend(_HUB_ID_SCHEMA),
        "venetian": cover.cover_schema(MyHubVenetianCover).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await cover.new_cover(config)
    await cg.register_component(var, config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

Each `type` gets its own schema and C++ class (only the venetian one needs `set_supports_tilt(true)` in
`get_traits()`), and adding a third type later is purely additive. See
[Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example.

### Sub-configs on a single platform entry

Some components instead nest their channels as optional sub-keys under one platform entry, the way
[`dht`](https://github.com/esphome/esphome/tree/dev/esphome/components/dht) nests `temperature:` and `humidity:`
under one `sensor:` entry. There is no `SUB_COVER` macro (only `binary_sensor`, `button`, `number`, `select`,
`sensor`, `switch`, `text_sensor` have one), and unlike `sensor.sensor_schema()`, `cover.cover_schema()` always
requires a class argument. Declare the pointer member and setter by hand, and null-check before use:

```cpp
class MyHubComponent : public Component {
 public:
  void set_channel_0_cover(cover::Cover *cover) { this->channel_0_cover_ = cover; }
 protected:
  cover::Cover *channel_0_cover_{nullptr};
};
```

### Choosing between them

Neither pattern is deprecated; they express different relationships between a controller and the covers it drives,
so let the hardware decide:

- **Sub-configs** fit when the channels are a small, fixed set on a single controller board - one physical device
  maps to one YAML block, which is easier to read.
- **A hub plus `type`** fits when a hub component already exists to describe the connection, and the set of channels
  is large or open-ended, or different channels need different traits (only the venetian type needs
  `set_supports_tilt(true)`) or C++ classes.

If both descriptions fit equally well, follow whichever pattern the surrounding component already uses. In a new
component with no hub, sub-configs are usually the smaller change.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
