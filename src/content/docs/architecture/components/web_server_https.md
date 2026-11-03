---
title: "HTTPS for the Web Server (ESP32)"
---

On ESP32, the HTTP server shared by `web_server_base` can serve HTTPS. Users can set a fixed certificate in YAML
(`web_server_idf: ssl:`). A component can also supply the certificate and key at runtime, for example one the user
uploaded, and switch between HTTP and HTTPS without a restart.

HTTPS can't be combined with `web_server` or `captive_portal` yet: `web_server` writes its event streams to the socket
directly, which would bypass TLS. A component that uses HTTPS must serve its own pages through handlers added with
`add_handler()`.

## Python

In the component's `to_code`, compile HTTPS in:

```python
from esphome.components import web_server_idf
from esphome.core import CORE
from esphome.types import ConfigType


async def to_code(config: ConfigType) -> None:
    if CORE.is_esp32:
        web_server_idf.enable_ssl()
```

`enable_ssl()` adds the `USE_WEBSERVER_SSL` define, keeps the server side of mbedTLS (ESPHome builds it client-only
otherwise) and includes ESP-IDF's `esp_https_server`. Don't set those sdkconfig options yourself; see
[TLS on ESP32](/architecture/components/esp32_tls/).

## C++

Use `WebServerBase` (`esphome/components/web_server_base/web_server_base.h`):

```cpp
#ifdef USE_WEBSERVER_SSL
// certificate and key are PEM strings. They are not copied and must stay valid while the server runs.
auto *base = web_server_base::global_web_server_base;
base->set_port(443);
base->set_ssl_credentials(certificate, key);  // restarts the listener if it is running

// Back to plain HTTP:
base->set_port(80);
base->set_ssl_credentials(nullptr, nullptr);
#endif
```

- `set_port()` takes effect when the listener next starts. `set_ssl_credentials()` restarts it, so call `set_port()`
  first.
- Restarting the listener closes open connections.
- `is_ssl()` is true while the listener is serving HTTPS.
- If the certificate or key is invalid, the server logs an error and stays off. It doesn't fall back to plain HTTP by
  itself; if your component wants that, check `is_ssl()` after setting the credentials.

Each HTTPS connection uses about 26 KB of RAM for its TLS session, or PSRAM when `CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC`
is set. On boards without PSRAM, keep the number of connections small.
