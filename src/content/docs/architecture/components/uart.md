---
title: "Interfacing via Serial/UART"
---

We have an [example, minimal UART-based component](https://github.com/esphome/starter-components/tree/main/components/empty_uart_component).

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

This defines the configuration schema for the component as discussed in [Configuration validation](/architecture/components/index#configuration-validation).
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

As mentioned in the [codebase standards](/contributing/code/#c), all components/platforms must inherit from either `Component` or
`PollingComponent`; our example here is no different. Note that, since it's a UART device, it also inherits from
`UARTDevice`.

Finally, the component implements the usual set of methods [as described here](/architecture/components/index#common-methods). This is all
that's required for our minimal UART component!

## UARTs Without Line Timing

On a serial line, bytes arrive at the pace of the baud rate, so a reader can find the end of a frame from a quiet gap,
such as the 3.5 characters that end a Modbus RTU frame. Some UARTs hand over received bytes in packets instead, and a
gap between them says nothing about where a frame ends:

- `tcp_uart` receives TCP segments; its baud rate is only a placeholder.
- A `usb_uart` channel receives USB packets from the adapter; an FTDI chip, for example, holds bytes for up to 16 ms
  by default (its latency timer).
- `usb_cdc_acm` learns its baud rate only when the host opens the port.
- `ble_nus` receives BLE packets.

These UARTs mark their declared id with `uart.mark_unclocked` in `CONFIG_SCHEMA`. A new UART like them does the same:

```python
import esphome.codegen as cg
from esphome.components import uart
import esphome.config_validation as cv

DEPENDENCIES = ["uart"]

my_link_ns = cg.esphome_ns.namespace("my_link")
MyLink = my_link_ns.class_("MyLink", uart.UARTComponent, cg.Component)

CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.All(cv.declare_id(MyLink), uart.mark_unclocked),
    }
).extend(cv.COMPONENT_SCHEMA)
```

A reader that ends a frame after a quiet gap calls `uart.is_unclocked(config[CONF_UART_ID])` from `to_code` and waits
longer on such a UART, or does not rely on the gap. The UART bridge
([esphome/esphome#20100](https://github.com/esphome/esphome/pull/20100)) and the Modbus gateway
([esphome/esphome#20105](https://github.com/esphome/esphome/pull/20105)) do this. The marks are made while the schemas
run, so every `to_code` sees them, whatever the order of the YAML. `is_unclocked()` compares ids by name, so a
generated id is found too. Both are plain functions, not coroutines.
