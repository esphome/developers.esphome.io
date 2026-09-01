---
title: "Climate"
---

The `climate` component is one of ESPHome's core [entity](/architecture/components/index) types. A climate entity
represents a device that controls the temperature (and, optionally, humidity) of an environment - an AC unit, a
thermostat, a heat pump, a bang-bang controller driven by a [sensor](/architecture/components/sensor), and so on. It is
one of the more involved entity types: unlike a [switch](/architecture/components/switch), which only has a boolean
state, a climate entity has several independent pieces of state (mode, target temperature(s), fan mode, swing mode,
preset, action) and each device only supports a subset of them.

Like the other entity types, `climate` is a *platform* base. Individual components (for example `bang_bang`,
`thermostat`, `pid`, or any of the various IR/UART-driven AC integrations) register a climate entity and implement the
logic that translates user commands into whatever the underlying hardware or protocol needs.

## Python

A climate platform lives in a `climate.py` file (or a `climate/__init__.py` package) inside your component's
directory. This file name tells ESPHome that the component provides a `climate` platform, allowing the user to
configure it under the `climate:` block:

```yaml
climate:
  - platform: my_component
    name: "My Climate"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import climate

my_climate_ns = cg.esphome_ns.namespace("my_climate")
MyClimate = my_climate_ns.class_("MyClimate", climate.Climate, cg.Component)
```

Note that `MyClimate` inherits from both `climate.Climate` and a component base (`cg.Component` here).

### Configuration schema

Use the `climate.climate_schema()` helper. It returns a schema pre-populated with all of the options common to every
climate entity - `name`, `id`, `icon`, `visual` (min/max temperature, temperature step, min/max humidity), the
`on_state` / `on_control` automations, MQTT topics, and so on - and lets you pass defaults for your device:

```python
CONFIG_SCHEMA = climate.climate_schema(MyClimate).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyClimate`) as the first argument tells the helper which class to declare the ID for, so you do
not need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `climate.new_climate()` helper. It calls `cg.new_Pvariable()` for you *and* generates all the
code to apply the common climate options (visual bounds, MQTT topics, `on_state`/`on_control` automations, etc.) from
the configuration:

```python
async def to_code(config):
    var = await climate.new_climate(config)
    await cg.register_component(var, config)
```

If your component owns a climate entity as a child (rather than *being* a climate entity), use
`await climate.register_climate(var, config)` instead, having declared the ID yourself.

## C++

The C++ class inherits from `climate::Climate` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/climate/climate.h"

namespace esphome::my_climate {

class MyClimate : public climate::Climate, public Component {
 public:
  void setup() override;
  void dump_config() override;

 protected:
  climate::ClimateTraits traits() override;
  void control(const climate::ClimateCall &call) override;
};

}  // namespace esphome::my_climate
```

`climate::Climate` declares two pure virtual methods that every implementation must provide: `traits()` and
`control()`.

### Declaring capabilities with `traits()`

`traits()` returns a `ClimateTraits` describing what this device can do. Only `CLIMATE_MODE_OFF` and a target
temperature are supported by default; everything else must be declared explicitly, either as a feature flag
(`ClimateFeature` in `climate_mode.h`) or as a supported-value set:

```cpp
climate::ClimateTraits MyClimate::traits() {
  auto traits = climate::ClimateTraits();
  traits.set_supported_modes({
      climate::CLIMATE_MODE_OFF,
      climate::CLIMATE_MODE_HEAT,
      climate::CLIMATE_MODE_COOL,
  });
  traits.add_feature_flags(climate::CLIMATE_SUPPORTS_CURRENT_TEMPERATURE | climate::CLIMATE_SUPPORTS_ACTION);
  traits.set_visual_min_temperature(10.0f);
  traits.set_visual_max_temperature(30.0f);
  traits.set_visual_temperature_step(0.5f);
  return traits;
}
```

Useful `ClimateTraits` setters include `set_supported_modes()` / `add_supported_mode()`, `set_supported_fan_modes()` /
`add_supported_fan_mode()`, `set_supported_swing_modes()` / `add_supported_swing_mode()`, `set_supported_presets()` /
`add_supported_preset()`, and `set_visual_min_temperature()` / `set_visual_max_temperature()` /
`set_visual_temperature_step()` / `set_visual_min_humidity()` / `set_visual_max_humidity()`. Capabilities such as
reporting current temperature/humidity, target humidity, two-point target temperature, or the current action are
declared through `add_feature_flags()` with the `CLIMATE_SUPPORTS_*` / `CLIMATE_REQUIRES_*` flags in `climate_mode.h`
rather than a boolean setter, so check that header for the exact set of flags your device needs. Custom (free-text)
fan modes and presets are declared on the `Climate` entity itself via `set_supported_custom_fan_modes()` /
`set_supported_custom_presets()`, not on the traits object.

### Handling commands with `control()`

Whenever the front-end (Home Assistant, the web server, MQTT, a `climate.control` action, etc.) wants to change the
device, it builds a `ClimateCall` (via `id(my_climate).make_call()`) and the base class forwards it to your
`control()` override. Each field you support is exposed as an `optional<T>` getter - `get_mode()`,
`get_target_temperature()`, `get_target_temperature_low()` / `get_target_temperature_high()`,
`get_target_humidity()`, `get_fan_mode()`, `get_swing_mode()`, `get_preset()` - which is only set when the caller
actually wants to change that property:

```cpp
void MyClimate::control(const climate::ClimateCall &call) {
  if (call.get_mode().has_value()) {
    this->mode = *call.get_mode();
    // ... drive hardware into the new mode ...
  }
  if (call.get_target_temperature().has_value()) {
    this->target_temperature = *call.get_target_temperature();
    // ... send the new setpoint to the hardware ...
  }

  this->action = this->mode == climate::CLIMATE_MODE_OFF ? climate::CLIMATE_ACTION_OFF : climate::CLIMATE_ACTION_HEATING;
  this->publish_state();
}
```

Check each property you declared support for in `traits()`, apply it to the hardware, update the corresponding public
member (`mode`, `target_temperature`/`target_temperature_low`/`target_temperature_high`, `target_humidity`,
`fan_mode`, `swing_mode`, `preset`, `action`), and finish by calling `this->publish_state()` to notify the front-end of
the new state. Read-only updates - for example a temperature sensor poll updating `current_temperature` - also just
set the member and call `publish_state()`, without going through `control()`.

### Enums

- `ClimateMode`: `CLIMATE_MODE_OFF`, `CLIMATE_MODE_HEAT_COOL`, `CLIMATE_MODE_COOL`, `CLIMATE_MODE_HEAT`,
  `CLIMATE_MODE_FAN_ONLY`, `CLIMATE_MODE_DRY`, `CLIMATE_MODE_AUTO`.
- `ClimateAction`: what the device is actually doing right now (`CLIMATE_ACTION_OFF`, `CLIMATE_ACTION_COOLING`,
  `CLIMATE_ACTION_HEATING`, `CLIMATE_ACTION_IDLE`, `CLIMATE_ACTION_DRYING`, `CLIMATE_ACTION_FAN`,
  `CLIMATE_ACTION_DEFROSTING`), only meaningful if `CLIMATE_SUPPORTS_ACTION` is declared.
- `ClimateFanMode` and `ClimateSwingMode`: the built-in fan/swing options (`CLIMATE_FAN_ON`/`OFF`/`AUTO`/`LOW`/etc.,
  `CLIMATE_SWING_OFF`/`BOTH`/`VERTICAL`/`HORIZONTAL`).
- `ClimatePreset`: built-in presets (`CLIMATE_PRESET_NONE`, `HOME`, `AWAY`, `BOOST`, `COMFORT`, `ECO`, `SLEEP`,
  `ACTIVITY`).

### Useful members

- `mode`, `action`, `swing_mode`, `fan_mode`, `preset`, `target_temperature` (or `target_temperature_low` /
  `target_temperature_high` for two-point devices), `target_humidity`, `current_temperature`, `current_humidity`: the
  entity's current state, read-only for the user and read-write for the integration.
- `make_call()`: build a `ClimateCall` to control this device (used internally by the front-end, and directly from
  lambdas: `id(my_climate).make_call().set_mode(climate::CLIMATE_MODE_HEAT).perform();`).
- `publish_state()`: push the current member values out to the front-end and persist them to flash for restore-on-boot.
- `get_traits()`: get this device's `ClimateTraits`, with any user-configured visual overrides already applied.
- `LOG_CLIMATE(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the climate entity's name in the
  standard format.

## Exposing multiple climate entities from one component

Hardware sometimes controls more than one climate zone from a single device - a multi-zone ducted HVAC controller, or
a multi-room heat pump hub with one indoor unit per room. There are two established ways to model this.

### A hub plus a `type` on the platform

With a top-level hub already configured, add one `climate:` entry per zone, distinguished by `type`, via
`cv.typed_schema()` with `key=CONF_TYPE`:

```yaml
multizone_hvac:
  id: the_hvac

climate:
  - platform: multizone_hvac
    type: zone_1
    name: "Living Room"
  - platform: multizone_hvac
    type: zone_2
    name: "Bedroom"
```

```python
from esphome.const import CONF_TYPE
from .. import CONF_MULTIZONE_HVAC_ID, MultizoneHvac, MultizoneHvacZone

_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_MULTIZONE_HVAC_ID): cv.use_id(MultizoneHvac)})
CONFIG_SCHEMA = cv.typed_schema(
    {
        "zone_1": climate.climate_schema(MultizoneHvacZone).extend(_HUB_ID_SCHEMA),
        "zone_2": climate.climate_schema(MultizoneHvacZone).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await climate.new_climate(config)
    await cg.register_component(var, config)
    await cg.register_parented(var, config[CONF_MULTIZONE_HVAC_ID])
```

Each zone is a first-class platform entry with the full option set, and adding another zone later is purely
additive. `haier/climate.py` is a real in-tree example of `cv.typed_schema()` wrapping `climate_schema()` (there it
picks a device protocol rather than a zone, but the mechanics are identical).

### Sub-configs on a single platform entry

Some components nest each zone as an optional sub-key under one platform entry instead (`zone_1:`, `zone_2:` under a
single `- platform: multizone_hvac`). Unlike `sensor_schema()`, `climate_schema()` requires a class argument, so each
sub-config still passes one explicitly, typically the same shared class:

```python
CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(MultizoneHvac),
        cv.Optional("zone_1"): climate.climate_schema(MultizoneHvacZone),
        cv.Optional("zone_2"): climate.climate_schema(MultizoneHvacZone),
    }
).extend(cv.COMPONENT_SCHEMA)
```

No `SUB_CLIMATE` macro exists, so declare the pointer members and setters by hand, and null-check them before use:

```cpp
class MultizoneHvac : public Component {
 public:
  void set_zone_1_climate(climate::Climate *c) { this->zone_1_climate_ = c; }
  void set_zone_2_climate(climate::Climate *c) { this->zone_2_climate_ = c; }
 protected:
  climate::Climate *zone_1_climate_{nullptr};
  climate::Climate *zone_2_climate_{nullptr};
};
```

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its climate zones, so let the hardware decide:

- **Sub-configs** fit when the zones are read and driven together as part of one controller's single transaction -
  for example a small multi-zone controller that always reports all of its zones at once. This keeps one physical
  controller to one YAML block.
- **A hub plus `type`** fits when the zones are genuinely independent things that happen to share a connection -
  especially when a hub component already exists because the device or transport must be configured once, or when
  the set of zones is large, open-ended, or different zones need different C++ classes or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.
In a new component with no hub, sub-configs are usually the smaller change.

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component) for a fully worked example of both patterns.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
