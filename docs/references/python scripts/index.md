---
title: "Component initialization script"
description: "To create a proper component setup for the user to define the right YAML options for your component you can use the functions below."
kind: section
---
## Contributing to ESPHome

This is a guide to contributing to the ESPHome codebase. ESPHome uses two languages for its project: Python and C++.

The user configuration is read, validated and transformed into a custom firmware with the Python side of the firmware.

The C++ codebase is what's actually running on the ESP and called the "runtime". This part of the codebase should first set up the communication interface to a sensor/component/etc. and communicate with the ESPHome core via the defined interfaces (like Sensor, BinarySensor, Switch).

## yaml config Validation

The first thing ESPHome does is read and validate the user config. For this ESPHome has a powerful
"config validation" mechanism. Each component defines a config schema that is validated against
the user config.

To do this, all ESPHome Python modules that can be configured by the user have a special field
called ``CONFIG_SCHEMA``. An example of such a schema is shown below:

``` python

    import esphome.config_validation as cv

    CONF_MY_REQUIRED_KEY = 'my_required_key'
    CONF_MY_OPTIONAL_KEY = 'my_optional_key'

    CONFIG_SCHEMA = cv.Schema({
      cv.Required(CONF_MY_REQUIRED_KEY): cv.string,
      cv.Optional(CONF_MY_OPTIONAL_KEY, default=10): cv.int_,
    }).extend(cv.COMPONENT_SCHEMA)
```

This variable is automatically loaded by the ESPHome core and validated against.
The underlying system ESPHome uses for this is [voluptuous](https://github.com/alecthomas/voluptuous).
Going into how to validate is out of scope for this guide, but the best way to learn is to look
at examples of how similar integrations validate user input.

A few point on validation:

- ESPHome puts a lot of effort into **strict validation** - If possible, all validation methods should be as strict
  as possible and detect wrong user input at the validation stage (and not later).
- All default values should be defined in the schema (and not in C++ codebase or other code parts).
- Config keys should be descriptive - If the meaning of a key is not immediately obvious you should
  always prefer long_but_descriptive_keys.

## Code Generation

After the user input has been successfully validated, the last step of the Python codebase
is called: Code generation.

As you may know, ESPHome converts the user's configuration into C++ code (you can see the generated
code under ``<NODE_NAME>/src/main.cpp``). Each integration must define its own ``to_code`` method
that converts the user input to C++ code.

This method is also automatically loaded and invoked by the ESPHome core. An example of
such a method can be seen below:

```python

    import esphome.codegen as cg

    def to_code(config):
        var = cg.new_Pvariable(config[CONF_ID])
        yield cg.register_component(var)

        cg.add(var.set_my_required_key(config[CONF_MY_REQUIRED_KEY]))
```

Again, going into all the details of ESPHome code generation would be out-of-scope. However,
ESPHome's code generation is 99% syntactic sugar - and again it's probably best to study other
integrations and just copy what they do.

There's one important concept for the ``to_code`` method: coroutines with ``yield``.
First the problem that leads to coroutines: In ESPHome, integrations can declare (via ``cg.Pvariable``) and access variables
(``cg.get_variable()``) - but sometimes when one part of the code base requests a variable
it has not been declared yet because the code for the component creating the variable has not run yet.

To allow for ID references, ESPHome uses so-called ``coroutines``. When you see a ``yield`` statement
in a ``to_code`` method, ESPHome will call the provided method - and if that method needs to wait
for a variable to be declared first, ``yield`` will wait until that variable has been declared.
After that, ``yield`` returns and the method will execute on the next line.

Next, there's a special method - ``cg.add`` - that you will often use. ``cg.add()`` does a very simple
thing: Any C++ declared in the parentheses of ``cg.add()`` will be added to the generated code.
If you do not call "add" a piece of code explicitly, it will not be added to the main.cpp file!

## magic symbols

.. note::
    This serves as documentation for some of ESPHome's internals and is not necessarily part of the
    development guide.

All Python modules have some magic symbols that will automatically be loaded by the ESPHome
loader. These are:

- ``DEPENDENCIES``: Mark the component to depend on other components. If the user hasn't explicitly
  added these components in their configuration, a validation error will be generated.
- ``AUTO_LOAD``: Automatically load a component if the user hasn't added it manually.
- ``MULTI_CONF``: Mark this component to accept an array of configurations. If this is an
  integer instead of a boolean, validation will only permit the given number of entries.
- ``CONFLICTS_WITH``: Mark a list of components as conflicting with this integration. If the user
  has one of them in the config, a validation error will be generated.

- ``ESP_PLATFORMS``: Provide a list of allowed ESP types this integration works with.
- ``CODEOWNERS``: GitHub usernames or team names of people that are responsible for this integration.
  You should add at least your GitHub username here, as well as anyone who helped you to write code
  that is being included.

- ``CONFIG_SCHEMA``: The configuration schema to validate the user config against.

- ``to_code``: The function that will be called with the validated configuration and should
  create the necessary C++ source code.
