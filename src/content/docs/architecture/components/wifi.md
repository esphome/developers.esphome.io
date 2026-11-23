---
title: "Wi-Fi Network Slots"
---

The Wi-Fi station list is sized at build time: one slot per network in the YAML, at least one. A component that adds
networks of its own with `add_sta()` must reserve slots for them, or `add_sta()` drops every network past the list's
size without an error.

## Python

Reserve the slots in `to_code`:

```python
import esphome.codegen as cg
from esphome.components import wifi
from esphome.const import CONF_ID

DEPENDENCIES = ["wifi"]

# The most networks this component adds with add_sta()
MAX_NETWORKS = 5


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    wifi.request_wifi_network_slots(MAX_NETWORKS)
```

Requests from several components add up. The count must be at least 1, the request must come from `to_code` (the
list's size is written at `FINAL` priority, and a request after that raises), and the YAML networks plus all requests
can be at most 127.

## C++

```cpp
#include "esphome/core/component.h"
#include "esphome/components/wifi/wifi_component.h"

namespace esphome::my_component {

class MyComponent : public Component {
 public:
  // Wi-Fi's own setup replaces the list with saved credentials, so add networks after it
  float get_setup_priority() const override { return setup_priority::AFTER_WIFI; }

  void setup() override {
    wifi::WiFiAP ap;
    ap.set_ssid("guest");
    ap.set_password("guest-password");
    // Goes after the YAML networks, in one of the requested slots
    wifi::global_wifi_component->add_sta(ap);
  }
};

}  // namespace esphome::my_component
```

`set_sta()` replaces the whole list with one network, so it needs no request. That also removes the networks added
with `add_sta()`, for example when new credentials come in through Improv, the captive portal or `wifi.configure`.
`WIFI_NETWORK_COUNT` is the size of the list: the YAML networks plus every request, at least one.
