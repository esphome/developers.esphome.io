---
title: "TLS on ESP32"
---

On ESP32 with ESP-IDF, the esp-tls and mbedTLS settings are sdkconfig flags shared by the whole build. A
component must not write them itself. It asks the `esp32` platform through the helpers below, so requests from
different components add up instead of overwriting each other.

## Verified connections

A component that checks the server certificate needs trusted root certificates. Call
`esp32.require_certificate_bundle()` from `to_code`. It keeps the mbedTLS stack in the build and turns on
`CONFIG_MBEDTLS_CERTIFICATE_BUNDLE`, which is off until a component asks for it. A user value in
`sdkconfig_options` still wins. `http_request` calls it when `verify_ssl` is true and no `ca_certificate_path` is
given; `audio` calls it for HTTPS streams.

The default bundle holds the common roots only. A component that must reach a service signed by a less common
root calls `esp32.require_full_certificate_bundle()` instead. Users can also pick the full bundle with
`use_full_certificate_bundle: true` under `esp32: framework: advanced:`.

The bundle helpers do not pull in esp-tls. A component that connects through esp-tls or the ESP-IDF HTTP client
also calls `esp32.request_tls()` or `esp32.request_http_client()`, and attaches the bundle on the C++ side with
`esp_crt_bundle_attach` under `#if CONFIG_MBEDTLS_CERTIFICATE_BUNDLE`.

## Unverified connections

Some components let the user turn verification off, for example with `verify_ssl: false`, and some never verify
(`nextion` downloads display files this way). esp-tls refuses such a connection unless `CONFIG_ESP_TLS_INSECURE`
and `CONFIG_ESP_TLS_SKIP_SERVER_CERT_VERIFY` are set. Call `esp32.allow_insecure_tls()` when the component will
skip verification.

The helper only ever switches the flags on. Once one component needs an unverified connection the whole build
allows them, and a component that verifies its own connections must not undo that. For the same reason a component
must never set the two options with `add_idf_sdkconfig_option` itself: writing `False` when its own `verify_ssl`
is true turns the flags back off for every component in the build. Call the helper when verification is off and
do nothing otherwise:

```python
if CORE.is_esp32:
    esp32.request_http_client()
    cg.add(var.set_verify_ssl(config[CONF_VERIFY_SSL]))
    if config[CONF_VERIFY_SSL]:
        esp32.require_certificate_bundle()
    else:
        esp32.allow_insecure_tls()
```

The flags only permit skipping verification. The C++ side still has to leave `crt_bundle_attach` and `cert_pem`
unset for that connection, as `http_request` does when `verify_ssl_` is false.

## See Also

- [Socket Consumption API](/architecture/components/socket_consumption_api/)
- [Advanced Component Topics](/architecture/components/advanced)
