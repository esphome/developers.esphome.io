# ESPHome Component Architecture



## Directory Structure

```
esphome
├─ components
│ ├─ example_component
│ │ ├─ __init__.py
│ │ ├─ example_component.h
│ │ ├─ example_component.cpp
```

This is the most basic component directory structure where the component would be used at the 
top-level of the YAML configuration.

```yaml
example_component:
```


## Python module structure

### Minimum requirements

At the heart of every ESPHome component is the `CONFIG_SCHEMA` and the `to_code` method.

The `CONFIG_SCHEMA` is based on and extends [Voluptuous](https://github.com/alecthomas/voluptuous), which is a 
data validation library. This allows the YAML to be parsed and converted to a Python object and performs
strong validation against the data types to ensure they match.

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

```python
import esphome.config_validation as cv
import esphome.codegen as cg
```

`config_validation` is a module that contains all the common validation functions that are used to validate the configuration.
Components may contain their own validations as well and this is very extensible.
`codegen` is a module that contains all the code generation functions that are used to generate the C++ code that is placed
into `main.cpp`.


```python
example_component_ns = cg.esphome_ns.namespace("example_component")
```

This is the c++ namespace inside the `esphome` namespace. It is required here so that the codegen knows the exact 
namespace of the class `that is being created. The namespace **must** match the name of the component.


```python
ExampleComponent = example_component_ns.class_("ExampleComponent", cg.Component)
```

This is the class that is being created. The first argument is the name of the class, the second and subsequent 
arguments are the base classes that this class inherits from.

```python
CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(): cv.declare_id(ExampleComponent),
    cv.Required(CONF_FOO): cv.boolean,
    cv.Optional(CONF_BAR): cv.string,
    cv.Optional(CONF_BAZ): cv.int_range(0, 255),
})
```

This is the schema that will allow user configuration for this component. This example shows that the user must provide
a `foo` value that is a boolean. The user may optionally provide a `bar` value that is a string, and a `baz` value that is
an integer between 0 and 255. The `cv.GenerateID()` is a special function that generates a unique ID for this component but
also allows the user to specify an `id` in the configuration for automations.



The `to_code` method is called after the entire configuration has been validated. This function is given the
parsed `config` object for this instance of this component. This method is responsible for generating the
C++ code that is placed into `main.cpp` translates the user configuration into the C++ instance method calls,
setting the variables on the object.

```python
var = cg.new_Pvariable(config[CONF_ID])
```

`var` becomes a special object that represents the actual C++ object that will be generated. The `CONF_ID` that represents
the above `cv.GenerateID()` holds both the id string, and the class name of the component `ExampleComponent`. Subsequent arguments
to `new_Pvariable` are arguments that can be passed to the constructor of the class.

```python
await cg.register_component(var, config)
```

This line generates `App.register_component(var)` in C++ which registers the component so that its `setup`, `loop` and/or `update`
functions are called correctly.

```python 
cg.add(var.set_foo(config[CONF_FOO]))
```

```c++
var->set_foo(true);
```

This would become the above C++ assuming the user set `foo: true` in the YAML configuration.

```python
if bar := config.get(CONF_BAR):
    cg.add(var.set_bar(bar))
```

If the user has set `bar` in the configuration, this line will generate the C++ code to call `set_bar` on the object.
If the config value is not set, then we do not call the setter function.

### Further information

- `AUTO_LOAD` - A list of components that will be automatically loaded if they are not already specified in the configuration.
  This can be a method that can be run with access to the `CORE` information like the target platform.
- `CODEOWNERS` - A list of GitHub usernames that are responsible for this component. `script/build_codeowners.py` will 
  update the `CODEOWNERS` file.
- `DEPENDENCIES` - A list of components that this component depends on. If these components are not present in the configuration,
  validation will fail and the user will be shown an error.
- `MULTI_CONF` - If this component can be used multiple times in the configuration. If set to `True`, the user can use this component
  multiple times in the configuration. If set to a number, the user can use this component that many times.
- `MULTI_CONF_NO_DEFAULT` - This is a special flag that allows the component to be auto-loaded without an instance of the configuration.
  An example of this is the `uart` component. This component can be auto-loaded so that all of the uart headers will be available but
  potentially there is no native uart instance, but one provided by another component such an an external i2c UART expander.


### Final validation

ESPHome has a mechanism to run a final validation step after all of the configuration is initially deemed to be individually valid.
This final validation gives an instance of a component the ability to check any other components configuration and potentially fail
the validation stage if an important dependent configuration does not match. 

For example many components that rely on `uart` can use the `FINAL_VALIDATE_SCHEMA` to ensure that the `tx_pin` and/or `rx_pin` are 
configured.
