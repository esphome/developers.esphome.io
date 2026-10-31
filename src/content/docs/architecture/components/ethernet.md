---
title: "Ethernet Lifecycle"
description: "Coordinate ESP32 Ethernet driver shutdown, PHY operations and asynchronous restart."
---

`ethernet::EthernetComponent` provides `enable()`, `disable()`, `is_enabled()`, `is_disabled()` and
`is_connected()`. Include `esphome/components/ethernet/ethernet_component.h` to use these methods.
The stop acknowledgement described below, including `is_driver_stopped()`, is available only under
`USE_ESP32` and was introduced by [esphome#19734](https://github.com/esphome/esphome/pull/19734).

Call lifecycle methods and inspect their status from the ESPHome main loop. The driver's event task
publishes the STOP acknowledgement through an atomic release/acquire operation; this does not make
all component methods or state safe to access from arbitrary tasks or interrupts.

## Disabled Versus Stopped

`disable()` requests a driver stop. On ESP32, if `esp_eth_stop()` succeeds, `is_disabled()` becomes
`true` immediately. Delivery of `ETHERNET_EVENT_STOP` is asynchronous, so this does not yet confirm
that the event handler has completed the stop transition.

`is_driver_stopped()` returns `true` only when the component is disabled and either the driver has
never started or its STOP event has been delivered. Starting the driver clears the acknowledgement
before calling `esp_eth_start()`. Use this method when a component must wait before changing PHY
configuration, powering down the PHY or performing another operation that requires a stopped driver.
`is_connected()` reports `false` while the component is disabled, even if the connection state machine
has not yet processed the stop.

Check that Ethernet setup succeeded and the driver is available before using this boundary.
Initialization errors mark the component failed, so `eth->is_failed()` must return `false`. With
`enable_on_boot: false`, the driver is not installed until `enable()` is first called, and
`eth->get_esp_netif()` returns `nullptr` until that installation has run, so check it as well. A
never-started driver is not evidence that initialization succeeded. Keep ownership of stop, PHY
operations and restart in one main-loop state machine so another caller cannot restart the driver
between checking the boundary and performing the operation.

For example, a component can call this helper from successive `loop()` iterations after successful
Ethernet setup:

```cpp
#ifdef USE_ESP32
bool stop_for_phy_operation(ethernet::EthernetComponent *eth) {
  eth->disable();
  return eth->is_driver_stopped();
}
#endif
```

If the helper returns `false`, defer the PHY operation and retry on a later iteration. Do not busy-wait
for the STOP event. Once it returns `true`, complete the PHY operation before requesting `enable()`.
Stop calling the helper after advancing to the next phase; each `disable()` cancels a pending enable.

## Deferred Enable

Calling `enable()` while a successful stop is waiting for STOP delivery records a pending enable.
The main loop performs the restart after the acknowledgement arrives. The event handler does not
start the driver. Calling `disable()` again cancels that pending request.

A sequence of `disable(); enable();` therefore schedules a restart, but `is_enabled()` and the YAML
`ethernet.enabled` condition remain `false` until the driver start succeeds. An immediate status check
after `enable()` is not proof that the restart has completed. Connectivity requires a separate check
of `is_connected()`.

## Failure Handling

If `esp_eth_stop()` fails, `disable()` leaves the component's enabled/disabled status unchanged and
does not claim a confirmed stop. Do not infer that the driver is safe for PHY operations from an
error code alone: ESP-IDF can change its internal state before later timer, MAC or event-posting steps
fail, without rolling that state back. In particular, `ESP_ERR_INVALID_STATE` on a retry is not a
replacement for the stop acknowledgement.

If a driver start fails, the component attempts stop cleanup. Another start requires a delivered STOP
acknowledgement. Partial driver failures or a missing STOP event can therefore prevent further
restart until reboot. Treat this as an unavailable interface and allow other interfaces or recovery
logic to continue; do not bypass the stop boundary to force a retry.
