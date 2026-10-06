---
title: "Virtual UART"
---

`uart::VirtualUARTComponent` is the receive half of a UART without a wire. Derive from it when a component should be
a UART to a reader, such as the `modbus` hub, but carries the bytes somewhere else, for example over TCP. The header
is `esphome/components/uart/uart_virtual.h`, and the implementation is `uart_virtual.cpp`. It is compiled only when a
component calls `uart.require_virtual_uart()`, which defines `USE_UART_VIRTUAL`.

The base owns the receive side: an RX ring, `read_array()`, `peek_byte()` and `available()`. The derived class feeds
it with `inject_rx()` and implements the send side itself: `write_array()`, `flush()` and, when the transport knows
its free room, `available_for_write()`. The UART bridge
([esphome/esphome#20100](https://github.com/esphome/esphome/pull/20100)) is the first reader that takes each block
directly.

Load `uart` with `AUTO_LOAD`, so no `uart:` block is needed. Declare the class with `uart.VirtualUARTComponent` as a
parent, so a `uart_id` that expects a UART accepts it, and call `require_virtual_uart()` from `to_code`. It is a plain
function, not a coroutine:

```python
import esphome.codegen as cg
from esphome.components import uart
import esphome.config_validation as cv
from esphome.const import CONF_ID
from esphome.types import ConfigType

AUTO_LOAD = ["uart"]

my_link_ns = cg.esphome_ns.namespace("my_link")
MyLink = my_link_ns.class_("MyLink", uart.VirtualUARTComponent, cg.Component)

CONFIG_SCHEMA = cv.Schema({cv.GenerateID(): cv.declare_id(MyLink)}).extend(
    cv.COMPONENT_SCHEMA
)


async def to_code(config: ConfigType) -> None:
    uart.require_virtual_uart()
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
```

The constructor takes the size of the RX ring. Make it hold the largest block the reader may leave unread, for
example one whole frame. In this example the transport is a loopback, so what the reader writes comes back as one
received block:

```cpp
#include "esphome/components/uart/uart_virtual.h"
#include "esphome/core/component.h"
#include "esphome/core/log.h"

namespace esphome::my_link {

static const char *const TAG = "my_link";

class MyLink final : public uart::VirtualUARTComponent, public Component {
 public:
  MyLink() : VirtualUARTComponent(256) {}

  void write_array(const uint8_t *data, size_t len) override {
    if (!this->inject_rx(data, len)) {
      ESP_LOGW(TAG, "RX full, %zu bytes dropped", len);
    }
  }
  uart::UARTFlushResult flush() override { return uart::UARTFlushResult::UART_FLUSH_RESULT_SUCCESS; }
};

}  // namespace esphome::my_link
```

- `inject_rx(data, len)` takes one whole block, for example one frame. The block goes into the RX ring whole or not
  at all: when the ring has less free room than `len`, nothing is kept and the call returns false.
- A reader that implements `uart::UARTSink` and attaches with `set_rx_sink()` gets each block in one `on_block()`
  call instead, and nothing goes into the ring. While the reader is still inside `on_block()`, a further
  `inject_rx()` returns false, so a reader that writes back cannot recurse.
- Reads never wait. A `read_array()` for more bytes than are there, or a `peek_byte()` on an empty ring, returns false
  and takes nothing. `read_array()` of 0 bytes returns true.
- The ring is allocated once, in the constructor. A size of 0 allocates no ring; use it only when a reader is always
  attached.
- `available_for_write()` keeps the base default `SIZE_MAX`: the class cannot tell its free room, so a writer hands
  over everything at once. Override it when the transport knows its free room, and `is_connected()` when the
  transport can be down.
- `load_settings()` does nothing (nothing is clocked) and `check_logger_conflict()` is empty.
- A device that checks the baud rate or framing of its UART, such as one that calls
  `final_validate_device_schema()` with `baud_rate`, rejects a virtual UART whose YAML has no such keys; a UART that
  passes on the bytes of another one can take that UART's settings, see
  [Forwarding UARTs](/architecture/components/uart/#forwarding-uarts).

> [!WARNING]
> Call `inject_rx()` and the read methods from the main loop only; the base does no locking. The `data` pointer
> passed to `on_block()` is valid only during that call, so a reader that keeps bytes must copy them.

## See Also

- [Interfacing via Serial/UART](/architecture/components/uart/)
