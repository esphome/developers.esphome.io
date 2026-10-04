---
title: "TCP client link"
---

`socket::TcpClientLink` is a reconnecting TCP stream driven from `loop()`. The header is
`esphome/components/socket/tcp_client_link.h`. It is compiled only when a component calls
`socket.require_tcp_client_link()` from `to_code`; `socket.require_tcp_listener()` implies it.

The link owns the socket, the DNS lookup, the retry backoff and a 1 KiB outgoing buffer. A fatal read or
write error closes the link, logs it and schedules the next attempt; the caller sees the edge through
`connected()` and clears its own state there.

- `begin(tag)` from `setup()`; `set_host`, `set_port` and `set_reconnect_interval` from codegen setters.
- `poll()` once per loop while acting as a client. It is an inline no-op while connected or backing off.
- `adopt(sock)` takes over an accepted socket; the [TCP listener](/architecture/components/tcp_listener/)
  is the usual caller.
- `read(buf, len)` returns bytes, 0 when nothing can move now, and -1 when the link dropped.
- `queue(data, len)` copies into the outgoing buffer and returns how many bytes fit; `tx_tail()` and
  `tx_commit(n)` give a zero copy fill bounded by `tx_free()`; `flush_tx()` sends the front and returns
  true once the buffer is empty.
- `close()` from `on_shutdown()`; it also clears the buffer, so bytes never leak into the next session.

`consume_role_sockets(component)` in `socket/__init__.py` does the socket accounting for a role keyed
schema: one stream socket always, plus one listen socket when `role` is `server`.

The link is IPv4-only. `set_host` takes an IPv4 address or a hostname; a hostname is looked up for an A
record through `socket::Ipv4Resolve` (on host and Zephyr the lookup blocks in `getaddrinfo()`). An IPv6
literal, or a name with only an AAAA record, never connects: every attempt logs a warning and waits out the
reconnect interval.

The first attempt runs on the first `poll()`; after a failure or a drop the next one waits out the reconnect
interval. A connect still pending after the longer of the reconnect interval and 10 seconds is dropped as
`Connect failed` with `ETIMEDOUT`, before the stack's own SYN retries end, and the next attempt resolves the
host again.

Connected and adopted sockets are non-blocking with `TCP_NODELAY` and TCP keepalive (30 s idle, then 3 probes
10 s apart where the stack has `TCP_KEEPIDLE`). Keepalive is best-effort: the raw lwIP implementation on
ESP8266 and RP2040 rejects it, so there a half-open link is only detected by a failed write. A link that only
receives does not notice a peer that vanished without closing.

`uart_tcp` and `tcp_uart` are the callers.
