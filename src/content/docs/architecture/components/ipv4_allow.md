---
title: "IPv4 allow list"
---

`socket::Ipv4Allow` decides whether an IPv4 address may connect. The header is
`esphome/components/socket/ipv4_allow.h`. It is header-only: a translation unit that does not include it does not
compile it.

`tcp_uart` is the first caller, on its server role. `uart_tcp` is expected to call the same list once that
component's server role is on `dev`, which is why the check lives next to the socket helpers instead of inside
the first caller.

An empty list allows every address. `add()` takes the address and the mask in host byte order and stores
`addr & mask`, so a single host is a mask of `0xFFFFFFFF` and host bits in a network entry are cleared.
`allows()` returns true when the list is empty or the address matches one entry. `add()` returns false once the
list holds 8 entries.

```cpp
socket::Ipv4Allow allowed;
allowed.add(0xC0A8AF00, 0xFFFFFF00);  // 192.168.175.0/24
if (allowed.allows(peer)) {
  // take the connection
}
```
