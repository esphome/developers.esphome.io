---
title: "Motion"
---

The `motion` component is a hardware abstraction base for accelerometers and gyroscopes (IMUs), not an
[entity](/architecture/components/index). A motion platform reads raw samples from the chip. `motion` maps them into
the user's frame (`axis_map`, `transform_matrix` and level/heading calibration) and hands them to the `motion`
sensor, binary sensor and event platforms, which provide acceleration, pitch, roll, orientation, shake and so on.

## Python

A motion platform lives in a `motion.py` file inside your component's directory, so the user configures it under the
`motion:` block:

```yaml
motion:
  - platform: my_imu
    id: imu
```

Build the schema with `motion_schema()`, saying which kinds of data the chip measures. Use `new_motion_component()`
in `to_code`. It creates the variable, registers it as a component and applies the axis map:

```python
import esphome.codegen as cg
from esphome.components import i2c
from esphome.components.motion import MotionComponent, motion_schema, new_motion_component
import esphome.config_validation as cv

my_imu_ns = cg.esphome_ns.namespace("my_imu")
MyIMU = my_imu_ns.class_("MyIMU", MotionComponent, i2c.I2CDevice)

CONFIG_SCHEMA = motion_schema(MyIMU, has_accel=True, has_gyro=True).extend(
    i2c.i2c_device_schema(0x6A)
)


async def to_code(config):
    var = await new_motion_component(config)
    await i2c.register_i2c_device(var, config)
```

`has_accel` and `has_gyro` let the `motion` sensor platforms reject options the chip can't provide.

## C++

Derive from `motion::MotionComponent`, call its `setup()` from yours, and implement `update_data()`. It fills
`MotionData` in the chip's own axes: acceleration in g and angular rate in degrees per second. Leave any value the
chip doesn't measure as `NAN`. Return `false` if the read failed.

```cpp
class MyIMU : public motion::MotionComponent, public i2c::I2CDevice {
 public:
  void setup() override;

 protected:
  bool update_data(motion::MotionData &data) override;
};

void MyIMU::setup() {
  MotionComponent::setup();
  // configure the chip
}
```

`MotionComponent` polls `update_data()` on its `update_interval`, applies the axis map and calibration, and passes
the result to the listeners.

## Tap detection

Many IMUs detect taps in hardware. `motion` provides the parts every platform shares: the `tap:` block's common
options, the `on_tap` and `on_double_tap` triggers, the `motion.set_tap_threshold` action, and the mapping of the
tap axis into the user's frame. The platform adds the chip's own timing and pin options and reads the chip's tap
status. All of it is compiled only when a `tap:` block is configured (`USE_MOTION_TAP`).

### Python

`tap_schema(default_threshold, extra)` returns the `tap:` block. It has `threshold` (in g), `axes`, `on_tap` and
`on_double_tap`, and needs at least one trigger. Pass the chip's own options in `extra`. Timing options differ in
meaning between chips, so they are not shared:

```python
from esphome.components.const import CONF_TAP
from esphome.components.motion import setup_tap, tap_schema

TAP_SCHEMA = tap_schema(
    "0.6g",
    {
        cv.Optional("quiet", default="30ms"): cv.positive_time_period_milliseconds,
    },
)

CONFIG_SCHEMA = motion_schema(MyIMU, has_accel=True, has_gyro=True).extend(
    {cv.Optional(CONF_TAP): TAP_SCHEMA}
)


async def to_code(config):
    var = await new_motion_component(config)
    if (tap := config.get(CONF_TAP)) is not None:
        await setup_tap(var, tap)
        # write the chip-specific options
```

`setup_tap()` adds the `USE_MOTION_TAP` define, sets the threshold and builds the triggers. `motion` rejects a
`motion.set_tap_threshold` action that targets a sensor without a `tap:` block, so platforms need no check of their
own.

### C++

Override `set_tap_threshold(float threshold_g)` to convert the threshold to the chip's steps, clamp it, and write it
if the chip is already set up. It is called once from the generated code, before `setup()`, and again for each
`motion.set_tap_threshold` action.

When the chip reports a tap, call one of these with the chip's own axis (`motion::X_AXIS` to `motion::Z_AXIS`) and
whether the tap was in the negative direction:

- `report_tap_(chip_axis, chip_negative)` fires `on_tap`.
- `report_double_tap_(chip_axis, chip_negative)` fires `on_double_tap` and drops any held single tap.

The triggers receive `axis` and `negative` in the user's frame, mapped through the build-time `axis_map` /
`transform_matrix`, so calibration doesn't move them.

Some chips report the first tap of a double tap as a single tap. If both triggers are configured on such a chip, hold
the single tap instead of reporting it straight away:

- Set `tap_hold_ms_` to how long a double tap can take to be recognised.
- Call `hold_tap_(chip_axis, chip_negative, now)` for a single tap.
- Call `release_held_tap_(now)` after each read of the tap status. It fires `on_tap` once `tap_hold_ms_` has passed
  without a double tap.

```cpp
#ifdef USE_MOTION_TAP
void MyIMU::set_tap_threshold(float threshold_g) {
  this->tap_threshold_ = /* steps, clamped */;
  if (this->is_ready())
    this->write_byte(REG_TAP_THS, this->tap_threshold_);
}

void MyIMU::read_tap_() {
  const uint32_t now = millis();
  uint8_t src;
  if (this->read_byte(REG_TAP_SRC, &src)) {
    if (src & DOUBLE_TAP) {
      this->report_double_tap_(axis_of(src), (src & SIGN) != 0);
    } else if (src & SINGLE_TAP) {
      this->hold_tap_(axis_of(src), (src & SIGN) != 0, now);
    }
  }
  this->release_held_tap_(now);
}
#endif
```

Read the tap status often enough to catch it. Some chips clear it within a few milliseconds, so use `set_interval()`
with a short interval or an interrupt pin rather than relying on `loop()`.
