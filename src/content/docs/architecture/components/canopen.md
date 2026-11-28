---
title: "CANopen"
---

The `canopen` component is a *hub* on top of a [CAN bus](/architecture/components/canbus): it runs a CANopen (CiA 301)
stack, [CANopenNode](https://github.com/CANopenNode/CANopenNode), on a `canbus`. The YAML options are in the
[user documentation](https://esphome.io/components/canopen/). This page is for components built on the hub: device
profiles that drive another node on the bus, components that serve entries of the node's object dictionary (OD), and
code that talks SDO, NMT or raw frames.

A hub runs in one of two modes:

- **Node**, with a `node_id` (1-127): a CANopen device on the bus, with its own OD, an SDO server, NMT, heartbeat and
  EMCY. `is_client_only()` is false.
- **Client only**, without `node_id`: only an SDO client and raw frames. CANopenNode's node part isn't built.
  `is_client_only()` is true.

Several hubs can share a canbus; a frame one of them sends is also delivered to the others, as on a real bus.

Most features are compiled only when something uses them. A component turns on what it needs from its Python code
(see below); these calls set defines and CANopenNode build flags, so the features can't be switched on at runtime.

## Python

A component depends on the hub and takes a reference to it under `canopen_id`. A component that drives one other node
uses `CANOPEN_NODE_SCHEMA`, which adds `canopen_id` and the other node's `node_id`, and registers itself with
`register_node()`:

```python
import esphome.codegen as cg
from esphome.components import canopen
import esphome.config_validation as cv
from esphome.const import CONF_ID

DEPENDENCIES = ["canopen"]

CONF_HEARTBEAT_TIMEOUT = "heartbeat_timeout"

my_drive_ns = cg.esphome_ns.namespace("my_drive")
MyDrive = my_drive_ns.class_("MyDrive", cg.Component, canopen.CANopenNode)

CONFIG_SCHEMA = (
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(MyDrive),
            cv.Optional(CONF_HEARTBEAT_TIMEOUT): canopen.UINT16_MS,
        }
    )
    .extend(canopen.CANOPEN_NODE_SCHEMA)
    .extend(cv.COMPONENT_SCHEMA)
)
FINAL_VALIDATE_SCHEMA = canopen.final_validate_canopen_node


async def to_code(config):
    hub = await cg.get_variable(config[canopen.CONF_CANOPEN_ID])
    var = cg.new_Pvariable(config[CONF_ID], hub, config[canopen.CONF_NODE_ID])
    await cg.register_component(var, config)
    await canopen.register_node(
        var, config, sdo=True, nmt=True, heartbeat_timeout=config.get(CONF_HEARTBEAT_TIMEOUT)
    )
```

- `register_node(var, config, sdo=False, nmt=False, heartbeat_timeout=None)` compiles the SDO client (`sdo=True`) and
  the NMT master (`nmt=True`) if the component uses them. With a `heartbeat_timeout` (a `TimePeriod`, validated with
  `canopen.UINT16_MS`) the hub monitors the node's heartbeat, next to the user's `heartbeat_clients`; a node in both
  keeps the shorter timeout. The node's EMCY frames are always passed on.
- `final_validate_canopen_node` rejects a hub without `node_id` and a `node_id` equal to the hub's own.

A component that only uses the hub, without driving one node, takes `canopen_id` itself and turns on what it uses
from `to_code`:

- `canopen.enable_sdo_client()`: the SDO client (`read_sdo()`, `write_sdo()`, ...). It fails if a hub has
  `sdo_client: false`.
- `canopen.enable_nmt_master()`: the NMT master (`send_nmt()`).

`canopen.require_node_id(hub_id, what)` checks from a `FINAL_VALIDATE_SCHEMA` that the hub is a node, for components
that need its OD; it returns the hub's config.

`CANOPEN_NODE_SCHEMA`, `register_node()`, `final_validate_canopen_node` and `require_node_id()` are available in
ESPHome 2026.12.0 and later (esphome/esphome#23440); `enable_sdo_client()` (esphome/esphome#23299) and
`enable_nmt_master()` (esphome/esphome#23327) in the same release.

## Setup order

The hub's `setup()` builds the OD and initialises CANopenNode. It runs at `setup_priority::HARDWARE - 1`: after the
canbus, before most components and the default `on_boot` automations. What it builds from must be in place before:

- OD entries and handlers (`get_od()`), identity (`set_identity()`) and device information (`set_device_name()`,
  `set_hardware_version()`, `set_software_version()`). Set them from code generation (statements run in `main()`,
  before any `setup()`), or from the `setup()` of a component with a higher setup priority, e.g.
  `setup_priority::HARDWARE - 0.5`. OD entries and handlers added later are logged as errors and ignored.
- Everything else is runtime API. SDO and NMT requests made before the hub's `setup()` wait for it; a failed setup
  rejects them.

The hub's callbacks and its SDO callbacks run on the main loop, from the hub's `loop()` or from the canbus frame
callback. No locking is needed.

## SDO client

The SDO client reads and writes other nodes' OD entries. It has one channel: requests run one after another, in the
order they were made, up to 16 queued. Every request ends in exactly one call of its callback, a plain function with
a `void *context`. A request that can't be queued (queue full, invalid arguments, failed hub) gets its callback with
`SDO_RESULT_REJECTED` before the call returns `false`. Requests to the hub's own node id are served from its own OD,
without CAN frames.

```cpp
void MyComponent::read_voltage_() {
  this->canopen_->read_sdo<uint16_t>(0x21, 0x6000, 1, [](void *context, const canopen::SDOReply &reply) {
    auto *self = static_cast<MyComponent *>(context);
    if (reply.ok())
      self->publish_voltage_(reply.as<uint16_t>());
  }, this);
}
```

- `read_sdo<T>(node_id, index, sub, callback, context)` and `write_sdo<T>(node_id, index, sub, value, callback,
  context)` transfer values of 1, 2 or 4 bytes. A read checks that the reply has the size of `T`.
- `read_sdo_data()` and `write_sdo_data()` transfer buffers (strings, domains) with segmented transfer. The buffer is
  the caller's and must stay valid until the callback, so it can't be on the stack. A read longer than `capacity` is
  aborted.
- `SDOReply` has `result` (`SDOResult`), `abort_code` (for `ABORT` and `TIMEOUT`), the value (`as<T>()`: sign-extended
  for signed types, bit cast for `float`) or, for a buffer read, `data` and `len` (valid only during the callback).
- A write that ended in `TIMEOUT` or `TRANSPORT_ERROR` may still have been done on the other node.
- `cancel_sdo(context)` drops the queued requests of `context` and aborts its transfer in flight, without callbacks.
  Call it before the object `context` points to goes away.

The SDO client needs `canopen.enable_sdo_client()` (or `register_node(..., sdo=True)`); the code is guarded by
`USE_CANOPEN_SDO_CLIENT`. It is available in ESPHome 2026.12.0 and later (esphome/esphome#22410).

## Raw frames, heartbeat and EMCY

Frames that the OD doesn't describe, such as other devices' PDOs, reach a frame listener. The listener is a
`FrameListener` struct owned by the caller: it can't be removed and must stay alive, so make it `static` or a member of
a component, and each hub needs its own. It can be added before or after the hub's `setup()`. The callback gets every
standard-ID data frame with `(can_id ^ listener.can_id) & listener.mask == 0`, after CANopenNode has seen it; `data` is
valid only during the call.

```cpp
void MyComponent::setup() {
  // the first TPDO of node 0x21 (COB-ID 0x1A1)
  this->listener_ = {0x1A1, 0x7FF, [](void *context, uint32_t can_id, const uint8_t *data, uint8_t len) {
    static_cast<MyComponent *>(context)->on_pdo_(can_id, data, len);
  }, this};
  this->canopen_->add_frame_listener(this->listener_);
}
```

`send_frame(can_id, data, len)` sends a standard-ID data frame of up to 8 bytes right away. It returns `false` for a CAN
ID above `0x7FF`, more than 8 bytes, or if the canbus refuses it (for example when its transmit buffers are full); the
frame isn't queued or retried.

`add_on_heartbeat_callback()` gets every heartbeat frame on the bus as `(uint8_t node_id, NMTState state)`, and
`add_on_emcy_callback()` every EMCY frame as `(uint8_t node_id, const Emergency &emergency)`, from any node. They are
compiled with `USE_CANOPEN_HEARTBEAT` / `USE_CANOPEN_EMCY`, which the user's `on_heartbeat` / `on_emcy` triggers and
`register_node()` (EMCY only) define. A component that needs them otherwise defines them with `cg.add_define()`.
`decode_heartbeat()` and `decode_emcy()` decode these frames from a frame listener.

These are available in ESPHome 2026.12.0 and later (esphome/esphome#23266).

## The node

For a hub with `node_id`:

- `get_nmt_state()` is the node's own NMT state, `add_on_nmt_state_callback()` reports its changes, and
  `set_nmt_state()` moves it to `OPERATIONAL`, `PRE_OPERATIONAL` or `STOPPED` without an NMT master.
- `set_identity(vendor_id, product_code, revision_number, serial_number)` fills the identity object (`0x1018`), and
  `set_device_name()`, `set_hardware_version()` and `set_software_version()` the device information (`0x1008`,
  `0x1009`, `0x100A`). Before the hub's `setup()` only; the strings must outlive the component.

These are guarded by `USE_CANOPEN_NODE` and available in ESPHome 2026.12.0 and later (esphome/esphome#23299).

## Node monitoring and NMT master

The hub monitors the nodes in the user's `heartbeat_clients` and those registered with
`register_node(..., heartbeat_timeout=...)`. `add_on_node_event_callback()` gets their events as
`(uint8_t node_id, NodeEvent event, NMTState state)`:

- `NODE_EVENT_ONLINE`: the first heartbeat, or the first after a timeout.
- `NODE_EVENT_OFFLINE`: no heartbeat within the timeout.
- `NODE_EVENT_NMT_CHANGED`: the state in the heartbeat changed. It also follows `ONLINE` (unknown to the state) and
  `OFFLINE` (the state to unknown).
- `NODE_EVENT_RESET`: a boot-up message. The node restarted and lost the configuration it got at runtime, so
  configure it again.

`is_node_online(node_id)` and `get_node_state(node_id)` give the state from the last heartbeat, `false` /
`NMT_STATE_UNKNOWN` for a node that isn't monitored.

`send_nmt(node_id, command)` sends an NMT command (`NMTCommand`: start, stop, pre-operational, reset node, reset
communication) to one node, or to all nodes with `node_id` 0. A command to the hub's own id or to all nodes applies to
the hub's node too. It needs `canopen.enable_nmt_master()` (or `register_node(..., nmt=True)`) and a hub with
`node_id`, and is guarded by `USE_CANOPEN_NMT_MASTER`.

These are available in ESPHome 2026.12.0 and later (esphome/esphome#23327).

## Object dictionary

`get_od()` returns the node's `ObjectDictionary`. A component adds its entries before the hub's `setup()` (see
[Setup order](#setup-order)); the SDO server then serves them to other nodes. The hub uses the communication area
(`0x1000`-`0x1FFF`); components use the manufacturer-specific (`0x2000`-`0x5FFF`) or profile areas. Adding an index
twice fails the hub's setup. The value storage is the component's and must outlive it.

- `add_var(index, attr, data, len)`: one value.
- `add_array(index, attr, count, data, elem_len, n)`: sub-index 0 is `*count` (read only), sub-indexes 1 to `n` are the
  elements of `elem_len` bytes at `data`.
- `add_record(index, {{sub, attr, data, len}, ...})`: a record; sub-index 0 (the highest sub-index, `uint8_t`) is
  listed like the others.
- `add_string(index, str)`: a read-only string.

`attr` is `canopen::OD_READ`, `OD_WRITE` or `OD_READ_WRITE`, the access the SDO server allows.

```cpp
// from code generation, or a setup() that runs before the hub's
void MyComponent::add_od_entries() {
  auto &od = this->canopen_->get_od();
  od.add_var(0x2000, canopen::OD_READ_WRITE, &this->setpoint_, sizeof(this->setpoint_));
  od.add_string(0x2001, "my component");
}
```

The object dictionary is available in ESPHome 2026.12.0 and later (esphome/esphome#23299).

### OD handlers

By default an SDO access reads or writes the entry's storage. To run code instead, for example to act on a written
command or to generate a value when it is read, attach a handler with `get_od().set_object(index, handler)` before
the hub's `setup()`, before or after adding the entry: the hub attaches the handlers when it builds the OD. An entry
has at most one handler; a handler for an index that doesn't exist, or a second handler for one, fails the hub's setup,
as adding an index twice does. The handler derives from `canopen::OdObject` and defines `od_read()` and/or
`od_write()` with the signatures below; they aren't virtual, the hub calls the handler type's own functions. What a
handler doesn't define reads or writes the entry's storage.

```cpp
#include "esphome/components/canopen/canopen.h"

class Setpoint : public canopen::OdObject {
 public:
  canopen::OdResult od_write(canopen::OdStream stream, const void *buf, size_t count, size_t *done) {
    if (count != sizeof(uint16_t))
      return canopen::OdResult::OD_RESULT_TYPE_MISMATCH;
    uint16_t value;
    std::memcpy(&value, buf, sizeof(value));
    if (value > 1000)
      return canopen::OdResult::OD_RESULT_VALUE_HIGH;
    auto ret = stream.write_original(buf, count, done);  // store it, then act on it
    this->apply_(value);
    return ret;
  }
};

// with the entry, before the hub's setup()
od.add_var(0x2000, canopen::OD_READ_WRITE, &this->setpoint_value_, sizeof(uint16_t));
od.set_object(0x2000, &this->setpoint_handler_);
```

The handler gets every access to the entry: SDO uploads and downloads from other nodes, requests to the hub's own
node id, and `write_od()` / `read_od()`. The SDO server checks the entry's access attribute before calling it.

- `OdStream` describes the access: `index()`, `sub()`, `offset()` (bytes already transferred), `size()` (the entry's
  length) and `data()` (the entry's storage, `nullptr` if it has none). `read_original()` and `write_original()` do
  the default access.
- Large data comes in chunks. A handler that returns `OD_RESULT_PARTIAL` is called again for the next chunk and
  advances `set_offset()` itself. For an entry without a fixed size (a domain), `size()` is 0 during a download until
  the last chunk; a read handler sets the size of the upload with `set_size()` on its first call (`offset() == 0`).
- Any result other than `OD_RESULT_OK` or `OD_RESULT_PARTIAL` aborts the transfer with the matching SDO abort code.

`write_od(index, sub, data, len)` and `read_od(index, sub, data, max_len, len)` on the hub write or read the node's
own OD through its handler, as an SDO download or upload does, for example for commands that arrive in other frames.
They are synchronous, check the access attribute and return an `OdResult` (`OD_RESULT_DEVICE_STATE` before the hub's
`setup()`). A read
returns `OD_RESULT_DATA_LONG` if the value doesn't fit in `max_len`.

OD handlers, `write_od()` and `read_od()` are available in ESPHome 2026.12.0 and later (esphome/esphome#23440).

## Driving another node

A component that drives one other node, for example a device profile such as a CiA 402 drive, derives from
`canopen::CANopenNode` (`canopen_node.h`) and is generated with `CANOPEN_NODE_SCHEMA` and `register_node()` (see
[Python](#python)). Its constructor takes the hub and the node id.

```cpp
#include "esphome/components/canopen/canopen_node.h"
#include "esphome/core/component.h"

namespace esphome::my_drive {

class MyDrive : public Component, public canopen::CANopenNode {
 public:
  MyDrive(canopen::CANopenComponent *parent, uint8_t node_id) : canopen::CANopenNode(parent, node_id) {}

 protected:
  // also after a reset: the node is offline after its boot-up message, until its next heartbeat
  void on_node_online() override { this->configure_(); }

  void configure_() {
    // heartbeat producer time of the drive: 1000 ms
    this->write_sdo<uint16_t>(0x1017, 0, 1000, [](void *context, const canopen::SDOReply &reply) {
      auto *self = canopen::CANopenNode::from_context<MyDrive>(context);
      if (reply.ok())
        self->send_nmt(canopen::NMTCommand::NMT_COMMAND_START);
    });
  }
};

}  // namespace esphome::my_drive
```

- Hooks for this node's events: `on_node_online()`, `on_node_offline()`, `on_node_nmt_changed(state)` and
  `on_node_reset()` while the node is monitored (a `heartbeat_timeout`, or the node in `heartbeat_clients`), and
  `on_node_emcy(emergency)` always. `on_node_nmt_changed()` also follows `on_node_online()` and `on_node_offline()`:
  act on online and reset, and use it as state information.
- State: `is_online()`, `get_nmt_state()`, `is_operational()`, `get_node_id()`, `get_canopen()`.
- The hub's calls with this node's id: `read_sdo<T>()`, `write_sdo<T>()`, `read_sdo_data()`, `write_sdo_data()`,
  `cancel_sdo()` (with `sdo=True`) and `send_nmt()` (with `nmt=True`).
- The SDO context defaults to the `CANopenNode` subobject, so `cancel_sdo()` drops the component's requests. In a
  callback, get the component back with `CANopenNode::from_context<T>(context)`, not a `static_cast` from `void *`:
  with other base classes, such as `Component`, the `CANopenNode` subobject isn't at the component's address.

`CANopenNode` is available in ESPHome 2026.12.0 and later (esphome/esphome#23440).
