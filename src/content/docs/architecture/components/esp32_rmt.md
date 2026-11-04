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
    await cg.register_component(var, config)
    esp32_rmt.register_rmt_channel(config)
```

A component with its own final validation calls `esp32_rmt.final_validate_rmt_channels(config)` from it instead.

The combined checks are skipped in `--testing-mode`, where component test grouping merges the RMT components of many
test configs into one build. `esp32_rmt.validate_rmt_not_supported(keys)` rejects RMT-only keys on variants without
RMT (`esp32_rmt.VARIANTS_NO_RMT`).
