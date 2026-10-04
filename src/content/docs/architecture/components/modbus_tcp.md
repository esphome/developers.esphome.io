---
title: "Modbus TCP framing"
---

The MBAP helpers turn one Modbus RTU frame into one Modbus TCP frame, and back. The header is
`esphome/components/modbus_tcp/mbap.h`. It is header-only. A build that does not include it compiles none of it,
and it does not link the Modbus hub.

`tcp_uart` and `uart_tcp` do not include the header. They copy bytes. The `modbus_tcp` component includes it.
That component is a UART in front of a raw `tcp_uart`. It does not open a socket.

The functions are in `esphome::modbus_tcp`. `take_mbap` reads one MBAP header plus its PDU. A short buffer returns
`NEED_MORE`. A protocol id other than 0, or a length outside 2 to 254, returns `BAD`, and `used` is 1.
`modbus_tcp` does not slide that byte. It drops the stream until the link goes down. The component computes a
fresh RTU CRC, so a shifted header would become a request nobody sent. `write_mbap` writes the same header in
front of a PDU and returns 0 when the PDU is empty or does not fit. `rtu_crc_ok` checks the CRC of one RTU frame.

`frame.pdu` points into the caller's buffer. It is valid only until that buffer moves.

```cpp
#include "esphome/components/modbus_tcp/mbap.h"

modbus_tcp::Mbap frame;
size_t used = 0;
switch (modbus_tcp::take_mbap(buf, len, &frame, &used)) {
  case modbus_tcp::MbapTake::NEED_MORE:
    break;
  case modbus_tcp::MbapTake::BAD:
    // used is 1. modbus_tcp discards the stream instead of trying the next byte.
    break;
  case modbus_tcp::MbapTake::FRAME:
    // frame.pdu points into buf. Copy it before buf moves.
    break;
}
```
