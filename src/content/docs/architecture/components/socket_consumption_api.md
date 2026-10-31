---
title: "Socket Consumption API"
---

When developing components that use network sockets, you must register your socket requirements using the Socket Consumption API. ESPHome uses the registrations to size socket limits (for example `CONFIG_LWIP_MAX_SOCKETS` on ESP32), and on nRF52 to decide whether the TCP stack is built at all. See [Platform Support](#platform-support).

## Background

On ESP32 with ESP-IDF, the `CONFIG_LWIP_MAX_SOCKETS` setting limits how many sockets can be open simultaneously. If this limit is too low, components fail to create sockets with errors like:

```text
E (3555) httpd: httpd_server_init: error in creating msg socket (23)
```

The Socket Consumption API solves this by having components declare their socket needs during configuration validation. Each platform then configures its network stack from the total needs of all components.

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
    socket.consume_sockets(1, "my_component", socket.SocketType.TCP_LISTEN)(config)
    socket.consume_sockets(2, "my_component", socket.SocketType.TCP)(config)
    return config

CONFIG_SCHEMA = cv.All(
    cv.Schema({
        # Your component schema here
    }).extend(cv.COMPONENT_SCHEMA),
    _consume_sockets,  # Register socket usage during validation
)
```

The socket type defaults to `SocketType.TCP`. Pass the type that matches what the component opens:

- `SocketType.TCP`: outbound TCP connections and accepted TCP clients
- `SocketType.TCP_LISTEN`: listening TCP sockets
- `SocketType.UDP`: UDP sockets, including multicast

### 3. Calculate Your Socket Requirements

Count all sockets your component uses:

**Listening sockets:** Each server/listener typically needs 1 socket:

```python
# Web server with one listener
socket.consume_sockets(1, "my_server", socket.SocketType.TCP_LISTEN)
```

**Client connections:** Add expected concurrent connections:

```python
# API: 1 listener + 3 typical concurrent clients
socket.consume_sockets(1, "api", socket.SocketType.TCP_LISTEN)
socket.consume_sockets(3, "api", socket.SocketType.TCP)
```

**Multicast sockets:** Count IPv4 and IPv6 separately:

```python
# mDNS: separate sockets for IPv4 and IPv6
socket.consume_sockets(2, "mdns", socket.SocketType.UDP)
```

**Multiple instances:** Register per-instance if `MULTI_CONF` is enabled:

```python
def _consume_camera_sockets(config):
    # Each camera instance needs 3 sockets (1 listener + 2 clients)
    name = f"esp32_camera_web_server_{config[CONF_ID]}"
    socket.consume_sockets(1, name, socket.SocketType.TCP_LISTEN)(config)
    socket.consume_sockets(2, name, socket.SocketType.TCP)(config)
    return config
```

## Examples from Core Components

### Simple Client (MQTT)

```python
def _consume_mqtt_sockets(config):
    """MQTT needs one socket for broker connection."""
    from esphome.components import socket
    socket.consume_sockets(1, "mqtt", socket.SocketType.TCP)(config)
    return config

CONFIG_SCHEMA = cv.All(
    cv.Schema({
        # MQTT configuration
    }).extend(cv.COMPONENT_SCHEMA),
    _consume_mqtt_sockets,
)
```

### Server with Multiple Clients (Web Server)

```python
def _consume_web_server_sockets(config):
    """Web server needs 1 listener + 2 concurrent clients."""
    from esphome.components import socket
    socket.consume_sockets(1, "web_server", socket.SocketType.TCP_LISTEN)(config)
    socket.consume_sockets(2, "web_server", socket.SocketType.TCP)(config)
    return config

CONFIG_SCHEMA = cv.All(
    cv.Schema({
        # Web server configuration
    }).extend(cv.COMPONENT_SCHEMA),
    _consume_web_server_sockets,
)
```

### Multi-Instance Component (Camera)

```python
def _consume_camera_sockets(config):
    """Each camera web server needs 3 sockets."""
    from esphome.components import socket
    # Use unique consumer name per instance
    name = f"camera_{config[CONF_ID]}"
    socket.consume_sockets(1, name, socket.SocketType.TCP_LISTEN)(config)
    socket.consume_sockets(2, name, socket.SocketType.TCP)(config)
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

1. **Registration Phase:** During configuration validation, each component calls `socket.consume_sockets(count, name, type)` to register its socket needs. `type` is optional and defaults to `SocketType.TCP`.

1. **Accumulation:** ESPHome stores these registrations in `CORE.data[KEY_SOCKET_CONSUMERS]`, accumulating the total across all components.

1. **Auto-Configuration:** Each platform reads the totals and configures its network stack, as listed under [Platform Support](#platform-support). On ESP32, `_configure_lwip_max_sockets()` sets `CONFIG_LWIP_MAX_SOCKETS` in sdkconfig.

1. **User Overrides:** Manual user settings via `sdkconfig_options` are respected. ESPHome validates that manual values are sufficient and warns if too low.

## Platform Support

The Socket Consumption API is currently used by:

- **ESP32** (ESP-IDF framework): sizes `CONFIG_LWIP_MAX_SOCKETS`.
- **RP2040 and LibreTiny**: size the lwIP connection pools, with minimums on top.
- **nRF52** (Zephyr): decides whether Zephyr's TCP stack is built at all. A build with no registered `SocketType.TCP` or
  `SocketType.TCP_LISTEN` socket (and no `async_tcp`) leaves TCP out, so an unregistered TCP socket fails at run time.

Other platforms, such as ESP8266, ignore the registrations. Register your sockets anyway: a component that opens sockets
**must** register them, whatever platform you test on.

## Validation and Warnings

If a user manually sets `CONFIG_LWIP_MAX_SOCKETS` too low, ESPHome will issue a warning:

```yaml
esp32:
  framework:
    type: esp-idf
    sdkconfig_options:
      CONFIG_LWIP_MAX_SOCKETS: "8"  # Too low!

# Warning: CONFIG_LWIP_MAX_SOCKETS is set to 8 but components need 16 sockets:
#   - api: 4
#   - web_server: 3
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
