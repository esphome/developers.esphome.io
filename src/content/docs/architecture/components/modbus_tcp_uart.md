---
title: "Modbus TCP framing"
---

The MBAP helpers turn one Modbus RTU frame into one Modbus TCP frame, and back. The header is
`esphome/components/modbus_tcp_uart/mbap.h`. It is header-only. A build that does not include it compiles none of it.
It does not link the Modbus hub, but `take_rtu` uses the frame length helpers of the `modbus` component, so a component
that calls it must load `modbus`.

`tcp_uart` and `uart_tcp` do not include the header. They copy bytes. The `modbus_tcp_uart` component includes it.
That component is a UART in front of a raw `tcp_uart`. It does not open a socket.

The functions are in `esphome::modbus_tcp_uart`. `take_mbap` reads one MBAP header plus its PDU. A short buffer returns
`NEED_MORE`. A protocol id other than 0, or a length outside 2 to 254, returns `BAD`, and `used` is 1. Do not slide by
that byte: a component that computes a fresh RTU CRC, as `modbus_tcp_uart` does, would turn a shifted header into a
request nobody sent. On `BAD`, call `mbap_announced_size(buf, len)` instead. It returns the size of the frame the header
announces, or 0 when its length is not usable. With a non-zero size, skip that one frame. With 0, drop incoming bytes
until the stream goes quiet; `modbus_tcp_uart` waits until the peer has been quiet for 100 ms.

On `FRAME`, `frame` holds the transaction id `txn`, the unit id `unit`, and `pdu` with its length `pdu_len`. `frame.pdu`
points into the caller's buffer. It is valid only until that buffer moves.

`write_mbap(dst, cap, txn, unit, pdu, pdu_len)` writes the 7-byte MBAP header in front of a PDU and returns the frame
length, 7 + `pdu_len`. It returns 0 and writes nothing when the PDU is empty, longer than 253 bytes, or does not fit in
the `cap` bytes of `dst`.

```cpp
#include "esphome/components/modbus_tcp_uart/mbap.h"

modbus_tcp_uart::Mbap frame;
size_t used = 0;
switch (modbus_tcp_uart::take_mbap(buf, len, &frame, &used)) {
  case modbus_tcp_uart::MbapTake::NEED_MORE:
    break;
  case modbus_tcp_uart::MbapTake::BAD: {
    size_t skip = modbus_tcp_uart::mbap_announced_size(buf, len);
    // Skip that many bytes once they have arrived; with 0, drop input until the stream is quiet.
    break;
  }
  case modbus_tcp_uart::MbapTake::FRAME:
    // frame.pdu points into buf. Copy frame.pdu_len bytes before buf moves; echo frame.txn in the reply.
    break;
}
```

`write_rtu` writes unit, PDU and CRC as one RTU frame and returns its length; `dst` must hold at least `pdu_len + 3`
bytes. `RTU_MAX_SIZE` is the largest RTU frame, 256 bytes. `rtu_crc_ok` checks the CRC of one RTU frame of 4 to
`RTU_MAX_SIZE` bytes. `take_rtu` finds the RTU frame at the start of a buffer. For a function code whose length the
`modbus` hub knows, the frame ends where the hub's own parser ends it: pass `replies` as true for what a server sends,
false for what a client sends. That frame returns `NEED_MORE` while bytes are missing and `BAD` when its CRC fails. For
any other function code the frame ends at the first CRC match from 4 bytes on. Without a match it returns `NEED_MORE`,
and `BAD` once it has `RTU_MAX_SIZE` bytes. `modbus_tcp_uart` joins what a writer hands over with it: pieces until the
frame is whole, and several frames from one write:

```cpp
#include "esphome/components/modbus_tcp_uart/mbap.h"

size_t frame_len = 0;
switch (modbus_tcp_uart::take_rtu(buf, len, false, &frame_len)) {
  case modbus_tcp_uart::RtuTake::NEED_MORE:
    // Keep the bytes and wait for the next write.
    break;
  case modbus_tcp_uart::RtuTake::BAD:
    // Not a Modbus frame. modbus_tcp_uart drops the part it held, or the write.
    break;
  case modbus_tcp_uart::RtuTake::FRAME:
    // The first frame_len bytes are one whole frame. More may follow in buf.
    break;
}
```
