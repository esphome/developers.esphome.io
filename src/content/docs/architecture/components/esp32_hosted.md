---
title: "ESP32 Hosted link state"
---

The `esp32_hosted` component connects a host chip without its own radio, such as the ESP32-P4, to a co-processor
such as an ESP32-C6, which provides Wi-Fi and Bluetooth over SDIO or SPI. The `esp_hosted` library brings up the link
to the co-processor in its own task, usually before any component's `setup()` runs, and the link can go down again
later.

A component that must not start something while the link is being brought up can ask whether the link is up and get a
callback when it changes. A typical case is an SD card on the other slot of the SD/MMC host that `esp32_hosted` uses
for SDIO. ESP-IDF changes the clock of that host outside its own lock, so initialising the card while `esp_hosted`
initialises the co-processor can disturb both. The SD card component waits for the link before it mounts the card.

## Python

In the component's `to_code`, pass the `esp32_hosted` component to your component when it is in the configuration:

```python
import esphome.codegen as cg
from esphome.const import CONF_ID
from esphome.core import CORE
from esphome.types import ConfigType


async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    if (hosted := CORE.config.get("esp32_hosted")) is not None:
        cg.add(var.set_esp32_hosted(await cg.get_variable(hosted[CONF_ID])))
```

Do not add `esp32_hosted` to `DEPENDENCIES` or `AUTO_LOAD` only to use this API. Without `esp32_hosted` in the
configuration there is no link to wait for, so the component must work without it.

## C++

Guard the code with `USE_ESP32_HOSTED`, which is defined when `esp32_hosted` is in the configuration:

```cpp
#ifdef USE_ESP32_HOSTED
#include "esphome/components/esp32_hosted/esp32_hosted.h"
#endif

class MyComponent : public Component {
 public:
  void setup() override;

#ifdef USE_ESP32_HOSTED
  void set_esp32_hosted(esp32_hosted::ESP32Hosted *hosted) { this->hosted_ = hosted; }
#endif

 protected:
  void start_();

#ifdef USE_ESP32_HOSTED
  esp32_hosted::ESP32Hosted *hosted_{nullptr};
#endif
};
```

The API is:

```cpp
// True while the link to the co-processor is up
bool ESP32Hosted::is_linked() const;

// Called with true when the link comes up and with false when it goes down
template<typename F> void ESP32Hosted::add_on_link_callback(F &&callback);
```

The callback takes a single `bool`. A link that is already up when the callback is added is not reported again, so
check `is_linked()` as well:

```cpp
void MyComponent::setup() {
#ifdef USE_ESP32_HOSTED
  if (this->hosted_ != nullptr) {
    this->hosted_->add_on_link_callback([this](bool linked) {
      if (linked)
        this->start_();
    });
    if (!this->hosted_->is_linked())
      return;
  }
#endif
  this->start_();
}
```

The callback runs again each time the link comes back up, so `start_()` must do nothing when the work has already been
started.

## When the State Changes

- `is_linked()` is `false` until `esp32_hosted` has found the state, even when the link came up before `setup()`. It
  finds the state from a short task that it starts in its own `setup()`, so the first `true` arrives a little later
  through the callback. Do not block in `setup()` to wait for it.
- Callbacks always run on the main loop, never on the `esp_hosted` tasks, so they can use the component's members
  without locks.
- Changes that come faster than one loop pass are merged, and only the latest state is reported.
- The link goes down when the transport fails or `esp_hosted` is stopped. After a transport failure, `esp_hosted`
  restarts the device unless that is turned off in its configuration, so a `false` callback is usually followed by a
  reboot. Keep that callback short.

## Platform Support

- ESP32-P4 and ESP32-H2 hosts with `esp32_hosted`: supported.
- Every other platform, and ESP32 configurations without `esp32_hosted`: `USE_ESP32_HOSTED` is not defined and there is
  no link to wait for.

## See Also

- [Advanced Component Topics](/architecture/components/advanced)
