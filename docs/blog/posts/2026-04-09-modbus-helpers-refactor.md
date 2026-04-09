---
date: 2026-04-09
authors:
  - bdraco
comments: true
---

# Modbus Helper Functions Moved to modbus::helpers

Shared helper functions and types have been moved from `modbus_controller` to `modbus::helpers` to enable reuse by other modbus-based components. Deprecated shims keep the old names working until **ESPHome 2026.10.0**.

This is a **developer breaking change** for external components in **ESPHome 2026.4.0 and later**.

<!-- more -->

## Background

**[PR #15291](https://github.com/esphome/esphome/pull/15291): Share helper functions across modbus components — part A**
**[PR #14172](https://github.com/esphome/esphome/pull/14172): Share helper functions across modbus components — part B**

These PRs are part of a series preparing for a new `modbus_server` component. Helper functions that were previously internal to `modbus_controller` are now in `modbus::helpers` so they can be shared across `modbus_controller`, `modbus_server`, and other modbus-based components.

## What's Changing

### C++ symbols moved (Part A)

| Old location | New location |
|---|---|
| `modbus_controller::SensorValueType` | `modbus::helpers::SensorValueType` |
| `modbus_controller::value_type_is_float()` | `modbus::helpers::value_type_is_float()` |
| `modbus_controller::modbus_register_read_function()` | `modbus::helpers::modbus_register_read_function()` |
| `modbus_controller::modbus_register_write_function()` | `modbus::helpers::modbus_register_write_function()` |
| `modbus_controller::c_to_hex()` | `modbus::helpers::c_to_hex()` |
| `modbus_controller::byte_from_hex_str()` | `modbus::helpers::byte_from_hex_str()` |
| `modbus_controller::word_from_hex_str()` | `modbus::helpers::word_from_hex_str()` |
| `modbus_controller::dword_from_hex_str()` | `modbus::helpers::dword_from_hex_str()` |
| `modbus_controller::qword_from_hex_str()` | `modbus::helpers::qword_from_hex_str()` |

### C++ symbols moved (Part B)

| Old location | New location |
|---|---|
| `modbus_controller::number_to_payload()` | `modbus::helpers::number_to_payload()` |
| `modbus_controller::payload_to_number()` | `modbus::helpers::payload_to_number()` |
| `modbus_controller::get_data()` | `modbus::helpers::get_data()` |
| `modbus_controller::float_to_payload()` | `modbus::helpers::float_to_payload()` |
| `modbus_controller::coil_from_vector()` | `modbus::helpers::coil_from_vector()` |
| `modbus_controller::mask_and_shift_by_rightbit()` | `modbus::helpers::mask_and_shift_by_rightbit()` |

### Python symbols moved

The following Python symbols have moved from `esphome.components.modbus_controller` to `esphome.components.modbus.helpers`:

- `MODBUS_FUNCTION_CODE`
- `MODBUS_REGISTER_TYPE`
- `MODBUS_WRITE_REGISTER_TYPE`
- `SENSOR_VALUE_TYPE`
- `TYPE_REGISTER_MAP`
- `CPP_TYPE_REGISTER_MAP`
- `ModbusRegisterType`

## Who This Affects

**External components that import helper functions from `modbus_controller`**, either in C++ (`modbus_controller::number_to_payload()`, etc.) or Python (`from esphome.components.modbus_controller import SENSOR_VALUE_TYPE`, etc.).

## Migration Guide

### C++

Deprecated shims in `modbus_controller.h` forward to the new location — existing code continues to compile with deprecation warnings. A `using` declaration keeps `modbus_controller::SensorValueType` working without warnings.

To silence warnings, update the namespace:

```cpp
// Before
#include "esphome/components/modbus_controller/modbus_controller.h"
auto result = modbus_controller::payload_to_number(data, offset, type);

// After
#include "esphome/components/modbus/helpers.h"
auto result = modbus::helpers::payload_to_number(data, offset, type);
```

### Python

```python
# Before
from esphome.components.modbus_controller import SENSOR_VALUE_TYPE

# After
from esphome.components.modbus.helpers import SENSOR_VALUE_TYPE
```

## Timeline

- **ESPHome 2026.4.0 (April 2026):** Functions moved, deprecated shims added
- **ESPHome 2026.10.0 (October 2026):** Deprecated shims removed

## Finding Code That Needs Updates

```bash
# C++ — find references to old namespace
grep -rn 'modbus_controller::number_to_payload\|modbus_controller::payload_to_number' your_component/
grep -rn 'modbus_controller::get_data\|modbus_controller::float_to_payload' your_component/
grep -rn 'modbus_controller::c_to_hex\|modbus_controller::byte_from_hex_str' your_component/
grep -rn 'modbus_controller::SensorValueType' your_component/

# Python — find old imports
grep -rn 'from esphome.components.modbus_controller import' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #15291: Share helper functions across modbus components — part A](https://github.com/esphome/esphome/pull/15291)
- [PR #14172: Share helper functions across modbus components — part B](https://github.com/esphome/esphome/pull/14172)
