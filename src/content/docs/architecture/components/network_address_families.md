---
title: "Network Address Families"
---

`network: enable_ipv4` and `enable_ipv6` decide which address families the firmware is built with. A component
that needs one of them says so in its schema, and the `network` component checks every declaration in its final
validation: a family a component needs cannot be turned off, and a family nobody needs can be left out of the build.

## Declaring a Requirement

Add the validator to the component's `CONFIG_SCHEMA`. It is a plain `(config) -> config` validator, the same shape as
`socket.consume_sockets()`, so it drops into an existing `cv.All(...)` chain:

```python
from esphome.components import network

CONFIG_SCHEMA = cv.All(
    cv.Schema({...}),
    network.require_ipv4("my_component"),
)
```

- `network.require_ipv4(name)` for a component that only speaks IPv4, for example one that resolves hostnames with
  `ipv4_resolve`, sends broadcasts, or uses a protocol library without IPv6 support.
- `network.require_ipv6(name)` for a component that only works over IPv6, for example `openthread`.
- `network.request_ipv4_off(name)` for a platform or component that wants IPv4 to default to off when nothing else
  needs it; `openthread` and `nrf52` use it.

`name` appears in the error a user sees: `IPv4 is required by my_component, but enable_ipv4 is false`.

The declaration only takes effect when `network` is part of the configuration. With no IP transport (`wifi`,
`ethernet`, `openthread`, ...) there is no network stack to constrain, and the validator does nothing.

## What the Network Component Does With It

- `enable_ipv4` defaults to `true`, or to `false` when a component asked for IPv4 off and nothing requires it.
- `enable_ipv6` defaults to `false`, or to `true` when a component requires it.
- Setting a family to `false` while a component requires it fails validation and names the component.
- At least one family stays on.

The results reach the firmware as `USE_NETWORK_IPV4` and `USE_NETWORK_IPV6`, so C++ code that only makes sense for
one family is gated with `#if USE_NETWORK_IPV4` or `#ifdef USE_NETWORK_IPV6`.

## Components That Already Declare

- IPv4: `e131`, `ethernet`, `mqtt`, `statsd`, `udp`, `voice_assistant`, `wake_on_lan`, `wifi`, `wireguard`, and the
  platforms without an IPv6 stack (`esp8266`, `rp2`, `libretiny`, `host`, `esp32` under Arduino).
- IPv4 through the socket helpers: `socket.consume_role_sockets()` declares it for the `TCPClientLink` and
  `ipv4_resolve` users, so `tcp_uart` and `uart_tcp` need no declaration of their own.
- IPv6: `openthread` and `nrf52`, which also request IPv4 off.

When a component gains support for the other family, remove its declaration in the same change.

## See Also

- [Socket Consumption API](/architecture/components/socket_consumption_api) for declaring how many sockets a
  component opens
- `esphome/components/network/__init__.py` for the validators and the final validation
