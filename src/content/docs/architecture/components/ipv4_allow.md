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
becomes a /32, host bits are cleared, and a non contiguous mask is rejected at config time. On the Python side
the whole wiring is one schema reference and one call; `add_ipv4_allow` is a plain function, not a coroutine:

```python
from esphome.components import socket

CONFIG_SCHEMA = cv.Schema(
    {
        cv.Optional(CONF_ALLOW, default=[]): socket.IPV4_ALLOW_SCHEMA,
    }
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    socket.add_ipv4_allow(var.set_allow, config[CONF_ALLOW], config[CONF_ID])
```

`add_ipv4_allow` defines `USE_SOCKET_IPV4_ALLOW` when it emits entries, so the member, the setter and the
check belong behind that guard; a config without a list then compiles none of it.

The C++ side exposes the matching setter and checks the accepted peer's `sockaddr` directly. A v4 mapped IPv6
peer is unwrapped through the shared `socket::sockaddr_to_ipv4()`; any other family is denied while the list is
not empty:

```cpp
#ifdef USE_SOCKET_IPV4_ALLOW
socket::Ipv4Allow allow_;

void set_allow(const socket::Ipv4AllowEntry *entries, size_t count) { this->allow_.set(entries, count); }
#endif

// in the accept path
struct sockaddr_storage peer;
socklen_t peer_len = sizeof(peer);
auto client = this->listen_->accept_loop_monitored(reinterpret_cast<struct sockaddr *>(&peer), &peer_len);
if (client != nullptr && !this->allow_.allows(reinterpret_cast<struct sockaddr *>(&peer))) {
  return;  // rejected; the unique_ptr closes the connection
}
```

`allows(uint32_t)` is also public and takes the address in network byte order, as it sits in a `sockaddr_in`.
The schema caps a list at 255 entries as a sanity limit.
