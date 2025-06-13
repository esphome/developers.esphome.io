# Component/platform test configurations

Each (new) component/platform must have tests. This enables our CI system to perform a test build of the
component/platform to ensure it compiles without any errors.

Tests should incorporate the new component/platform itself as well as all
[automations](https://esphome.io/automations/actions) it implements.

!!! note
    These are **compile tests only** and do not test functionality.

### Overview

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

### General structure

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

To use `common.yaml` in a test configuration, YAML substitutions and the insertion operator are used (see
[substitutions](https://esphome.io/components/substitutions)). This allows the test YAML file to reference and include
the shared configuration. For the `dht12` platform, one of the test files is named `test.esp32-ard.yaml` and it contains
this:

```yaml
substitutions:
  scl_pin: GPIO16
  sda_pin: GPIO17

<<: !include common.yaml
```

By including `common.yaml`, all test configurations maintain the same structure while allowing flexibility for
platform-specific substitutions such as pin assignments. This approach simplifies managing multiple test cases across
different hardware platforms.

### Which tests do I need?

**We require a test for each framework/architecture combination** the component/platform supports. *Most*
components/platforms include the following test files:

- `test.esp32-ard.yaml` - ESP32 (Xtensa)/Arduino
- `test.esp32-idf.yaml` - ESP32 (Xtensa)/IDF
- `test.esp32-c3-ard.yaml` - ESP32-C3 (RISC-V)/Arduino
- `test.esp32-c3-idf.yaml` - ESP32-C3 (RISC-V)/IDF
- `test.esp8266-ard.yaml` - ESP8266 (Xtensa)/Arduino
- `test.rp2040-ard.yaml` - RP2040 (ARM)/Arduino

Because our test script checks for **successful compilation only**, it is not necessary to include a test for every
microcontroller variant _unless different code is compiled based on the variant._ For example, the ESP32, ESP32-S2
and ESP32-S3 are all based on the same Xtensa architecture and, as such, use the same tooling and configuration. Given
a block of code, if it compiles for the ESP32, it will compile for the S2 and S3, as well. Therefore, spinning up a new
test run for each variant within this family is not productive and we avoid doing so to minimize CI runtime.

If your component/platform builds different code based on the variant (for example, ESP32/S2/S3 or C3/C6), then tests
should be added to/omitted from the list above as appropriate. This is often only necessary when implementing support
for some specific hardware component built into the microcontroller. The
[ADC](https://esphome.io/components/sensor/adc) is one example of this.

### Running the tests

You can run the tests locally simply by invoking the test script:

```shell
script/test_build_components -e compile -c dht12
```

Our CI will also run this script when you create or update your pull request (PR).
