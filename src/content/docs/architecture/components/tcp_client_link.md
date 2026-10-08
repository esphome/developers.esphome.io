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

`uart_tcp` is the first caller; `tcp_uart` follows in esphome#20026.
