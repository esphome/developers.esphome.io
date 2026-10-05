---
title: "TCP listener"
---

`socket::TcpListener` is the server half next to the
[TCP client link](/architecture/components/tcp_client_link/). The header is
`esphome/components/socket/tcp_listener.h`, and the implementation is `tcp_listener.cpp`. It is compiled only
when a component calls `socket.require_tcp_listener()`. That call also pulls in the client link and the IPv4
resolver.

The listener owns the listen socket and, when the config passes a list, an
[IPv4 allow list](/architecture/components/ipv4_allow/).
It accepts one peer at a time and adopts the socket into the caller's `TcpClientLink`. A second connection waits
in the stack until the first one drops. The listen backlog is 1.

`uart_tcp` and `tcp_uart` are the callers; both use it for their server role. A server role calls
`require_tcp_listener()` and, for a non-empty `allowed_ips`, `add_ipv4_allow`. An empty or omitted list does
not compile the allow list, and every peer is accepted.
`consume_role_sockets` accounts for one stream socket, plus one listen socket when `role` is `server`.

`BASE_SCHEMA` holds the options both roles share; `uart_tcp` adds the UART, the reconnect interval and the
sensor there. Take the keys from `esphome.components.const` instead of defining them locally. An omitted list is
fine; `add_ipv4_allow` accepts `None`:

```python
import esphome.codegen as cg
from esphome.components import socket
from esphome.components.const import CONF_ALLOWED_IPS, CONF_HOST, CONF_ROLE
import esphome.config_validation as cv
from esphome.const import CONF_ID, CONF_PORT

AUTO_LOAD = ["socket"]

MyComponent = cg.esphome_ns.namespace("my_component").class_("MyComponent", cg.Component)

BASE_SCHEMA = cv.Schema(
    {cv.GenerateID(): cv.declare_id(MyComponent), cv.Required(CONF_PORT): cv.port}
).extend(cv.COMPONENT_SCHEMA)

CONFIG_SCHEMA = cv.All(
    cv.typed_schema(
        {
            "client": BASE_SCHEMA.extend({cv.Required(CONF_HOST): cv.string}),
            "server": BASE_SCHEMA.extend(
                {cv.Optional(CONF_ALLOWED_IPS): socket.IPV4_ALLOW_SCHEMA}
            ),
        },
        key=CONF_ROLE,
        default_type="client",
        lower=True,
    ),
    socket.consume_role_sockets("my_component"),
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    if config[CONF_ROLE] == "server":
        socket.require_tcp_listener()
        cg.add(var.set_server(True))
        socket.add_ipv4_allow(var.set_allow, config.get(CONF_ALLOWED_IPS), config[CONF_ID])
    else:
        socket.require_tcp_client_link()
```

`set_server` exists only under `USE_SOCKET_TCP_LISTENER`, which `require_tcp_listener()` defines. `set_allow`
and the member behind it exist only under `USE_SOCKET_IPV4_ALLOW`, which `add_ipv4_allow` defines when it
emits entries, so guard any direct use the same way.

Call `begin()` from `setup()` with the log tag. Call `poll()` once per loop, and `close()` from `on_shutdown()`.
`poll()` takes the link and a flag. Pass false to hold the next accept until the component has handled the
disconnect edge, so a sensor and any stale bytes still see the drop.

```cpp
socket::TcpClientLink link_;
bool server_{false};
// The link state loop() saw last; the edge clears buffers and publishes sensors.
bool link_was_up_{false};
#ifdef USE_SOCKET_TCP_LISTENER
socket::TcpListener listener_;

void set_server(bool server) { this->server_ = server; }
#ifdef USE_SOCKET_IPV4_ALLOW
void set_allow(const socket::Ipv4AllowEntry *entries, size_t count) { this->listener_.set_allow(entries, count); }
#endif
#endif

void setup() override {
  this->link_.begin(TAG);
#ifdef USE_SOCKET_TCP_LISTENER
  this->listener_.begin(TAG);
#endif
}

void loop() override {
#ifdef USE_SOCKET_TCP_LISTENER
  if (this->server_) {
    // Hold the accept until the previous drop's edge has run.
    this->listener_.poll(this->link_, !this->link_was_up_);
  } else
#endif
  {
    this->link_.poll();
  }
  if (this->link_.connected() != this->link_was_up_) {
    this->link_was_up_ = this->link_.connected();
    // The disconnect edge: clear component state, publish sensors.
  }
}

void on_shutdown() override {
  this->link_.close();
#ifdef USE_SOCKET_TCP_LISTENER
  this->listener_.close();
#endif
}
```

A rejected peer is closed without being adopted, and the warning is logged at most once every 5 seconds.
Call the listener's `dump_config()` from the component's own `dump_config()`; it prints one line per
allowed network. `EAGAIN`, `EWOULDBLOCK`, `ECONNABORTED` and `EINTR` from
`accept()` are ignored. Any other accept error closes the listen socket; `poll()` reopens it after the
link's reconnect interval.
The allow list is IPv4-only; see the [IPv4 allow list](/architecture/components/ipv4_allow/).
