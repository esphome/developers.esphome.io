# Contributing to ESPHome

![logo](/images/logo-text.svg)

This is a guide to contributing to the ESPHome codebase.

## Codebase standards

ESPHome's maintainers work hard to maintain a high standard for its code. We try our best to adhere to the standards
outlined below.

### C++ code style

We use the [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html) with a few modifications:

- Function, method and variable names are `lower_snake_case`
- Class/struct/enum names should be `UpperCamelCase`
- Constants should be `UPPER_SNAKE_CASE`
- Fields should be `lower_snake_case_with_trailing_underscore_` and:
    - **Prefer `protected`** for most fields to allow extensibility and testing
    - **Use `private`** for true implementation details, especially when direct access could lead to bugs:
        - **Pointer lifetime issues**: When a setter validates and stores a safe pointer from a known list (e.g., storing
          `current_option_` pointer that must point to an entry in `options_` vector, not a temporary string)
        - **Invariant coupling**: When multiple fields must stay synchronized (e.g., `data_` and `size_` must always match)
        - **Resource management**: When a setter performs cleanup/registration (e.g., unregistering old sensor before
          storing new one)
    - Provide `protected` accessor methods when derived classes need controlled access to `private` members
- It's preferred to use long variable/function names over short and non-descriptive ones.
- All uses of class members and member functions should be prefixed with `this->` to distinguish them from global
  functions/variables.
- Use two spaces, not tabs.
- Using `#define` for constants is discouraged and should be replaced with `const` variables or enums. Use `#define` only for:
    - Conditional compilation (`#ifdef`, `#ifndef`)
    - Compile-time sizes calculated during Python code generation (e.g., `cg.add_define("MAX_SERVICES", count)` for `std::array` sizing)
- Use `using type_t = int;` instead of `typedef int type_t;`
- Wrap lines in all files at no more than 120 characters. This makes reviewing PRs faster and easier. Exceptions
  should be made only for lines where wrapping them would result in a syntax issue.

#### When to use `private` vs `protected`

##### Example: Pointer lifetime safety

```cpp
class ClimateDevice : public Component {
 public:
  void set_custom_fan_modes(std::initializer_list<const char *> modes) {
    this->custom_fan_modes_ = modes;
    this->active_custom_fan_mode_ = nullptr;  // Reset when modes change
  }

  bool set_custom_fan_mode(const char *mode) {
    // Find mode in supported list and store that pointer (not the input pointer)
    for (const char *valid_mode : this->custom_fan_modes_) {
      if (strcmp(valid_mode, mode) == 0) {
        this->active_custom_fan_mode_ = valid_mode;
        return true;
      }
    }
    return false;  // Mode not in supported list
  }

 protected:
  // Protected: Simple state that derived classes can safely access
  bool has_state_{false};

 private:
  // Private: Pointer that MUST point to entry in custom_fan_modes_ vector
  std::vector<const char *> custom_fan_modes_;  // Pointers to string literals in flash
  const char *active_custom_fan_mode_{nullptr};
};

// If active_custom_fan_mode_ was protected, a derived class could do:
//   this->active_custom_fan_mode_ = some_temporary_string;  // Use-after-free bug!
// By making it private, we enforce it always points to a valid custom_fan_modes_ entry.
```

##### Example: Invariant coupling

```cpp
class Buffer {
 public:
  void resize(size_t new_size) {
    delete[] this->data_;
    this->data_ = new uint8_t[new_size];
    this->size_ = new_size;  // Must stay in sync!
  }

 private:
  // These MUST stay synchronized - making them private prevents:
  //   this->size_ = 1000;  // But data_ is still old allocation - buffer overflow!
  uint8_t *data_{nullptr};
  size_t size_{0};
};
```

### Use of external libraries

In general, we try to avoid use of external libraries.

- If the component you're developing has a simple communication interface, please consider implementing it natively in
  ESPHome.
- Libraries which use hardware interfaces (I²C, for example), should be configured/wrapped to use ESPHome's own
  communication abstractions.
- Libraries which directly manipulate pins or don't do any I/O generally do not cause problems.
- Libraries which access/maintain a global variable/state (`Wire` is a good example) are likely to cause a problem
  because the component won't be modular. Put another way, this approach generally means that it's not possible to
  create multiple instances of the component for use within ESPHome.

### ESPHome-specific idiosyncrasies

#### Python

- Configuration keys (those that appear as keys in YAML):
    - Should be defined as constants--even if used only once--in the form `CONF_XYZ` where `XYZ` is the upper-case
      version of the YAML key. For example: `CONF_SUPERBUS_ID = "superbus_id"`
    - When used in only a single component, they should be defined within that component.
    - If a key is used in two or more components, it should be migrated to `esphome/const.py`.
    - If a key appears in three or more components, it **must** be migrated to `esphome/const.py` or CI checks will fail.
    - Create a separate PR if/when you wish to move a constant into  `esphome/const.py`.
- Using `AUTO_LOAD` to load main platform components (`sensor`, `binary_sensor`, `switch`, etc.) is not permitted.
- Use Python's walrus operator for optional config gathering, except for boolean values. For example:
  `sensor_config := config.get(CONF_SENSOR)`

#### C++

- Components **must** use the provided abstractions like `sensor`, `switch`, etc. and should inherit from either
  `Component` or `PollingComponent`.
- Components should **not** directly access other components -- for example, to publish to MQTT topics.
- Use of `static` variables within component/platform classes is not permitted, as this is likely to cause problems
  when multiple instances of the component/platform are created.
- Components are required to dump their configuration using `ESP_LOGCONFIG` in the `dump_config()` method. This method
  is used **exclusively** to **print values** determined during `setup()` -- nothing more.
- For time tracking, use `App.get_loop_component_start_time()` rather than `millis()`. Hardware time reads are slow
  and repeated calls from multiple components degrades loop performance. The cached loop start time is sufficient for
  most timing needs.

    !!! warning "Time Caching"
        The time is cached at the start of each loop iteration. For long-running operations, you may need to call
        `millis()` to get fresh values. However, if your code runs long enough to need fresh time readings, consider
        breaking it into smaller operations to avoid blocking the main loop.

- Code in `loop()`, `update()` and `setup()` **must not block**. Because ESPHome uses a single-threaded loop for all
  components, if your component blocks, it will delay the whole loop, negatively impacting other components. This can
  result in a variety of problems such as network connections being lost. As such:
    - Avoid using methods such as `delay()` and note that **delays longer than 10 ms are not permitted**.
    - If your code **must** wait for something to happen (for example, your sensor requires hundreds of milliseconds to
      initialize and/or take a reading), then you'll need to implement a state machine to facilitate this. For example,
      your code can send the "take reading" command, return, and, when the next iteration of `loop()` or `update()` is
      called, it then attempts to read back the measurement from the sensor.
        - `loop()` is called every 16 ms (assuming no other components delay this, which may occasionally happen).
        - `update()` is called at an interval defined in the user configuration for the component, but note that this
          method is only available for [`PollingComponent`](https://esphome.io/api/classesphome_1_1_polling_component).
    - For any [`Component`](https://esphome.io/api/classesphome_1_1_component) (which is nearly everything), the
      well-known `set_timeout` method is also available; this can be a handy alternative to implementing a state
      machine.

#### Components/platforms and entities

- Components/platforms should pass data from hardware directly through to the respective entities presented in the
  front end (Home Assistant, MQTT, web, etc.). If the raw data requires grooming, this should be left to the user to do
  by way of the various types of filters available
  ([sensor](https://esphome.io/components/sensor/#sensor-filters),
  [binary sensor](https://esphome.io/components/binary_sensor/#binary-sensor-filters),
  [text sensor](https://esphome.io/components/text_sensor/#text-sensor-filters)).
- Components/platforms should facilitate the creation of entities only when there is a corresponding hardware feature
  which the entity may control. Put another way, in general, do not introduce platforms which allow tuning
  component/platform behavior when there is no corresponding feature implemented in the hardware the
  component/platform is for.

#### General

- All entities must be *optional* in the configuration.
- Avoid "hard-coding" values -- use constants instead. In particular:
    - Any literal string used more than once should be defined as a constant.
    - Constants should be used in C++ as much as possible to aid with readability. For example, it's easier to
      understand code which refers to registers using constants instead of "hard-coded" values.
- Implementations for new devices should contain reference links for the datasheet and/or other sample
  implementations.
- Comments in code should be used as appropriate:
    - Comments which explain some complexity or provide a brief summary of what a class, method, etc. is doing are
      generally helpful and encouraged.
    - Single lines of commented code may be useful from time to time (for example, to call out something which was
      deliberately omitted for some reason) but should generally be avoided.
    - **PRs which include large blocks of commented-out code will not be accepted.**
- ESPHome uses a unified formatting tool for all source files (but this tool can be difficult to install).
  When creating a new PR in GitHub, be sure to check the [GitHub Actions](submitting-your-work.md#automated-checks)
  output to see what formatting needs to be changed and what potential problems are detected.
- Please test your changes :)

!!!note
    For testing, you can use [external components](https://esphome.io/components/external_components).

Please be sure your work is consistent with the standards outlined above before
[submitting your work for integration into ESPHome](submitting-your-work.md).

## Running CI checks locally

You can run the lint and GitHub Actions checks via a docker image:

```bash
# Full lint+test suite
docker run --rm -v "${PWD}/":/esphome -it ghcr.io/esphome/esphome-lint script/fulltest

# Run lint only over changed files
docker run --rm -v "${PWD}/":/esphome -it ghcr.io/esphome/esphome-lint script/quicklint
```

If you are using Windows and have docker installed, the syntax is slightly different.
If you have cloned ESPHome to `c:\edev\esphome` the path will be `c/edev/esphome`

```bash
# convert the volume format
$current_dir=(Get-Location).Path.ToLower().Replace(':','').Replace('\','/')
# Run lint only over changed files from powershell
docker run --rm -v "$($current_dir):/esphome" -it ghcr.io/esphome/esphome-lint script/quicklint
```
