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
- `set_idle_timeout(ms)` from a codegen setter, `idle_timeout()` for `dump_config()`. `0`, the default, leaves
  the link up.
- `check_idle()` once per loop, after the reads and writes. When no byte was read and none was accepted by the
  peer for `idle_timeout()`, it drops the link like a failed read and schedules the next attempt. The clock
  starts when the link comes up. It is an inline no-op at a zero timeout or while the link is down.
- `note_io()` restarts that clock without moving a byte. Call it when the consumer's own buffer is full, so a
  peer that is still sending is not taken for idle.

`consume_role_sockets(component)` in `socket/__init__.py` does the socket accounting for a role keyed
schema: one stream socket always, plus one listen socket when `role` is `server`.

`FINAL_VALIDATE_SCHEMA = socket.final_validate_idle_timeout` lets a component reject a `timeout` shorter than one
main loop pass (`loop_interval` under `esphome:`, 16 ms by default); `0s` turns the timeout off and always passes.

`uart_tcp` is the first caller; `tcp_uart` follows in esphome#20026.
