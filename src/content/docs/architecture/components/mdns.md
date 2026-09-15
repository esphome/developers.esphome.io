---
title: "mDNS Services"
---

ESPHome advertises mDNS services so that other software on the network can find the device. Which services exist is
decided at build time: the `mdns` component compiles in a service for each built-in feature that needs one (the native
API, the web server, and so on) plus any `services:` entries from the user's configuration. All of them are registered
when the `mdns` component sets up.

On ESP32 with ESP-IDF, a component can also enable and disable one of these services at runtime. A typical use is a
service that must not be found before the server behind it is listening: the component starts the service disabled and
enables it once its server is running, and disables it again if the server is stopped.

## Python

In the component's `to_code`, ask the `mdns` component for the runtime API:

```python
from esphome.components import mdns
from esphome.const import CONF_ID
from esphome.core import CORE


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    if mdns.request_service_enable_disable():
        mdns_var = await cg.get_variable(CORE.config["mdns"][CONF_ID])
        cg.add(var.set_mdns(mdns_var))
```

`request_service_enable_disable()` returns `True` when the platform supports the API. In that case it adds the
`USE_MDNS_SUPPORTS_ENABLE_DISABLE` define and keeps the compiled service list stored, which is required to re-register a
service later. It returns `False`, and adds nothing, when:

- the target is not an ESP32,
- the `mdns` component is not in the configuration or has `disabled: true`, or
- `openthread` is in the configuration, which publishes services through the Thread SRP client instead of the mDNS
  stack.

Always branch on the return value. When it is `False` the service is advertised the whole time the device is up, exactly
as if the component had never asked, so the component must still work in that case.

## C++

Guard everything that touches the API with the define, since the method does not exist otherwise:

```cpp
#ifdef USE_MDNS_SUPPORTS_ENABLE_DISABLE
#include "esphome/components/mdns/mdns_component.h"
#endif

class MyComponent : public Component {
 public:
  void loop() override;

#ifdef USE_MDNS_SUPPORTS_ENABLE_DISABLE
  void set_mdns(mdns::MDNSComponent *mdns) { this->mdns_ = mdns; }
#endif

 protected:
#ifdef USE_MDNS_SUPPORTS_ENABLE_DISABLE
  mdns::MDNSComponent *mdns_{nullptr};
  bool mdns_advertised_{false};
#endif
};
```

The method is:

```cpp
bool MDNSComponent::set_service_enabled(const char *service_type, const char *proto, bool enabled);
```

It finds the compiled-in service whose type and protocol match, including the leading underscores (for example
`"_my_service"` and `"_tcp"`), then adds it to or removes it from the mDNS stack. It returns `true` when the service
is in the requested state afterwards, which includes the case where it already was. It returns `false`, with a
warning in the log, when no service matches or the mDNS stack refused the change.

### When to Call It

The `mdns` component sets up at `setup_priority::AFTER_CONNECTION`, after most components, and only builds its service
list then. A call from your own `setup()` therefore runs too early: the service is not found yet and the request is
lost. Call it once `mdns` reports ready instead, for example from `loop()`:

```cpp
void MyComponent::loop() {
#ifdef USE_MDNS_SUPPORTS_ENABLE_DISABLE
  // is_ready() is false until mdns has finished setup(), and stays false if it failed.
  if (!this->mdns_->is_ready()) {
    return;
  }
  bool advertise = this->server_is_running_();
  if (advertise != this->mdns_advertised_) {
    this->mdns_advertised_ = advertise;
    this->mdns_->set_service_enabled("_my_service", "_tcp", advertise);
  }
#endif
}
```

Keeping a local copy of the advertised state, as above, means the comparison is the only work on most loop
iterations. `set_service_enabled()` itself blocks briefly on the mDNS task, so do not call it on every pass or from a
time-critical path.

### Starting a Service Disabled

Each compiled service carries an `enabled` flag that defaults to `true`. When the define is set, a service whose flag
is `false` is skipped during the initial registration and only appears once something enables it. The flag is set where
the `mdns` component builds its service list, in `compile_records_()` in `mdns_component.cpp`:

```cpp
#ifdef USE_MDNS_SUPPORTS_ENABLE_DISABLE
  // Starts disabled; the component enables it once its server is running
  my_service.enabled = false;
#endif
```

This is currently only possible for the built-in services defined there. Services from the user's `services:`
configuration always start enabled.

## Platform Support

- ESP32 with ESP-IDF: supported.
- ESP32 with OpenThread: not supported. Services are published through the SRP client, which has no equivalent.
- ESP8266, RP2040, LibreTiny, and other platforms: not supported. These platforms build their own mDNS backend
  without this feature, and `request_service_enable_disable()` returns `False` for them.

## See Also

- [Advanced Component Topics](/architecture/components/advanced)
- Runtime service enable/disable: PR [#19325](https://github.com/esphome/esphome/pull/19325)
