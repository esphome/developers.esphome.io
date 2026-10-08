---
title: "Component/platform test configurations"
---

Each (new) component/platform must have tests. This enables our CI system to perform a test build of the
component/platform to ensure it compiles without any errors.

Tests should incorporate the new component/platform itself as well as all
[automations](https://esphome.io/automations/actions) it implements.

> [!NOTE]
> These are **compile tests only** and do not test functionality.

## Overview

The tests aim to test compilation of the code for each processor architecture:

- Xtensa (ESP8266, original ESP32 and S-series)
- RISC-V (ESP32 C-series)
- ARM (RP2040)

...and for each supported framework:

- Arduino
- [ESP-IDF](https://github.com/espressif/esp-idf/)

There should be *at least one test* for each framework/architecture combination. We can probably go without saying it,
but some framework/architecture combinations are simply not supported/possible, so tests for those are impossible and,
as such, are (naturally) omitted.

## General structure

We try to structure the tests in a way so as to minimize repetition. Let's look at the `dht12` sensor platform as an
example:

First, you'll find a `common.yaml` file which contains this:

```yaml
i2c:
  - id: i2c_dht12
    scl: ${scl_pin}
    sda: ${sda_pin}

sensor:
  - platform: dht12
    temperature:
      name: DHT12 Temperature
    humidity:
      name: DHT12 Humidity
    update_interval: 15s
```

It's a shared configuration file that defines common settings used across all hardware platforms. Having a "common"
file like this minimizes duplication and ensures test consistency across all platforms.

To use `common.yaml` in a test configuration, YAML substitutions and a [package](https://esphome.io/components/packages)
are used (see [substitutions](https://esphome.io/components/substitutions)). This allows the test YAML file to reference
and include the shared configuration. For the `dht12` platform, one of the test files is named `test.esp32-ard.yaml` and
it contains this:

```yaml
substitutions:
  scl_pin: GPIO16
  sda_pin: GPIO17

packages:
  dht12: !include common.yaml
```

By including `common.yaml` as a named package, all test configurations maintain the same structure while allowing
flexibility for platform-specific substitutions such as pin assignments. This approach simplifies managing multiple test
cases across different hardware platforms.

## Tests that need a display

Some platforms — touchscreens are the common case — require a
[`display`](https://esphome.io/components/display/) to be present only so they can read its dimensions. Instantiating a
real display driver in these tests is wasteful: it occupies GPIO pins (which then tend to collide with the pins the
component under test needs) and pulls in unrelated bus dependencies.

For these cases, use the shared `test_display` package. It provides a no-op display that draws nothing and uses no pins
and no bus, so it never competes for GPIOs. Include it alongside your component's `common.yaml` using named packages:

```yaml
# tests/components/<your_component>/test.esp32-idf.yaml
packages:
  test_display: !include ../../test_build_components/common/test_display/test_display.yaml
  <your_component>: !include common.yaml
```

Then point your component at the `test_display_screen` display that the package provides:

```yaml
# tests/components/<your_component>/common.yaml
touchscreen:
  - platform: <your_component>
    display: test_display_screen
    interrupt_pin: ${interrupt_pin}
```

The package declares its own `external_components` entry (the `test_display` platform lives under `tests/components/`,
not in the shipped component tree), so your test does not need to declare it. Because the package sits alongside the
shared bus packages (`i2c`, `spi`, `uart`, …) under `tests/test_build_components/common/`, tests that use it are still
batch-grouped together and share the single `test_display_screen` instance.

> [!NOTE]
> The provided `test_display_screen` reports a size of 240×320. If your component depends on specific dimensions,
> keep the package for the `external_components` entry and add your own instance with `platform: test_display`, a
> unique `id`, and the `dimensions:` you need (for example `dimensions: 320x240`). The `id` cannot be `test_display`
> itself, since an `id` may not match the name of a platform.

## Which tests do I need?

**We require a test for each framework/architecture combination** the component/platform supports. *Most*
components/platforms include the following test files:

- `test.esp32-ard.yaml` - ESP32 (Xtensa)/Arduino
- `test.esp32-idf.yaml` - ESP32 (Xtensa)/IDF
- `test.esp32-c3-ard.yaml` - ESP32-C3 (RISC-V)/Arduino
- `test.esp32-c3-idf.yaml` - ESP32-C3 (RISC-V)/IDF
- `test.esp8266-ard.yaml` - ESP8266 (Xtensa)/Arduino
- `test.rp2040-ard.yaml` - RP2040 (ARM)/Arduino

Because our test script checks for **successful compilation only**, it is not necessary to include a test for every
microcontroller variant *unless different code is compiled based on the variant.* For example, the ESP32, ESP32-S2
and ESP32-S3 are all based on the same Xtensa architecture and, as such, use the same tooling and configuration. Given
a block of code, if it compiles for the ESP32, it will compile for the S2 and S3, as well. Therefore, spinning up a new
test run for each variant within this family is not productive and we avoid doing so to minimize CI runtime.

If your component/platform builds different code based on the variant (for example, ESP32/S2/S3 or C3/C6), then tests
should be added to/omitted from the list above as appropriate. This is often only necessary when implementing support
for some specific hardware component built into the microcontroller. The
[ADC](https://esphome.io/components/sensor/adc) is one example of this.

## Config-only tests (`validate.*.yaml`)

Sometimes a test only needs to exercise configuration validation — for example, a deprecated-syntax migration
path, a schema edge case, or a platform-specific validation branch — where actually building firmware adds no
extra signal. For these cases you can use a `validate.*.yaml` file instead of a `test.*.yaml` file.

`validate.*.yaml` files are run with `esphome config` only and are **never compiled**. The naming grammar mirrors
`test.*.yaml`:

- `validate.<platform>.yaml` — base config-only test (for example, `validate.esp32-idf.yaml`)
- `validate-<variant>.<platform>.yaml` — config-only variant (for example, `validate-legacy.esp32-idf.yaml`)

A component may have any mix of `test.*.yaml` and `validate.*.yaml` files. Unlike `test.*.yaml` files, validate
files never participate in bus-grouping; each one runs as its own `esphome config` invocation.

> [!NOTE]
> If a PR changes only a component's `validate.*.yaml` files — no source changes, no `test.*.yaml` changes, and
> the component isn't pulled in as a dependency of another changed component — CI skips the compile stage for
> that component entirely and runs config validation only. This keeps CI fast for changes that can't affect the
> compiled output.

## Running the tests

You can run the tests locally simply by invoking the test script:

```shell
script/test_build_components -e compile -c dht12
```

Use `-e config` instead of `-e compile` to run validation only. This is the stage that exercises `validate.*.yaml`
files, which are skipped when compiling.

Our CI will also run this script when you create or update your pull request (PR).
