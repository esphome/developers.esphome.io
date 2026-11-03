---
title: "HTTPS for the Web Server (ESP32)"
---

On ESP32, the HTTP server shared by `web_server_base` can serve HTTPS. A component supplies the certificate and key at
run time, for example one the user uploaded, and can switch between HTTP and HTTPS without a restart.

HTTPS can't be combined with `web_server`, `captive_portal` or `prometheus` yet: `web_server` writes its event streams to
the socket directly, which would bypass TLS, and `prometheus` is advertised over mDNS as plain HTTP. A component that
uses HTTPS must serve its own pages through handlers added with `add_handler()`, and start the listener itself with
`init()`, since none of those components will.

## Python

Register the HTTPS server's client sockets in the component's schema, which also rejects the components above, and
compile HTTPS in from `to_code`:

```python
import esphome.config_validation as cv
from esphome.components import web_server_idf
from esphome.core import CORE
from esphome.types import ConfigType

CONFIG_SCHEMA = cv.All(
    cv.Schema({...}),
    web_server_idf.consume_ssl_sockets,
)


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
base->set_ssl_credentials(certificate, key);
base->init();  // once, in setup(): starts the listener

// Back to plain HTTP:
base->set_port(80);
base->set_ssl_credentials(nullptr, nullptr);
#endif
```

- `set_port()` and `set_ssl_credentials()` each restart a running listener, which closes open connections.
- Call them from the main loop, not from an HTTP request handler: the restart would wait for the handler's own task.
  To act on a request (for example, a certificate upload), defer the change to the main loop.
- `is_ssl()` is true while the listener is serving HTTPS.
- The certificate and key are checked before the server starts. The key must be unencrypted. If either is invalid,
  or the key doesn't belong to the certificate, the server logs an error and stays off. It doesn't fall back to plain HTTP by
  itself; if your component wants that, check `is_ssl()` after setting the credentials.

The server allows 4 open HTTPS connections, ESP-IDF's HTTPS default. When HTTPS is compiled in, plain HTTP is held to
the same 4 connections. Each uses about 26 KB of RAM for its TLS session,
or PSRAM when `CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC` is set.
