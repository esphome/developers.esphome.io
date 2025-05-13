---
date: 2025-05-14
authors: 
  - jesserockz
---

# `*.*_SCHEMA` deprecations

In order to align all of the top level platform components (listed below), we are deprecating the `*_SCHEMA` constants that are present e.g., `SENSOR_SCHEMA`, `SWITCH_SCHEMA`, etc.

Each entity platform component has a matching `*_schema(...)` function which takes the class type and common schema defaults as arguments. There are plenty of examples in the ESPHome codebase of these.

This will become a breaking change in ESPHome **2025.11.0**, set to release around the 19th of November 2025. The breaking PRs will be merged right after the 2025.10.0 release goes out around the 15th of October 2025.

If you are a maintainer of `external_components` that use these constants, please update them to use the new `*_schema(...)` functions. If you are a user of `external_components` and see the warning in your install logs, please reach out to the maintainers of those components and ask them to update their code.

`external_components` are able to import the ESPHome version into their python file in order to support older versions in the cases where the relevant `*_schema(...)` function was not added yet.

## List of affected platforms

- `alarm_control_panel`
- `binary_sensor`
- `button`
- `climate`
- `cover`
- `datetime`
- `event`
- `fan`
- `lock`
- `media_player`
- `number`
- `select`
- `sensor`
- `switch`
- `text`
- `text_sensor`
- `update`
- `valve`
