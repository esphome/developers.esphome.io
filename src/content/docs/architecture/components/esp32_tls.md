---
title: "TLS on ESP32"
---

The esp-tls and mbedTLS settings are sdkconfig flags shared by the whole build. Never write them from a component;
ask the `esp32` platform with these helpers so requests from different components add up.

- `esp32.require_certificate_bundle()`: the connection verifies the server certificate against the built-in root
  bundle. `esp32.require_full_certificate_bundle()` asks for the full set of roots instead of the common ones.
- `esp32.allow_insecure_tls()`: the connection skips verification. It switches `CONFIG_ESP_TLS_INSECURE` and
  `CONFIG_ESP_TLS_SKIP_SERVER_CERT_VERIFY` on and never off, because another component may need them too.

Setting the two insecure flags with `add_idf_sdkconfig_option` yourself breaks other components: writing `False`
when your own `verify_ssl` is true turns them off for the whole build.

```python
if config[CONF_VERIFY_SSL]:
    esp32.require_certificate_bundle()
else:
    esp32.allow_insecure_tls()
```
