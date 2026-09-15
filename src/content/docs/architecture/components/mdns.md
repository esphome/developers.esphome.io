---
title: "mDNS Services"
---

ESPHome advertises mDNS services so that other software on the network can find the device. Which services exist is
decided at build time: the `mdns` component compiles in a service for each built-in feature that needs one (the native
API, the web server, and so on) plus any `services:` entries from the user's configuration. All of them are registered
when the `mdns` component sets up.

On ESP32, a component can also enable and disable one of these services at runtime. A typical use is a
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
warning in the log, when no service matches, the mDNS stack refused the change, or the `mdns` component failed to set
up.

### When to Call It

The `mdns` component sets up at `setup_priority::AFTER_CONNECTION`, after most components. A call made before then,
for example from your own `setup()`, does not touch the mDNS stack: it only records the requested state, and the
initial registration honours it. This is how a component starts its service disabled without it ever being announced.

Once `mdns` is running, each call adds or removes the service immediately. To follow a state that changes over time,
such as whether your server is listening, compare against a local copy and call only on a change, for example from
`loop()`:

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

The `is_ready()` check keeps the comparison the only work on most loop iterations while `mdns` is still starting.
`set_service_enabled()` itself blocks briefly on the mDNS task once it is running, so do not call it on every pass or
from a time-critical path.

### Starting a Service Disabled

Call the method with `false` from your component's `setup()`, before `mdns` has set up:

```cpp
void MyComponent::setup() {
#ifdef USE_MDNS_SUPPORTS_ENABLE_DISABLE
  this->mdns_->set_service_enabled("_my_service", "_tcp", false);
#endif
}
```

The service is then skipped during the initial registration and first appears when something enables it. This relies
on your component setting up before `mdns`, which is the case for every setup priority above `AFTER_CONNECTION`.

## Platform Support

- ESP32 with either the ESP-IDF or the Arduino framework: supported. Both use the ESP-IDF mDNS stack.
- ESP32 with OpenThread: not supported. Services are published through the SRP client, which has no equivalent.
- ESP8266, RP2040, LibreTiny, and other platforms: not supported. These platforms build their own mDNS backend
  without this feature, and `request_service_enable_disable()` returns `False` for them.

## See Also

- [Advanced Component Topics](/architecture/components/advanced)
- Runtime service enable/disable: PR [#19325](https://github.com/esphome/esphome/pull/19325)
