# Architectural Overview

ESPHome itself uses two languages: Python and C++.

As you may already know:

- The Python side of ESPHome reads a YAML configuration file, validates it and transforms it into a custom firmware
  which includes only the code needed to perform as defined in the configuration file.
- The C++ part of the codebase is what's actually running on the microcontroller; this is called the "runtime". This
  part of the codebase should first set up the communication interface to a sensor/component/etc. and then communicate
  with the ESPHome core via the defined interfaces (like `Sensor`, `BinarySensor` and `Switch`, among others).

## Directory structure

ESPHome's directory structure looks like this:

```
esphome
├── __main__.py
├── automation.py
├── codegen.py
├── config_validation.py
├── components
│   ├── __init__.py
│   ├── dht12
│   │   ├── __init__.py
│   │   ├── dht12.cpp
│   │   ├── dht12.h
│   │   ├── sensor.py
│   ├── restart
│   │   ├── __init__.py
│   │   ├── restart_switch.cpp
│   │   ├── restart_switch.h
│   │   ├── switch.py
│  ...
├── tests
│   ├── components
│   │   ├── dht12
│   │   │   ├── common.yaml
│   │   │   ├── test.esp32-ard.yaml
│   │   │   ├── test.esp32-c3-ard.yaml
│   │   │   ├── test.esp32-c3-idf.yaml
│   │   │   ├── test.esp32-idf.yaml
│   │   │   ├── test.esp8266-ard.yaml
│   │   │   ├── test.rp2040-ard.yaml
│  ...
```

All components are in the "components" directory. Each component is in its own subdirectory which contains the Python
code (`.py`) and the C++ code (`.h` and `.cpp`).

In the "tests" directory, a second "components" directory contains configuration files (`.yaml`) used to perform test
builds of each component. It's structured similarly to the "components" directory mentioned above, with subdirectories
for each component.

Consider a YAML configuration file containing the following:

```yaml
hello1:

sensor:
  - platform: hello2
```

In both cases, ESPHome will automatically look for corresponding entries in the "components" directory and find the
directory with the given name. In this example, the first entry causes ESPHome to look for the
`esphome/components/hello1/__init__.py` file and the second entry tells ESPHome to look for
`esphome/components/hello2/sensor.py` or `esphome/components/hello2/sensor/__init__.py`.

Let's leave the content of those files for [the next section](config-validation), but for now you should also know
that, whenever a component is loaded, all the C++ source files in the directory of the component are automatically
copied into the generated PlatformIO project. All you need to do is add the C++ source files in the component's directory
and the ESPHome core will copy them with no additional code required by the component developer.

## Config validation

The first task ESPHome performs is to read and validate the provided YAML configuration file. ESPHome has a powerful
"config validation" mechanism for this purpose. Each component defines a config schema which is used to validate the
provided configuration file.

To do this, all ESPHome Python modules that can be configured by the user define a special variable named
`CONFIG_SCHEMA`. An example of such a schema is shown below:

```python
import esphome.config_validation as cv

CONF_MY_REQUIRED_KEY = 'my_required_key'
CONF_MY_OPTIONAL_KEY = 'my_optional_key'

CONFIG_SCHEMA = cv.Schema({
  cv.Required(CONF_MY_REQUIRED_KEY): cv.string,
  cv.Optional(CONF_MY_OPTIONAL_KEY, default=10): cv.int_,
}).extend(cv.COMPONENT_SCHEMA)
```

This variable is automatically loaded by the ESPHome core and is used to validate the provided configuration. The
underlying system ESPHome uses for this is [Voluptuous](https://github.com/alecthomas/voluptuous). How validation works
is out of scope for this guide; the easiest way to learn is to look at how similar components validate user input.

A few notes on validation:

- ESPHome puts a lot of effort into **strict validation**. All validation methods should be as strict as possible and
  detect incorrect user input at the validation stage, mitigating compiler warnings and/or errors.
- All default values should be defined in the schema -- not in C++ codebase.
- Prefer naming configuration keys in a way which is descriptive instead of short. Put another way, if the meaning of a
  key is not immediately obvious, don't be afraid to use `long_but_descriptive_keys`. There is no reason to use
  obscure shorthand. As an example, `scrn_btn_inpt` is indeed shorter but more difficult to understand, particularly
  for new users; do not name keys and variables in this way.

## Code generation

The last step the Python codebase performs is called *code generation*. This runs only after the user input has been
successfully validated.

As you may know, ESPHome "converts" the user's YAML configuration into C++ code (you can see the generated code under
`<NODE_NAME>/src/main.cpp`). Each component must define its own `to_code` method that "converts" the user input to
C++ code.

This method is also automatically loaded and invoked by the ESPHome core. Here's an example of such a method:

```python
import esphome.codegen as cg

async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    cg.add(var.set_my_required_key(config[CONF_MY_REQUIRED_KEY]))
```

The details of ESPHome code generation is out-of-scope for this document. However, ESPHome's code generation is 99%
syntactic sugar - and (again) it's probably best to study similar components and just copy what they do.

There's one important concept for the `to_code` method: coroutines with `await`.

The problem that necessitates coroutines is this: in ESPHome, components can declare (via `cg.Pvariable`) and access
variables (`cg.get_variable()`) -- but sometimes, when one part of the codebase requests a variable, it has not been
declared yet because the code for the component creating the variable has not yet run.

To allow for ID references, ESPHome uses so-called `coroutines`. When you see an `await` statement in a `to_code`
method, ESPHome will call the provided method and, if that method needs to wait for a variable to be declared first,
`await` will wait until that variable has been declared. After that, `await` returns and the method will execute on
the next line.

Next, there's a special method - `cg.add` - that you will often use. `cg.add()` performs a very simple task: Any
C++ declared in the parentheses of `cg.add()` will be added to the generated code. Note that, if you do not call
"add" to insert a piece of code explicitly, it will not be added to the `main.cpp` file!

## Runtime

At this point, the Python part of the codebase has completed its work. Let's move on and discuss the C++ part of
components.

Most components consist of two primary parts/steps:

- Setup Phase
- Run Phase

When you create a new component, your new component will inherit from the
[`Component`](https://esphome.io/api/classesphome_1_1_component) class. This class has a special `setup()` method that
will be called once to set up the component. At the time the `setup()` method is called, all the setters generated by
the Python codebase have already run and the all fields are set for your class.

The `setup()` method should set up the communication interface for the component and check if communication works (and,
if not, it should call `mark_failed()`).

Again, look at examples of other components to learn more.

The next method that will be called with your component is `loop()` (or `update()` for a
[`PollingComponent`](https://esphome.io/api/classesphome_1_1_polling_component). These methods should retrieve the
latest data from your component and publish them with the provided methods.

Finally, your component must have a `dump_config` method that prints the complete user configuration.

## Test configurations

Each (new) component/platform must have tests. This enables our CI system to perform a test build of the
component/platform to ensure it compiles without any errors. The test file(s) should incorporate the new
component/platform itself as well as all [automations](https://esphome.io/automations/actions) it implements.

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

We require a test for each framework/architecture combination the component/platform supports. *Most*
components/platforms include the following test files:

- `test.esp32-ard.yaml` - ESP32 (Xtensa)/Arduino
- `test.esp32-idf.yaml` - ESP32 (Xtensa)/IDF
- `test.esp32-c3-ard.yaml` - ESP32-C3 (RISC-V)/Arduino
- `test.esp32-c3-idf.yaml` - ESP32-C3 (RISC-V)/IDF
- `test.esp8266-ard.yaml` - ESP8266 (Xtensa)/Arduino
- `test.rp2040-ard.yaml` - RP2040 (ARM)/Arduino

In cases where the component/platform implements support for some microcontroller-specific hardware component, tests
should be added to/omitted from the list above as appropriate. The [ADC](https://esphome.io/components/sensor/adc) is
one example of this.

### Running the tests

You can run the tests locally simply by invoking the test script:

```shell
script/test_build_components -e compile -c dht12
```

Our CI will also run this script when you create or update your pull request (PR).
