---
title: "Modbus TCP framing"
---

The MBAP helpers turn one Modbus RTU frame into one Modbus TCP frame, and back. The header is
`esphome/components/modbus_tcp_uart/mbap.h`. It is header-only. A build that does not include it compiles none of it,
and it does not link the Modbus hub.

`tcp_uart` and `uart_tcp` do not include the header. They copy bytes. The `modbus_tcp_uart` component includes it.
That component is a UART in front of a raw `tcp_uart`. It does not open a socket.

The functions are in `esphome::modbus_tcp_uart`. `take_mbap` reads one MBAP header plus its PDU. A short buffer returns
`NEED_MORE`. A protocol id other than 0, or a length outside 2 to 254, returns `BAD`, and `used` is 1.
`modbus_tcp_uart` does not slide that byte. The component computes a fresh RTU CRC, so a shifted header would become a
request nobody sent. `mbap_announced_size` returns the size of the frame a header announces, or 0 when its length is
not usable. With a usable length, `modbus_tcp_uart` skips that one frame. Without one, it drops incoming bytes until the
peer has been quiet for 100 ms. `write_mbap` writes the same header in front of a PDU and returns 0 when the PDU is
empty or does not fit. `rtu_crc_ok` checks the CRC of one RTU frame.

`frame.pdu` points into the caller's buffer. It is valid only until that buffer moves.

```cpp
#include "esphome/components/modbus_tcp_uart/mbap.h"

modbus_tcp_uart::Mbap frame;
size_t used = 0;
switch (modbus_tcp_uart::take_mbap(buf, len, &frame, &used)) {
  case modbus_tcp_uart::MbapTake::NEED_MORE:
    break;
  case modbus_tcp_uart::MbapTake::BAD:
    // used is 1. modbus_tcp_uart skips the announced frame, or waits for a quiet stream,
    // instead of trying the next byte.
    break;
  case modbus_tcp_uart::MbapTake::FRAME:
    // frame.pdu points into buf. Copy it before buf moves.
    break;
}
```
