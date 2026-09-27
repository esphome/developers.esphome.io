---
title: "nRF52: nRF Connect SDK Projects Fetched Only When Needed"
date: 2026-09-26
authors: bdraco
---

nRF52 builds with the native `sdk-nrf` toolchain now download only the nRF Connect SDK west projects a build needs,
instead of all of them. External components that use an SDK module outside the default set must request it with
`include_west_project()`.

This is a **breaking change** for external components in **ESPHome 2026.10.0 and later**.

<!-- excerpt -->

## Background

**[PR #19735](https://github.com/esphome/esphome/pull/19735): Fetch only the nRF Connect SDK projects a build needs**

The nRF Connect SDK manifest lists about 50 west projects, 2.2 GB on disk, and most of them serve features ESPHome never
uses (Matter, TF-M, WiFi, LoRaWAN, Azure IoT and more). Matter and cmock also pull git submodules with their full
history. The first nRF52 build downloaded all of it.

A fresh install now fetches four projects (five from SDK 3.1), about 1 GB on disk instead of 2.2 GB and roughly a
third of the previous download, and a component adds whatever else it needs.
download, and a component adds whatever else it needs.

## What's Changing

These west projects are always fetched:

| Project | Provides |
| --- | --- |
| `zephyr` | Zephyr RTOS |
| `hal_nordic` | nrfx drivers and the MDK |
| `nrfxlib` | SoftDevice Controller, MPSL, ZBOSS and other Nordic libraries |
| `cmsis` | Arm CMSIS headers |
| `cmsis_6` | Arm CMSIS 6 core headers, SDK 3.1 and later |

Every other project in the manifest is left out unless a component asks for it. The install is shared by every config on
the machine, so a later build that needs another project fetches only what is missing; nothing is removed again.

ESPHome's built-in components already request what they use:

| Project | Requested by |
| --- | --- |
| `tinycrypt` up to SDK 3.1, `mbedtls` and `oberon-psa-crypto` from 3.2 | `zephyr_ble_server` (and `ble_nus` through it) |
| `segger` | `debug` (RTT logging) |
| `openthread` and `mbedtls`; `oberon-psa-crypto` too from SDK 2.7 | `openthread` |
| `zcbor`, `mcuboot` | `zephyr_mcumgr` OTA |
| `mcuboot` | any build with sysbuild on |

An SDK installed before this change keeps every project and is not touched.

## Who This Affects

**External components that** use a Zephyr or nRF Connect SDK module from a project outside the default set, for example
CMSIS DSP, LittleFS or FatFs, without one of the built-in components above pulling it in.

**Standard YAML configurations are not affected**; the built-in components request the projects they need.

There is no YAML override for users: an external component that needs another project has to be updated to request it.

## Migration Guide

Call `include_west_project()` from your component's `to_code()` with the west project name from the SDK manifest
(`nrf/west.yml`, or the `zephyr/west.yml` it imports):

```python
# In your component's __init__.py
from esphome.components.nrf52.framework import include_west_project


async def to_code(config):
    include_west_project("cmsis-dsp")
    # ... rest of to_code
```

The call only records the project; the download happens when the build installs the SDK. Project names change between
SDK versions (TinyCrypt left the manifest in SDK 3.2, for example), so check
`CORE.data[KEY_CORE][KEY_FRAMEWORK_VERSION]` when a project only exists in some of them. A name the manifest does not
have fails the build with a message listing the requested projects.

## Supporting Multiple ESPHome Versions

```python
async def to_code(config):
    try:
        from esphome.components.nrf52.framework import include_west_project
    except ImportError:
        # ESPHome < 2026.10.0 fetches every project
        pass
    else:
        include_west_project("cmsis-dsp")
```

## Build Errors

A missing project shows up as a Kconfig symbol that cannot be enabled or a header that cannot be found:

```text
warning: TINYCRYPT (defined at modules/Kconfig.tinycrypt:9) has direct dependencies ... with value n
fatal error: zcbor_common.h: No such file or directory
```

The fix is to add the matching `include_west_project()` call. To see every project and which ones were left out, run
`west list -a -f "{name} {active}"` in the SDK folder, `frameworks/<version>` under `~/Library/Caches/esphome/sdk-nrf`
on macOS, `~/.cache/esphome/sdk-nrf` on Linux and `%LOCALAPPDATA%\esphome\sdk-nrf` on Windows, or under
`ESPHOME_SDK_NRF_PREFIX` when that is set. The `west` module lives in the matching `penvs/<version>` Python environment
next to it.

## Timeline

- **ESPHome 2026.10.0 (October 2026):** only the default projects are fetched
- No deprecation period; behavior changed directly

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [nRF52 Platform](https://esphome.io/components/nrf52/)
- [PR #19735: Fetch only the nRF Connect SDK projects a build needs](https://github.com/esphome/esphome/pull/19735)
- [West manifest project filter](https://docs.zephyrproject.org/latest/develop/west/manifest.html#active-and-inactive-projects)
