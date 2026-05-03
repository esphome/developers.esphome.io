---
date: 2026-02-12
authors:
  - bdraco
comments: true
---

# ESP32 Arduino Selective Compilation: Libraries Disabled by Default

ESP32 Arduino builds now disable all Arduino libraries by default. ESPHome uses ESP-IDF APIs directly for WiFi, networking, and BLE, so most Arduino libraries were compiled and linked but never called. External components that use Arduino libraries must explicitly enable them via `cg.add_library()`.

This is a **breaking change** for external components in **ESPHome 2026.2.0 and later**.

<!-- more -->

## Background

**[PR #13623](https://github.com/esphome/esphome/pull/13623): Reduce Arduino build size by 44% and build time by 36%**

Previously, the entire Arduino framework with all its libraries was compiled and linked into every ESP32 Arduino build, even though ESPHome uses ESP-IDF APIs directly for most functionality. This wasted significant flash, RAM, and compile time.

This PR enables `CONFIG_ARDUINO_SELECTIVE_COMPILATION` and disables all Arduino libraries by default. It also stubs out unused IDF managed components that Arduino's `idf_component.yml` would otherwise pull in.

### Results

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| **Flash** | 1,053,543 bytes (57.4%) | 588,647 bytes (32.1%) | **464,896 bytes (44% reduction)** |
| **Static RAM** | 39,124 bytes (11.9%) | 19,700 bytes (6.0%) | **19,424 bytes (50% reduction)** |
| **Build time** | 56.5 sec | 36.3 sec | **36% faster** |

## What's Changing

All Arduino libraries are now disabled by default on ESP32 Arduino builds. The full list of disabled libraries includes: `WiFi`, `Network`, `BLE`, `SPI`, `Wire`, `Preferences`, `HTTPClient`, `ESPmDNS`, `Ethernet`, `FS`, `SD`, `Update`, `WebServer`, and many more.

ESPHome's built-in components already call `cg.add_library()` for any Arduino libraries they need, so they are automatically re-enabled. External components that use Arduino libraries must do the same.

The mechanism is automatic — when you call `cg.add_library("WiFi", None)`, ESPHome:

1. Enables the `WiFi` Arduino library for compilation
2. Enables any Arduino library dependencies (e.g., `WiFi` depends on `Network`)
3. Un-stubs any IDF managed components that the library requires

## Who This Affects

**External components that:**

- Use Arduino library APIs (e.g., `WiFi.h`, `Wire.h`, `SPI.h`, `Preferences.h`) in C++ code without calling `cg.add_library()` in their Python `to_code()`
- Rely on Arduino libraries being implicitly available

**Users who:**

- Call Arduino library APIs directly in lambdas (e.g., `WiFi.localIP()`, `Preferences`)

**Standard YAML configurations are not affected** — ESPHome's built-in components automatically enable the libraries they need.

## Migration Guide

### External Components: Add cg.add_library() Calls

If your external component uses Arduino library APIs, add the corresponding `cg.add_library()` call in your `to_code()`:

```python
# In your component's __init__.py
import esphome.codegen as cg
from esphome.core import CORE

async def to_code(config):
    # Enable the Arduino libraries your C++ code uses directly
    if CORE.is_esp32 and CORE.using_arduino:
        cg.add_library("Preferences", None)  # For Preferences.h
        cg.add_library("FS", None)           # For FS.h
```

The `None` version parameter tells ESPHome to use the version bundled with the Arduino framework.

### Users: Add Libraries in YAML

If you call Arduino library APIs directly in lambdas:

```yaml
esphome:
  libraries:
    - WiFi        # For WiFi.h APIs in lambdas
    - Preferences # For Preferences.h APIs in lambdas
```

### Libraries Already Enabled by Built-in Components

Many Arduino libraries are already enabled by ESPHome's built-in components. If your external component lists any of these in its `DEPENDENCIES`, the library is already available — you do **not** need to add it again:

| Library | Enabled by ESPHome Component |
|---------|------------------------------|
| `WiFi` | `wifi` |
| `Wire` | `i2c` |
| `SPI` | `spi` |
| `HTTPClient` | `http_request` |
| `DNSServer` | `captive_portal` |
| `NetworkClientSecure` | `i2s_audio` (media_player) |

### Libraries You May Need to Add

These libraries are **not** enabled by any commonly-used built-in component. If your external component uses them directly, you must add `cg.add_library()`:

| Library | Header | Use Case |
|---------|--------|----------|
| `Preferences` | `Preferences.h` | NVS key-value storage |
| `BLE` | `BLE*.h` | Bluetooth Low Energy (Arduino API) |
| `BluetoothSerial` | `BluetoothSerial.h` | Classic Bluetooth serial |
| `FS` | `FS.h` | Filesystem base class |
| `SD` / `SD_MMC` | `SD.h` / `SD_MMC.h` | SD card access |

### When You Still Need to Add Already-Enabled Libraries

If your external component uses an Arduino library API **without** depending on the corresponding ESPHome component, you must add the library yourself. For example, if your component includes `WiFi.h` directly but does not list `wifi` in `DEPENDENCIES`:

```python
DEPENDENCIES = []  # No wifi dependency

async def to_code(config):
    if CORE.is_esp32 and CORE.using_arduino:
        cg.add_library("WiFi", None)  # Must add explicitly
```

## Supporting Multiple ESPHome Versions

The `cg.add_library()` call is safe on all ESPHome versions — it's a no-op for libraries that are already enabled. No version check is needed:

```python
async def to_code(config):
    # Safe on all versions - just always add it
    if CORE.is_esp32 and CORE.using_arduino:
        cg.add_library("WiFi", None)
```

On ESPHome < 2026.2.0, the library was already compiled by default, so the `add_library` call simply registers it in PlatformIO (which it was already). On ESPHome >= 2026.2.0, the call enables the library for selective compilation.

## Compilation Errors

If your component uses a disabled Arduino library without enabling it, you'll see errors like:

```
fatal error: WiFi.h: No such file or directory
fatal error: Preferences.h: No such file or directory
fatal error: Wire.h: No such file or directory
```

The fix is to add the corresponding `cg.add_library()` call in your Python code.

## Timeline

- **ESPHome 2026.2.0 (February 2026):** Arduino libraries disabled by default
- No deprecation period — behavior changed directly

## Finding Code That Needs Updates

```bash
# Find Arduino library includes in your C++ code
grep -rn '#include.*<WiFi\.h>' your_component/
grep -rn '#include.*<Wire\.h>' your_component/
grep -rn '#include.*<SPI\.h>' your_component/
grep -rn '#include.*<Preferences\.h>' your_component/
grep -rn '#include.*<HTTPClient\.h>' your_component/
grep -rn '#include.*<BLE' your_component/

# Check if your Python code already adds these libraries
grep -rn 'add_library' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [ESP32 Platform](https://esphome.io/components/esp32.html)
- [PR #13623: Reduce Arduino build size by 44% and build time by 36%](https://github.com/esphome/esphome/pull/13623)
