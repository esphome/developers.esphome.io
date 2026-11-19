---
title: "Ethernet Connection State"
---

A component that depends on the Ethernet link can be told when the interface connects or disconnects, instead of
checking `is_connected()` on every `loop()`. This is the Ethernet counterpart of the Wi-Fi component's connect state
listener (`wifi::WiFiConnectStateListener`). The listener code is compiled in only when a component asks for it, and
its storage is sized at build time by the number of components that do.

## Python

In the component's `to_code`, request a listener slot:

```python
import esphome.codegen as cg
from esphome.components import ethernet
import esphome.config_validation as cv
from esphome.const import CONF_ID

DEPENDENCIES = ["ethernet"]

my_component_ns = cg.esphome_ns.namespace("my_component")
MyComponent = my_component_ns.class_("MyComponent", cg.Component)

CONFIG_SCHEMA = cv.Schema({cv.GenerateID(): cv.declare_id(MyComponent)}).extend(
    cv.COMPONENT_SCHEMA
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    ethernet.request_ethernet_connect_state_listener()
```

Each call adds one slot. A request defines `USE_ETHERNET_CONNECT_STATE_LISTENERS`; a component that only requests a
listener in some configurations guards its listener code with it.

## C++

Implement `ethernet::EthernetConnectStateListener` and register in `setup()`:

```cpp
#include "esphome/components/ethernet/ethernet_component.h"
#include "esphome/core/component.h"

namespace esphome::my_component {

class MyComponent : public Component, public ethernet::EthernetConnectStateListener {
 public:
  void setup() override { ethernet::global_eth_component->add_connect_state_listener(this); }

  void on_ethernet_connect_state(bool connected) override {
    // Runs on the main loop; is_connected() already returns the new state
  }
};

}  // namespace esphome::my_component
```

`on_ethernet_connect_state()` is called on the main loop, at the same points as the `on_connect` and `on_disconnect`
triggers:

- `true` when the interface becomes connected: the link is up and the interface has its address.
- `false` when a connected interface loses its link or address, or is stopped with `ethernet.disable`.

Keep the callback short. A component with more to do can enable its `loop()` from the callback and do the work there.
