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

### Forwarding UARTs

A component that is itself a UART but passes on the bytes of another UART, such as an output of `uart_split`
([esphome/esphome#20098](https://github.com/esphome/esphome/pull/20098)), has no baud rate, data bits, parity or stop
bits of its own. Devices on it that require them would be rejected. Call
`uart.inherit_settings(uart_id, source_id)` from `CONFIG_SCHEMA`; `final_validate_device_schema()` then checks those
devices against the settings of the source UART, following every hop. No pins are checked on a forwarding UART:
`require_tx` and `require_rx` apply to hardware UARTs only. Final validation runs in YAML order, so a call from
`to_code` or from final validation can come too late. `inherit_settings` is a plain function, not a coroutine:

```python
import esphome.codegen as cg
from esphome.components import uart
import esphome.config_validation as cv
from esphome.const import CONF_ID, CONF_UART_ID
from esphome.types import ConfigType

DEPENDENCIES = ["uart"]

my_tap_ns = cg.esphome_ns.namespace("my_tap")
MyTap = my_tap_ns.class_("MyTap", uart.UARTComponent, cg.Component)


def _inherit_settings(config: ConfigType) -> ConfigType:
    uart.inherit_settings(config[CONF_ID], config[CONF_UART_ID])
    return config


CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(MyTap),
            cv.Required(CONF_UART_ID): cv.use_id(uart.UARTComponent),
        }
    ).extend(cv.COMPONENT_SCHEMA),
    _inherit_settings,
)
```

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
