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

When the component is created with `cg.new_Pvariable()`, `uart.new_uart_component()` creates it, registers it as a
component and registers it on the UART in one call:

```python
# Before
var = cg.new_Pvariable(config[CONF_ID])
await cg.register_component(var, config)
await uart.register_uart_device(var, config)

# After
var = await uart.new_uart_component(config)
```

Arguments after `config` go to the constructor, for example `await uart.new_uart_component(config, config[CONF_MODE])`.
[I2C](/architecture/components/i2c#python) and [SPI](/architecture/components/spi#python) have the same helper.

### Forwarding UARTs

A component that is itself a UART but passes on the bytes of another UART has no baud rate, data bits, parity or stop
bits of its own. Devices on it that require them would be rejected. `uart.inherit_settings(uart_id, source_id)` makes
`final_validate_device_schema()` check those devices against the settings of the source UART instead, following every
hop. No pins are checked on a forwarding UART: `require_tx` and `require_rx` apply to hardware UARTs only.

Call it from `CONFIG_SCHEMA`. `to_code` runs after final validation, so a call there is always too late. Final
validation runs in YAML order, so a call from final validation can miss devices that were checked before it. `inherit_settings` is a plain function, not a coroutine:

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

Unlike `read_available()`, it keeps reading while bytes arrive, so call it before a command rather than on a device
that sends without pause. It stops if a read fails. It is available in ESPHome 2026.11.0 and later
(esphome/esphome#21029).

## Holding the TX line low

Some devices take a low TX line that lasts much longer than a character as a signal, for example to restart their
receiver. `set_tx_break()` on `UARTComponent` holds the TX line at the level opposite to idle until it is released.
That is low for a TX pin that is not inverted. It is compiled in only when a component asks for it in `to_code`:

```python
from esphome.components import uart
from esphome.types import ConfigType


async def to_code(config: ConfigType) -> None:
    var = await uart.new_uart_component(config)
    uart.request_tx_break()
```

`request_tx_break()` is a plain function, not a coroutine. It adds the `USE_UART_TX_BREAK` define, so guard the C++
that calls `set_tx_break()` with a define of the component or with `USE_UART_TX_BREAK`:

```cpp
void MyDevice::start_reset_() {
  this->flush();
  if (!this->parent_->set_tx_break(true)) {
    ESP_LOGE(TAG, "UART bus cannot hold TX low");
    return;
  }
  this->break_start_ = millis();
  this->break_active_ = true;
}

void MyDevice::loop() {
  if (this->break_active_) {
    if (millis() - this->break_start_ < RESET_TIME_MS)
      return;
    this->break_active_ = false;
    this->parent_->set_tx_break(false);
  }
  this->read_available([this](uint8_t b) { this->handle_char_(b); });
}
```

Details:

- It returns `false` when the bus cannot do it: no TX pin, or a UART that is not a pin of the microcontroller, such
  as `usb_uart`, `tcp_uart`, `uart_mux`, `ble_nus` and the host platform, which keep the default implementation.
  ESP32 and LibreTiny also return `false` for a bus that failed its setup, and a LibreTiny hardware port for an
  inverted `tx_pin`, which it cannot drive to the break level. LibreTiny software serial returns `false` as well:
  it sends from a timer and its `flush()` does not wait for the bytes to leave.
- Every `set_tx_break(true)` that returned `true` must be followed by `set_tx_break(false)`. Nothing can be sent
  until then.
- Write nothing while the line is held, and call `flush()` first so a frame in flight is not cut. Do not block for
  the time of the break: release it from `loop()` or a timeout, as above.
- On LibreTiny the port is closed while the line is held and opened again on release, so bytes that arrive in
  between are lost. A release without a break before it does nothing. Do not read during the break on any platform.
- `load_settings()` on ESP32 and ESP8266 applies a held break again. The line can leave the break level for a moment
  while the port is set up.
- A component that needs the line physically low should reject an inverted `tx_pin` and a bus without one in its
  final validation. `uart.NATIVE_UART_CLASSES` holds the class names of the UARTs of the microcontroller:

  ```python
  bus = fv.get_declaring_config(config[CONF_UART_ID])
  if str(bus[CONF_ID].type) not in uart.NATIVE_UART_CLASSES or CONF_TX_PIN not in bus:
      raise cv.Invalid("requires a UART bus of the microcontroller with a tx_pin")
  if bus[CONF_TX_PIN].get(CONF_INVERTED, False):
      raise cv.Invalid("requires a tx_pin that is not inverted")
  ```

How each platform holds the line:

| Platform | Hardware UART | Software serial / PIO |
| -------- | ------------- | --------------------- |
| ESP32 | TX signal inverted with `uart_set_line_inverse()` | not applicable |
| ESP8266 | break bit of the UART (`UCBRK`) | pin written as a GPIO |
| RP2040 | pad output override (`gpio_set_outover()`) | pad output override |
| LibreTiny | port closed, pin driven as a GPIO, port opened again | not supported, returns `false` |

The `tuya` component uses it for `mcu_watchdog` with `action: reset` (esphome/esphome#22914).

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

A component that reads the UART for itself claims it in its final validation:

```python
from esphome.components import uart
from esphome.types import ConfigType

DOMAIN = "my_bridge"


def _final_validate(config: ConfigType) -> None:
    uart.claim_exclusive(config, DOMAIN)


FINAL_VALIDATE_SCHEMA = _final_validate
```

`uart.claim_exclusive(config, owner, conf_key="uart_id")` is a plain function, not a coroutine. It claims the UART
that `config[conf_key]` names and rejects a second claim of that UART by the same owner, even under another key, any
other component that names it by `uart_id` or `conf_key`, and a `dummy_receiver` in the UART's `debug`. `owner` is the
component's top-level config key: the check skips that domain and keeps the claims per owner in
`fv.full_config.get().data["uart_exclusive"]`.
Grouped CI builds share one bus between components, so in testing mode other components are not checked. `uart_tcp`
uses it, and the `cdc_acm_uart` bridge platform claims both its `uart_id` and its `usb_cdc_acm_id` with the owner
`bridge`, so a second bridge on the same UART or the same CDC-ACM interface is rejected.

Finding other components is best effort: bare `id:` references, such as a `uart.write` action, and lambdas are missed.

For other messages or rules, check by hand with `subtree_references_uart()`:

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

The manual check is best effort: further arguments name the keys to search instead of the default `uart_id`, so
`subtree_references_uart(domain_conf, uart_id, CONF_UART_ID, "bridge_uart_id")` finds the UART under either key and
each key must match exactly, but bare `id:` references, such as a `uart.write` action, and lambdas are not found. The
loop above skips the component's own domain, which fits a top-level, single-instance component; a platform (whose config
sits under `sensor:` and the like) or a `MULTI_CONF` component must skip its own config node instead, or it rejects
itself and misses a second instance on the same bus.

## Reading text lines

Devices that send text, one reading per line, need the bytes collected until the line ends. `LineReader` from
`esphome/core/line_reader.h` does this in a fixed buffer, with no `std::string` and no heap use. It takes bytes from any
source, not only a UART:

```cpp
// smt100.h
#include "esphome/core/line_reader.h"

LineReader<MAX_LINE_LENGTH, '\r', '\n'> line_reader_;
```

```cpp
// smt100.cpp
void SMT100Component::loop() {
  while (this->available() != 0) {
    const int readch = this->read();
    if (readch <= 0)
      continue;
    char *line = this->line_reader_.feed(readch);
    if (line != nullptr && line[0] != '\0') {
      char *token = strtok(line, ",");
      ...
    }
  }
}
```

`LineReader<N, TERMINATOR_CHAR = '\n', IGNORE_CHAR = '\r'>` has a buffer of `N` bytes, so a line holds up to `N - 1`
characters. `TERMINATOR_CHAR` ends a line and is not stored. `IGNORE_CHAR` is dropped wherever it appears; set it to
`'\0'` to drop nothing but NUL bytes. `feed()` takes one byte and returns the finished line, ending in a NUL, or
`nullptr` while the line is not complete; `feed(c, len)` also sets `len` to the line's length. The line stays valid
until the next call on the reader, and the caller may change it, for example with `strtok()`. Empty lines are returned
too, as an empty string.

A line longer than `N - 1` characters is dropped up to its terminator, and `overflowed()` is `true` right after the
byte that made it too long. A device that does not always end its lines can use that moment to report the start of
the line and start again, as `hrxl_maxsonar_wr` does:

```cpp
size_t len;
const char *line = this->line_reader_.feed(data, len);
if (line != nullptr) {
  this->handle_line_(line, len);
} else if (this->line_reader_.overflowed()) {
  ESP_LOGW(TAG, "Invalid data read from sensor: %s", this->line_reader_.partial());
  this->line_reader_.reset();
}
```

`partial()` returns the line collected so far, for prompts that have no line end. `reset()` forgets it and starts a new
line with the next byte, `restart_with(c)` starts a new line with `c`, and `discard_line()` drops everything up to the
next terminator. `log_if_overflowed(TAG)` logs one shared warning when a line was dropped; a component that calls it
adds `cg.add_define("USE_LINE_READER")` in its `to_code`, which compiles that shared code in. Besides the buffer the
reader keeps one byte for its position, or two bytes when `N` is 254 or more.

## Reading binary frames

Many devices send fixed-length binary frames that start with one or more header bytes. `FrameReader` from
`esphome/core/frame_reader.h` is the binary twin of `LineReader`: it skips bytes until a header starts, collects the
frame in a fixed buffer and returns it once it is complete. The header bytes are template arguments, so on ESP8266 no
header table is placed in RAM. Checking the checksum stays with the caller:

```cpp
// ds1603l.h
#include "esphome/core/frame_reader.h"

FrameReader<FRAME_SIZE, HEADER_BYTE> reader_;
```

```cpp
// ds1603l.cpp
void DS1603L::loop() {
  uint8_t byte;
  while (this->available() > 0 && this->read_byte(&byte)) {
    const uint8_t *frame = this->reader_.feed(byte);
    if (frame == nullptr)
      continue;
    if (!this->parse_data_(frame))
      this->reader_.resync();
  }
}
```

`FrameReader<N, HEADER...>` holds `N` bytes, header included, and takes 1 to 8 header bytes. `feed()` takes one
byte and returns the finished frame or `nullptr`. The frame stays valid until the next call on the reader. When a
header breaks partway through, the reader looks for a new header in the bytes it already matched, so a byte that could
start the next frame is never lost, even with a repeated header such as `0xAA 0xAA 0xBB`.

When the caller rejects a frame, for example because the checksum is wrong, `resync()` drops its first byte and looks
for a header in the rest. This recovers when a header byte that appeared in the payload was taken as the start of the
frame. Call it only right after `feed()` returned the frame, and use `reset()` otherwise.

`length()` is the number of bytes collected so far, which is 0 while the reader is looking for a header. `reset()`
forgets the partial frame, for example after sending a new command or after a timeout. Besides the buffer the reader
keeps one byte for its position, or two bytes when `N` is more than 255. It is available in ESPHome 2026.11.0 and
later (esphome/esphome#21446).
