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

The schema below is the one `uart_tcp` uses, without the UART and sensor options. `BASE_SCHEMA` holds the
options both roles share. `CONF_ALLOWED_IPS`, `CONF_HOST`, `CONF_RECONNECT_INTERVAL` and `CONF_ROLE` are shared
keys in `esphome.components.const`; do not define them locally. An omitted list is fine; `add_ipv4_allow`
accepts `None`:

```python
import esphome.codegen as cg
from esphome.components import socket
from esphome.components.const import (
    CONF_ALLOWED_IPS,
    CONF_HOST,
    CONF_RECONNECT_INTERVAL,
    CONF_ROLE,
)
import esphome.config_validation as cv
from esphome.const import CONF_ID, CONF_PORT
from esphome.types import ConfigType

DEPENDENCIES = ["network"]
AUTO_LOAD = ["socket"]

my_component_ns = cg.esphome_ns.namespace("my_component")
MyComponent = my_component_ns.class_("MyComponent", cg.Component)

BASE_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(MyComponent),
        cv.Required(CONF_PORT): cv.port,
        cv.Optional(
            CONF_RECONNECT_INTERVAL, default="5s"
        ): cv.positive_time_period_milliseconds,
    }
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


async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    if config[CONF_ROLE] == "server":
        socket.require_tcp_listener()
        cg.add(var.set_server(True))
        socket.add_ipv4_allow(
            var.set_allow, config.get(CONF_ALLOWED_IPS), config[CONF_ID]
        )
    else:
        socket.require_tcp_client_link()
    cg.add(var.set_port(config[CONF_PORT]))
    cg.add(var.set_reconnect_interval(config[CONF_RECONNECT_INTERVAL]))
    if (host := config.get(CONF_HOST)) is not None:
        cg.add(var.set_host(host))
```

The listener uses the link's port and reconnect interval, so the setters forward to the link. `set_server`
exists only under `USE_SOCKET_TCP_LISTENER`, which `require_tcp_listener()` defines; `set_allow` and the member
behind it exist only under `USE_SOCKET_IPV4_ALLOW`, which `add_ipv4_allow` defines when it emits entries. Guard
any direct use the same way. The header, as in `uart_tcp.h`:

```cpp
#include "esphome/components/socket/tcp_client_link.h"
#ifdef USE_SOCKET_TCP_LISTENER
#include "esphome/components/socket/tcp_listener.h"
#endif
#include "esphome/core/component.h"

namespace esphome::my_component {

class MyComponent : public Component {
 public:
  void set_host(const char *host) { this->link_.set_host(host); }
  void set_port(uint16_t port) { this->link_.set_port(port); }
  void set_reconnect_interval(uint32_t ms) { this->link_.set_reconnect_interval(ms); }
#ifdef USE_SOCKET_TCP_LISTENER
  void set_server(bool server) { this->server_ = server; }
#ifdef USE_SOCKET_IPV4_ALLOW
  void set_allow(const socket::Ipv4AllowEntry *entries, size_t count) { this->listener_.set_allow(entries, count); }
#endif
#endif

  void setup() override;
  void loop() override;
  void dump_config() override;
  void on_shutdown() override;
  float get_setup_priority() const override { return setup_priority::AFTER_WIFI; }

 protected:
  socket::TcpClientLink link_;
#ifdef USE_SOCKET_TCP_LISTENER
  socket::TcpListener listener_;
#endif
  bool server_{false};
  // The link state loop() saw last; the edge clears buffers and publishes sensors.
  bool link_was_up_{false};
};

}  // namespace esphome::my_component
```

Call `begin()` from `setup()` with the log tag. Call `poll()` once per loop, and `close()` from `on_shutdown()`.
`poll()` takes the link and a flag. Pass false to hold the next accept until the component has handled the
disconnect edge, so a sensor and any stale bytes still see the drop:

```cpp
#include "my_component.h"

#include "esphome/core/log.h"

namespace esphome::my_component {

static const char *const TAG = "my_component";

void MyComponent::setup() {
  this->link_.begin(TAG);
#ifdef USE_SOCKET_TCP_LISTENER
  this->listener_.begin(TAG);
#endif
}

void MyComponent::dump_config() {
  ESP_LOGCONFIG(TAG, "  Port: %u", this->link_.port());
#ifdef USE_SOCKET_TCP_LISTENER
  this->listener_.dump_config();
#endif
}

void MyComponent::on_shutdown() {
  this->link_.close();
#ifdef USE_SOCKET_TCP_LISTENER
  this->listener_.close();
#endif
}

void MyComponent::loop() {
#ifdef USE_SOCKET_TCP_LISTENER
  if (this->server_) {
    // Hold the accept until the previous drop's edge has run.
    this->listener_.poll(this->link_, !this->link_was_up_);
  } else {
    this->link_.poll();
  }
#else
  this->link_.poll();
#endif
  if (this->link_.connected() != this->link_was_up_) {
    this->link_was_up_ = this->link_.connected();
    // The disconnect edge: clear component state, publish sensors.
  }
}

}  // namespace esphome::my_component
```

A rejected peer is closed without being adopted, and the warning is logged at most once every 5 seconds.
Call the listener's `dump_config()` from the component's own `dump_config()`; it prints one line per
allowed network. `EAGAIN`, `EWOULDBLOCK`, `ECONNABORTED` and `EINTR` from
`accept()` are ignored. Any other accept error closes the listen socket; `poll()` reopens it after the
link's reconnect interval.

The allow list is IPv4-only. While it is not empty, a v4 mapped IPv6 peer is checked as IPv4 and any other
IPv6 peer is rejected; see the [IPv4 allow list](/architecture/components/ipv4_allow/).
