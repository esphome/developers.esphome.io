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

## Multi-byte values

`read_byte_16()` and `write_byte_16()` on `I2CDevice` treat the first byte on the wire as the most significant byte.
Many chips store 16-bit registers the other way round, least significant byte first. Use `read_byte_16_le()` and
`write_byte_16_le()` for those instead of swapping the bytes yourself:

```cpp
// Before
uint16_t data;
this->read_byte_16(AS7341_ASTEP, &data);
return this->swap_bytes(data);

// After
uint16_t data;
if (!this->read_byte_16_le(AS7341_ASTEP, &data))
  return 0;
return data;
```

`read_byte_16_le()` and `write_byte_16_le()` return `false` when the transfer fails. `read_bytes_16_le(reg, words, count)`
reads `count` consecutive little-endian words into a `uint16_t` or `int16_t` array, such as an accelerometer's X, Y and
Z registers. As with `read_bytes_16()`, a failed read can leave the destination partly written.

To decode values from a block read in one go, use the helpers in `esphome/core/helpers.h`: `encode_value<T>(bytes)` reads `sizeof(T)` bytes most
significant first, and `encode_value_le<T>(bytes)` reads them least significant first. Both work for signed types
too, so a signed reading needs no cast:

```cpp
// Before
const uint16_t ch0 = encode_uint16(raw[2], raw[1]);
data.acceleration[motion::X_AXIS] = static_cast<int16_t>(encode_uint16(raw_data[0], raw_data[1])) * accel_factor;

// After
const uint16_t ch0 = encode_value_le<uint16_t>(&raw[1]);
data.acceleration[motion::X_AXIS] = encode_value<int16_t>(raw_data) * accel_factor;
```
