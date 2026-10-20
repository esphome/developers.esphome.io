---
title: "Infrared and RF frames with remote_base"
---

`remote_base` holds the timings that `remote_transmitter` sends and `remote_receiver` reads, as a list of marks
(carrier on) and spaces (carrier off) in microseconds. Climate IR drivers and other components that build or parse
their own frames work on these lists directly.

## Sending

`transmit_state()` fills a `RemoteTransmitData` and sends it:

```cpp
auto transmit = this->transmitter_->transmit();
auto *data = transmit.get_data();
data->set_carrier_frequency(38000);
data->item(HEADER_MARK, HEADER_SPACE);  // a mark then a space
...
data->mark(BIT_MARK);
transmit.perform();
```

## Reading

`on_receive()` gets a `RemoteReceiveData` and walks it with the `expect_*` calls. Each one advances only when the
next timings match within the receiver's tolerance, so a failed check leaves the position where it was:

```cpp
bool MyClimate::on_receive(remote_base::RemoteReceiveData data) {
  if (!data.expect_item(HEADER_MARK, HEADER_SPACE))
    return false;
  ...
}
```

## Frame bytes

Most IR frames send each byte as eight bits, each a fixed mark followed by a long space for 1 or a short space
for 0. Describe the bit with a `remote_base::BitTimings` and pass it as the template argument to send or read a byte
array in one call, instead of writing the bit loop:

```cpp
static constexpr remote_base::BitTimings BIT_TIMINGS{.bit_mark = 465, .one_space = 1750, .zero_space = 670};

data->item_bytes<BIT_TIMINGS>(remote_state, sizeof(remote_state));

uint8_t state_frame[STATE_FRAME_SIZE];
if (!data.expect_bytes<BIT_TIMINGS>(state_frame, sizeof(state_frame)))
  return false;
```

- Bits go least significant first; set `.bit_order = remote_base::BitOrder::BIT_ORDER_MSB_FIRST` in the `BitTimings`
  for protocols that send the most significant bit first.
- `expect_bytes` returns false at the first bit whose space matches neither length, leaving that item unread. Only
  whole bytes are written to `out`, so the buffer does not need to be zeroed first.
- Frames with gaps or separators between groups of bytes use one call per group, with the separator items between.
- Fill `BitTimings` with designated initializers so the two spaces cannot be swapped. As a template argument it
  keeps no timings object in RAM.

These helpers were added in ESPHome 2026.11.0.
