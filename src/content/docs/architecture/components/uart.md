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

## Components that own a UART

A component that copies bytes into a UART from a faster source, such as a socket, should not block on the line.
`paced_write_room()` returns how many bytes a write can take now:

```cpp
// Members: the bytes that wait for the UART, and the loop start time of the last write.
const uint8_t *pending_{nullptr};
size_t pending_len_{0};
uint32_t last_write_ms_{0};

// Move at most what the UART can take now.
size_t n = std::min(this->parent_->paced_write_room(this->last_write_ms_), this->pending_len_);
if (n != 0) {
  this->write_array(this->pending_, n);
  this->pending_ += n;
  this->pending_len_ -= n;
  this->last_write_ms_ = App.get_loop_component_start_time();
}
```

Where the driver reports its TX room, this is `available_for_write()`, and 0 means the TX buffer is full. Otherwise it
paces to the line time at 10 bits per byte (8N1) since `last_write_ms`, a loop start time from
`App.get_loop_component_start_time()`: at most one loop interval and 4 s, and at least one byte, so at a low baud
rate a loop that wakes often can still get ahead of the line. `uart_tcp` uses it.

A component that reads the UART for itself claims it in its final validation:

```python
from esphome.components import uart
from esphome.types import ConfigType

DOMAIN = "my_bridge"


def _final_validate(config: ConfigType) -> ConfigType:
    uart.claim_exclusive(config, DOMAIN)
    return config


FINAL_VALIDATE_SCHEMA = _final_validate
```

`claim_exclusive()` claims the UART named by `config[conf_key]`; the third argument, `conf_key`, defaults to `uart_id`
and can be another key. It rejects a second `my_bridge` entry on that UART, any other component
that names it by `uart_id` or `conf_key`, and a `dummy_receiver` in the UART's `debug`. Grouped CI builds share one bus
between components, so in testing mode other components are not checked. `uart_tcp` uses it.

For other messages, `uart.subtree_references_uart(node, uart_id, conf_key="uart_id")` tells whether any part of a
config names the UART; the CDC-ACM bridge uses it. Neither finds bare `id:` references, such as a `uart.write` action,
or lambdas.
