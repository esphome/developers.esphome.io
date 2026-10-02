---
title: "Modbus TCP framing"
---

`modbus_tcp` turns one Modbus RTU frame into one Modbus TCP frame, and back. The header is
`esphome/components/modbus_tcp/mbap.h`. It is header-only. A build that does not include it compiles none of it,
and it does not link the Modbus hub.

The component has no configuration. Callers load it with `AUTO_LOAD`. `tcp_uart` and `uart_tcp` are the callers.
There is no YAML key.

The functions are in `esphome::modbus_tcp`. `take_mbap` reads one MBAP header plus its PDU. A short buffer returns
`NEED_MORE`. A protocol id other than 0, or a length outside 2 to 254, returns `BAD` and consumes one byte, so the
caller can resync. `write_mbap` writes the same header in front of a PDU and returns 0 when the PDU is empty or
does not fit. `rtu_crc_ok` checks the CRC of one RTU frame.

```cpp
#include "esphome/components/modbus_tcp/mbap.h"

modbus_tcp::Mbap frame;
size_t used = 0;
switch (modbus_tcp::take_mbap(buf, len, &frame, &used)) {
  case modbus_tcp::MbapTake::NEED_MORE:
    break;
  case modbus_tcp::MbapTake::BAD:
    // used is 1; drop that byte and try again
    break;
  case modbus_tcp::MbapTake::FRAME:
    // frame.pdu points into buf and is valid until buf moves
    break;
}
```
