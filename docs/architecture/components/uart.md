# Interfacing via Serial/UART

We have an example, minimal UART-based component
[here](https://github.com/esphome/starter-components/tree/main/components/empty_uart_component).

Let's take a closer look at this example.

## Python

In addition to the usual requisite imports, we have:

```python
from esphome.components import uart
```

This allows us to use some functions we'll need for validation and code generation later on.

```python
DEPENDENCIES = ["uart"]
```

Given that this component will use--and consequently depend on--a UART, we must add it as a dependency. This allows
ESPHome to understand this requirement and generate an error if it is not met.

```python
empty_uart_component_ns = cg.esphome_ns.namespace("empty_uart_component")
EmptyUARTComponent = empty_uart_component_ns.class_(
    "EmptyUARTComponent", cg.Component, uart.UARTDevice
)
```

This is some boilerplate code which allows ESPHome code generation to understand the namespace and class names that the
component will use. Note that `EmptyUARTComponent` is inheriting from both `Component` and `UARTDevice`.

```python
CONFIG_SCHEMA = ...
```

This defines the configuration schema for the component as discussed [here](index.md#configuration-validation).
In particular, note that the schema is extended with `.extend(uart.UART_DEVICE_SCHEMA)` since this is a UART
component/platform.

Finally, in the `to_code` function, we have:

```python
await uart.register_uart_device(var, config)
```

Since this is a serial device which uses a UART, we must register it as such so it is handled appropriately by ESPHome.

## C++

The C++ class for this example component is quite simple.

```c
class EmptyUARTComponent : public uart::UARTDevice, public Component { ... };
```

As mentioned [here](/contributing/code/#c), all components/platforms must inherit from either `Component` or
`PollingComponent`; our example here is no different. Note that, since it's a UART device, it also inherits from
`UARTDevice`.

Finally, the component implements the usual set of methods [as described here](index.md#common-methods). This is all
that's required for our minimal UART component!
