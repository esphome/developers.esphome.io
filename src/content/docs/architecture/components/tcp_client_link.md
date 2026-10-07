---
title: "TCP client link"
---

`socket::TcpClientLink` is a reconnecting TCP stream driven from `loop()`. The header is
`esphome/components/socket/tcp_client_link.h`. It is compiled only when a component calls
`socket.require_tcp_client_link()` from `to_code`; `socket.require_tcp_listener()` implies it.

The link owns the socket, the DNS lookup, the retry backoff and a 1 KiB outgoing buffer. A fatal read or
write error closes the link, logs it and schedules the next attempt; the caller sees the edge through
`connected()` and clears its own state there.

- `begin(tag)` from `setup()`; `set_host`, `set_port`, `set_reconnect_interval` and `set_idle_timeout` from
  codegen setters.
- `poll()` once per loop while acting as a client. It is an inline no-op while connected or backing off.
- `adopt(sock)` takes over an accepted socket; the [TCP listener](/architecture/components/tcp_listener/)
  is the usual caller.
- `read(buf, len)` returns bytes, 0 when nothing can move now, and -1 when the link dropped.
- `queue(data, len)` copies into the outgoing buffer and returns how many bytes fit; `tx_tail()` and
  `tx_commit(n)` give a zero copy fill bounded by `tx_free()`; `flush_tx()` sends the front and returns
  true once the buffer is empty.
- `close()` from `on_shutdown()`; it also clears the buffer, so bytes never leak into the next session.
- `check_idle()` once per loop after reading and flushing. It closes the link when nothing was read or sent for
  `idle_timeout()` ms since the link came up or the last byte, and is an inline no-op while that is `0`, the
  default, or while the link is down. An idle close is logged at info level and otherwise works like a drop:
  `connected()` turns false and a client waits the reconnect interval before the next attempt.
- `note_io()` restarts the idle clock. A caller that skips a read because it cannot take more bytes (`tcp_uart`
  with a full receive buffer, `uart_tcp` with no room in the UART) calls it, so a busy link is not taken for a
  quiet one.

`consume_role_sockets(component)` in `socket/__init__.py` does the socket accounting for a role keyed
schema: one stream socket always, plus one listen socket when `role` is `server`.

`final_validate_idle_timeout` in `socket/__init__.py` is a `FINAL_VALIDATE_SCHEMA` for a schema with a `timeout`
key that has a default: `0s` passes, and any other value shorter than one main loop pass is rejected, because the
link would close between two polls.

`get_loop_interval()` in `esphome/core/config.py` returns `loop_interval` from the `esphome:` block, or
`DEFAULT_LOOP_INTERVAL` (16 ms) when it is not set. It reads the full configuration, so call it only from a
`FINAL_VALIDATE_SCHEMA`.

`uart_tcp` and `tcp_uart` use the link, `consume_role_sockets` and `final_validate_idle_timeout`.
