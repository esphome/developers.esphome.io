---
date: 2025-05-14
authors: 
  - jesserockz
---

# `*.*_SCHEMA` deprecations

In order to align all of the top level platform components (listed below), we are deprecating the `*_SCHEMA` constants that are present. Some examples are `SENSOR_SCHEMA`, `SWITCH_SCHEMA` and so on.

Each entity platform component has a matching `*_schema(...)` function which takes the class type and common schema defaults as arguments. There are plenty of examples in the ESPHome codebase of these.

This will become a breaking change in ESPHome **2025.11.0**, set to release around the 19th of November 2025. The breaking PRs will be merged right after the 2025.10.0 release goes out around the 15th of October 2025.

If you are a maintainer of `external_components` that use these constants, please update them to use the new `*_schema(...)` functions. If you are a user of `external_components` and see the warning in your install logs, please reach out to the maintainers of those components and ask them to update their code.

`external_components` are able to import the ESPHome version into their python file in order to support older versions in the cases where the relevant `*_schema(...)` function was not added yet.

## List of affected components

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

## Reference Pull Requests

- [esphome/esphome#8747](https://github.com/esphome/esphome/pull/8747)
- [esphome/esphome#8748](https://github.com/esphome/esphome/pull/8748)
- [esphome/esphome#8756](https://github.com/esphome/esphome/pull/8756)
- [esphome/esphome#8757](https://github.com/esphome/esphome/pull/8757)
- [esphome/esphome#8758](https://github.com/esphome/esphome/pull/8758)
- [esphome/esphome#8759](https://github.com/esphome/esphome/pull/8759)
- [esphome/esphome#8760](https://github.com/esphome/esphome/pull/8760)
- [esphome/esphome#8761](https://github.com/esphome/esphome/pull/8761)
- [esphome/esphome#8762](https://github.com/esphome/esphome/pull/8762)
- [esphome/esphome#8763](https://github.com/esphome/esphome/pull/8763)
- [esphome/esphome#8764](https://github.com/esphome/esphome/pull/8764)
- [esphome/esphome#8770](https://github.com/esphome/esphome/pull/8770)
- [esphome/esphome#8771](https://github.com/esphome/esphome/pull/8771)
- [esphome/esphome#8772](https://github.com/esphome/esphome/pull/8772)
- [esphome/esphome#8773](https://github.com/esphome/esphome/pull/8773)
- [esphome/esphome#8774](https://github.com/esphome/esphome/pull/8774)
- [esphome/esphome#8775](https://github.com/esphome/esphome/pull/8775)
- [esphome/esphome#8784](https://github.com/esphome/esphome/pull/8784)
- [esphome/esphome#8785](https://github.com/esphome/esphome/pull/8785)
- [esphome/esphome#8786](https://github.com/esphome/esphome/pull/8786)
- [esphome/esphome#8788](https://github.com/esphome/esphome/pull/8788)
