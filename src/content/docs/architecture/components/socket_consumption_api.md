---
title: "Socket Consumption API"
---

When developing components that use network sockets on ESP32 with ESP-IDF, you must register your socket requirements using the Socket Consumption API. This ensures ESPHome automatically configures `CONFIG_LWIP_MAX_SOCKETS` with sufficient capacity for all components in a configuration.

## Background

On ESP32 with ESP-IDF, the `CONFIG_LWIP_MAX_SOCKETS` setting limits how many sockets can be open simultaneously. If this limit is too low, components fail to create sockets with errors like:

```text
E (3555) httpd: httpd_server_init: error in creating msg socket (23)
```

The Socket Consumption API solves this by having components declare their socket needs during configuration validation. The ESP32 platform then automatically calculates and configures the required limit based on the total needs of all components.

## When to Register Socket Usage

Register socket consumption if your component:

- Creates listening sockets (TCP/UDP servers)
- Establishes outbound connections (HTTP clients, MQTT, etc.)
- Uses multicast sockets (mDNS, discovery protocols)
- Wraps system services that consume sockets

## How to Register Socket Usage

### 1. Add Socket Dependency

In your component's `__init__.py`, add socket to `AUTO_LOAD`:

```python
AUTO_LOAD = ["socket"]
```

This ensures the socket component is automatically loaded without requiring users to add it to their configuration.

### 2. Import and Register Sockets

Create a validator function that registers your socket needs:

```python
from esphome.components import socket
import esphome.config_validation as cv

def _consume_sockets(config):
    """Register socket needs for this component."""
    # Example: 1 listening socket + 2 concurrent client connections
    socket.consume_sockets(3, "my_component")(config)
    return config

CONFIG_SCHEMA = cv.All(
    cv.Schema({
        # Your component schema here
    }).extend(cv.COMPONENT_SCHEMA),
    _consume_sockets,  # Register socket usage during validation
)
```

### 3. Calculate Your Socket Requirements

Count all sockets your component uses:

**Listening sockets:** Each server/listener typically needs 1 socket:

```python
# Web server with one listener
socket.consume_sockets(1, "my_server")
```

**Client connections:** Add expected concurrent connections:

```python
# API: 1 listener + 3 typical concurrent clients
socket.consume_sockets(4, "api")
```

**Multicast sockets:** Count IPv4 and IPv6 separately:

```python
# mDNS: separate sockets for IPv4 and IPv6
socket.consume_sockets(2, "mdns")
```

**Multiple instances:** Register per-instance if `MULTI_CONF` is enabled:

```python
def _consume_camera_sockets(config):
    # Each camera instance needs 3 sockets (1 listener + 2 clients)
    socket.consume_sockets(3, f"esp32_camera_web_server_{config[CONF_ID]}")(config)
    return config
```

## Examples from Core Components

### Simple Client (MQTT)

```python
def _consume_mqtt_sockets(config):
    """MQTT needs one socket for broker connection."""
    from esphome.components import socket
    socket.consume_sockets(1, "mqtt")(config)
    return config

CONFIG_SCHEMA = cv.All(
    cv.Schema({
        # MQTT configuration
    }).extend(cv.COMPONENT_SCHEMA),
    _consume_mqtt_sockets,
)
```

### Clients of the Shared Web Server

Components that serve requests through the shared web server (`web_server_base`) do not register the listening
socket; `web_server_base` does. Register the client connections your component keeps open with
`web_server_base.add_httpd_clients()` instead of `socket.consume_sockets()`:

```python
from esphome.components import web_server_base

DOMAIN = "web_server"

def _consume_web_server_sockets(config):
    # A browser opens several connections: page resources, the event stream and control requests
    web_server_base.add_httpd_clients(5, DOMAIN)
    return config

CONFIG_SCHEMA = cv.All(
    cv.Schema({
        # Web server configuration
    }).extend(cv.COMPONENT_SCHEMA),
    _consume_web_server_sockets,
)
```

`add_httpd_clients()` registers the TCP sockets and adds them to the shared server's client total. On ESP32 that
total sets the ESP-IDF HTTP server's open socket limit (`max_open_sockets`) at build time, never below the ESP-IDF
default of 7, so a component that keeps long-lived connections (for example a stream) must count them here, or the
server runs out of slots and purges the oldest connection. Call `add_httpd_clients()` during config validation, and
do not register the same clients again with `socket.consume_sockets()`.

If the user sets `CONFIG_LWIP_MAX_SOCKETS` in `sdkconfig_options`, the limit is capped at that value minus three
(the listening socket and the two UDP control sockets), even when that is below 7. For example, a value of 9 allows
6 clients.

`web_server_idf` registers the two UDP control sockets that the ESP-IDF HTTP server opens, so components never count
those.

Short requests that close right away, like a Prometheus scrape, need no registration, but each one holds a client
slot while it is served. If registered long-lived connections fill every slot, such a request makes the server purge
one of them, so register one more client when short requests must not interrupt them.

### Multi-Instance Component (Camera)

```python
def _consume_camera_sockets(config):
    """Each camera web server needs 3 sockets."""
    from esphome.components import socket
    # Use unique consumer name per instance
    socket.consume_sockets(3, f"camera_{config[CONF_ID]}")(config)
    return config

CONFIG_SCHEMA = cv.All(
    cv.Schema({
        cv.GenerateID(): cv.declare_id(ESP32Camera),
        # Camera configuration
    }).extend(cv.COMPONENT_SCHEMA),
    _consume_camera_sockets,
)
```

## How It Works

1. **Registration Phase:** During configuration validation, each component calls `socket.consume_sockets(count, name)` to register its socket needs. Clients of the shared web server call `web_server_base.add_httpd_clients(count, name)` instead, which registers the sockets the same way.

1. **Accumulation:** ESPHome stores these registrations in `CORE.data[KEY_SOCKET_CONSUMERS]`, accumulating the total across all components.

1. **Auto-Configuration:** The ESP32 platform's `_configure_lwip_max_sockets()` function reads the total and sets `CONFIG_LWIP_MAX_SOCKETS` in sdkconfig.

1. **User Overrides:** Manual user settings via `sdkconfig_options` are respected. ESPHome validates that manual values are sufficient and warns if too low.

## Platform Support

The Socket Consumption API is currently used by:

- ESP32 (ESP-IDF framework only)

Other platforms (ESP8266, RP2040, etc.) ignore socket registrations as they don't have configurable socket limits.

## Validation and Warnings

If a user manually sets `CONFIG_LWIP_MAX_SOCKETS` too low, ESPHome will issue a warning:

```yaml
esp32:
  framework:
    type: esp-idf
    sdkconfig_options:
      CONFIG_LWIP_MAX_SOCKETS: "8"  # Too low!

# Warning: CONFIG_LWIP_MAX_SOCKETS is set to 8 but components need 22 sockets:
#   - api: 4
#   - web_server: 5
#   - web_server_base: 1
#   - web_server_idf: 2
#   - mdns: 2
#   - ota: 1
#   - mqtt: 1
#   - camera_cam1: 3
#   - camera_cam2: 3
```

## Best Practices

1. **Count accurately:** Include all sockets your component creates, including hidden ones (like multicast).

1. **Document assumptions:** Comment your socket count calculation for maintainability.

1. **Use descriptive names:** The consumer name appears in validation warnings, so make it clear what component is using sockets.

1. **Test socket exhaustion:** Verify your component handles socket exhaustion gracefully if the limit is insufficient.

1. **Consider scaling:** If your component creates variable numbers of sockets based on configuration, calculate dynamically:

   ```python
   def _consume_sockets(config):
       from esphome.components import socket
       # 1 listener + configured max_clients
       count = 1 + config.get(CONF_MAX_CLIENTS, 5)
       socket.consume_sockets(count, "my_component")(config)
       return config
   ```

## Troubleshooting

**"error in creating socket (23)"** - ENFILE error indicates socket exhaustion. Component isn't registering socket usage or count is too low.

**Component not auto-loading socket** - Ensure `AUTO_LOAD = ["socket"]` or `DEPENDENCIES = ["socket"]` is set.

**Sockets not counted** - Verify `_consume_sockets` is in the `cv.All()` validator chain and returns the config.

**Manual override ignored** - User sdkconfig settings take precedence. Check for warnings about insufficient limits.

## See Also

- [TCP listener](/architecture/components/tcp_listener/)
- [IPv4 allow list](/architecture/components/ipv4_allow/)
- [Advanced Component Topics](/architecture/components/advanced)
- Socket Consumption API: PR [#11378](https://github.com/esphome/esphome/pull/11378)
