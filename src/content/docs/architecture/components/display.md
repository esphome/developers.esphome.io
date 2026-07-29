---
title: "Display"
---

Unlike [sensor](/architecture/components/sensor) or [switch](/architecture/components/switch), `display` is not a
Home Assistant entity type - it does not appear as a device in the front-end. Instead it is a hardware/utility base
that drives a screen: an OLED, an e-paper panel, a TFT, and so on. Other parts of ESPHome (fonts, images, graphs, the
`graphical_display_menu`, and most importantly the user's own `lambda`) draw onto a `display` instance; the platform's
job is to get whatever was drawn onto the physical screen.

Like the entity types, `display` is a *platform* base: individual components (for example `ssd1306_i2c`, `ili9xxx` or
`waveshare_epaper`) register a display and implement the code that talks to the actual controller chip.

## Python

A display platform lives in a `display.py` file (or a `display/__init__.py` package) inside your component's
directory, allowing the user to configure it under the top-level `display:` block:

```yaml
display:
  - platform: my_component
    lambda: |-
      it.print(0, 0, id(my_font), "Hello World!");
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import display

my_display_ns = cg.esphome_ns.namespace("my_display")
MyDisplay = my_display_ns.class_("MyDisplay", cg.PollingComponent, display.DisplayBuffer)
```

Most display drivers buffer a full frame in RAM and inherit `display.DisplayBuffer`, which itself extends the base
`display.Display` (which extends `cg.PollingComponent`). A handful of displays that don't need a RAM buffer (for
example ones that stream draw commands straight to the controller) inherit `display.Display` directly instead.

### Configuration schema

Rather than a single `<platform>_schema()` helper, `display` provides two schema building blocks that you extend:
`display.BASIC_DISPLAY_SCHEMA` (just the `lambda` option plus `update_interval`) and `display.FULL_DISPLAY_SCHEMA`,
which additionally adds `rotation`, `pages`, `on_page_change`, `auto_clear_enabled` and `show_test_card`. Most drivers
extend the full schema with their own hardware-specific options:

```python
CONFIG_SCHEMA = display.FULL_DISPLAY_SCHEMA.extend(
    {
        cv.GenerateID(): cv.declare_id(MyDisplay),
        cv.Optional(cv.CONF_RESET_PIN): pins.gpio_output_pin_schema,
    }
).extend(cv.polling_component_schema("1s"))
```

You need an explicit `cv.GenerateID()` / `cv.declare_id()` here since, unlike `sensor.sensor_schema()`, the display
schema helpers don't take your class as an argument.

### Code generation

In `to_code`, register the display with `display.register_display()`. This calls `cg.register_component()` for you
*and* generates the code for all of the common options - `rotation`, `pages`, the `lambda`, and so on:

```python
async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await display.register_display(var, config)

    if reset_pin := config.get(CONF_RESET_PIN):
        pin = await cg.gpio_pin_expression(reset_pin)
        cg.add(var.set_reset_pin(pin))
```

If your driver accepts a `lambda:` that isn't handled by `register_display` (uncommon - most drivers just let the
full schema deal with it), process it with `cg.process_lambda()` and pass `display.DisplayRef` as the lambda's
parameter type so the user's lambda receives `it` as a `display::Display &`.

## C++

The C++ class inherits from `display::DisplayBuffer` (or `display::Display` directly, for unbuffered drivers). Note
that `DisplayBuffer`/`Display` already inherit `PollingComponent`, so you don't add a separate component base:

```cpp
#include "esphome/components/display/display_buffer.h"

namespace esphome::my_display {

class MyDisplay : public display::DisplayBuffer {
 public:
  void setup() override;
  void update() override;
  void dump_config() override;

  display::DisplayType get_display_type() override { return display::DisplayType::DISPLAY_TYPE_BINARY; }

 protected:
  void draw_absolute_pixel_internal(int x, int y, Color color) override;
  int get_width_internal() override { return 128; }
  int get_height_internal() override { return 64; }
};

}  // namespace esphome::my_display
```

### The draw / update flow

Whatever draws onto the display - the user's `lambda:`, a configured `pages:` entry, fonts, images - ultimately calls
the public `draw_pixel_at(x, y, color)` (or one of the higher-level helpers like `line()`, `filled_rectangle()`,
`print()`, etc., which are all implemented in terms of it). `DisplayBuffer` applies clipping and the configured
`rotation:` and then calls the one method you must implement: `draw_absolute_pixel_internal(x, y, color)`, which
writes a single pixel into your driver's own frame buffer.

Because `Display` inherits `PollingComponent`, your driver's `update()` is called on the user's `update_interval:`.
This is where you actually refresh the screen:

```cpp
void MyDisplay::update() {
  // Runs the configured lambda/pages against this display, filling the buffer.
  this->do_update_();
  // Push the now-updated buffer out to the physical hardware.
  this->write_display_data_();
}
```

`do_update_()` (protected, on the base class) clears the buffer if `auto_clear_enabled:` is set, then invokes either
the active `DisplayPage`'s writer or the top-level `lambda:` - both receive `*this` as their `it` argument - and
finally clears the clipping region. None of that touches real hardware; it only updates your in-memory buffer, so
your `update()` implementation is responsible for flushing that buffer out over I2C/SPI/etc. afterwards.

Allocate your buffer during `setup()` with the base class's `init_internal_(buffer_length)`, sized appropriately for
your pixel format (for example `width * height / 8` for a 1-bit-per-pixel panel).

### Useful members

- `get_width()` / `get_height()`: the *rotated* dimensions as seen by drawing code (call your own
  `get_width_internal()` / `get_height_internal()` for the native, pre-rotation dimensions).
- `fill(Color)` / `clear()`: fill the whole buffer with a color (or `COLOR_OFF`). The default implementation walks
  every pixel via `draw_absolute_pixel_internal()`; override `fill()` if your hardware/buffer layout allows a faster
  bulk clear.
- `get_display_type()`: must return `DISPLAY_TYPE_BINARY`, `DISPLAY_TYPE_GRAYSCALE` or `DISPLAY_TYPE_COLOR` so other
  components (like `image`) know how to render content for your panel.
- `LOG_DISPLAY(prefix, type, obj)`: a convenience macro for `dump_config()` that logs the rotation and dimensions in
  the standard format.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
