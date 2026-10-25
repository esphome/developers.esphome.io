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

`on_receive()` gets a `RemoteReceiveData` and walks it with the `expect_*` calls. `expect_item`, `expect_mark` and
`expect_space` advance only when the next timings match within the receiver's tolerance, so a failed check leaves the
position where it was:

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
```

In `transmit_state()`, where `data` is the `RemoteTransmitData *`:

```cpp
data->item_bytes<BIT_TIMINGS>(remote_state, sizeof(remote_state));
```

In `on_receive()`, where `data` is the `RemoteReceiveData`:

```cpp
uint8_t state_frame[STATE_FRAME_SIZE];
if (!data.expect_bytes<BIT_TIMINGS>(state_frame, sizeof(state_frame)))
  return false;
```

- Bits go least significant first; set `.bit_order = remote_base::BitOrder::BIT_ORDER_MSB_FIRST` in the `BitTimings`
  for protocols that send the most significant bit first.
- `expect_bytes` returns false at the first bit whose mark and space do not both match the one or the zero timings,
  leaving that item unread. The bits before it stay read, so the position does not go back to the start of the call.
  Only whole bytes are written to the output buffer, so it does not need to be zeroed first.
- Frames with gaps or separators between groups of bytes use one call per group, with the separator items between.
- Fill `BitTimings` with designated initializers so the two spaces cannot be swapped. As a template argument it
  keeps no timings object in RAM.

### Bits whose mark also varies

Some protocols carry the bit in the mark as well, or send each bit's space before its mark. Set `one_mark` and
`zero_mark` (both default to `bit_mark`, which is unused once both are set) and `space_first`:

```cpp
// A one is a 750 us space then a 1460 us mark, a zero is a 1460 us space then a 750 us mark
static constexpr remote_base::BitTimings BIT_TIMINGS{
    .one_space = 750, .zero_space = 1460, .one_mark = 1460, .zero_mark = 750, .space_first = true};
```

Designated initializers must follow the declaration order: `bit_mark`, `one_space`, `zero_space`, `bit_order`,
`one_mark`, `zero_mark`, `space_first`. Mark first or space first, a bit is read only when its mark and its space match the same
value.

When the last bit of a frame is only a mark, because its space runs into the gap after the frame, read the bytes with
`expect_bytes_last_mark` instead. It needs `one_mark` and `zero_mark` to differ and works only for mark-first bits:

```cpp
// A one is a 750 us mark then a 350 us space, a zero a 350 us mark then a 750 us space
static constexpr remote_base::BitTimings MARK_TIMINGS{.one_space = 350,
                                                      .zero_space = 750,
                                                      .bit_order = remote_base::BitOrder::BIT_ORDER_MSB_FIRST,
                                                      .one_mark = 750,
                                                      .zero_mark = 350};

uint8_t frame[5];
if (!data.expect_bytes_last_mark<MARK_TIMINGS>(frame, sizeof(frame)))
  return false;
```

To send such a frame, use `item_bytes` as usual: it sends the last bit's space too, which simply lengthens the gap
after the frame.

These helpers were added in ESPHome 2026.11.0.
