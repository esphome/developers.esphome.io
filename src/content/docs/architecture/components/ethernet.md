---
title: "Ethernet Connection State"
---

A component can be told when the Ethernet interface connects or disconnects, instead of polling `is_connected()`.
The listeners are a [`SLOT_LIST`](/contributing/code/#stl-container-guidelines): with none registered, they take no
space.

## Python

Register the component in `to_code`:

```python
import esphome.codegen as cg
from esphome.components import ethernet
from esphome.const import CONF_ID

DEPENDENCIES = ["ethernet"]


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await ethernet.register_connect_state_listener(var)
```

## C++

```cpp
#include "esphome/components/ethernet/ethernet_component.h"

class MyComponent : public Component, public ethernet::EthernetConnectStateListener {
 public:
  void on_ethernet_connect_state(bool connected) override {
    // On the main loop; is_connected() already returns the new state
  }
};
```

`on_ethernet_connect_state()` is called with the `on_connect` and `on_disconnect` triggers: `true` once the link is up
with an address, `false` when it is lost or `ethernet.disable` stops it.
