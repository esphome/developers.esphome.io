---
title: "Touchscreen"
---

Like [display](/architecture/components/display), `touchscreen` is not a Home Assistant entity type - it's a
hardware/utility base for reading a touch-sensitive panel. It reports one or more touch points (position, and
optionally pressure), attaches to a [display](/architecture/components/display) so it can translate raw controller
coordinates into on-screen pixel coordinates, and fires triggers/dispatches to listeners (for example
`binary_sensor` platforms such as `touchscreen_binary_sensor`, or LVGL's input driver) when a touch starts, moves, or
ends.

Like the entity types, `touchscreen` is a *platform* base: individual components (for example `xpt2046`, `ft5x06` or
`gt911`) register a touchscreen and implement the code that reads the touch controller.

## Python

A touchscreen platform lives in a `touchscreen.py` file (or a `touchscreen/__init__.py` package) inside your
component's directory, allowing the user to configure it under the top-level `touchscreen:` block:

```yaml
touchscreen:
  - platform: my_component
    display: my_display
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import touchscreen

my_touchscreen_ns = cg.esphome_ns.namespace("my_touchscreen")
MyTouchscreen = my_touchscreen_ns.class_("MyTouchscreen", touchscreen.Touchscreen)
```

`touchscreen.Touchscreen` already inherits `cg.PollingComponent`, so no separate component base is needed.

### Configuration schema

Use the `touchscreen.touchscreen_schema()` helper. It returns a schema pre-populated with the options common to
every touchscreen - the `display` it's attached to, `transform` (`swap_xy`/`mirror_x`/`mirror_y`), `calibration`,
`touch_timeout`, and the `on_touch`/`on_update`/`on_release` automations - plus `update_interval` via
`cv.polling_component_schema`:

```python
CONFIG_SCHEMA = touchscreen.touchscreen_schema(
    default_touch_timeout="30ms",
).extend(
    {
        cv.GenerateID(): cv.declare_id(MyTouchscreen),
        cv.Optional(CONF_INTERRUPT_PIN): pins.internal_gpio_input_pin_schema,
    }
)
```

`touchscreen_schema()` also takes optional `calibration_required` and `defaults` arguments, used by drivers whose
controller cannot be sensibly used without a `calibration:` block configured (or that ship known-good calibration
defaults). As with the display schema helpers, you supply your own `cv.GenerateID()` here.

### Code generation

In `to_code`, register the touchscreen with `touchscreen.register_touchscreen()`. This calls
`cg.register_component()` for you *and* generates the code for all of the common options (attaching the display,
transform, calibration, automations):

```python
async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await touchscreen.register_touchscreen(var, config)

    if interrupt_pin := config.get(CONF_INTERRUPT_PIN):
        pin = await cg.gpio_pin_expression(interrupt_pin)
        cg.add(var.set_interrupt_pin(pin))
```

## C++

The C++ class inherits from `touchscreen::Touchscreen`:

```cpp
#include "esphome/components/touchscreen/touchscreen.h"

namespace esphome::my_touchscreen {

class MyTouchscreen : public touchscreen::Touchscreen {
 public:
  void setup() override;

 protected:
  void update_touches() override;
};

}  // namespace esphome::my_touchscreen
```

### Reporting touches

The one method you *must* implement is the protected `update_touches()`. The base class calls it (from its own
`loop()`, whenever the interrupt pin fired or, if no interrupt is configured, on every `update()` poll) to ask you
to read the controller. For every point currently touched, call `add_raw_touch_position_(id, x_raw, y_raw[, z_raw])`
with the *raw* coordinates straight from the hardware:

```cpp
void MyTouchscreen::update_touches() {
  if (!this->is_touched_by_hardware_()) {
    return;
  }
  int16_t x_raw = this->read_x_();
  int16_t y_raw = this->read_y_();
  this->add_raw_touch_position_(0, x_raw, y_raw);
}
```

You never call `publish_state()` yourself - `add_raw_touch_position_()` handles everything downstream. It applies
the configured `swap_xy`/`mirror_x`/`mirror_y` transform and `calibration:` range, scales the result into the
attached display's pixel dimensions, and stores it. Once `update_touches()` returns, the base class fires
`on_touch`/`on_update`/`on_release` and dispatches to any registered `TouchListener`s (as `TouchPoint`s) for you - if
you don't call `add_raw_touch_position_()` for a point that was previously touched, the base class treats it as
released.

### Useful members

- `get_touch()` / `get_touches()`: the most recently reported touch point(s), already calibrated and scaled to
  display coordinates.
- `get_display()`: the `display::Display *` this touchscreen is attached to, useful if you need its dimensions.
- `register_listener(TouchListener *)`: lets other components (like a binary sensor platform) subscribe to
  `touch()`/`update()`/`release()` callbacks instead of using the YAML automations.
- `attach_interrupt_(pin, type)`: a protected helper for drivers with an IRQ pin - it wires the pin so a hardware
  interrupt sets an internal flag, letting `loop()` call `update_touches()` immediately instead of waiting for the
  next poll.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
