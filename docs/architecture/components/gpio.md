# Interfacing via GPIO

We have an example, minimal component which uses a single GPIO pin
[here](https://github.com/esphome/starter-components/tree/main/components/empty_gpio_component).

Let's take a closer look at this example.

## Python

In addition to the usual requisite imports, we have:

```python
from esphome import pins
```

This allows us to use some functions we'll need for validation and code generation later on.

```python
empty_gpio_component_ns = cg.esphome_ns.namespace("empty_gpio_component")
EmptyGPIOComponent = empty_gpio_component_ns.class_("EmptyGPIOComponent", cg.Component)
```

This is some boilerplate code which allows ESPHome code generation to understand the namespace and class names that the
component will use.

```python
CONFIG_SCHEMA = ...
```

This defines the configuration schema for the component as discussed [here](index.md#configuration-validation).
In particular, note that the schema includes `cv.Required(CONF_PIN): pins.gpio_output_pin_schema,`. Of note:

- This specifically requires an **output** GPIO pin schema.
- While a [complete pin schema](https://esphome.io/guides/configuration-types#pin-schema) is permitted, it is often
  shortened to `pin: GPIOXX`.
- This arrangement will allow *any* GPIO pin to be used -- including a GPIO pin which might be connected via an I/O
  expander! If you specifically require a pin that is "internal" to the microcontroller, you can use
  `internal_gpio_output_pin_schema`.
- If you require an *input* pin, simply swap `output` for `input` in `gpio_output_pin_schema`.

Finally, in the `to_code` function, we have:

```python
pin = await gpio_pin_expression(config[CONF_PIN])
cg.add(var.set_output_pin(pin))
```

This configures the component/platform to use the pin as specified in the YAML configuration.

## C++

The C++ class for this example component is quite simple.

```c
class EmptyGPIOComponent : public Component { ... };
```

As mentioned [here](/contributing/code/#c), all components/platforms must inherit from either `Component` or
`PollingComponent`; our example here is no different.

The `void set_output_pin(GPIOPin *pin)` method is implemented to allow setting the pin that the component should use.

Finally, the component implements the usual set of methods [as described here](index.md#common-methods). This is all
that's required for our minimal GPIO component!
