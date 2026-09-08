---
title: "Interfacing via Bluetooth LE"
---

ESPHome's Bluetooth LE support is built in three layers:

- **`ble_device_base`** — the platform-neutral layer. It owns the shared advertisement types
  (`ESPBTDevice`, `ESPBTUUID`, `ServiceData`, `ESPBLEiBeacon`), the listener interface
  (`ESPBTDeviceListener`) and the tracker contract (`BLEHub`). These types are owned here on every
  platform, with no chip-SDK types in their *neutral* surface; a small esp32-only compat surface
  is kept under `#ifdef USE_ESP32` for backward compatibility (detailed in the migration section).
- **Trackers** — one component per chip family that drives the chip's BLE controller and implements
  `BLEHub` (for example `esp32_ble_tracker`). Outside the esp32 compat carve-out above, trackers
  are the only place where chip SDK types appear.
- **Consumers** — the BLE advertisement sensors and `bluetooth_proxy`. Every in-tree advertisement
  sensor platform depends only on `ble_device_base` and binds to *whichever* tracker the user
  configured; `bluetooth_proxy` does the same on the neutral platforms, and keeps its historical
  `esp32_ble_tracker` binding on esp32.

Consumers resolve their tracker with `cv.use_id(BLEHub)`, which matches any component whose codegen
class declares `BLEHub` as a parent. There is no platform registry in either direction: supporting a
new BLE chip means writing one new tracker component plus a few mechanical registrations
(see [Implementing a tracker for a new chip](#implementing-a-tracker-for-a-new-chip)) — no sensor
or proxy changes. Out-of-tree hubs are unsupported.

## Writing a BLE advertisement sensor

A BLE sensor is a passive listener: the tracker parses each advertisement into an `ESPBTDevice` and
offers it to every registered listener.

### Python

```python
import esphome.codegen as cg
from esphome.components import ble_device_base, sensor
import esphome.config_validation as cv

AUTO_LOAD = ["ble_device_base"]

my_ns = cg.esphome_ns.namespace("my_ble_sensor")
MyBLESensor = my_ns.class_(
    "MyBLESensor", cg.Component, sensor.Sensor, ble_device_base.ESPBTDeviceListener
)

CONFIG_SCHEMA = (
    sensor.sensor_schema(MyBLESensor)
    .extend(ble_device_base.BLE_DEVICE_SCHEMA)
    .extend(cv.COMPONENT_SCHEMA)
)

async def to_code(config):
    var = await sensor.new_sensor(config)
    await cg.register_component(var, config)
    await ble_device_base.register_ble_device(var, config)
```

- `AUTO_LOAD = ["ble_device_base"]` pulls in the neutral layer.
- `ble_device_base.BLE_DEVICE_SCHEMA` declares the `ble_hub_id` option and resolves it against the
  configured tracker. Extending the schema (rather than appending a validator through `cv.All`)
  keeps `ble_hub_id:` a declared key on `PREVENT_EXTRA` schemas, so the explicit form validates.
  A missing tracker fails with an error naming the trackers for the target platform; an explicit
  `ble_hub_id:` defers to ID resolution (the multi-hub disambiguation case).
- `ble_device_base.register_ble_device(var, config)` registers the variable as a listener on the
  resolved hub and maintains the listener count used for compile-time trimming.
- `ble_device_base.add_service_uuid(var, service_uuid)` emits the width-matched
  `set_service_uuid16/32/128` setter call (16/32-bit as hex literals, 128-bit as a reversed byte
  array in BLE wire order) — use it instead of dispatching on UUID length in the platform.
- Platforms migrated from the esp32-only API prepend
  `ble_device_base.rename_legacy_hub_id("<component>")` to their `CONFIG_SCHEMA`: it warns on and
  auto-migrates an explicit legacy `esp32_ble_id:` until its removal in 2027.2.0.

Helpers previously imported from `esp32_ble_tracker` live in the base: `bt_uuid` (plus the
`BT_UUID16_FORMAT` / `BT_UUID32_FORMAT` / `BT_UUID128_FORMAT` length templates), `as_hex`,
`as_hex_array` and `as_reversed_hex_array`. The historical lowercase constant names remain
available as aliases from `esp32_ble` / `esp32_ble_tracker` for existing esp32-only components.

### C++

```cpp
#include "esphome/components/ble_device_base/ble_device.h"

namespace esphome::my_ble_sensor {

class MyBLESensor : public Component,
                    public sensor::Sensor,
                    public ble_device_base::ESPBTDeviceListener {
 public:
  bool parse_device(const ble_device_base::ESPBTDevice &device) override {
    if (device.address_uint64() != this->address_)
      return false;
    // inspect device.get_service_datas(), get_manufacturer_datas(), get_rssi(), ...
    return true;
  }
  void on_scan_end() override {}  // optional: called at the end of each scan period
};

}  // namespace esphome::my_ble_sensor
```

`parse_device()` returns `true` when the advertisement was recognized and handled. `ESPBTDevice`
exposes the address (`address_uint64()`, `address_str_to()`), RSSI, name, service UUIDs, service
data and manufacturer data — all in neutral types. Address-type constants
(`BLE_ADDR_TYPE_PUBLIC`, `BLE_ADDR_TYPE_RANDOM`, `BLE_ADDR_TYPE_RPA_PUBLIC`,
`BLE_ADDR_TYPE_RPA_RANDOM`) are provided by the base. `get_address_type()` is the one
platform-split accessor: it returns the historical `esp_ble_addr_type_t` on esp32 and `uint8_t`
elsewhere — compare it against the shared constants above, or use the fully portable
`address_type_str()` (`"PUBLIC"`, `"RANDOM"`, `"RPA_PUBLIC"`, `"RPA_RANDOM"`).

A listener-only component includes `ble_device_base/ble_device.h`, as above. A consumer that
calls hub methods (`BLEHub::get_capabilities()`, `request_scan_mode()`) includes
`ble_device_base/ble_hub_impl.h`, which binds the `BLEHub` alias; `ble_hub.h` is the contract
side that trackers include.

### Resolvable private addresses (IRK)

`ESPBTDevice::resolve_irk()` matches a resolvable private address against an Identity Resolving
Key. The AES code behind it is compiled only when requested — call
`ble_device_base.request_irk_support()` from `to_code` when your component accepts an `irk:` option:

```python
    if irk := config.get(CONF_IRK):
        ble_device_base.request_irk_support()
        cg.add(var.set_irk(ble_device_base.as_hex_array(str(irk))))
```

Without this call, `resolve_irk()` compiles to a stub that returns `false`.

### Encrypted advertisements

`ble_device_base/ble_aes_ccm.h` provides `aes_ccm_auth_decrypt()` and `aes128_encrypt_block()` for
payload formats that encrypt advertisements (BTHome v2, Xiaomi MiBeacon). Both run on a
self-contained software AES, so they behave identically on every platform and are covered by host
unit tests.

## Implementing a tracker for a new chip

A tracker drives the chip's scanner and provides the `BLEHub` method surface defined in
`ble_device_base/ble_hub.h`. `BLEHub` is not an abstract interface: exactly one tracker exists
per build, so it is a **compile-time alias** to that tracker's class, bound in
`ble_device_base/ble_hub_impl.h` and checked against the `BLEHubContract` C++20 concept with a
`static_assert` — no vtable, every hub call inlinable. Adding a chip therefore means two
mechanical edits besides the tracker itself: the tracker's codegen emits its
`USE_<CHIP>_BLE_TRACKER` define, and `ble_hub_impl.h` gains the matching
`#elif defined(USE_<CHIP>_BLE_TRACKER)` alias arm. A tracker missing part of the surface fails
the `static_assert` at compile time. Its Python module **must** call
`ble_device_base.register_hub_provider("<component>")` at import time — without it, configs that
bind through the generated `ble_hub_id` are rejected by the missing-tracker gate (an explicit
`ble_hub_id:` bypasses the registry). The registry is also what lets that error name real
component keys instead of a C++ class; a CI test asserts every in-tree `BLEHub` subclass
registered, so a forgotten call fails the build rather than a user's valid config. Finally, add a
one-line entry to `ble_device_base._IN_TREE_HUB_PROVIDERS`, keyed by *target platform* (for
example `"ln882x": "ln882h_ble_tracker"`) — it only phrases the missing-tracker error, but CI
asserts the table matches the in-tree hubs. Out-of-tree BLE hubs are not supported: a new chip is
supported by adding an in-tree tracker component.

```cpp
// The BLEHubContract surface every tracker provides (ble_hub.h):
void register_listener(ESPBTDeviceListener *listener);
void set_raw_advertisement_callback(RawAdvertisementCallback callback);
static constexpr HubCapabilities get_capabilities();
void get_adapter_mac(uint8_t out[6]);  // printable (MSB-first) order
bool scan_running();
bool scan_active();
bool request_scan_mode(bool active);   // required; return false when the mode cannot be honored

// Push hubs only — the concept requires both exactly when
// USE_BLE_SCANNER_STATE_CALLBACK is defined:
void set_scanner_state_callback(ScannerStateCallback callback);
ScannerState get_scanner_state();
```

The last two members are the optional **push path** for scanner-state transitions (today only
`esp32_ble_tracker` provides them). A push hub must emit a transition for every accepted *or
refused* mode request — on push builds consumers skip their own polled mode report
(`bluetooth_proxy` polls only when `USE_BLE_SCANNER_STATE_CALLBACK` is not defined), so a missed
emission means the subscriber never learns the mode changed. The `static_assert` cannot catch
that; it is a behavioral obligation.

### Scan-mode requests

Consumers (for example `bluetooth_proxy`, answering Home Assistant's scanner-mode request) call
`request_scan_mode(active)` to ask for active or passive scanning:

- **Return `true`** when the hub honors the request. Apply the mode immediately: restart a running
  scan with the new mode, and let an idle scan pick it up on its next start. Do **not** notify
  `on_scan_end()` for a mode-flip restart — the scan logically continues.
- **Return `false`** when the hub cannot change mode — a passive-only controller asked for
  active scanning, or the hub simply has no mode switch. The caller reports the real state back
  to its subscriber; the hub does not need to log. Every tracker implements
  `request_scan_mode()` — the concept requires it, there is no default.

A hub whose `HubCapabilities::active_scan` is `false` returns `!active`: a passive request is
already satisfied, an active one cannot be honored.

Whether the hub honors requests is advertised by `HubCapabilities::scan_mode_switch`, so
consumers can gate features on the switch without probing. It is independent of `active_scan`:
that bit describes what the **controller** can do, `scan_mode_switch` whether the hub exposes a
**runtime switch**. A hub may support active scanning and still keep
`scan_mode_switch = false` — `esp32_ble_tracker` does, driving its mode through its own tracker
API instead. Implementing `request_scan_mode()` and advertising the switch are independent: only
hubs that expose a working runtime switch set the bit (rp2, ln882h, and bk72xx, whose
`bk72xx_ble` reconciler drives active scanning even though the BDK scan API itself is
passive-only).

For each received advertisement, build a neutral device with
`ESPBTDevice::from_scan_result(mac, rssi, addr_type, data, data_len)` — `mac` is in BLE controller
order (least-significant octet first) — and offer it to each registered listener.

### Address byte order

Two orders exist, and mixing them up silently produces reversed addresses:

- **Controller order** (least-significant octet first) — what the radio delivers and what
  `from_scan_result()` takes. The raw-advertisement callback is different: `RawAdvertisement`
  carries the address already packed as a `uint64` — producers convert their native order at the
  emit site, so no byte-order convention crosses that contract.
- **Printable order** (most-significant octet first) — what users read, what `get_adapter_mac()`
  returns, and how `ESPBTDevice` stores the address internally.

To pack a controller-order MAC into the `uint64` the native API speaks (for example when
forwarding raw advertisements), use `ble_device_base::mac_lsb_first_to_uint64(mac)` — it produces
the same value `esp32_ble::ble_addr_to_uint64()` has always produced for that address, so all
platforms agree on the wire. For an already-parsed device use `ESPBTDevice::address_uint64()`,
which accounts for the MSB-first internal storage.

Chip differences are expressed as data, never as platform conditionals in consumers:
`HubCapabilities` reports whether the controller supports active scanning, whether advertisement
and scan response arrive merged, whether GATT connections are available, and whether the hub
honors runtime scan-mode requests (`scan_mode_switch` — the one bit with an in-tree consumer
today: `bluetooth_proxy` gates its mode-switch feature flag on it).

In Python, declare the codegen class with `BLEHub` as a parent so `use_id(BLEHub)` can resolve it:

```python
MyTracker = my_ns.class_("MyTracker", ble_device_base.BLEHub, cg.Component)
```

## Migrating from the esp32-only API

Before `ble_device_base`, the shared BLE types lived in `esp32_ble_tracker`. External components
written against that API map as follows. (Every in-tree sensor platform already runs on the
neutral API; until your external component migrates, the historical `esp32_ble_tracker` surface
keeps working unchanged on esp32.)

| Before (`esp32_ble_tracker`) | Now |
| --- | --- |
| `from esphome.components import esp32_ble_tracker` | `from esphome.components import ble_device_base` |
| `DEPENDENCIES = ["esp32_ble_tracker"]` | `AUTO_LOAD = ["ble_device_base"]` |
| `.extend(esp32_ble_tracker.ESP_BLE_DEVICE_SCHEMA)` | `.extend(ble_device_base.BLE_DEVICE_SCHEMA)` |
| `esp32_ble_id:` (the schema's generated tracker reference) | `ble_hub_id:` — only relevant when set explicitly |
| `esp32_ble_tracker.register_ble_device(var, config)` | `ble_device_base.register_ble_device(var, config)` |
| `esp32_ble_tracker::ESPBTDeviceListener` | `ble_device_base::ESPBTDeviceListener` — the esp32 listener is a *subclass* of the neutral one that additionally carried `set_parent()` / `parent_`; a component that used the tracker back-pointer needs another route to the hub |
| `#include "esphome/components/esp32_ble_tracker/esp32_ble_tracker.h"` | `#include "esphome/components/ble_device_base/ble_device.h"` |
| `ESPBTUUID::get_uuid()` / `ESPBTUUID::from_uuid()` | unchanged — kept as esp32-only members of the neutral type (`#ifdef USE_ESP32`) |
| `ESPBTDevice::parse_scan_rst()` / `get_scan_result()` | kept on esp32 for compatibility — prefer `from_scan_result()` and the neutral accessors; deprecation is a planned follow-up pending feedback on the raw scan-result fields, with no removal release announced |

On esp32, `esp32_ble_tracker` aliases the neutral advertisement types (and derives its listener
from the neutral one) for backward compatibility, so existing esp32-only components keep
compiling. Components that should work on every BLE platform must use the `ble_device_base` names
directly and must not include esp32 headers.

GATT client components (the `ble_client` family) remain esp32-only by component dependency
(`DEPENDENCIES = ["esp32_ble_tracker"]`) — they sit outside the neutral layer entirely.
Separately, `HubCapabilities::gatt` advertises whether the platform has a `bluetooth_connection`
GATT backend (esp32 and rp2 today), which is what `bluetooth_proxy` active connections build on.
