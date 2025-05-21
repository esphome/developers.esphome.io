# Interfacing via SPI

We have an example, minimal SPI-based component
[here](https://github.com/esphome/starter-components/tree/main/components/empty_spi_component).

Let's take a closer look at this example.

## Python

In addition to the usual requisite imports, we have:

```python
from esphome.components import spi
```

This allows us to use some functions we'll need for validation and code generation later on.

```python
DEPENDENCIES = ["spi"]
```

Given that this component will use--and consequently depend on--SPI, we must add it as a dependency. This allows
ESPHome to understand this requirement and generate an error if it is not met.

```python
empty_spi_component_ns = cg.esphome_ns.namespace("empty_spi_component")
EmptySPIComponent = empty_spi_component_ns.class_(
    "EmptySPIComponent", cg.Component, spi.SPIDevice
)
```

This is some boilerplate code which allows ESPHome code generation to understand the namespace and class names that the
component will use. Note that `EmptySPIComponent` is inheriting from both `Component` and `SPIDevice`.

```python
CONFIG_SCHEMA = ...
```

This defines the configuration schema for the component as discussed [here](index.md#configuration-validation).
In particular, note that the schema is extended with `.extend(spi.spi_device_schema(cs_pin_required=True))` since this
is an SPI component/platform. Also note that we can configure whether or not a CS pin is required for this component.

Finally, in the `to_code` function, we have:

```python
await spi.register_spi_device(var, config)
```

Since this is an SPI device, we must register it as such so it is handled appropriately by ESPHome.

## C++

The C++ class for this example component is quite simple.

```c
class EmptySPIComponent : public Component, 
                    public spi::SPIDevice<spi::BIT_ORDER_MSB_FIRST,spi::CLOCK_POLARITY_LOW, 
                            spi::CLOCK_PHASE_LEADING,spi::DATA_RATE_1KHZ> { ... };
```

As mentioned [here](/contributing/code/#c), all components/platforms must inherit from either `Component` or
`PollingComponent`; our example here is no different. Note that, since it's an SPI device, it also inherits from
`SPIDevice` which uses a C++ template to define the SPI bus parameters such as bit order, clock polarity and speed.

Finally, the component implements the usual set of methods [as described here](index.md#common-methods). This is all
that's required for our minimal SPI component!
