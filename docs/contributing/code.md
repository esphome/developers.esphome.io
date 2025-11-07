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
    auto new_data = std::make_unique<uint8_t[]>(new_size);
    if (this->data_) {
      std::memcpy(new_data.get(), this->data_.get(), std::min(this->size_, new_size));
    }
    this->data_ = std::move(new_data);
    this->size_ = new_size;  // Must stay in sync with data_
  }

 private:
  // These MUST stay synchronized - making them private prevents:
  //   this->size_ = 1000;  // But data_ is still old allocation - buffer overflow!
  std::unique_ptr<uint8_t[]> data_;
  size_t size_{0};  // Must match allocated size of data_
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

## Public API and Breaking Changes

Understanding what constitutes ESPHome's "public API" is crucial for maintaining backward compatibility and
managing user expectations. This section covers both C++ and Python APIs, and how to handle breaking changes.

### What is Considered Public C++ API?

ESPHome distinguishes between different scopes of what constitutes the public C++ API:

#### For Components

For individual components (sensors, switches, displays, etc.), **only features documented in the user-facing
documentation at [esphome.io](https://esphome.io)** are considered part of the public C++ API.

- **Public API**: Any method, property, or behavior that is documented in the component's documentation page
- **Internal Implementation**: Everything else, even if technically `public` in C++

**Why the distinction?** Many C++ members are marked `public` purely for technical reasons—typically so Python code
generation can access them. These are implementation details, not stable interfaces.

!!!example "Component Example"
    ```cpp
    // In a sensor component
    class MySensorComponent : public PollingComponent, public sensor::Sensor {
     public:
      void set_update_interval(uint32_t interval);  // Documented in esphome.io - PUBLIC API
      void set_internal_buffer_size(size_t size);   // Not documented - INTERNAL, may change

     protected:
      size_t buffer_size_{256};  // Internal implementation detail
    };
    ```

    If `set_update_interval` is documented on esphome.io, changing its signature is a breaking change. However,
    `set_internal_buffer_size` can be changed or removed freely since it's not documented.

#### For Core, Base Entity Classes, and Components with Global Accessors

For core functionality (anything in `esphome/core/`), base entity classes (like `Component`, `Sensor`, `BinarySensor`,
`Switch`, etc.), and components accessible via global accessors, **all `public` C++ members are considered part of the
public API**.

- **Public API**: Any `public` method or member in:
  - Core classes (`esphome/core/` directory)
  - Base entity classes
  - Components with global accessors (e.g., `global_api_server`, `global_preferences`, `global_voice_assistant`,
    `global_bluetooth_proxy`)
- **Internal Implementation**: Only `protected` and `private` members
- **Exception**: Methods that are exclusively called by Python codegen (typically configuration setters) are not public
  API, even in components with global accessors

This stricter definition exists because:
- These classes form the foundation that all components build upon
- Many users create external components that inherit from or interact with these base classes
- Global accessors explicitly expose components for use by other components, making them part of the public contract

!!!example "Core and Global Accessor Examples"
    ```cpp
    // In esphome/core/component.h
    class Component {
     public:
      virtual void setup();           // PUBLIC API - cannot change signature
      virtual void loop();            // PUBLIC API - cannot change signature
      void set_timeout(/* ... */);    // PUBLIC API - cannot change signature

     protected:
      CallbackManager<void()> *defer_;  // INTERNAL - can change
    };

    // In esphome/components/api/api_server.h
    class APIServer : public Component {
     public:
      void send_log_message(/* ... */);      // PUBLIC API - used via global_api_server
      bool is_connected();                   // PUBLIC API - used via global_api_server
      void set_port(uint16_t port);          // INTERNAL - only called by Python codegen

     protected:
      uint16_t port_;                        // INTERNAL - can change
    };

    extern APIServer *global_api_server;  // Global accessor exposes this component
    ```

    Any change to the `public` methods in `Component` or public methods like `send_log_message()` in `APIServer`
    is a breaking change because external components access these via global accessors. However, `set_port()` is
    only called by Python codegen, so it can be changed.

### What Constitutes a C++ Breaking Change?

A breaking change is any modification that could cause existing external components to stop compiling or behaving
correctly. Breaking changes must be:

1. **Documented** in the PR description (which generates release notes)
2. **Justified** with clear reasoning for why the change is necessary
3. **Accompanied** by deprecation warnings when possible (for gradual migration)

#### C++ Breaking Changes Include

- Changing the signature of a documented/public method
- Removing a documented public method
- Changing the behavior of a documented feature in an incompatible way
- Renaming public classes or methods from core/base entity classes
- Changing virtual method signatures that components override
- Removing public methods from core/base entity classes
- Changing the inheritance hierarchy of core/base classes

#### Not C++ Breaking Changes

- Refactoring internal implementation details
- Changing `protected` or `private` members
- Removing undocumented public methods from components (though a deprecation notice is courteous)
- Adding new public methods (as long as they don't conflict with existing usage)
- Adding new optional parameters with default values
- Adding new virtual methods with default implementations

### C++ User Expectations

!!!warning "Use at Your Own Risk"
    Users are free to use any `public` C++ method in their external components, but only documented APIs are guaranteed
    to remain stable. Undocumented public methods in components may change or be removed at any time without notice.

    For core and base entity classes, all `public` members are considered stable API.

### C++ Deprecation Process

When you need to make a C++ breaking change:

1. **Add a deprecation warning** using compile-time warnings or runtime logs (if possible—see note below)
2. **Maintain the old behavior** alongside the new for 6 months when possible (note: for C++ changes, maintaining
   backward compatibility is not always possible, especially for signature changes or refactorings)
3. **Document the migration path** in the PR description (which generates release notes) and code comments
4. **Update all internal usage** to use the new API

!!!note "C++ Compatibility Window"
    ESPHome aims to maintain backward compatibility for 6 months when possible. However, some C++ breaking changes
    cannot maintain backward compatibility:

    - **Signature changes**: Changes to virtual method signatures, template parameters, or function signatures
    - **Deep refactorings**: Architectural changes that affect the class hierarchy or design patterns
    - **Resource constraints**: When the old design uses excessive RAM/flash and requires a complete redesign

    In these cases, a clean break is necessary. Skip the deprecation warning and clearly document the breaking change
    with migration examples in the PR description.

```cpp
// Example: Deprecating a method
// Remove before 2026.6.0
class MySensor : public Component {
 public:
  // New method
  void set_filter_mode(FilterMode mode) { this->filter_mode_ = mode; }

  // Deprecated method - kept for backward compatibility
  [[deprecated("Use set_filter_mode() instead. Will be removed in ESPHome 2026.6.0")]]
  void set_mode(int mode) {
    ESP_LOGW(TAG, "set_mode() is deprecated and will be removed in ESPHome 2026.6.0. Use set_filter_mode() instead");
    this->set_filter_mode(static_cast<FilterMode>(mode));
  }

 protected:
  FilterMode filter_mode_;
};
```

### What is Considered Public Python API?

The Python side of ESPHome handles configuration validation and C++ code generation. Understanding what constitutes
the public Python API is important for maintaining compatibility with user configurations and external components.

#### Configuration Schema

**All configuration options documented at [esphome.io](https://esphome.io)** are considered part of the public Python
API. This includes:

- **Configuration keys**: Any YAML key that appears in documentation (e.g., `update_interval`, `pin`, `name`)
- **Configuration validators**: Expected types, ranges, and validation behavior for config values
- **Configuration structure**: Nesting requirements, required vs optional keys
- **Platform names**: The names used to reference components (e.g., `sensor.dht`, `switch.gpio`)

#### Python Functions and Classes

Unlike C++, most Python code in ESPHome is **internal implementation** unless explicitly documented:

- **Public API**: Only functions and classes documented in developer documentation or explicitly intended for use by
  external components
- **Internal Implementation**: All other Python code, even if not prefixed with underscore

!!!example "Python API Example"
    ```python
    # In esphome/components/my_component/__init__.py

    # PUBLIC - documented configuration schema
    CONF_CUSTOM_PARAM = "custom_param"

    CONFIG_SCHEMA = cv.Schema({
        cv.GenerateID(): cv.declare_id(MyComponent),
        cv.Required(CONF_CUSTOM_PARAM): cv.int_,  # PUBLIC - documented config key
    })

    async def to_code(config):
        # INTERNAL - can change implementation
        var = cg.new_Pvariable(config[CONF_ID])
        cg.add(var.set_custom_param(config[CONF_CUSTOM_PARAM]))
    ```

### What Constitutes a Python Breaking Change?

A Python breaking change is any modification that could cause existing user YAML configurations or external components
to stop working.

#### Python Breaking Changes Include

- Removing a documented configuration key
- Renaming a documented configuration key
- Changing validation requirements (e.g., making optional key required, tightening accepted value ranges)
- Changing default values in ways that alter behavior
- Removing a platform or component
- Changing the generated C++ code in ways that break documented C++ API
- Changing configuration inheritance (e.g., removing schema extensions)

#### Not Python Breaking Changes

- Refactoring internal Python functions
- Changing how code generation works internally (as long as output behavior is preserved)
- Renaming internal Python variables or helper functions
- Optimizing configuration validation (as long as validation behavior is unchanged)
- Adding new optional configuration keys
- Adding new components or platforms

### Python User Expectations

!!!warning "External Components"
    External components that rely on ESPHome's Python implementation may break between releases. Only documented
    configuration schemas are guaranteed stable. Python code in `esphome/core/` that is actively used by existing core
    components is considered stable API. Python code that is not called by any core component is internal implementation
    and may change at any time.

### Python Deprecation Process

When you need to make a Python breaking change:

1. **Add a deprecation warning** during configuration validation
2. **Maintain backward compatibility** for 6 months when possible
3. **Document the migration path** clearly in warnings and the PR description (which generates release notes)
4. **Update all examples** in esphome-docs to use the new configuration format

!!!note "Python Compatibility Window"
    ESPHome aims to maintain backward compatibility for Python/configuration changes for 6 months. Python changes
    are generally easier to maintain backward compatibility for compared to C++, so deprecation periods should be
    provided whenever possible.

```python
# Example: Deprecating a configuration key
import logging
_LOGGER = logging.getLogger(__name__)

CONF_OLD_KEY = "old_key"
CONF_NEW_KEY = "new_key"

def validate_config(config):
    if CONF_OLD_KEY in config:
        _LOGGER.warning(
            "'%s' is deprecated and will be removed in ESPHome 2026.6.0. "
            "Please use '%s' instead. "
            "See migration guide: https://developers.esphome.io/blog/...",
            CONF_OLD_KEY,
            CONF_NEW_KEY
        )
        # Provide automatic migration
        if CONF_NEW_KEY not in config:
            config[CONF_NEW_KEY] = config[CONF_OLD_KEY]
    return config

# During deprecation period (6 months) - keep both keys
CONFIG_SCHEMA = cv.Schema({
    cv.Optional(CONF_OLD_KEY): cv.string,  # Still accepted but deprecated
    cv.Optional(CONF_NEW_KEY): cv.string,
}).add_extra(validate_config)

# After deprecation period - remove old key and make cv.invalid to give clear error
# CONFIG_SCHEMA = cv.Schema({
#     cv.Optional(CONF_OLD_KEY): cv.invalid(
#         f"'{CONF_OLD_KEY}' has been replaced by '{CONF_NEW_KEY}'"
#     ),
#     cv.Required(CONF_NEW_KEY): cv.string,
# })
```

```python
# Example: Deprecating a schema constant (with removal date comment)
import logging
_LOGGER = logging.getLogger(__name__)

# Internal schema (preferred approach)
def my_component_schema(class_: MockObjClass = MyComponent):
    return cv.Schema({
        cv.GenerateID(): cv.declare_id(class_),
        # ... config options
    })

# Remove before 2026.6.0
def deprecated_schema_constant(config):
    """Warn users about deprecated schema constant usage."""
    type_name = "unknown"
    if (id := config.get(CONF_ID)) is not None and isinstance(id, core.ID):
        type_name = str(id.type).split("::", maxsplit=1)[0]
    _LOGGER.warning(
        "Using `my_component.MY_COMPONENT_SCHEMA` is deprecated and will be removed in ESPHome 2026.6.0. "
        "Please use `my_component.my_component_schema(...)` instead. "
        "If you are seeing this, report an issue to the external_component author and ask them to update it. "
        "See: https://developers.esphome.io/blog/2025/05/14/_schema-deprecations/. "
        "Component using this schema: %s",
        type_name,
    )
    return config

# Deprecated constant kept for backward compatibility
MY_COMPONENT_SCHEMA = my_component_schema(MyComponent)
MY_COMPONENT_SCHEMA.add_extra(deprecated_schema_constant)
```

!!!tip "Deprecation Best Practices"
    - Always include a "Remove before YYYY.MM.0" comment at the deprecation site
    - Calculate the removal date as 6 months from the deprecation merge date
    - Include in the warning message:
        - What is deprecated
        - What to use instead
        - When it will be removed (version number)
        - A link to migration documentation (blog post or developers docs, if applicable)
        - For external components: guidance to report to component author
    - Provide automatic migration when possible
    - Keep the old behavior working during the deprecation period

!!!note "When to Write a Blog Post"
    Blog posts are required for:

    - **Significant architectural changes** (e.g., changes to the build system, code generation, or core runtime)
    - **Changes to core functions** that affect multiple components
    - **Significant changes to core entity classes** (`Component`, `Sensor`, `BinarySensor`, `Switch`, etc.)
    - **Breaking changes that affect many users** or external components

    For simple component changes, the PR description is usually sufficient. The PR description will be used to
    generate release notes, so ensure it includes clear migration instructions for any breaking changes.

### Breaking Changes Checklist

Before making a breaking change (C++ or Python), ensure you:

- [ ] Have a clear justification for why the change is necessary (e.g., excessive RAM usage, architectural improvement)
- [ ] Have explored non-breaking alternatives
- [ ] Added deprecation warnings in the current release (if possible)
- [ ] Documented the migration path clearly in the PR description
- [ ] Included migration instructions in the PR description (they will be used to generate release notes)
- [ ] Updated all internal usage to the new API
- [ ] Updated esphome-docs examples and documentation
- [ ] Tested that existing configurations still work (for deprecations)
- [ ] Considered the impact on external components
- [ ] Written a blog post (if the change affects core functions, core entity classes, or represents a significant architectural change)

### PR Description Template for Breaking Changes

When submitting a PR with breaking changes, structure your description to include:

1. **Summary Section** - High-level overview of the change and migration timeline
2. **Justification** - Why the breaking change is necessary (RAM savings, architectural improvement, etc.)
3. **Breaking Changes Section** - Clear statement of what will break and when
4. **Migration Guide** - Concrete before/after examples for each affected use case:
   - YAML lambda examples
   - C++ external component examples
   - Common patterns (callbacks, logging, comparisons, etc.)
5. **Timeline** - Specific version when deprecated code will be removed
6. **Backward Compatibility** - What still works during the deprecation period
7. **Components Updated** - List of components already migrated (if applicable)

!!!example "Breaking Change with Deprecation Period"
    See [PR #11623](https://github.com/esphome/esphome/pull/11623) - `select` refactor to index-based operations:

    - Clearly documents the 6-month migration window
    - Provides concrete before/after code examples
    - Lists all affected components
    - Explains the resource constraint justification (28-32 bytes RAM per instance)
    - Shows deprecation warnings users will see
    - Includes migration patterns for YAML, C++, callbacks, and logging
    - Maintains backward compatibility during deprecation period

!!!example "Clean Break (No Deprecation)"
    See [PR #11466](https://github.com/esphome/esphome/pull/11466) - `climate` migration to `FiniteSetMask`:

    - **Why no deprecation:** Changing from `std::set<EnumType>` to `FiniteSetMask<T>` requires signature changes
      that cannot maintain backward compatibility
    - Clear justification: ~440 bytes heap + significant flash savings per climate entity
    - Comprehensive migration guide with before/after examples
    - Mechanical find-replace patterns for external components
    - Quantified benefits: Flash, heap, and O(1) vs O(log n) performance improvements
    - Should have a blog post (affects core entity class)
    - All existing YAML configurations continue to work (C++ API change only)

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
