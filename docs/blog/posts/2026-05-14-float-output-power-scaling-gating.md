---
date: 2026-05-14
authors:
  - bdraco
comments: true
---

# FloatOutput Power Scaling Fields Gated Behind USE_OUTPUT_FLOAT_POWER_SCALING

The `min_power_` / `max_power_` / `zero_means_zero_` fields and their setters on `FloatOutput` are now gated behind a new `USE_OUTPUT_FLOAT_POWER_SCALING` build flag. The codegen turns the flag on automatically whenever a YAML config references the feature. Lambdas that call `id(out).set_min_power(...)` / `set_max_power(...)` / `set_zero_means_zero(...)` without any matching YAML key or action will now fail to compile with a clear `static_assert` pointing at the one-line YAML fix.

This is a **breaking change** for external components and YAML configs that drive power scaling exclusively from lambdas in **ESPHome 2026.5.0 and later**.

<!-- more -->

## Background

**[PR #15998](https://github.com/esphome/esphome/pull/15998): Gate FloatOutput power scaling fields behind USE_OUTPUT_FLOAT_POWER_SCALING**

`min_power_`, `max_power_`, and `zero_means_zero_` cost **12 bytes per instance** on every PWM channel, DAC channel, LEDC output, and dimmer-chip channel — paid by every device with any `output:` block, regardless of whether the user touches the feature. Repo-wide YAML usage of `min_power` / `max_power` / `zero_means_zero` is on the order of 17 lines, mostly test fixtures. The `output.set_min_power` / `output.set_max_power` runtime actions (added in #8934) have no usage outside their own test fixture.

This follows the same pattern the entity base classes already use — `USE_POWER_SUPPLY` gates `BinaryOutput::power_`, and `USE_ENTITY_ICON` / `USE_ENTITY_DEVICE_CLASS` / `USE_ENTITY_UNIT_OF_MEASUREMENT` gate string members of `EntityBase`. Configs that opt in pay the cost; configs that don't get it stripped.

### Measured savings

Built with the unmodified example configs from devices.esphome.io for two real ESP8266 PWM lights — neither uses `min_power` / `max_power` / `zero_means_zero` / scaling actions:

**[H801 RGBWW LED Controller](https://devices.esphome.io/devices/H801-RGBW-LED-Controller/)** — 5 PWM outputs:

| Metric | Baseline | PR | Δ |
|---|---|---|---|
| RAM (.bss + .data) | 30 416 B | 30 352 B | **−64 B** |
| Flash | 346 047 B | 345 799 B | **−248 B** |
| `sizeof(ESP8266PWM)` | 40 B | 28 B | **−12 B** |

**H802 RGBW LED Controller** — 4 PWM outputs: −48 B RAM, −248 B flash, same 12 B per channel.

Per-instance .bss savings scale linearly with channel count (12 B × N). Flash savings (~248 B per binary) come from the elided multiply/subtract in `set_level()` and the dropped scaling-related strings/branches in `dump_config()`.

## What's Changing

`USE_OUTPUT_FLOAT_POWER_SCALING` is a new `cg.add_define()` flag that controls four things at compile time on `FloatOutput`:

- `min_power_`, `max_power_`, `zero_means_zero_` member fields
- `set_min_power()`, `set_max_power()`, `set_zero_means_zero()` setters
- The min/max/zero-means-zero math inside `FloatOutput::set_level()`
- The `SetMinPowerAction` / `SetMaxPowerAction` action templates

The Python codegen turns the flag on **automatically** whenever:

- A `min_power:` / `max_power:` / `zero_means_zero:` key is set on **any** `output:` entry, **or**
- An `output.set_min_power` / `output.set_max_power` action is registered anywhere in the config.

`zero_means_zero_` now has a default initializer (it was undefined before, hidden behind an unconditional setter call driven by the schema default).

## Who This Affects

**You are affected only if all three of these are true:**

1. You do **not** set `min_power`, `max_power`, or `zero_means_zero` on any of your outputs in YAML, **and**
2. You do **not** use the `output.set_min_power` or `output.set_max_power` automation actions anywhere, **and**
3. You **do** call `id(...).set_min_power(...)`, `id(...).set_max_power(...)`, or `id(...).set_zero_means_zero(...)` directly from a `lambda:`.

If any of those is false, your config is unaffected and behaves exactly as before.

External hardware-driver components that ship their own C++ and call these setters from `setup()` or `dump_config()` fall in this bucket — typically inverter / charger / DC-DC bridges that auto-configure scaling per detected hardware (e.g. several of the `syssi/esphome-*` repos).

## Migration Guide

### YAML lambda users — add one line of YAML

The build will fail with a clear error at your lambda:

```
error: static assertion failed: set_min_power() requires USE_OUTPUT_FLOAT_POWER_SCALING.
To enable it, add 'min_power: 0%' (or any value) to one output entry in your YAML — the
codegen will then keep the scaling fields.
```

The fix is one line of YAML — add this to **any one** output entry:

```yaml
output:
  - platform: esp8266_pwm
    id: out
    pin: 4
    min_power: 0%        # ← add this (or max_power: 100%, or zero_means_zero: true)
```

`min_power: 0%` / `max_power: 100%` are the existing defaults, so this changes no runtime behavior — it just tells the codegen "compile in runtime power scaling so my lambda can use it."

### External component authors — declare the define

If your component ships its own `output.*` C++ and depends on the scaling setters, you have two options:

1. **(Recommended)** Add the YAML key on any output. The codegen will turn the define on for you. This is the same flow regular users follow.

2. If you cannot rely on user YAML, declare the define in your component's Python codegen:

    ```python
    import esphome.codegen as cg

    async def to_code(config):
        cg.add_define("USE_OUTPUT_FLOAT_POWER_SCALING")
        # ...
    ```

    The `output` component will then include the fields and setters regardless of YAML.

## References

- [PR #15998](https://github.com/esphome/esphome/pull/15998) — Gate FloatOutput power scaling fields behind USE_OUTPUT_FLOAT_POWER_SCALING
- [Output component documentation](https://esphome.io/components/output/) — `min_power` / `max_power` / `zero_means_zero` reference
- Pattern reference: `USE_POWER_SUPPLY` (gates `BinaryOutput::power_`), `USE_ENTITY_ICON` / `USE_ENTITY_DEVICE_CLASS` / `USE_ENTITY_UNIT_OF_MEASUREMENT` (gate `EntityBase` strings)
