## PR Title

`Add blog post: Socket and ClientInfo std::string removal`

---

## Description

Documents the removal of heap-allocated strings from socket and API connection code:

**Removed methods:**
- `Socket::getpeername()` returning `std::string`
- `Socket::getsockname()` returning `std::string`

**New API:**
- `getpeername_to(std::span<char, SOCKADDR_STR_LEN> buf)` / `getsockname_to(...)`
- Use `socket::SOCKADDR_STR_LEN` for buffer size (16 IPv4, 46 IPv6)

**APIFrameHelper changes:**
- `std::string` fields removed
- Replaced with `char client_name_[32]` and `char client_peername_[SOCKADDR_STR_LEN]`

Saves ~38 bytes RAM per connection, 516 bytes flash.

Related PR: esphome/esphome#12566
