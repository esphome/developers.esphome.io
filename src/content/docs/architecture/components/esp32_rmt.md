---
title: "RMT channels on ESP32"
---

`esp32_rmt_led_strip`, `remote_transmitter` and `remote_receiver` each create one RMT channel, and all of them share
the chip's few RMT channels and their memory. ESPHome checks them together, so a config where one of them would fail
at boot with `no free tx channels` is caught before it is flashed. A component that creates its own RMT channel with
the ESP-IDF `rmt_new_tx_channel()` or `rmt_new_rx_channel()` joins this check with three helpers from `esp32_rmt`:

- `esp32_rmt.request_rmt_channel(direction, setup_priority)`: add it at the end of `CONFIG_SCHEMA`, after the schema
  has filled in the defaults. `direction` is `"TX"` or `"RX"`. `setup_priority` is the value your C++
  `get_setup_priority()` returns, since the channel is created in `setup()`; an entry's own `setup_priority` overrides
  it. It checks `rmt_symbols` against what ESP-IDF accepts and records the channel.
- `esp32_rmt.final_validate_rmt_channels(config)`: call it from `FINAL_VALIDATE_SCHEMA`. It fails validation when the
  components need more channels than the chip has, or when more than one of them sets `use_dma` in one direction.
- `esp32_rmt.register_rmt_channel(config)`: call it in `to_code` right after `cg.register_component()`. It records the
  order the components are registered in, which decides the order they are set up in. During code generation ESPHome
  then allocates the RMT memory in that order like ESP-IDF does, and logs a warning with a suggested `rmt_symbols` when
  a channel will not fit.

The entry needs an `id` and an `rmt_symbols` value on every variant with RMT; `use_dma` and `name` are optional and
used when present. Use all three helpers: a component that leaves one out is only partly checked.

```python
from esphome.components import esp32_rmt

CONFIG_SCHEMA = (
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(MyComponent),
            cv.Optional(CONF_RMT_SYMBOLS, default=64): cv.int_,
            cv.Optional(CONF_USE_DMA): cv.boolean,
        }
    )
    .extend(cv.COMPONENT_SCHEMA)
    # setup_priority::HARDWARE, from MyComponent::get_setup_priority()
    .add_extra(esp32_rmt.request_rmt_channel("TX", 800.0))
)

FINAL_VALIDATE_SCHEMA = esp32_rmt.final_validate_rmt_channels


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    cg.add(var.set_rmt_symbols(config[CONF_RMT_SYMBOLS]))
    cg.add_optional(var.set_with_dma, config.get(CONF_USE_DMA))
    await cg.register_component(var, config)
    esp32_rmt.register_rmt_channel(config)
```

A component with its own final validation calls `esp32_rmt.final_validate_rmt_channels(config)` from it instead.

## Channels of a fixed size

A component that creates several channels of a fixed size and has no `rmt_symbols` option uses
`esp32_rmt.request_rmt_channels(channels, setup_priority)` instead of `request_rmt_channel()`. `channels` lists the
direction and the number of memory blocks of each channel, in the order `setup()` creates them. `setup()` must stop
at the first channel it fails to create: the check does not count the channels after it. The channels do not use DMA.
All of them are recorded under the `id` of the entry, and `name` is used when present. Final validation and
`register_rmt_channel()` work as above. The error names such a component once, with its channel count, for example
`'bus' (2 channels)`. The warning lists each channel with its direction and size, for example
`'bus' (RX 48), 'bus' (TX 48)`, and names the component once among those that do not fit.

```python
# One RX and one TX channel of one memory block each, in the order setup() creates them
RMT_CHANNELS = (("RX", 1), ("TX", 1))

CONFIG_SCHEMA = cv.All(
    BASE_SCHEMA,
    # setup_priority::HARDWARE - 1, from MyBus::get_setup_priority()
    esp32_rmt.request_rmt_channels(RMT_CHANNELS, 799.0),
)

FINAL_VALIDATE_SCHEMA = esp32_rmt.final_validate_rmt_channels
```

The combined checks are skipped in `--testing-mode`, where component test grouping merges the RMT components of many
test configs into one build.

On variants without RMT (`esp32_rmt.VARIANTS_NO_RMT`), reject the RMT-only keys by adding
`.add_extra(esp32_rmt.validate_rmt_not_supported([CONF_RMT_SYMBOLS, CONF_USE_DMA]))` to
`CONFIG_SCHEMA`.
