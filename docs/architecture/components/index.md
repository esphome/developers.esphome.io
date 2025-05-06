# Component Architecture

All components within ESPHome have a specific structure. This structure exists because:

- It allows the Python parts of ESPHome to:
    - Easily determine which parts of the C++ codebase are required to complete a build.
    - Understand how to interact with the component/platform so it can be configured correctly.
- It makes understanding and maintaining the codebase easier.

## Directory structure

```
esphome
├─ components
│ ├─ example_component
│ │ ├─ __init__.py
│ │ ├─ example_component.h
│ │ ├─ example_component.cpp
```

This is the most basic component directory structure where the component would be used at the top-level of the YAML
configuration.

```yaml
example_component:
```

## Python module structure

### Minimum requirements

At the heart of every ESPHome component is the `CONFIG_SCHEMA` and the `to_code` method.

The `CONFIG_SCHEMA` is based on and extends [Voluptuous](https://github.com/alecthomas/voluptuous), which is a data
validation library. This allows the YAML to be parsed and converted to a Python object and performs strong validation
against the data types to ensure they match.

```python
import esphome.config_validation as cv
import esphome.codegen as cg

from esphome.const import CONF_ID

CONF_FOO = "foo"
CONF_BAR = "bar"
CONF_BAZ = "baz"

example_component_ns = cg.esphome_ns.namespace("example_component")
ExampleComponent = example_component_ns.class_("ExampleComponent", cg.Component)

CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(): cv.declare_id(ExampleComponent),
    cv.Required(CONF_FOO): cv.boolean,
    cv.Optional(CONF_BAR): cv.string,
    cv.Optional(CONF_BAZ): cv.int_range(0, 255),
})


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])

    await cg.register_component(var, config)

    cg.add(var.set_foo(config[CONF_FOO]))
    if bar := config.get(CONF_BAR):
        cg.add(var.set_bar(bar))
    if baz := config.get(CONF_BAZ):
        cg.add(var.set_baz(baz))
```

Let's break this down a bit.

#### Module/component setup

```python
import esphome.config_validation as cv
import esphome.codegen as cg
```

`config_validation` is a module that contains all the common validation method that are used to validate the
configuration. Components may contain their own validations as well and this is very extensible. `codegen` is a module
that contains all the code generation method that are used to generate the C++ code that is placed into `main.cpp`.


```python
example_component_ns = cg.esphome_ns.namespace("example_component")
```

This is the C++ namespace inside the `esphome` namespace. It is required here so that the codegen knows the exact
namespace of the class that is being created. The namespace **must** match the name of the component.


```python
ExampleComponent = example_component_ns.class_("ExampleComponent", cg.Component)
```

This is the class that is being created. The first argument is the name of the class and any subsequent arguments are
the base classes that this class inherits from.

#### Configuration validation

```python
CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(): cv.declare_id(ExampleComponent),
    cv.Required(CONF_FOO): cv.boolean,
    cv.Optional(CONF_BAR): cv.string,
    cv.Optional(CONF_BAZ): cv.int_range(0, 255),
})
```

This is the schema that will allow user configuration for this component. This example requires the user to provide
a boolean value for the key `foo`. The user also may or may not (hence `Optional`) provide a string value for the key
`bar` and an integer value between 0 and 255 for they key `baz`. The `cv.GenerateID()` is a special function that
generates a unique ID (C++ variable name used in the generated code) for this component but also allows the user to
specify their own `id` in their configuration in the event that they wish to refer to it in their automations.

#### Code generation

The `to_code` method is called after the entire configuration has been validated. It is given the parsed `config`
object for this instance of this component and uses it to determine exactly what C++ code is placed into the generated
`main.cpp` file. It translates the user configuration into the C++ instance method calls, setting variables on the
object as required/specified.

```python
var = cg.new_Pvariable(config[CONF_ID])
```

`var` becomes a special object that represents the actual C++ object that will be generated. The `CONF_ID` that
represents the above `cv.GenerateID()` contains both the `id` string and the class name of the component -- in our
example, this is `ExampleComponent`. Subsequent arguments to `new_Pvariable` are arguments that can be passed to the
constructor of the class.

```python
await cg.register_component(var, config)
```

This line generates `App.register_component(var)` in C++ which registers the component so that its `setup`, `loop`
and/or `update` methods are called correctly.

Assuming the user has `foo: true` in their YAML configuration, this line:

```python
cg.add(var.set_foo(config[CONF_FOO]))
```

...will result in this line:

```c++
var->set_foo(true);
```

...in the generated `main.cpp` file.

```python
if bar := config.get(CONF_BAR):
    cg.add(var.set_bar(bar))
```

If the user has set `bar` in the configuration, this line will generate the C++ code to call `set_bar` on the object.
If the config value is not set, then we do not call the setter function.

### Further information

- `AUTO_LOAD`: A list of components that will be automatically loaded if they are not already specified in the
  configuration. This can be a method that can be run with access to the `CORE` information like the target platform.
- `CONFLICTS_WITH`: A list of components which conflict with this component. If the user has one of them in their
  config, a validation error will be generated.
- `CODEOWNERS`: A list of GitHub usernames that are responsible for this component. `script/build_codeowners.py` will
  update the `CODEOWNERS` file.
- `DEPENDENCIES`: A list of components that this component depends on. If these components are not present in the
   configuration, validation will fail and the user will be shown an error.
- `MULTI_CONF`: If set to `True`, the user can use this component multiple times in their configuration. If set to a
  number, the user can use this component that number of times.
- `MULTI_CONF_NO_DEFAULT`: This is a special flag that allows the component to be auto-loaded without an instance of
  the configuration. An example of this is the `uart` component. This component can be auto-loaded so that all of the
  UART headers will be available but potentially there is no native UART instance, but one provided by another
  component such an an external i2c UART expander.

### Final validation

ESPHome has a mechanism to run a final validation step after all of the configuration is initially deemed to be
individually valid. This final validation gives an instance of a component the ability to check the configuration of
any other components and potentially fail the validation stage if an important dependent configuration does not match.

For example many components that rely on `uart` can use the `FINAL_VALIDATE_SCHEMA` to ensure that the `tx_pin` and/or
`rx_pin` are configured.

## C++ component structure

Given the example Python code above, let's consider the following C++ code:

- **`example_component.h:`**
  ```cpp
  #pragma once

  #include "esphome/core/component.h"

  namespace esphome {
  namespace example_component {

  class ExampleComponent : public Component {
  public:
    void setup() override;
    void loop() override;
    void dump_config() override;
    void set_foo(bool foo) { this->foo_ = foo;}
    void set_bar(std::string bar) { this->bar_ = bar;}
    void set_baz(int baz) { this->baz_ = baz;}
  protected:
    bool foo_{false};
    std::string bar_{};
    int baz_{0};
  };

  }  // namespace example_component
  }  // namespace esphome
  ```

- **`example_component.cpp:`**
  ```cpp
  #include "esphome/core/log.h"
  #include "example_component.h"

  namespace esphome {
  namespace example_component {

  static const char *TAG = "example_component.component";

  void ExampleComponent::setup() {
    // ...
  }

  void ExampleComponent::loop() {
    // ...
  }

  void ExampleComponent::dump_config(){
    ESP_LOGCONFIG(TAG, "Example component");
    ESP_LOGCONFIG(TAG, "  foo = %s", TRUEFALSE(this->foo_));
    ESP_LOGCONFIG(TAG, "  bar = %s", this->bar_.c_str());
    ESP_LOGCONFIG(TAG, "  baz = %i", this->baz_);
  }

  }  // namespace example_component
  }  // namespace esphome
  ```

This represents the minimum required code to implement a component in ESPHome. While most of it is likely reasonably
self-explanatory, let's walk through it for completeness.

### Namespaces

All components must have their own namespace, named appropriately based on the name of the component. The component's
namespace will always be placed within the `esphome` namespace.

### Component class

Any component exists as at least one C++ `class`. In ESPHome, components always inherit from either the `Component` or
`PollingComponent` classes. The latter of these defines an additional `update()` method which is called on a periodic
basis based on user configuration. This is often useful for hardware such as sensors which are queried periodically for
a new measurement/reading.

### Common methods

There are four methods `Component` defines which every component must implement. They are as follows:

- `setup()`: This method is called once as ESPHome starts up to perform initialization of the component. This may mean
  simply initializing some memory/variables or performing a series of read/write calls to look for and initialize
  some (sensor, display, etc.) hardware connected via some bus (I2C, SPI, serial/UART, one-wire, etc.).
- `loop()`: This method is called at each iteration of ESPHome's main application loop. Typically this is every 16
  milliseconds, but there may be some variance as other components consume cycles to perform their own tasks.
- `dump_config()`: This method is called as-needed to "dump" the device's current configuration. Typically this happens
  once after booting and then each time a new client connects to monitor logs (assuming logging is enabled). Note
  that this method is to be used **only** to dump configuration values determined during `setup()`; this method is
  not permitted to contain any other types of calls to (for example) perform bus reads and/or writes.
- `get_setup_priority()`: This method is called to determine the component's setup priority. This is used specifically
  to ensure components are initialized in an appropriate order. For example, an I2C sensor cannot be initialized before
  the I2C bus is initialized; therefore, for I2C sensors, this must return a value indicating that it is to be
  initialized _only after_ (I2C) busses are initialized. See `setup_priority` in `esphome/core/component.h` for
  commonly-used values.
- Setter methods: it is quite common that components will have at least one configuration variable which must be set in
  order to configure the component. In `ExampleComponent`, we have three of these: "foo", "bar" and "baz".
  [As mentioned earlier](#code-generation), these methods are the same methods referred from within the `to_code`
  function in Python; the values contained in the user's YAML configuration are passed through to these setter methods
  as they are placed into the generated `main.cpp` file produced by ESPHome's code generation (codegen). It's important
  to note that **these methods will be called (and, thus, variables set) *before* the `setup()` method is called.**

In addition, for `PollingComponent`:

- `update()`: This method is called at an interval defined in the user's YAML configuration. For many components, the
  interval defaults to 60 seconds, but this may be overridden by the user to fit their use case.
