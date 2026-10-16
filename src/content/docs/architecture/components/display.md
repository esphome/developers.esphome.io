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
from esphome import pins
from esphome.components import display
from esphome.const import CONF_RESET_PIN

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
        cv.Optional(CONF_RESET_PIN): pins.gpio_output_pin_schema,
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

### Components that draw into a display

Some components draw into a display from outside its `lambda:` or `pages:`, for example LVGL or `vnc`. Such a
component tells the display about it by calling `display.register_external_writer()` from its `CONFIG_SCHEMA`:

```python
from esphome.types import ConfigType


def _register_writer(config: ConfigType) -> ConfigType:
    display.register_external_writer(config[CONF_DISPLAY_ID], DOMAIN)
    return config


CONFIG_SCHEMA = cv.All(
    cv.Schema({cv.GenerateID(CONF_DISPLAY_ID): cv.use_id(display.Display), ...}),
    _register_writer,
)
```

The ID may still be unresolved at that point (an auto-picked `display_id`). The ID pass resolves it in place before
final validation, so the lookups below work from any `FINAL_VALIDATE_SCHEMA`:

- `display.get_external_writers(display_id)` returns the names of the components registered for that display. A
  component can use it to reject a second writer on the same display.
- `display.has_external_writer(display_id)` is true if any component registered for that display, or if LVGL is in the
  configuration.

A driver that would otherwise force a test card on a display without a `lambda:` or `pages:` should check
`has_external_writer()` in its final validation. If it is true, the driver should leave the test card off, because
`test_card()` clears the buffer on the first update and would wipe what the other component drew. It should also
default `update_interval` to `never`, because the other component decides when to call `update()`. The `it8951` and
`epaper_spi` drivers do this:

```python
def _final_validate(config: ConfigType) -> None:
    if CONF_LAMBDA not in config and CONF_PAGES not in config:
        if display.has_external_writer(config[CONF_ID]):
            if CONF_UPDATE_INTERVAL not in config:
                config[CONF_UPDATE_INTERVAL] = update_interval("never")
        else:
            config[CONF_SHOW_TEST_CARD] = True


FINAL_VALIDATE_SCHEMA = _final_validate
```

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

### Drawing blocks of pixels

LVGL and `image` don't draw an image one `draw_pixel_at()` call at a time. They hand the display a whole block of
pixels with the public `draw_pixels_at()`:

```cpp
// The block is w x h pixels, read from a source buffer whose lines are x_offset + w + x_pad pixels long,
// starting y_offset lines and x_offset pixels in. It is drawn with its top left corner at x_start, y_start.
void draw_pixels_at(int x_start, int y_start, int w, int h, const uint8_t *ptr, display::ColorBitness bitness,
                    bool big_endian, int x_offset, int y_offset, int x_pad);
// The same, for a block that fills its source buffer with no gaps
void draw_pixels_at(int x_start, int y_start, int w, int h, const uint8_t *ptr, display::ColorBitness bitness,
                    bool big_endian);
```

Pixels are always RGB, with red in the most significant bits. `bitness` is one of:

- `COLOR_BITNESS_565`: 2 bytes per pixel; `big_endian` says which byte comes first.
- `COLOR_BITNESS_888`: 3 bytes per pixel, stored blue, green, red in memory, as LVGL and ESPHome images store it.
  `big_endian` is ignored.
- `COLOR_BITNESS_332`: 1 byte per pixel.

The caller makes sure the block lies on the screen. The block may be drawn while a clipping region is set.

By default the block is decoded and drawn per pixel through `draw_pixel_at()`, so it works on every display,
including rotation and clipping. A driver that can do better overrides the protected virtual
`draw_pixels_internal()`, which takes the same parameters. A typical override copies the rows straight into its frame
buffer when they are already in the buffer's own format, and sends everything else back to the base version:

```cpp
class MyDisplay : public display::DisplayBuffer {
 protected:
  void draw_pixels_internal(int x_start, int y_start, int w, int h, const uint8_t *ptr, display::ColorBitness bitness,
                            bool big_endian, int x_offset, int y_offset, int x_pad) override {
    // Anything that is not laid out like the frame buffer is drawn per pixel by the base version
    if (bitness != display::COLOR_BITNESS_565 || !big_endian ||
        this->rotation_ != display::DISPLAY_ROTATION_0_DEGREES || this->is_clipping()) {
      display::Display::draw_pixels_internal(x_start, y_start, w, h, ptr, bitness, big_endian, x_offset, y_offset,
                                             x_pad);
      return;
    }
    const size_t stride = x_offset + w + x_pad;
    for (int y = 0; y != h; y++) {
      memcpy(this->buffer_ + ((y_start + y) * this->get_width_internal() + x_start) * 2,
             ptr + ((y_offset + y) * stride + x_offset) * 2, w * 2);
    }
    // Mark the copied area as changed, as draw_absolute_pixel_internal() does for single pixels
  }
};
```

The rules for an override:

- Copy a block as is only when it is laid out exactly the way your own `draw_absolute_pixel_internal()` stores
  pixels: the same bitness and byte order, no software rotation, and no clipping region. Send everything else to
  `display::Display::draw_pixels_internal()`, which draws per pixel and so honors rotation and clipping.
- Call `display::Display::draw_pixels_internal()` for that fallback, never `draw_pixels_at()`: `draw_pixels_at()`
  calls your override again.
- If your driver keeps a frame buffer and sends it to the panel at the end of `update()`, a block drawn during
  `update()` must go into that buffer and mark its area as changed. Writing it straight to the panel would be painted
  over by the buffer when `update()` sends it. Outside `update()`, for example from LVGL, a driver may write the block
  straight to the panel.
- Don't override `draw_pixels_at()` itself: it is not virtual.

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
