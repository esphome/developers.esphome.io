---
title: "Light"
---

The `light` component is one of ESPHome's core [entity](/architecture/components/index) types. A light represents a
device that can be turned on/off and, depending on the hardware, may also support brightness, color temperature, RGB
color or addressable effects.

`light` works differently from the other entity types. For a [sensor](/architecture/components/sensor) or a
[switch](/architecture/components/switch), your platform class *is* the entity. For a light, the entity itself is
`light::LightState` - a class provided entirely by ESPHome core, which handles transitions, flashes, effects and
publishing to the front-end. Your platform instead implements `light::LightOutput`, a small interface that only knows
how to report what the hardware supports and how to write a given color/brightness to it. `LightState` owns your
`LightOutput` and drives it.

We have an [example, minimal light component](https://github.com/esphome/starter-components/tree/main/components/empty_light)
which is a good starting point.

## Python

A light platform lives in a `light.py` file (or a `light/__init__.py` package) inside your component's directory. This
file name tells ESPHome that the component provides a `light` platform, allowing the user to configure it under the
`light:` block:

```yaml
light:
  - platform: my_component
    name: "My Light"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import light

my_light_ns = cg.esphome_ns.namespace("my_light")
MyLightOutput = my_light_ns.class_("MyLightOutput", light.LightOutput)
```

Note that `MyLightOutput` inherits only from `light.LightOutput` - not from a component base. `LightState` (the
entity) is registered as the `Component` on your behalf; your output only needs `cg.Component` in addition if it has
its own initialization to perform (see [Optional `Component` behaviour](#optional-component-behaviour) below).

### Configuration schema

Use the `light.light_schema()` helper, passing your output class and the kind of light you're implementing via
`type_=`:

```python
from esphome.components.light import LightType

CONFIG_SCHEMA = light.light_schema(MyLightOutput, type_=LightType.RGB)
```

`LightType` is an enum with four members - `BINARY`, `BRIGHTNESS_ONLY`, `RGB` and `ADDRESSABLE` - and picks which of
the underlying schemas (`BINARY_LIGHT_SCHEMA`, `BRIGHTNESS_ONLY_LIGHT_SCHEMA`, `RGB_LIGHT_SCHEMA` or
`ADDRESSABLE_LIGHT_SCHEMA`) your platform extends, which in turn determines which options are available (for example
`gamma_correct` and `default_transition_length` only apply from `BRIGHTNESS_ONLY` upwards, and `color_correct` /
`power_supply` only apply to `ADDRESSABLE`) and which class of effects (`BINARY_EFFECTS`, `MONOCHROMATIC_EFFECTS`,
`RGB_EFFECTS`, `ADDRESSABLE_EFFECTS`) are valid under `effects:`.

Unlike `sensor.sensor_schema()` or `switch.switch_schema()`, the generated ID is declared under `CONF_OUTPUT_ID`, not
`CONF_ID` - the `id:` the user sets on a light refers to the `LightState`, whose ID is already declared by the base
schema. Your own output object gets its own, separate generated ID:

```python
CONFIG_SCHEMA = light.light_schema(MyLightOutput, type_=LightType.RGB).extend(
    {
        cv.Required(CONF_RED): cv.use_id(output.FloatOutput),
        cv.Required(CONF_GREEN): cv.use_id(output.FloatOutput),
        cv.Required(CONF_BLUE): cv.use_id(output.FloatOutput),
    }
)
```

If you don't need `light_schema()`'s convenience defaults (`entity_category`, `icon`, `default_restore_mode`), you can
instead extend the underlying schema constant directly and declare the output ID yourself, as several in-tree
components do:

```python
CONFIG_SCHEMA = light.RGB_LIGHT_SCHEMA.extend(
    {
        cv.GenerateID(CONF_OUTPUT_ID): cv.declare_id(MyLightOutput),
        ...
    }
)
```

### Code generation

In `to_code`, use the `light.new_light()` helper. It creates your output `Pvariable`, then internally creates and
registers the `LightState` that wraps it:

```python
async def to_code(config):
    var = await light.new_light(config)
    red = await cg.get_variable(config[CONF_RED])
    cg.add(var.set_red(red))
    ...
```

If your output class also inherits `cg.Component` (see below), construct it yourself with `cg.new_Pvariable()`,
register it as a component, and call `await light.register_light(var, config)` instead of `new_light()`:

```python
async def to_code(config):
    var = cg.new_Pvariable(config[CONF_OUTPUT_ID])
    await cg.register_component(var, config)
    await light.register_light(var, config)
```

## C++

The C++ class implements `light::LightOutput`:

```cpp
#include "esphome/components/light/light_output.h"
#include "esphome/components/output/float_output.h"

namespace esphome::my_light {

class MyLightOutput : public light::LightOutput {
 public:
  void set_red(output::FloatOutput *red) { this->red_ = red; }
  void set_green(output::FloatOutput *green) { this->green_ = green; }
  void set_blue(output::FloatOutput *blue) { this->blue_ = blue; }

  light::LightTraits get_traits() override {
    auto traits = light::LightTraits();
    traits.set_supported_color_modes({light::ColorMode::RGB});
    return traits;
  }

  void write_state(light::LightState *state) override {
    float red, green, blue;
    state->current_values_as_rgb(&red, &green, &blue);
    this->red_->set_level(red);
    this->green_->set_level(green);
    this->blue_->set_level(blue);
  }

 protected:
  output::FloatOutput *red_;
  output::FloatOutput *green_;
  output::FloatOutput *blue_;
};

}  // namespace esphome::my_light
```

### Declaring supported color modes

`get_traits()` tells `LightState` what your hardware can do. Call `set_supported_color_modes()` with one or more
`ColorMode` values:

- `ON_OFF`: on/off only, no dimming.
- `BRIGHTNESS`: dimmable, single channel.
- `WHITE`: a separate white channel (used together with another color mode, e.g. `RGB_WHITE`).
- `COLOR_TEMPERATURE`: dimmable white with adjustable color temperature (also set `set_min_mireds()` /
  `set_max_mireds()`).
- `COLD_WARM_WHITE`: independently dimmable cold/warm white channels.
- `RGB`: red/green/blue with a shared brightness.
- `RGB_WHITE`, `RGB_COLOR_TEMPERATURE`, `RGB_COLD_WARM_WHITE`: RGB combined with a white channel.

Each `ColorMode` is really a bitmask of `ColorCapability` flags (`ON_OFF`, `BRIGHTNESS`, `WHITE`,
`COLOR_TEMPERATURE`, `COLD_WARM_WHITE`, `RGB`); if a light supports switching between several distinct modes (for
example plain RGB *and* a separate color-temperature white channel), pass more than one `ColorMode` to
`set_supported_color_modes()`.

### Writing state to hardware

The one method you *must* implement is `write_state(LightState *state)`. It is called from `loop()` by the light core
every time the *current* (post-transition) values have changed, and you should push them to hardware immediately.
Unlike a switch or fan, you never call `publish_state()` yourself - `LightState` owns the state and publishing.

Read the values you need through `state->current_values_as_*()`, not the raw `state->current_values` fields directly:
these accessors apply gamma correction and convert the internal, mode-specific representation into the shape your
hardware expects:

- `current_values_as_binary(bool *binary)`
- `current_values_as_brightness(float *brightness)`
- `current_values_as_rgb(float *red, float *green, float *blue)`
- `current_values_as_rgbw(float *red, float *green, float *blue, float *white)`
- `current_values_as_rgbww(float *red, float *green, float *blue, float *cold_white, float *warm_white)`
- `current_values_as_rgbct(float *red, float *green, float *blue, float *color_temperature, float *white_brightness)`
- `current_values_as_cwww(float *cold_white, float *warm_white)`
- `current_values_as_ct(float *color_temperature, float *white_brightness)`

Pick the accessor matching the `ColorMode`(s) you declared, regardless of what the user's automations set - a light in
`COLOR_TEMPERATURE` mode should call `current_values_as_ct()`, and so on.

### Optional `Component` behaviour

If your output needs its own hardware initialization (for example a status LED on a raw GPIO pin), you can also
inherit `Component` and implement `setup()`/`dump_config()` as usual - just remember to `cg.register_component()` it
in Python in addition to `light.register_light()`, as shown above. If your output has no independent setup to do (most
simple color outputs don't - the wrapped `output::FloatOutput`/`output::BinaryOutput` instances handle their own
setup), skip `Component` entirely, as in the example above.

Two further optional overrides exist for advanced cases:

- `setup_state(LightState *state)`: called once when the `LightState` is set up; use it if you need a pointer back to
  the state (for example to register a `LightRemoteValuesListener`).
- `update_state(LightState *state)`: called every time the current values change, *before* `write_state()`. Every call
  to `write_state()` is preceded by at least one call to `update_state()`, but `update_state()` can also fire on its
  own without a following `write_state()` - useful for cheap bookkeeping that should track every change, separate from
  the (potentially more expensive) actual hardware write.

### Useful members

- `ColorMode` / `ColorCapability`: the color-mode and capability enums described above.
- `LightTraits::set_min_mireds()` / `set_max_mireds()`: the color-temperature range, required when supporting
  `COLOR_TEMPERATURE`.
- `create_default_transition()`: override to provide a custom `LightTransformer` for transitions; the default uses a
  smooth (gamma-aware) transition.
- `state->get_effect_name()`: the name of the currently active effect, or `"None"`.

## Exposing multiple lights from one component

Hardware sometimes drives more than one light from a single controller - an LED driver hub might expose a plain
dimmable white channel on one header and a full RGB channel on another. Since the *entity* is always the core-owned
`light::LightState`, exposing a light means registering a `LightOutput` and letting `light.new_light()` wrap it in
its own `LightState`. There are still two established ways to let the user configure which outputs exist, and both
are valid - which one fits depends on how the hardware itself is shaped.

### A hub plus a `type` on the platform

If your component has a top-level hub, let the user add *one `light:` entry per channel*, distinguished by a `type`
key, using `cv.typed_schema()` with `key=CONF_TYPE`. Each type maps to that channel's real
`light.light_schema(class_, type_=LightType.X)` call:

```yaml
my_light_hub:
  id: the_hub
light:
  - platform: my_light_hub
    type: white
    name: "Hallway Light"
  - platform: my_light_hub
    type: rgb
    name: "Accent Light"
```

```python
_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_MY_HUB_ID): cv.use_id(MyHub)})
CONFIG_SCHEMA = cv.typed_schema(
    {
        "white": light.light_schema(MyHubWhiteLightOutput, type_=LightType.BRIGHTNESS_ONLY).extend(_HUB_ID_SCHEMA),
        "rgb": light.light_schema(MyHubRgbLightOutput, type_=LightType.RGB).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await light.new_light(config)
    await cg.register_parented(var, config[CONF_MY_HUB_ID])
```

The generated ID for each type lives under `CONF_OUTPUT_ID`, not `CONF_ID`, and `new_light()` already registers the
`LightState` as a component, so `to_code` needs no separate `cg.register_component()` call. Each `type` gets its own
schema, so the white channel and the RGB channel can declare both a different output class and a different
`LightType`. See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component)
for a fully worked example.

### Sub-configs on a single platform entry

Some components instead nest their channels as optional sub-keys under one platform entry, the way
[`dht`](https://github.com/esphome/esphome/tree/dev/esphome/components/dht) nests `temperature:` and `humidity:`
under one `sensor:` entry. This is a heavier lift for `light`: unlike `sensor.sensor_schema()`,
`light.light_schema()` has no default for `class_` or `type_`, so every sub-config needs its own output class and
explicit `LightType`, and `to_code` calls `light.new_light()` per configured channel:

```python
if channel_0_config := config.get(CONF_CHANNEL_0):
    output = await light.new_light(channel_0_config)
    cg.add(var.set_channel_0_light_output(output))
```

There is no `SUB_LIGHT` macro (only `binary_sensor`, `button`, `number`, `select`, `sensor`, `switch`, `text_sensor`
have one), so declare the pointer member and setter by hand, and null-check before use:

```cpp
class MyHubComponent : public Component {
 public:
  void set_channel_0_light_output(light::LightOutput *output) { this->channel_0_light_output_ = output; }
 protected:
  light::LightOutput *channel_0_light_output_{nullptr};
};
```

### Choosing between them

Neither pattern is deprecated; they express different relationships between a driver and the outputs it exposes, so
let the hardware decide:

- **Sub-configs** fit a small, fixed set of channels from a single LED driver board - one physical device maps to
  one YAML block, which is easier to read.
- **A hub plus `type`** fits when a hub component already exists to describe the connection, and the set of channels
  is large or open-ended, or different channels need different color modes (`LightType`) or output classes.

If both descriptions fit equally well, follow whichever pattern the surrounding component already uses. In a new
component with no hub, sub-configs are usually the smaller change.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
