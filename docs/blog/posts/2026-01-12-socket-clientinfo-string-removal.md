---
date: 2026-01-12
authors:
  - bdraco
comments: true
---

# Socket and ClientInfo std::string Removal

The `Socket` class virtual methods `getpeername()` and `getsockname()` that returned `std::string` have been removed. The `ClientInfo` struct no longer contains `std::string` fields.

This is a **breaking change** for external components in **ESPHome 2026.1.0 and later**.

<!-- more -->

## Background

**[PR #12566](https://github.com/esphome/esphome/pull/12566): Eliminate std::string from ClientInfo struct**

This PR removes heap-allocated strings from socket and API connection code:
- Saves ~38 bytes of RAM per active API connection
- Reduces flash by 516 bytes on ESP32-IDF
- Eliminates heap fragmentation from connection handling

## What's Changing

### Socket class methods removed

```cpp
// Removed - heap-allocating virtual methods
virtual std::string getpeername();
virtual std::string getsockname();
```

### New buffer-based API

```cpp
// New - write to provided buffer
// Returns bytes written (can be ignored for simple logging)
size_t getpeername_to(std::span<char, SOCKADDR_STR_LEN> buf);
size_t getsockname_to(std::span<char, SOCKADDR_STR_LEN> buf);

// Buffer size constant (compile-time, based on IPv6 support)
socket::SOCKADDR_STR_LEN  // 16 bytes (IPv4-only) or 46 bytes (IPv6-enabled)
```

### APIFrameHelper buffer changes

```cpp
// Before - heap-allocated strings in APIFrameHelper
class APIFrameHelper {
  std::string client_info_;
  // ...
};

// After - fixed buffers in APIFrameHelper
class APIFrameHelper {
  char client_name_[CLIENT_INFO_NAME_MAX_LEN];     // 32 bytes for client name
  char client_peername_[socket::SOCKADDR_STR_LEN]; // 16/46 bytes for IP address
  // ...
};
```

### APIConnection getters

```cpp
// Before - returned std::string
const std::string &get_name() const;
const std::string &get_peername() const;

// After - returns const char*
const char *get_name() const;
const char *get_peername() const;
```

## Who This Affects

External components that:
- Call `getpeername()` or `getsockname()` on socket objects
- Access `APIFrameHelper` client name/peername fields
- Call `get_name()` or `get_peername()` on `APIConnection`

**Standard YAML configurations are not affected.**

## Migration Guide

### 1. Socket getpeername/getsockname

```cpp
// Before - heap allocation
std::string peer = socket->getpeername();
ESP_LOGD(TAG, "Connected from: %s", peer.c_str());

// After - stack buffer
char peer[socket::SOCKADDR_STR_LEN];
socket->getpeername_to(peer);
ESP_LOGD(TAG, "Connected from: %s", peer);
```

### 2. Buffer size constant

`SOCKADDR_STR_LEN` is a compile-time constant sized for your build configuration:

```cpp
// Works for both IPv4 and IPv6 - size determined at compile time
char buffer[socket::SOCKADDR_STR_LEN];

// IPv4-only builds: 16 bytes (fits "255.255.255.255")
// IPv6-enabled builds: 46 bytes (fits full IPv6 addresses)
```

### 3. APIConnection name access

```cpp
// Before
const std::string &name = connection->get_name();
const std::string &peer = connection->get_peername();

// After - returns const char*
const char *name = connection->get_name();
const char *peer = connection->get_peername();

// Direct logging (no .c_str() needed)
ESP_LOGD(TAG, "Client: %s from %s", name, peer);
```

### 4. Storing the address

If you need to store the address, copy it to your own buffer:

```cpp
// Stack buffer for temporary use
char peer[socket::SOCKADDR_STR_LEN];
socket->getpeername_to(peer);

// If you need to store it (snprintf ensures null-termination)
char stored_peer[socket::SOCKADDR_STR_LEN];
snprintf(stored_peer, sizeof(stored_peer), "%s", peer);
```

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 1, 0)
  // New API - buffer-based
  char peer[socket::SOCKADDR_STR_LEN];
  socket->getpeername_to(peer);
  ESP_LOGD(TAG, "Peer: %s", peer);
#else
  // Old API - heap-allocating
  std::string peer = socket->getpeername();
  ESP_LOGD(TAG, "Peer: %s", peer.c_str());
#endif
```

## Timeline

- **ESPHome 2026.1.0 (January 2026):** Old methods removed, new buffer-based API required
- No deprecation period - methods removed directly

## Finding Code That Needs Updates

```bash
# Find getpeername/getsockname calls
grep -rn "getpeername()" your_component/
grep -rn "getsockname()" your_component/

# Find APIFrameHelper usage
grep -rn "APIFrameHelper" your_component/

# Find APIConnection name access
grep -rn "get_name()" your_component/
grep -rn "get_peername()" your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [Native API Component](https://esphome.io/components/api.html)
- [PR #12566](https://github.com/esphome/esphome/pull/12566)
