---
title: "remote_base Protocol Methods Are No Longer Virtual and Receiver Lists Are Sized From Codegen"
date: 2026-10-14
authors: bdraco
---

`RemoteProtocol<T>` no longer declares `encode()`, `decode()` and `dump()` as virtual, the receiver's listener and dumper lists are fixed size `StaticVector`s sized during code generation, and a protocol's source file is only compiled when the configuration uses it. External components that derive from `RemoteProtocol`, that register listeners or dumpers from C++, or that use a protocol class from their own C++ need small changes.

This is a **developer breaking change** for external components in **ESPHome 2026.10.0 and later**.

<!-- excerpt -->

## Background

**[PR #19084](https://github.com/esphome/esphome/pull/19084): Make protocol methods non-virtual and size receiver lists from codegen**

Every protocol class derived from `RemoteProtocol<T>`, but nothing ever used one through a base pointer: dumpers, triggers, binary sensors and transmit actions are all templates on the concrete protocol type. The virtual methods only cost a vtable per protocol and kept the linker from dropping the `encode()`, `decode()` and `dump()` bodies a build never calls. The receiver kept its listeners and dumpers in `std::vector`s that grew on the heap during setup, even though code generation knows exactly how many there are. The CI memory report on the PR measured 14.6 KB less flash on the ESP8266 test build with a receiver and the ir_rf_proxy platforms, and 11.9 KB less on the ESP32 IDF build; the rc_switch protocol table also moves from RAM into flash.

### Why a clean break

Every protocol added to `remote_base` has cost every user of the component, whether their configuration used it or not: with the methods virtual and every source file always compiled, each protocol's vtable, its `encode()`, `decode()` and `dump()` bodies and its dumper and trigger instantiations all stayed in the image. There are 35 protocols in tree and more arrive most releases, so that per-protocol tax kept growing for every `remote_receiver` and `remote_transmitter` user, most of whom use one or two protocols. Making the methods non-virtual and compiling only the requested sources removes the tax. There is no way to keep `override` compiling on a method that is no longer virtual, so a deprecation window is not possible and the change lands as a clean break with this guide.

## What's Changing

Three things, each with its own migration step below:

1. `RemoteProtocol<T>` is an empty marker. `encode()`, `decode()` and `dump()` are plain member functions, checked by C++20 concepts wherever a protocol is used.
1. `RemoteReceiverBase::register_listener()` and `register_dumper()` only accept a registration when code generation counted a slot for it; with no slot counted the call fails a `static_assert`. A registration from C++ `setup()` has no slot.
1. A protocol's `*_protocol.cpp` is only compiled when something in the configuration requests it: a dumper, a trigger, a binary sensor, a transmit action, or an explicit request from a component's `to_code()`.

## Who This Affects

External components that:

- derive a protocol class from `remote_base::RemoteProtocol<T>` and mark its methods `override`
- call `register_listener()` or `register_dumper()` on a remote receiver from C++
- use a protocol class such as `remote_base::NECProtocol` from their own C++ without a dumper, trigger, binary sensor or transmit action for it in the configuration

A GitHub code search found protocol classes with `override` in `pauln/esphome-linp-doorbell-g04`, `brown-studios/esphome-maxxfan-protocol`, `alexyao2015/ESPHomeYAML`, `kitsuned/esphome-configs`, `pputerla/esphome-custom-components` and `Weissnix4711/esphome-opentherm-custom`, and C++ side listener or dumper registration in `AzonInc/Doorman`, `maciekczwa/esphome_alecto`, `leonardpitzu/esphome_somfy`, `swoboda1337/somfy-esphome`, `CoMPaTech/esphome_ct`, `berfenger/esphome-mantra-rf-433` and `ryanh7/esphome-custom-components`.

**Standard YAML configurations are not affected**, with one exception: a lambda that calls `id(tx).transmit<remote_base::NECProtocol>(data)` needs that protocol referenced somewhere else in the configuration, see below.

## Migration Guide

### Protocol classes: drop `override`

The methods are no longer virtual, so the compiler reports each `override`:

```cpp
// Before
class MyProtocol : public RemoteProtocol<MyData> {
 public:
  void encode(RemoteTransmitData *dst, const MyData &data) override;
  optional<MyData> decode(RemoteReceiveData src) override;
  void dump(const MyData &data) override;
};

// After
class MyProtocol : public RemoteProtocol<MyData> {
 public:
  void encode(RemoteTransmitData *dst, const MyData &data);
  optional<MyData> decode(RemoteReceiveData src);
  void dump(const MyData &data);
};
```

The signatures are unchanged. The `RemoteProtocolDecoder`, `RemoteProtocolDumper` and `RemoteProtocolEncoder` concepts check them wherever the protocol is used, so a mismatch is reported at the `DECLARE_REMOTE_PROTOCOL(...)` line, normally in the protocol's own header; a protocol declared without that macro sees it at its first use.

### Listeners and dumpers: register from Python

The receiver's lists are sized during code generation. A component that registered itself from C++ has no slot:

```cpp
// Before, in setup()
this->receiver_->register_listener(this);
```

Register from `to_code()` instead, so the slot is counted. For a component whose schema uses `CONF_RECEIVER_ID`, one call does both halves:

```python
from esphome.components import remote_base

async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    # sets the receiver on the entity and registers it as a listener
    await remote_base.attach_receiver(var, config)
```

`attach_receiver(var, config, key=...)` accepts a different config key, `remote_base.register_listener(var, config)` registers without calling `set_receiver()`, and `remote_base.add_listener(receiver, var)` and `remote_base.add_dumper(receiver, dumper)` take the receiver object directly.

When a configuration counted no slot at all, a C++ registration fails the build with a message naming this fix; when the counted slots are already used, the same message is logged at boot.

### Protocols used from C++: request the source file

A component that uses a protocol class directly in C++, with no dumper, trigger, binary sensor or transmit action for it in the configuration, must keep the source file in the build:

```python
# in to_code()
remote_base.request_protocol("coolix")
```

Otherwise the protocol's `.cpp` is filtered out and the link fails with an undefined reference to its `encode()`, `decode()` or `dump()`. Unknown names raise during code generation and list the valid ones.

The same applies to a YAML lambda that uses a protocol class, for example `id(tx).transmit<remote_base::NECProtocol>(data)`: reference that protocol somewhere else in the configuration, with a `dump` entry, an `on_nec` trigger or a `remote_transmitter.transmit_nec` action.

### Receiver platforms: one call for listeners and dumpers

A platform deriving from `RemoteReceiverBase` that called the protected `call_listeners_()` and `call_dumpers_()` separately now calls `call_listeners_dumpers_()`, which already existed as the combined entry point; the two were merged so each list can compile out on its own.

## Supporting Multiple ESPHome Versions

`override` on a method that is no longer virtual is a compile error, so a component that has to build on 2026.9 and 2026.10 needs a version guard around the declarations:

```cpp
#include "esphome/core/version.h"

class MyProtocol : public RemoteProtocol<MyData> {
 public:
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 10, 0)
  void encode(RemoteTransmitData *dst, const MyData &data);
  optional<MyData> decode(RemoteReceiveData src);
  void dump(const MyData &data);
#else
  void encode(RemoteTransmitData *dst, const MyData &data) override;
  optional<MyData> decode(RemoteReceiveData src) override;
  void dump(const MyData &data) override;
#endif
};
```

For listeners, `remote_base.register_listener(var, config)` exists on both versions, so a component whose schema uses `CONF_RECEIVER_ID` can move the registration to Python once and drop the C++ call with no guard. `attach_receiver`, `add_listener` and `request_protocol` only exist from 2026.10.0; keep the C++ registration for older versions:

```python
# in to_code()
try:
    from esphome.components.remote_base import attach_receiver
except ImportError:
    # ESPHome < 2026.10.0 registers the listener from setup()
    receiver = await cg.get_variable(config[CONF_REMOTE_RECEIVER_ID])
    cg.add(var.set_receiver(receiver))
else:
    await attach_receiver(var, config, CONF_REMOTE_RECEIVER_ID)
```

```cpp
void MyComponent::setup() {
#if ESPHOME_VERSION_CODE < VERSION_CODE(2026, 10, 0)
  this->receiver_->register_listener(this);
#endif
}
```

`request_protocol` follows the same shape; before 2026.10.0 every protocol source file is compiled, so the failing import is safe to ignore.

## Timeline

- **ESPHome 2026.10.0 (October 2026):** protocol methods are no longer virtual, receiver lists are sized from codegen, unused protocol sources are not compiled. No deprecation period: `override` on a non-virtual method cannot be kept compiling.

## Finding Code That Needs Updates

```bash
# Protocol classes that still mark the methods override
grep -rn 'RemoteProtocol<' your_component/
grep -rnE '(encode|decode|dump)\(.*\) override' your_component/

# Listener or dumper registration from C++
grep -rn 'register_listener\|register_dumper' your_component/

# Protocol classes used from C++ or lambdas
grep -rn 'remote_base::[A-Za-z0-9]*Protocol' your_component/ your_configs/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #19084: Make protocol methods non-virtual and size receiver lists from codegen](https://github.com/esphome/esphome/pull/19084)
- [Remote Transmitter component](https://esphome.io/components/remote_transmitter.html)
- [Remote Receiver component](https://esphome.io/components/remote_receiver.html)
