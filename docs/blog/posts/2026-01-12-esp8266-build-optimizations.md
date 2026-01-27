---
date: 2026-01-12
authors:
  - bdraco
comments: true
---

# ESP8266 Build Optimizations: Serial and Waveform Code

ESP8266 builds now exclude unused Serial objects and waveform/PWM code by default. External components using these features must explicitly enable them.

This is a **breaking change** for external components in **ESPHome 2026.1.0 and later**.

<!-- more -->

## Background

**[PR #12736](https://github.com/esphome/esphome/pull/12736): Serial object exclusion**
Excludes `Serial`/`Serial1` objects when not used, saving 32-64 bytes RAM.

**[PR #12690](https://github.com/esphome/esphome/pull/12690): Waveform code exclusion**
Excludes Arduino waveform/PWM subsystem when not used, saving 596 bytes RAM and 464 bytes flash.

## What's Changing

### Serial Objects

`Serial` and `Serial1` are now excluded by default unless:
- The logger component uses that UART
- An external component explicitly enables it
- YAML configuration sets `enable_serial: true`

### Waveform Code

The Arduino waveform subsystem (`wvfState`, `pwmState`) is now excluded by default unless:
- The `esp8266_pwm` component is used
- An external component explicitly requires it

## Who This Affects

**External components that:**
- Access Arduino `Serial` or `Serial1` directly
- Use Arduino PWM functions (`analogWrite`, `tone`)
- Use waveform functions (`startWaveform`, `stopWaveform`)

**Standard YAML configurations are not affected** - the logger and esp8266_pwm components automatically enable the required features.

## Migration Guide

### Serial Access

If your external component accesses Arduino Serial directly:

```python
# In your component's __init__.py
from esphome.core import CORE
from esphome.components.esp8266.const import enable_serial, enable_serial1

async def to_code(config):
    if CORE.is_esp8266:
        enable_serial()    # Enable Serial (UART0)
        # or
        enable_serial1()   # Enable Serial1 (UART1)
```

### Waveform/PWM Functions

If your external component uses waveform or PWM functions:

```python
# In your component's __init__.py
from esphome.core import CORE
from esphome.components.esp8266.const import require_waveform

async def to_code(config):
    if CORE.is_esp8266:
        require_waveform()
```

### YAML Override (for users)

Users can force-enable Serial in YAML:

```yaml
esp8266:
  board: esp01_1m
  enable_serial: true   # Force-enable Serial (UART0)
  enable_serial1: true  # Force-enable Serial1 (UART1)
```

## Functions Requiring enable_serial/enable_serial1

```cpp
// These require enable_serial() or enable_serial1():
Serial.begin(...)
Serial.print(...)
Serial.read()
Serial.available()
Serial1.begin(...)
Serial1.print(...)
// ... any Serial or Serial1 method
```

## Functions Requiring require_waveform()

```cpp
// These require require_waveform():
analogWrite(pin, value)
tone(pin, frequency)
noTone(pin)
startWaveform(...)
stopWaveform(...)
```

## Recommended Alternative

Instead of using Arduino Serial directly, consider using the `uart` component:

```yaml
uart:
  tx_pin: GPIO1
  rx_pin: GPIO3
  baud_rate: 9600
```

This provides a consistent API across all platforms (ESP8266, ESP32, RP2040, etc.).

## Supporting Multiple ESPHome Versions

```python
from esphome.core import CORE

async def to_code(config):
    if CORE.is_esp8266:
        try:
            from esphome.components.esp8266.const import enable_serial
            enable_serial()
        except ImportError:
            # ESPHome < 2026.1.0 - Serial always included
            pass
```

## Timeline

- **ESPHome 2026.1.0 (January 2026):** Features excluded by default
- No deprecation period - behavior changed directly

## Finding Code That Needs Updates

```bash
# Find Serial usage in C++
grep -rn "Serial\." your_component/
grep -rn "Serial1\." your_component/

# Find PWM/waveform usage
grep -rn "analogWrite" your_component/
grep -rn "tone(" your_component/
grep -rn "startWaveform" your_component/
```

## Compilation Errors

If your component uses excluded features without enabling them, you'll see linker errors:

```
undefined reference to `Serial'
undefined reference to `Serial1'
undefined reference to `startWaveform'
```

The fix is to add the appropriate `enable_*` or `require_*` call in your Python code.

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [ESP8266 Platform](https://esphome.io/components/esp8266.html)
- [UART Component](https://esphome.io/components/uart.html)
- [PR #12736: Serial exclusion](https://github.com/esphome/esphome/pull/12736)
- [PR #12690: Waveform exclusion](https://github.com/esphome/esphome/pull/12690)
