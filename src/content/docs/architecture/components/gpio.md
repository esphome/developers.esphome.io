---
title: "Interfacing via GPIO"
---

We have an [example, minimal component which uses a single GPIO pin](https://github.com/esphome/starter-components/tree/main/components/empty_gpio_component).

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

This defines the configuration schema for the component as discussed in [Configuration validation](/architecture/components/index#configuration-validation).
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
await cg.add_pin(var.set_output_pin, config[CONF_PIN])
```

This builds the pin as specified in the YAML configuration with `cg.gpio_pin_expression()` and passes it to the
setter. For an optional pin, pass `config.get(CONF_PIN)`; nothing is generated when it is not set.

## C++

The C++ class for this example component is quite simple.

```c
class EmptyGPIOComponent : public Component { ... };
```

As mentioned in the [codebase standards](/contributing/code/#c), all components/platforms must inherit from either `Component` or
`PollingComponent`; our example here is no different.

The `void set_output_pin(GPIOPin *pin)` method is implemented to allow setting the pin that the component should use.

Finally, the component implements the usual set of methods [as described here](/architecture/components/index#common-methods). This is all
that's required for our minimal GPIO component!

## Providing pins from a GPIO expander

A component for an I/O expander chip offers its pins to other components through a pin schema, so a user can write
`pin: {xl9535: my_expander, number: 3}` wherever a GPIO pin is accepted. ESPHome has shared pieces for both halves of
this; the examples below use `xl9535`.

### Python

Build the pin schema with `pins.gpio_base_schema()` and add the key that names the expander. Pass the modes the chip
supports, and a mode validator. `pins.gpio_validate_input_xor_output` accepts a pin that is either an input or an
output, never both or neither; `pins.gpio_validate_input_xor_output_pullup` also allows `pullup` on inputs only.
Then create the pin with `pins.new_parented_pin()`:

```python
from esphome import pins
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.const import CONF_INPUT, CONF_OUTPUT
from esphome.cpp_generator import MockObj
from esphome.types import ConfigType

# xl9535_ns, XL9535Component, CONF_XL9535 and validate_pin are defined by the component

AUTO_LOAD = ["gpio_expander"]

XL9535GPIOPin = xl9535_ns.class_("XL9535GPIOPin", cg.GPIOPin)

XL9535_PIN_SCHEMA = pins.gpio_base_schema(
    XL9535GPIOPin,
    cv.All(cv.int_range(min=0, max=17), validate_pin),
    modes=[CONF_INPUT, CONF_OUTPUT],
    mode_validator=pins.gpio_validate_input_xor_output,
).extend(
    {
        cv.Required(CONF_XL9535): pins.use_id_or_address(XL9535Component),
    }
)


@pins.PIN_SCHEMA_REGISTRY.register(CONF_XL9535, XL9535_PIN_SCHEMA)
async def xl9535_pin_to_code(config: ConfigType) -> MockObj:
    return await pins.new_parented_pin(config, CONF_XL9535)
```

`new_parented_pin(config, parent_key)` creates the pin, sets the expander named by `config[parent_key]` as its parent,
and sets the pin number, `inverted` and the mode flags. It needs the `inverted` key, so keep `gpio_base_schema()`'s
default of `invertible=True`. Any further arguments go to the pin's constructor, for example `cg.TemplateArguments(...)`
for a pin class that is a template.

### C++

The expander component provides `pin_mode(uint8_t pin, gpio::Flags flags)`, `digital_read(uint8_t pin)` and
`digital_write(uint8_t pin, bool value)`. The pin class is then `gpio_expander::ExpanderGPIOPin`, with no code of its
own apart from its summary text:

```cpp
// xl9535.h
#include "esphome/components/gpio_expander/expander_gpio_pin.h"

namespace esphome::xl9535 {

using XL9535GPIOPin = gpio_expander::ExpanderGPIOPin<XL9535Component>;

}  // namespace esphome::xl9535

ESPHOME_EXPANDER_PIN_SUMMARY_DECL(esphome::xl9535::XL9535Component);
```

```cpp
// xl9535.cpp, after the namespace
ESPHOME_EXPANDER_PIN_SUMMARY(esphome::xl9535::XL9535Component, "%u via XL9535")
```

The summary is a `printf` format that takes the pin number. Both macros go at file scope, outside the namespace. They
keep the format string out of RAM on ESP8266; a component that leaves out the `.cpp` macro fails to link with an
undefined reference to `ExpanderGPIOPin<...>::dump_summary`. The pin handles inversion itself, so the expander's
methods always work with the real level of the pin.

### Caching reads and the interrupt pin

Most expanders read all their pins in one bus transfer. Derive the component from
`gpio_expander::CachedGpioExpanderComponent<T, N>` in `esphome/components/gpio_expander/cached_gpio_component.h` and
each bank is read once per loop instead of once per pin. `T` is the type that holds one bank (`uint8_t` for a chip
read 8 pins at a time, `uint16_t` for one read of up to 16 pins) and `N` is the number of pins. The component
implements `digital_read_hw()`, which reads the bank into a member, `digital_read_cache()`, which returns one pin from
that member, and `digital_write_hw()`.

The base class also handles an optional active-low interrupt line from the chip. Add
`gpio_expander.INTERRUPT_EXPANDER_SCHEMA` to the schema, which is `cv.COMPONENT_SCHEMA` with an optional
`interrupt_pin`, and set the pin in `to_code`. `pcf8574` is the example here:

```python
CONFIG_SCHEMA = (
    cv.Schema(
        {
            cv.Required(CONF_ID): cv.declare_id(PCF8574Component),
            cv.Optional(CONF_PCF8575, default=False): cv.boolean,
        }
    )
    .extend(gpio_expander.INTERRUPT_EXPANDER_SCHEMA)
    .extend(i2c.i2c_device_schema(0x21))
)


async def to_code(config: ConfigType) -> None:
    var = await i2c.new_i2c_component(config)
    cg.add(var.set_pcf8575(config[CONF_PCF8575]))
    await cg.add_pin(var.set_interrupt_pin, config.get(CONF_INTERRUPT_PIN))
```

On the C++ side, call `setup_interrupt_pin_()` at the end of `setup()` and `enable_polling_loop_()` in `pin_mode()`
for an input pin:

```cpp
class PCF8574Component final : public gpio_expander::CachedGpioExpanderComponent<uint16_t, 16>,
                               public i2c::I2CDevice {
  ...
};

void PCF8574Component::setup() {
  if (!this->read_gpio_()) {
    this->mark_failed(LOG_STR(ESP_LOG_MSG_COMM_FAIL));
    return;
  }
  ...
  this->setup_interrupt_pin_();
}

void PCF8574Component::pin_mode(uint8_t pin, gpio::Flags flags) {
  if (flags == gpio::FLAG_INPUT) {
    this->mode_mask_ &= ~(1 << pin);
    this->write_gpio_();
    this->enable_polling_loop_();
  } else if (flags == gpio::FLAG_OUTPUT) {
    this->mode_mask_ |= 1 << pin;
  }
}
```

Do not override `loop()`; the base class version clears the read cache. The loop starts disabled. Without an interrupt
pin, `enable_polling_loop_()` turns it on for the first input, so an expander used only for outputs never reads the
bus. With an interrupt pin, reads stay cached until the line falls, the loop runs again and keeps running until the
line is released. The setup priority is `setup_priority::IO`, and `interrupt_pin_` is available to log in
`dump_config()`. The interrupt line is fixed active-low, so the schema rejects `inverted` and `allow_other_uses` on it.

The base class and schema are available in ESPHome 2026.11.0 and later.
