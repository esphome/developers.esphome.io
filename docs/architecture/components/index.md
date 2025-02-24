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

At the heart of every ESPHome component is the `CONFIG_SCHEMA` and the `to_code` method.


### `CONFIG_SCHEMA`

The `CONFIG_SCHEMA` is based on and extends [Voluptuous](https://github.com/alecthomas/voluptuous), which is a 
data validation library. This allows the YAML to be parsed and converted to a Python object and performs
strong validation against the data types to ensure they match.

```python
import esphome.config_validation as cv

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
```

Let's break this down a bit.

**example_component_ns**

This is the c++ namespace inside the `esphome` namespace. It is required here so that the codegen knows the exact 
namespace of the class that is being created. The namespace **must** match the name of the component.


...

### `to_code`

The `to_code` method is called after the entire configuration has been validated. This function is given the
parsed `config` object for this instance of this component. This method is responsible for generating the
C++ code that is placed into `main.cpp` translates the user configuration into the C++ instance method calls,
setting the variables on the object.

```python
import esphome.codegen as cg

from esphome.const import CONF_ID

async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])

    await cg.register_component(var, config)

    cg.add(var.set_foo(config[CONF_FOO]))
    if bar := config.get(CONF_BAR):
        cg.add(var.set_bar(bar))
    if baz := config.get(CONF_BAZ):
        cg.add(var.set_baz(baz))
```

### TODO

- CONFIG_SCHEMA
  - voluptuous
- to_code
  - Called after all validation is done
  - Given config object for this component
- FINAL_VALIDATE_SCHEMA
  - Allows validation of this components configuration against any other config

- consts
  - AUTO_LOAD
    - List of strings of components
    - Can be a function returning a list of strings of components
  - DEPENDENCIES
    - list of strings of components
      - "sensor"
      - "adc.sensor" or "sensor.adc" - double check
  - CODEOWNERS
    - list of gh usernames
    - Run `script/build_codeowners.py` to update files after altering
  - MULTI_CONF
    - True / False / Number of instances allowed
  - MULTI_CONF_NO_DEFAULT
    - True / False
    - Allows a component to be auto loaded without an instance of configuration
