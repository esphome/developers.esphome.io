---
date: 2026-05-14
authors:
  - bdraco
comments: true
---

# Modbus Server Split Out of modbus_controller

Modbus server mode has been split out of `modbus_controller` into a new dedicated `modbus_server` component. Configurations that used `modbus_controller` as a Modbus server (the `role: server` setting lives on the `modbus:` bus, not on `modbus_controller`) must move their `server_registers:` and `server_courtesy_response:` blocks under a new top-level `modbus_server:` entry.

This is a **breaking change** for YAML configurations using server mode in **ESPHome 2026.5.0 and later**.

<!-- more -->

## Background

**[PR #15509](https://github.com/esphome/esphome/pull/15509): Split modbus_server from modbus_controller**

Server-mode register handling was wedged into `modbus_controller` alongside its client-mode polling. The two roles share a transport (the `modbus:` bus) but almost nothing else: server mode dispatches inbound requests to user lambdas, while client mode polls outbound register reads on a schedule. Keeping both in the same component made the controller heavier than it needed to be, complicated review of server-side fixes, and prevented the server logic from sharing helpers with future modbus-based components.

`modbus_server` is a thin `Component` that implements `modbus::ModbusDevice` and owns the register table plus the optional courtesy response, with no client-mode machinery. The migration in this PR is intentionally close to a copy/paste — functional improvements to server mode (out-of-range handling, multi-register transactions, parser fixes, etc.) come in follow-up PRs.

### Flash savings (approximate)

| Configuration | Before | After |
|---|---|---|
| Pure server | `modbus_controller` ~4.5 KB | `modbus_server` ~1.8 KB |
| Pure client | `modbus_controller` ~6.4 KB | `modbus_controller` ~3.9 KB |

Devices that previously combined client and server in one `modbus_controller` will now have two separate components, but each is much smaller.

## What's Changing

### YAML keys moved

| Old (under `modbus_controller`) | New (under `modbus_server`) |
|---|---|
| `server_registers:` | `registers:` |
| `server_courtesy_response:` | `courtesy_response:` |

### `modbus_controller` is now client-only

`role: server` on the bus is still supported — that selects the transport-layer role. What changed is that the **register table** is no longer accepted on `modbus_controller`. Put it on `modbus_server` instead.

## Who This Affects

**YAML configurations that used `modbus_controller` as a Modbus server** — typically battery management bridges (BMS protocol bridges, yamBMS forks), EVSE bridges, energy/inverter proxies, and any "act as a register slave" project. Pure-client `modbus_controller` users (the more common case — reading from third-party Modbus devices) are not affected.

## Migration Guide

```yaml
# Before
modbus:
  role: server

modbus_controller:
  - address: 1
    server_registers:
      - address: 0x0001
        value_type: U_WORD
        read_lambda: "return id(my_sensor).state;"
    server_courtesy_response:
      enabled: true
      register_value: 0
```

```yaml
# After
modbus:
  role: server

modbus_server:
  - address: 1
    registers:
      - address: 0x0001
        value_type: U_WORD
        read_lambda: "return id(my_sensor).state;"
    courtesy_response:
      enabled: true
      register_value: 0
```

A `modbus:` bus has a single role and your device occupies one side of it: `modbus_controller` requires `role: client`, `modbus_server` requires `role: server`, and the bus schema enforces this — you cannot mix the two on the same `modbus:` instance. Modbus only allows one client per bus, so the "both on one device" pattern was never valid; if a previous config had `server_registers:` under a client-mode `modbus_controller`, those registers were silently inactive. Run a second `modbus:` bus on a different UART if you need a device that's both a server on one wire and a client on another.

## Timeline

- **2026.5.0:** Server-mode keys removed from `modbus_controller`; new `modbus_server` component active.

This is a clean break — there is no deprecation period or migration shim. `modbus_controller` configs that still contain `server_registers:` or `server_courtesy_response:` will fail validation on 2026.5.0. (For contrast, the earlier `modbus_controller` → `modbus::helpers` namespace refactor in 2026.4.0 kept deprecation shims through 2026.10.0 — that pattern doesn't apply here because there's no in-place rename to forward, and the affected configs are caught at config-validation time with a precise error message rather than at runtime.)

## Finding Code That Needs Updates

```bash
# YAML — find server-mode keys still under modbus_controller.
# -E (extended regex) keeps the alternation portable across GNU and BSD/macOS grep.
grep -rEn 'server_registers:|server_courtesy_response:' your_configs/
```

## Questions?

If you have questions about migrating your configuration, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15509](https://github.com/esphome/esphome/pull/15509) — Split modbus_server from modbus_controller
- [PR #15291](https://github.com/esphome/esphome/pull/15291) and [PR #14172](https://github.com/esphome/esphome/pull/14172) — Earlier helper-function refactor that enabled this split ([blog post](2026-04-09-modbus-helpers-refactor.md))
- [ESPHome Modbus Server documentation](https://esphome.io/components/modbus_server/) (new page)
- [ESPHome Modbus Controller documentation](https://esphome.io/components/modbus_controller/)
