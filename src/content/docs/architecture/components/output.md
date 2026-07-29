---
title: "Output"
---

The `output` component is a hardware abstraction base, not an [entity](/architecture/components/index). It represents
something that can be driven to a state - a GPIO pin, a PWM channel, a DAC - without being shown to the user directly.
Outputs are *consumed* by other components: a [light](/architecture/components/light) or [fan](/architecture/components/fan)
platform might own one to drive its hardware, and the `output.turn_on` / `output.turn_off` / `output.set_level` actions let
users control a standalone output straight from YAML.

There are two flavors:

- `output::BinaryOutput`: a simple on/off output.
- `output::FloatOutput`: a variable-level output in the range `0.0` (off) to `1.0` (fully on), such as a PWM duty cycle.
  `FloatOutput` inherits from `BinaryOutput`, so a float output can always be used wherever a binary output is expected -
  `1.0` and `0.0` stand in for on and off.

We have two example, minimal components to start from:
[`empty_binary_output`](https://github.com/esphome/starter-components/tree/main/components/empty_binary_output) and
[`empty_float_output`](https://github.com/esphome/starter-components/tree/main/components/empty_float_output).

## Python

An output platform lives in an `output.py` file (or `output/__init__.py` package) inside your component's directory,
allowing the user to configure it under the `output:` block:

```yaml
output:
  - platform: my_component
    id: my_output
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import output
from esphome.const import CONF_ID

my_output_ns = cg.esphome_ns.namespace("my_output")
MyOutput = my_output_ns.class_("MyOutput", output.FloatOutput, cg.Component)
```

Note that `MyOutput` inherits from both `output.FloatOutput` (or `output.BinaryOutput`) and a component base
(`cg.Component` here).

### Configuration schema

Unlike `sensor` or `switch`, the `output` module has no `output_schema()` / `new_output()` pair. Instead you extend the
base schema directly - `output.BINARY_OUTPUT_SCHEMA` or `output.FLOAT_OUTPUT_SCHEMA` - which supplies the options common
to every output (`inverted`, `power_supply`, and for float outputs `min_power` / `max_power` / `zero_means_zero`).
Because there is no helper to declare the ID for you, you add `CONF_ID` to the schema yourself:

```python
CONFIG_SCHEMA = output.FLOAT_OUTPUT_SCHEMA.extend(
    {
        cv.Required(CONF_ID): cv.declare_id(MyOutput),
    }
).extend(cv.COMPONENT_SCHEMA)
```

### Code generation

There is no `new_output()` helper either. In `to_code`, create the variable yourself with `cg.new_Pvariable()`, then call
`output.register_output()` to apply the common options (`inverted`, `power_supply`, `min_power`/`max_power` for float
outputs) from the configuration:

```python
async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await output.register_output(var, config)
    await cg.register_component(var, config)
```

## C++

The C++ class inherits from `output::BinaryOutput` or `output::FloatOutput` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/output/float_output.h"

namespace esphome::my_output {

class MyOutput : public output::FloatOutput, public Component {
 public:
  void dump_config() override;

 protected:
  void write_state(float state) override;
};

}  // namespace esphome::my_output
```

### Writing state to hardware

The one method you *must* implement is the protected virtual `write_state()`. There is no `control()`/`Call` object here
- callers (other components, or the `output.turn_on` / `output.set_level` actions) call the public `turn_on()`,
`turn_off()`, `set_state(bool)` or `set_level(float)` methods on the base class, which apply inversion (and, for
`FloatOutput`, power-supply requesting plus min/max power scaling when `USE_OUTPUT_FLOAT_POWER_SCALING` is enabled)
before calling your `write_state()` with the already-adjusted value:

```cpp
void MyOutput::write_state(float state) {
  // `state` has already had inversion and power scaling applied - just drive the hardware.
  this->write_pwm_duty_(state);
}
```

For a binary output the override is `void write_state(bool state) override;` instead, and it likewise receives the
already-inverted value.

There is no `publish_state()` to call back: an output has no front-end state to report. The component that owns the
output (a light, fan, or the `output.set_level` action) is responsible for tracking and exposing whatever state it cares
about.

### Useful members

- `is_inverted()`: whether the user configured `inverted: true`.
- `get_min_power()` / `get_max_power()`: the configured power-scaling bounds for a `FloatOutput` (`0.0`/`1.0` when power
  scaling is not compiled in).
- `LOG_BINARY_OUTPUT(this)` / `LOG_FLOAT_OUTPUT(this)`: convenience macros for `dump_config()` that log the inversion
  (and, for float outputs, min/max power) state in the standard format.

## Exposing multiple outputs from one component

Outputs are multiple by nature: PWM drivers, I/O expanders and shift registers all drive many channels from one chip. So
unlike the entity types, outputs are rarely modelled as sub-configs nested under a single entry. Instead the hub owns the
chip and each channel is its own `output:` platform entry, which is what lets the user point a separate light, fan or
`output.set_level` action at each one.

### Homogeneous channels: a per-channel key

When every channel behaves identically and only its index differs, give the platform a required channel key and a
`use_id` reference back to the hub.
[`pca9685`](https://github.com/esphome/esphome/tree/dev/esphome/components/pca9685) is the canonical example:

```yaml
pca9685:
  frequency: 500Hz

output:
  - platform: pca9685
    id: red_channel
    channel: 0
  - platform: pca9685
    id: green_channel
    channel: 1
```

```python
from esphome.const import CONF_CHANNEL, CONF_ID

from . import PCA9685Output, pca9685_ns

DEPENDENCIES = ["pca9685"]

CONF_PCA9685_ID = "pca9685_id"

CONFIG_SCHEMA = output.FLOAT_OUTPUT_SCHEMA.extend(
    {
        cv.Required(CONF_ID): cv.declare_id(PCA9685Channel),
        cv.GenerateID(CONF_PCA9685_ID): cv.use_id(PCA9685Output),
        cv.Required(CONF_CHANNEL): cv.int_range(min=0, max=15),
    }
)


async def to_code(config):
    paren = await cg.get_variable(config[CONF_PCA9685_ID])
    var = cg.new_Pvariable(config[CONF_ID])
    cg.add(var.set_channel(config[CONF_CHANNEL]))
    cg.add(paren.register_channel(var))
    await output.register_output(var, config)
```

Note that the hub is handed the channel via its own `register_channel()` method, so it knows which of its outputs to
write when it flushes to hardware.

### Heterogeneous channels: a `type` key

If the channels are *not* interchangeable - some binary, some float, or backed by different registers - use
`cv.typed_schema()` with `key=CONF_TYPE` so each variant gets its own schema, its own C++ class and the correct base
schema. `modbus_controller`'s output platform does exactly this, distinguishing a `coil` (binary) from a `holding`
register (float):

```python
CONFIG_SCHEMA = cv.typed_schema(
    {
        "coil": output.BINARY_OUTPUT_SCHEMA.extend(
            {
                cv.GenerateID(): cv.declare_id(ModbusBinaryOutput),
                cv.Required(CONF_ADDRESS): cv.positive_int,
            }
        ),
        "holding": output.FLOAT_OUTPUT_SCHEMA.extend(
            {
                cv.GenerateID(): cv.declare_id(ModbusFloatOutput),
                cv.Required(CONF_ADDRESS): cv.positive_int,
            }
        ),
    },
    key=CONF_TYPE,
)
```

> [!NOTE]
> Pick the per-channel key when the channels are interchangeable and only an index distinguishes them, and `type` when
> they need genuinely different schemas or C++ classes. Either way, keep one `output:` entry per channel rather than
> nesting them as sub-configs - consumers reference outputs by ID, so each one has to be independently addressable.

For a comparison with how the entity types handle this, see
[Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component).

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
