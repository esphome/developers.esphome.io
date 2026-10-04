---
title: "IPv4 allow list"
---

`socket::Ipv4Allow` decides whether a peer may connect. The header is
`esphome/components/socket/ipv4_allow.h`. It is header-only: a translation unit that does not include it does not
compile it.

It lives next to the socket helpers so any server component (such as `tcp_uart` or `uart_tcp`) can share it
instead of carrying its own copy.

An empty list allows every peer. The entries are built at codegen time, validated by `cv.ipv4network` and
emitted into flash (`PROGMEM` on ESP8266), so the component only stores a pointer and a count. A bare address
becomes a /32, host bits are cleared, and a non contiguous mask is rejected at config time. The list is
IPv4-only.

On the Python side the whole wiring is one schema reference and one call; `add_ipv4_allow` is a plain
function, not a coroutine. Use the shared key `CONF_ALLOWED_IPS` from `esphome.components.const`
([esphome/esphome#20053](https://github.com/esphome/esphome/pull/20053)) instead of a local constant. An
omitted list is fine; `add_ipv4_allow` accepts `None` and an empty list and emits nothing for either:

```python
import esphome.codegen as cg
from esphome.components import socket
from esphome.components.const import CONF_ALLOWED_IPS
import esphome.config_validation as cv
from esphome.const import CONF_ID
from esphome.types import ConfigType

AUTO_LOAD = ["socket"]

my_component_ns = cg.esphome_ns.namespace("my_component")
MyComponent = my_component_ns.class_("MyComponent", cg.Component)

CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(MyComponent),
        cv.Optional(CONF_ALLOWED_IPS): socket.IPV4_ALLOW_SCHEMA,
    }
).extend(cv.COMPONENT_SCHEMA)


async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    socket.add_ipv4_allow(
        var.set_allow, config.get(CONF_ALLOWED_IPS), config[CONF_ID]
    )
```

`add_ipv4_allow` defines `USE_SOCKET_IPV4_ALLOW` when it emits entries, so the member, the setter and the
check belong behind that guard; a config without a list then compiles none of it.

A component with a [TCP listener](/architecture/components/tcp_listener/) does not hold the list itself: its
`set_allow` forwards to `TcpListener::set_allow`, and the listener checks every accepted peer. A component with
its own listen socket exposes the matching setter and checks the accepted peer's `sockaddr` directly. A v4
mapped IPv6 peer is unwrapped through the shared `socket::sockaddr_to_ipv4()`; any other family is denied while
the list is not empty:

```cpp
#include "esphome/components/socket/socket.h"
#ifdef USE_SOCKET_IPV4_ALLOW
#include "esphome/components/socket/ipv4_allow.h"
#endif

std::unique_ptr<socket::ListenSocket> listen_;
#ifdef USE_SOCKET_IPV4_ALLOW
socket::Ipv4Allow allow_;

void set_allow(const socket::Ipv4AllowEntry *entries, size_t count) { this->allow_.set(entries, count); }
#endif

// in the accept path
struct sockaddr_storage peer {};
socklen_t peer_len = sizeof(peer);
auto client = this->listen_->accept_loop_monitored(reinterpret_cast<struct sockaddr *>(&peer), &peer_len);
#ifdef USE_SOCKET_IPV4_ALLOW
if (client != nullptr && !this->allow_.allows(reinterpret_cast<struct sockaddr *>(&peer))) {
  return;  // rejected; the unique_ptr closes the connection
}
#endif
```

`allows(uint32_t)` is also public and takes the address in network byte order, as it sits in a `sockaddr_in`.
The schema caps a list at 255 entries as a sanity limit.
