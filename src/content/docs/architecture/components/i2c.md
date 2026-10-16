---
title: "Interfacing via I2C"
---

We have an [example, minimal I2C-based component](https://github.com/esphome/starter-components/tree/main/components/empty_i2c_component).

Let's take a closer look at this example.

## Python

In addition to the usual requisite imports, we have:

```python
from esphome.components import i2c
```

This allows us to use some functions we'll need for validation and code generation later on.

```python
DEPENDENCIES = ["i2c"]
```

Given that this component will use--and consequently depend on--I2C, we must add it as a dependency. This allows
ESPHome to understand this requirement and generate an error if it is not met.

```python
empty_i2c_component_ns = cg.esphome_ns.namespace("empty_i2c_component")
EmptyI2CComponent = empty_i2c_component_ns.class_(
    "EmptyI2CComponent", cg.Component, i2c.I2CDevice
)
```

This is some boilerplate code which allows ESPHome code generation to understand the namespace and class names that the
component will use. Note that `EmptyI2CComponent` is inheriting from both `Component` and `I2CDevice`.

```python
CONFIG_SCHEMA = ...
```

This defines the configuration schema for the component as discussed in [Configuration validation](/architecture/components/index#configuration-validation).
In particular, note that the schema is extended with `.extend(i2c.i2c_device_schema(0x01))` since this is an I2C
component/platform. The `0x01` value is the default I2C address for the device to be used by this component/platform.

Finally, in the `to_code` function, we have:

```python
await i2c.register_i2c_device(var, config)
```

Since this is an I2C device, we must register it as such so it is handled appropriately by ESPHome.

## C++

The C++ class for this example component is quite simple.

```c
class EmptyI2CComponent : public i2c::I2CDevice, public Component { ... };
```

As mentioned in the [codebase standards](/contributing/code/#c), all components/platforms must inherit from either `Component` or
`PollingComponent`; our example here is no different. Note that, since it's an I2C device, it also inherits from
`I2CDevice`.

Finally, the component implements the usual set of methods [as described here](/architecture/components/index#common-methods). This is all
that's required for our minimal I2C component!

## Writing a list of registers

Chips such as audio codecs are set up by writing a long, fixed list of registers. Keep the list as a table of
`i2c::I2CRegValue` entries, one register and one value each, and send it with `write_registers()`:

```cpp
static constexpr i2c::I2CRegValue ES8156_INIT[] PROGMEM = {
    // REG02 MODE CONFIG 1: Enable software mode for I2C control of volume/mute
    {ES8156_REG02_SCLK_MODE, 0x04},
    // REG20 ANALOG SYSTEM: Configure analog signal path
    {ES8156_REG20_ANALOG_SYS1, 0x2A},
    ...
    {ES8156_REG25_ANALOG_SYS5, 0x20},
};

void ES8156::setup() {
  if (!this->write_registers(ES8156_INIT))
    this->mark_failed(LOG_STR("Failed to initialize"));
}
```

The entries are written in order, each as its own transfer, and `write_registers()` stops and returns `false` at the
first one that fails. Mark the table `PROGMEM` so it stays in flash on ESP8266; `write_registers()` copies one entry at
a time out of flash. The same register may appear more than once, for steps such as a reset sequence. Passing the
array finds its length; `write_registers(table, count)` takes a pointer and a count instead. Writes that depend on the
configuration or need a delay between them stay as separate calls around the tables.
