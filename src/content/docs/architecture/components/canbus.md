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

## Waiting for the receive queue to drain

`Canbus::loop()` hands at most `max_frames_per_loop` frames to the callbacks in one pass and leaves the rest for the
next one. `rx_capped()` is true when the last pass stopped at that limit, so more frames may still be waiting. A
component that should only act once the queue is empty, for example to answer a request only after every frame that
arrived before it, checks it in its own `loop()`:

```cpp
void MyNode::loop() {
  if (this->canbus_->rx_capped())
    return;  // more frames are queued; the next pass of the canbus loop delivers them
  this->process_pending_();
}
```

It is available in ESPHome 2026.12.0 and later (esphome/esphome#23247).
