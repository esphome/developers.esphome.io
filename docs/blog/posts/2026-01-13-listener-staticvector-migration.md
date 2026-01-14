---
date: 2026-01-13
authors:
  - bdraco
comments: true
---

# Listener StaticVector Migration: WiFi and Logger

WiFi and Logger components now use `StaticVector` for listener storage, eliminating heap allocation and STL overhead. External components that register listeners must now call request functions during code generation.

This is a **breaking change** for external components in **ESPHome 2026.1.0 and later**.

<!-- more -->

## What changed

Previously, listener vectors were dynamically allocated with `std::vector`. Now they use compile-time-sized `StaticVector` based on how many components request listener slots.

**If the appropriate `request_*_listener()` is not called, `add_*_listener()` will silently fail** - your listener will never receive callbacks.

## WiFi Listeners

Four independent listener types now require separate request functions:

```python
# In your component's __init__.py
from esphome.components import wifi

async def to_code(config):
    # Request the specific listener type(s) you need
    wifi.request_wifi_ip_state_listener()        # For IP/DNS state changes
    wifi.request_wifi_connect_state_listener()   # For SSID/BSSID changes
    wifi.request_wifi_scan_results_listener()    # For scan results
    wifi.request_wifi_power_save_listener()      # For power save mode changes
```

### WiFi Listener C++ Registration

These use interface classes, not lambdas:

```cpp
// Your component implements the listener interface
class MyComponent : public Component, public wifi::WiFiIPStateListener {
 public:
  void setup() override {
    wifi::global_wifi_component->add_ip_state_listener(this);
  }
  void on_ip_state(const network::IPAddresses &ips, const network::IPAddress &dns1,
                   const network::IPAddress &dns2) override {
    // Handle IP state change
  }
};
```

Available listener interfaces:

| Interface | Method Signature |
|-----------|------------------|
| `WiFiIPStateListener` | `on_ip_state(const network::IPAddresses &ips, const network::IPAddress &dns1, const network::IPAddress &dns2)` |
| `WiFiConnectStateListener` | `on_wifi_connect_state(StringRef ssid, std::span<const uint8_t, 6> bssid)` |
| `WiFiScanResultsListener` | `on_wifi_scan_results(const wifi_scan_vector_t<WiFiScanResult> &results)` |
| `WiFiPowerSaveListener` | `on_wifi_power_save(WiFiPowerSaveMode mode)` |

## Logger Listeners

Components implementing `LogListener` must request a listener slot:

```python
# In your component's __init__.py
from esphome.components.logger import request_log_listener

async def to_code(config):
    request_log_listener()
    # ... rest of code generation
```

### Logger Listener C++ Registration

```cpp
class MyComponent : public Component, public logger::LogListener {
 public:
  void setup() override {
    if (logger::global_logger != nullptr)
      logger::global_logger->add_log_listener(this);
  }
  void on_log(uint8_t level, const char *tag, const char *message, size_t message_len) override {
    // Handle log message
  }
};
```

## Compilation

External components will compile successfully but **listeners will silently fail** if the request function is not called. There is no compile-time error - the listener simply won't receive callbacks.

## Finding code that needs updates

```bash
# Find WiFi listener registrations
grep -rn "add_ip_state_listener\|add_connect_state_listener" your_component/
grep -rn "add_scan_results_listener\|add_power_save_listener" your_component/

# Find log listener registrations
grep -rn "add_log_listener" your_component/
```

## Why this change

- **Flash savings**: 1,048 bytes on ESP8266 (WiFi), 268 bytes (Logger)
- **Unused code elimination**: Only requested listener types are compiled
- **Exact sizing**: StaticVectors sized precisely for actual component count
- **No heap fragmentation**: Compile-time allocation instead of runtime

## Reference Pull Requests

- [esphome/esphome#13197](https://github.com/esphome/esphome/pull/13197) - WiFi Listeners
- [esphome/esphome#13196](https://github.com/esphome/esphome/pull/13196) - Logger Listeners

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)
