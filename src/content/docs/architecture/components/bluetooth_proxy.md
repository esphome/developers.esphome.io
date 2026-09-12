---
title: "Filtering Bluetooth proxy advertisements"
---

A `bluetooth_proxy` forwards every advertisement its radio hears to Home Assistant. In an
installation with many BLE devices — or many proxies — a large share of that traffic cannot be
used by any integration: passing phones and watches rotate their addresses every few minutes, and
some vendor broadcast traffic is not consumable at all.

ESPHome does not decide what is worth forwarding, since that depends entirely on the
installation. Instead `bluetooth_proxy` exposes a hook an external component can install a
predicate into, so filtering policy lives outside of core.

## Installing a filter

`AdvertisementFilter` is a slot holding one predicate. It has the same shape as
`ble_device_base::RawAdvertisementCallback`: a POD struct with no allocation and a single
subscriber.

```cpp
#include "esphome/components/bluetooth_proxy/bluetooth_proxy.h"

void MyFilter::setup() {
  this->parent_->set_advertisement_filter(
      {this, [](void *self, const ble_device_base::RawAdvertisement &adv) {
         return static_cast<MyFilter *>(self)->should_forward(adv);
       }});
}

bool MyFilter::should_forward(const ble_device_base::RawAdvertisement &adv) {
  return adv.rssi >= this->threshold_;
}
```

Returning `false` drops the advertisement. The predicate is consulted in
`on_raw_advertisement_()` **before** the packet is queued, so a dropped advertisement never
reaches the batch or the network.

A later `set_advertisement_filter()` call replaces an earlier one; there is one subscriber.

## Compiling the hook in

The hook is compiled out unless a component asks for it. Turn it on from your codegen:

```python
from esphome.components import bluetooth_proxy


async def to_code(config):
    bluetooth_proxy.enable_advertisement_filter()
    ...
```

:::caution
Call `enable_advertisement_filter()` rather than emitting the underlying define yourself. The
define is an implementation detail of `bluetooth_proxy` and may be renamed; this function is the
supported interface.
:::

Without it there is no slot, no member and no branch on the advertisement path, so a proxy that
installs no filter is unaffected — the same configuration compiles to a byte-identical image with
and without this hook present in core.

Declare `DEPENDENCIES = ["bluetooth_proxy"]` and take the proxy as a `cv.use_id` reference to get
the instance to install into.

## Writing the predicate

The predicate runs on the advertisement hot path, once per packet received, so:

- **Keep it cheap.** Order your checks so the cheapest reject first, and only walk the
  advertisement payload for packets that survive everything else.
- **Do not block.** No delays, no network calls, no waiting on a lock.
- **Do not publish state from it.** Accumulate counters and publish them from a sensor's update
  interval instead.

`RawAdvertisement` gives you the address, address type, RSSI, and the raw payload with its length.

## Filtering and device discovery

Filtering changes what Home Assistant can see, which has consequences worth designing around:

- Home Assistant selects which proxy connects to a device from among the proxies reporting it, so
  a proxy that filters out a device's advertisements will not be asked to connect to it.
- A device in a pairing or commissioning mode typically advertises from a rotating private
  address, so any filter keyed on the address cannot match it, and its address is not knowable in
  advance. Provide a way to exempt such devices — matching on an advertised service UUID works,
  since it is stable where the address is not.
- Filtering is not a security boundary. It governs what is forwarded, not what may connect. To
  restrict connections, filter at the controller level instead.
