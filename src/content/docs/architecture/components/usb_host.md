---
title: "USB host"
---

## Periodic FIFO space

On the ESP32-S2 and ESP32-S3, the full-speed USB controller has 800 usable bytes of FIFO that it shares between
received packets, control and bulk OUT packets, and periodic (interrupt and isochronous) OUT packets. ESP-IDF rejects
an endpoint whose max packet size doesn't fit its share, and the default split leaves only 128 bytes for periodic OUT
packets, less than one packet of 48 kHz 16-bit stereo audio.

A component whose interrupt or isochronous endpoints use larger packets asks `usb_host` for space with
`usb_host.request_periodic_fifo(in_bytes=..., out_bytes=...)`, passing the largest packet in each direction. Never
set the `USB_HOST_FIFO_*` defines or the FIFO bias options yourself; `usb_host` combines the requests from all
components:

- It keeps the largest request in each direction: `in_bytes` sizes the FIFO for received packets, `out_bytes` the
  one for periodic OUT packets.
- If the requests fit the split ESP-IDF already uses (the default, or the `CONFIG_USB_HOST_HW_BUFFER_BIAS_*` option
  set in `sdkconfig_options`), it keeps that split.
- Otherwise it sizes a custom split: control and bulk keep 64 bytes, and each direction keeps at least 128 bytes.
- The leftover space goes to the requested directions, split evenly when both are requested, because a device can
  declare a larger max packet size than requested.
- Requests that don't fit in the 800 bytes fail validation. A custom split needs ESP-IDF 5.5 or later, so on an
  older release requests that need one fail validation too.
- If a `CONFIG_USB_HOST_HW_BUFFER_BIAS_*` option is set and the requests don't fit it, validation fails and names
  the option to remove.

Other variants keep ESP-IDF's default split. The ESP32-P4's high-speed controller already leaves 512 bytes for
periodic OUT.

Call the request from `CONFIG_SCHEMA` validation, so it is recorded before `usb_host` reconciles the requests in its
final validation:

```python
import esphome.config_validation as cv
from esphome.components import usb_host

DEPENDENCIES = ["usb_host"]


def _request_fifo(config):
    # A 48 kHz 16-bit stereo stream: up to 49 frames of 4 bytes per 1 ms packet.
    usb_host.request_periodic_fifo(out_bytes=196)
    return config


CONFIG_SCHEMA = cv.All(
    ...,
    _request_fifo,
)
```
