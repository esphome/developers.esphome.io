# Interfacing via I2C

We have an example, minimal I2C-based component
[here](https://github.com/esphome/starter-components/tree/main/components/empty_i2c_component).

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
CONF_I2C_ADDR = 0x01
```

All I2C devices will have at least one address which the I2C device responds to. This is configured here.
Note that some components do not use a constant here and instead hard-code the address below.

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

This defines the configuration schema for the component as discussed [here](index.md#configuration-validation).
In particular, note that the schema is extended with `.extend(i2c.i2c_device_schema(CONF_I2C_ADDR))` since this is an
I2C component/platform.

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

As mentioned [here](/contributing/code/#c), all components/platforms must inherit from either `Component` or
`PollingComponent`; our example here is no different. Note that, since it's an I2C device, it also inherits from
`I2CDevice`.

Finally, the component implements the usual set of methods [as described here](index.md#common-methods). This is all
that's required for our minimal I2C component!
