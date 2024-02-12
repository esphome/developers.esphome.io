# Introduction
The renewed touchscreen component makes it easier for touchscreen drivers (touchscreen platform components) to interact with esphome. The driver should only setup the touchscreen controller and read the current touches. All other other task are handled by the touchscreen component.

This renewed touchscreen has now a beter management for single and multi touch controller.

To create a new touchscreen driver There are 2 methods (functions) to override in the platform component:

1 the `setup()` method: here you set the needed pins and the minimal maximal coordinates that the touchscreen outputs and when an interrupt_pin is used call:
    ```c++
      this->attach_interrupt_(irq_pin_, esphome::gpio::InterruptType type);
    ```
    and dont forget to set the raw minimal and maximal values that the touchscreen sends out.
    ```c++
      this->set_calibration(0, controller_max_x, 0, controller_max_y);
    ```

2 the `update_touches()` method: Here you readout the the touches from the touchscreen and add them to the touchscreen component by call:
    ```c++
      this->set_raw_touch_position_(touch_id, x_raw, y_raw[, z_raw]);
    ```
    Where `touch_id` is an unique touch reference given by the touchscreen controller. Or **0** by a single touch controller. The `z_raw` is optional and is used for the touch pressure when available.

When the controller is not ready to return the touches you can set `this->skip_update_ = true;`, This will notify the touchscreen component that noting will be changed and that it needs to try in next `loop()`.
