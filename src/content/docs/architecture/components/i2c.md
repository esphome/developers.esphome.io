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

## Checking the chip ID

Most chips have a register that holds a fixed ID. Reading it in `setup()` shows that the right chip answers at the
address. `check_chip_id()` reads the register, compares it, and marks the component failed when it does not match:

```cpp
// Before
uint8_t id;
if (!this->read_byte(APDS9930_ID | APDS9930_CMD, &id)) {
  this->mark_failed(LOG_STR("Communication failed"));
  return;
}
if (id != APDS9930_CHIP_ID) {
  ESP_LOGE(TAG, "Wrong ID 0x%02X (expected 0x%02X)", id, APDS9930_CHIP_ID);
  this->mark_failed(LOG_STR("Wrong chip ID"));
  return;
}

// After
if (!this->check_chip_id(this, APDS9930_ID | APDS9930_CMD, APDS9930_CHIP_ID))
  return;
```

The first argument is the component to mark failed, since `I2CDevice` is not a component itself. The failure reason is
"Communication failed" when the read fails and "Wrong chip ID" when the ID does not match. An optional fourth argument
is a mask, for an ID register that also holds other bits or for a family of chips whose IDs differ in a few bits:

```cpp
// 0xB1 for APDS9306, 0xB3 for APDS9306-065; they differ only in bit 1
if (!this->check_chip_id(this, APDS9306_PART_ID, 0xB1, 0xFD))
  return;
```

The ID is accepted when `(id & mask) == (expected & mask)`. Keep your own code when the chip needs more than one
register read to identify, or when a wrong ID should only warn.
