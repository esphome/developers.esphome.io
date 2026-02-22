---
date: 2026-02-20
authors:
  - bdraco
comments: true
---

# ESP32: Unused Built-in IDF Components Excluded by Default

ESP32 builds now exclude unused built-in IDF components by default to reduce compile time. This applies to **both ESP-IDF and Arduino framework** builds, since both use the ESP-IDF build system underneath. External components that use excluded IDF APIs (e.g., `esp_vfs_fat.h`, `esp_http_client.h`, `esp_eth.h`) must explicitly re-enable them via `include_builtin_idf_component()`.

This is a **breaking change** for external components in **ESPHome 2026.2.0 and later**.

<!-- more -->

## Background

**[PR #13610](https://github.com/esphome/esphome/pull/13610): Reduce compile time by excluding unused IDF components**
**[PR #13664](https://github.com/esphome/esphome/pull/13664): Exclude additional unused IDF components**

Previously, all ESP-IDF built-in components were compiled for every ESP32 build (both IDF and Arduino frameworks), even when ESPHome never uses them. Components like `fatfs`, `spiffs`, `esp_hid`, `mqtt`, and many others were compiled and linked but never called. Excluding them significantly reduces compile time.

## What's Changing

The following ESP-IDF components are now excluded by default:

| Excluded Component | Description |
|---|---|
| `cmock` | Unit testing mock framework |
| `driver` | Legacy driver shim |
| `esp_adc` | ADC driver |
| `esp_driver_dac` | DAC driver |
| `esp_driver_i2s` | I2S driver |
| `esp_driver_mcpwm` | Motor control PWM driver |
| `esp_driver_pcnt` | Pulse counter driver |
| `esp_driver_rmt` | RMT driver |
| `esp_driver_touch_sens` | Touch sensor driver |
| `esp_driver_twai` | TWAI/CAN driver |
| `esp_eth` | Ethernet driver |
| `esp_hid` | HID host/device support |
| `esp_http_client` | HTTP client |
| `esp_https_ota` | ESP-IDF HTTPS OTA |
| `esp_https_server` | HTTPS server |
| `esp_lcd` | LCD controller drivers |
| `esp_local_ctrl` | Local control over HTTPS/BLE |
| `espcoredump` | Core dump support |
| `fatfs` | FAT filesystem |
| `mqtt` | ESP-IDF MQTT library |
| `openthread` | Thread protocol |
| `perfmon` | Xtensa performance monitor |
| `protocomm` | Protocol communication for provisioning |
| `spiffs` | SPIFFS filesystem |
| `ulp` | ULP coprocessor |
| `unity` | Unit testing framework |
| `wear_levelling` | Flash wear levelling for fatfs |
| `wifi_provisioning` | WiFi provisioning |

ESPHome's built-in components already call `include_builtin_idf_component()` to re-enable any they need, so they are automatically handled. External components that use these IDF APIs must do the same.

## Who This Affects

**External components that:**

- Include ESP-IDF headers from excluded components (e.g., `esp_vfs_fat.h`, `esp_http_client.h`, `rmt_encoder.h`)
- Use ESP-IDF APIs provided by excluded components without calling `include_builtin_idf_component()` in their Python `to_code()`

**Standard YAML configurations are not affected** — ESPHome's built-in components automatically re-enable the IDF components they need.

!!! note
    Arduino framework builds have additional exclusions for Arduino-specific managed components. See the [ESP32 Arduino Selective Compilation](2026-02-12-esp32-arduino-selective-compilation.md) post for details on Arduino library changes.

## Migration Guide

### External Components: Add include_builtin_idf_component() Calls

If your external component uses IDF APIs from an excluded component, call `include_builtin_idf_component()` in your `to_code()`:

```python
# In your component's __init__.py
from esphome.components.esp32 import include_builtin_idf_component

async def to_code(config):
    include_builtin_idf_component("fatfs")
    include_builtin_idf_component("wear_levelling")  # If using wear levelling
    # ... rest of to_code
```

### Users: YAML Override (No Code Changes)

If you cannot modify the external component, add the required IDF components in your YAML. This works with both ESP-IDF and Arduino framework builds:

```yaml
esp32:
  framework:
    advanced:
      include_builtin_idf_components:
        - fatfs
        - wear_levelling
```

### Components Already Re-enabled by Built-in ESPHome Components

Many IDF components are already re-enabled by ESPHome's built-in components. If your external component lists any of these in its `DEPENDENCIES`, the IDF component is already available:

| IDF Component | Re-enabled by ESPHome Component |
|---|---|
| `esp_driver_rmt` | `remote_transmitter`, `remote_receiver`, `neopixelbus`, `esp32_rmt_led_strip` |
| `esp_driver_i2s` | `i2s_audio` |
| `esp_driver_pcnt` | `pulse_counter`, `hlw8012` |
| `esp_driver_twai` | `esp32_can` |
| `esp_driver_touch_sens` | `esp32_touch` |
| `esp_driver_dac` | `esp32_dac` |
| `esp_adc` | `adc` |
| `esp_eth` | `ethernet` |
| `esp_http_client` | `http_request`, `audio` |
| `esp_lcd` | `display` |
| `mqtt` | `mqtt` |
| `openthread` | `openthread` |
| `driver` | `esp32_can`, `esp32_touch`, `opentherm` |

### IDF Components You May Need to Add

These IDF components are **not** re-enabled by any commonly-used built-in component. If your external component uses them, you must call `include_builtin_idf_component()`:

| IDF Component | Headers | Use Case |
|---|---|---|
| `fatfs` | `esp_vfs_fat.h` | FAT filesystem, SD card via VFS |
| `wear_levelling` | `wear_levelling.h` | Flash wear levelling for FAT partitions |
| `spiffs` | `esp_spiffs.h` | SPIFFS filesystem |
| `esp_hid` | `esp_hid*.h` | HID host/device |
| `esp_https_ota` | `esp_https_ota.h` | ESP-IDF native OTA |
| `esp_https_server` | `esp_https_server.h` | HTTPS server |
| `espcoredump` | `esp_core_dump.h` | Core dump analysis |
| `ulp` | `ulp.h`, `ulp_riscv.h` | ULP coprocessor |

## Supporting Multiple ESPHome Versions

```python
async def to_code(config):
    try:
        from esphome.components.esp32 import include_builtin_idf_component
        include_builtin_idf_component("fatfs")
    except ImportError:
        # ESPHome < 2026.2.0 - all IDF components included by default
        pass
```

## Compilation Errors

If your component uses an excluded IDF component without re-enabling it, you'll see errors like:

```
fatal error: esp_vfs_fat.h: No such file or directory
fatal error: esp_http_client.h: No such file or directory
fatal error: rmt_encoder.h: No such file or directory
```

The fix is to add the corresponding `include_builtin_idf_component()` call in your Python code, or use the `include_builtin_idf_components` YAML option.

## Timeline

- **ESPHome 2026.2.0 (February 2026):** IDF components excluded by default
- No deprecation period — behavior changed directly

## Finding Code That Needs Updates

```bash
# Find IDF includes from commonly-excluded components
grep -rn '#include.*esp_vfs_fat' your_component/
grep -rn '#include.*esp_http_client' your_component/
grep -rn '#include.*esp_hid' your_component/
grep -rn '#include.*wear_levelling' your_component/
grep -rn '#include.*esp_spiffs' your_component/
grep -rn '#include.*rmt_encoder' your_component/

# Check if your Python code already re-enables them
grep -rn 'include_builtin_idf_component' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [ESP32 Platform](https://esphome.io/components/esp32.html)
- [PR #13610: Reduce compile time by excluding unused IDF components](https://github.com/esphome/esphome/pull/13610)
- [PR #13664: Exclude additional unused IDF components](https://github.com/esphome/esphome/pull/13664)
