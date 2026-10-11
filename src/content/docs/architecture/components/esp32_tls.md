---
title: "TLS on ESP32"
---

On ESP32 with ESP-IDF, the esp-tls and mbedTLS options are sdkconfig flags, and every flag is one value shared by
the whole build. A component must not write these flags itself; it asks the `esp32` platform through the helpers
below, so requests from different components add up instead of overwriting each other.

## Verified connections

A component that opens a TLS connection and checks the server certificate needs a set of trusted root
certificates. Call `esp32.require_certificate_bundle()` from `to_code`. It keeps the mbedTLS TLS stack in the
build and turns on `CONFIG_MBEDTLS_CERTIFICATE_BUNDLE`. The bundle is off by default, so `esp_crt_bundle.c` is
compiled and `gen_crt_bundle` runs only when a component asks for it. The `esp32` platform applies the request at
`CoroPriority.FINAL`, after every component has run, and a user value in `sdkconfig_options` still wins.
`http_request` calls it when `verify_ssl` is true and no `ca_certificate_path` is given; `audio` calls it for
HTTPS streams.

The default bundle holds only the common roots (`CONFIG_MBEDTLS_CERTIFICATE_BUNDLE_DEFAULT_CMN`). It covers most
public sites, including Let's Encrypt, DigiCert, Google and Amazon, and is about 51 KB smaller than the full set.
A component that must reach a service signed by a less common root calls `esp32.require_full_certificate_bundle()`
instead; it implies `require_certificate_bundle()`. Users can also turn on the full bundle themselves with
`use_full_certificate_bundle: true` under `esp32: framework: advanced:`.

The bundle helpers do not pull in the esp-tls wrapper. A component that connects through esp-tls or the ESP-IDF
HTTP client also calls `esp32.request_tls()` or `esp32.request_http_client()`. On the C++ side the connection
attaches the bundle with `esp_crt_bundle_attach`, guarded by `#if CONFIG_MBEDTLS_CERTIFICATE_BUNDLE`.

## Unverified connections

Some components let the user turn verification off, for example with a `verify_ssl: false` option, and some always
connect without checking the server (`nextion` downloads display files this way). esp-tls refuses such a
connection unless `CONFIG_ESP_TLS_INSECURE` and `CONFIG_ESP_TLS_SKIP_SERVER_CERT_VERIFY` are set. Call
`esp32.allow_insecure_tls()` when the component will skip verification; it switches both flags on.

The helper only ever switches the flags on. Both are global, so once one component needs an unverified connection
the whole build allows them, and a component that verifies its own connections must not undo that request. For the
same reason a component must never set the two options itself with `add_idf_sdkconfig_option`: writing `False`
when its own `verify_ssl` is true flips the flags back off for every component in the build, and the other
component's connections fail. Call the helper when the user turned verification off and do nothing otherwise:

```python
if CORE.is_esp32:
    esp32.request_http_client()
    cg.add(var.set_verify_ssl(config[CONF_VERIFY_SSL]))
    if config[CONF_VERIFY_SSL]:
        esp32.require_certificate_bundle()
    else:
        esp32.allow_insecure_tls()
```

The flags only permit skipping verification. The C++ code still has to leave `crt_bundle_attach` and `cert_pem`
unset for that connection, as `http_request` does when `verify_ssl_` is false.

## See Also

- [Socket Consumption API](/architecture/components/socket_consumption_api/)
- [Advanced Component Topics](/architecture/components/advanced)
- `allow_insecure_tls()`: PR [#20506](https://github.com/esphome/esphome/pull/20506)
