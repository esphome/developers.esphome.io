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

## Reading what has arrived

A component that parses a byte stream usually reads everything the UART has received on each pass of `loop()`.
Reading in blocks costs less than one call per byte. `read_available()` on `UARTDevice` reads the bytes available
now through a buffer on the stack and calls a function for each byte. It replaces the `available()` and
`read_array()` batching loop that many components used to carry:

```cpp
void Tuya::loop() {
  this->read_available([this](uint8_t b) { this->handle_char_(b); });
  process_command_queue_();
}
```

`read_available_chunks()` does the same but calls the function once per block, as
`(const uint8_t *data, size_t len)`, for code that copies or scans whole blocks. Details:

- The buffer is 64 bytes by default. Both helpers take another size as the template argument.
- Only the bytes that were available when the call started are read, so a fast sender cannot keep `loop()` busy.
  To read a set number of bytes instead, pass it after the function; it must not be more than `available()`:

  ```cpp
  this->read_available_chunks<128>([this](const uint8_t *data, size_t len) { this->parse_(data, len); }, count);
  ```

- If the function returns `bool`, returning `false` stops the reading. With `read_available()`, the rest of the
  current block has already been taken from the UART and is lost. A function that returns `void` always continues.
- Both return `false` only when a read from the UART fails; stopping early still returns `true`.

A device that answers each command usually needs any old bytes dropped before the next command is sent, so a late
reply is not read as the new one. `discard_available()` reads and drops everything waiting in the receive buffer:

```cpp
void MyDevice::send_command_(const uint8_t *command, size_t len) {
  this->discard_available();
  this->write_array(command, len);
}
```

It keeps reading while bytes arrive and stops if a read fails.

## UARTs Without Line Timing

On a serial line, bytes arrive at the pace of the baud rate, so a reader can find the end of a frame from a quiet gap,
such as the 3.5 characters that end a Modbus RTU frame. Some UARTs hand over received bytes in packets instead, and a
gap between them says nothing about where a frame ends:

- `tcp_uart` reads whatever bytes the network has delivered so far, in chunks timed by the network rather than by
  the line; its baud rate is only a placeholder.
- A `usb_uart` channel receives USB packets from the adapter; an FTDI chip, for example, holds bytes for up to 16 ms
  by default (its latency timer).
- `usb_cdc_acm` learns its baud rate only when the host opens the port.
- `ble_nus` receives BLE packets.

These UARTs mark their declared id with `uart.mark_unclocked` in `CONFIG_SCHEMA`. A new UART like them, a component
that provides a `uart::UARTComponent` rather than a `UARTDevice`, does the same:

```python
import esphome.codegen as cg
from esphome.components import uart
import esphome.config_validation as cv

AUTO_LOAD = ["uart"]

my_link_ns = cg.esphome_ns.namespace("my_link")
MyLink = my_link_ns.class_("MyLink", uart.UARTComponent, cg.Component)

CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.All(cv.declare_id(MyLink), uart.mark_unclocked),
    }
).extend(cv.COMPONENT_SCHEMA)
```

A UART device that ends a frame after a quiet gap calls `uart.is_unclocked(config[CONF_UART_ID])` from `to_code`
(`CONF_UART_ID` is in `esphome.const`) and waits longer on such a UART, or does not rely on the gap. The marks are made
while the schemas run, so every `to_code` sees them, whatever the order of the YAML. `is_unclocked()` compares ids by
name, so a generated id is found too. Both are plain functions, not coroutines.

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

It returns `size_t`, so `std::min` with a `size_t` length works as shown. What it returns:

- Where the driver reports its TX room, `available_for_write()`; 0 means the TX buffer is full.
- Otherwise, the bytes the line carries at 10 bits per byte (8N1) in the time since `last_write_ms`, a loop start
  time from `App.get_loop_component_start_time()`. That time is capped at one loop interval and at 4 s, whichever is
  smaller.
- Never less than one byte. At a low baud rate a loop that wakes often can therefore still get ahead of the line.

`uart_tcp` uses it.

A component that reads the UART for itself can reject other users in its final validation:

```python
from esphome.components import uart
import esphome.config_validation as cv
from esphome.const import CONF_UART_ID
from esphome.core import CORE
import esphome.final_validate as fv
from esphome.types import ConfigType

DOMAIN = "my_bridge"


def _final_validate(config: ConfigType) -> ConfigType:
    uart_id = str(config[CONF_UART_ID])
    # Grouped CI builds share one bus between components.
    if CORE.testing_mode:
        return config
    for domain, domain_conf in fv.full_config.get().items():
        if domain != DOMAIN and uart.subtree_references_uart(domain_conf, uart_id):
            raise cv.Invalid(
                f"The UART '{uart_id}' is also used by '{domain}'. "
                f"{DOMAIN} requires exclusive use of that UART.",
                [CONF_UART_ID],
            )
    return config


FINAL_VALIDATE_SCHEMA = _final_validate
```

The check is best effort: the third argument, `conf_key`, finds the UART under another key than `uart_id`, but bare
`id:` references, such as a `uart.write` action, and lambdas are not found. The loop above skips the component's own
domain, which fits a top-level, single-instance component; a platform (whose config sits under `sensor:` and the like)
or a `MULTI_CONF` component must skip its own config node instead, or it rejects itself and misses a second instance
on the same bus. `uart_tcp` runs the check exactly as shown. The `cdc_acm_uart` bridge platform skips its whole
`bridge:` domain and records the ids it has claimed in `fv.full_config.get().data`, so a second bridge on the same
UART is rejected too.
