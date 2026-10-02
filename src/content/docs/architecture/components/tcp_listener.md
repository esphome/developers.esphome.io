---
title: "TCP listener"
---

`socket::TcpListener` is the server half next to `socket::TcpClientLink`. The header is
`esphome/components/socket/tcp_listener.h`, and the implementation is `tcp_listener.cpp`. It is compiled only
when a component calls `socket.require_tcp_listener()`. That call also pulls in the client link and the IPv4
resolver.

The listener owns the listen socket and, when the config passes a list, an `socket::Ipv4Allow`.
It accepts one peer at a time and adopts the socket into the caller's `TcpClientLink`. A second connection waits
in the stack until the first one drops. The listen backlog is 1.

`uart_tcp` is the caller. A server role calls `require_tcp_listener()` and, for a non-empty `allowed_ips`,
`add_ipv4_allow`. An empty or omitted list does not compile the allow list, and every peer is accepted.
`consume_role_sockets` accounts for one stream socket, plus one listen socket when `role` is `server`:

```python
from esphome.components import socket

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

Call `begin()` from `setup()` with the log tag. Call `poll()` once per loop, and `close()` from `on_shutdown()`.
`poll()` takes the link and a flag. Pass false to hold the next accept until the component has handled the
disconnect edge, so a sensor and any stale bytes still see the drop.

```cpp
#ifdef USE_SOCKET_TCP_LISTENER
socket::TcpListener listener_;
#endif

void setup() override {
#ifdef USE_SOCKET_TCP_LISTENER
  this->listener_.begin(TAG);
#endif
}

void loop() override {
#ifdef USE_SOCKET_TCP_LISTENER
  if (this->server_) {
    this->listener_.poll(this->link_, !this->link_was_up_);
  } else
#endif
  {
    this->link_.poll();
  }
}
```

A rejected peer is closed without being adopted, and the warning is logged at most once every 5 seconds.
`dump_config()` prints one line per allowed network. `EAGAIN`, `EWOULDBLOCK`, `ECONNABORTED` and `EINTR` from
`accept()` are ignored. Any other accept error closes the listen socket and uses the link's reconnect interval.
