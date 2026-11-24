---
title: "CAN bus"
---

A component that talks a protocol over CAN, such as a CANopen stack, takes a `canbus::Canbus *` and works on the
frames the bus receives. The header is `esphome/components/canbus/canbus.h`.

## Receiving frames

Register with `add_frame_callback()`. The callback gets every received frame as a `const CanFrame &`, which is only
valid during the call, so copy out what you need to keep. `payload_length()` gives the number of data bytes for the
frame's DLC (classic or CAN FD), and `payload()` returns them as a `CanPayload` on the stack.

```cpp
void MyNode::setup() {
  this->canbus_->add_frame_callback([this](const canbus::CanFrame &frame) {
    if (frame.can_id == this->node_id_ && !frame.remote_transmission_request)
      this->handle_(frame.data, frame.payload_length());
  });
}
```

`add_frame_callback()` replaces `add_callback()`, which copies the payload into a `std::vector` and is deprecated.
It is available in ESPHome 2026.12.0 and later (esphome/esphome#22008).

## Waiting for the receive queue to drain

`Canbus::loop()` hands at most `max_frames_per_loop` frames to the callbacks in one pass and leaves the rest for the
next one. `rx_capped()` is true when the last pass stopped at that limit, so more frames may still be waiting. A
component that should only act once the queue is empty, for example to answer a request only after every frame that
arrived before it, checks it in its own `loop()`:

```cpp
void MyNode::loop() {
  if (this->canbus_->rx_capped())
    return;  // more frames may be queued; the next pass of the canbus loop delivers them
  this->process_pending_();
}
```

While frames keep arriving at least as fast as `max_frames_per_loop` per pass, every pass hits the limit and this
check keeps deferring the work. Raise `max_frames_per_loop`, or skip only a bounded number of passes, if the component
must make progress on a busy bus.

It is available in ESPHome 2026.12.0 and later (esphome/esphome#23247).
