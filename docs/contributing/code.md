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

### Memory management and heap allocation

ESP devices run for months with small heaps shared between Wi-Fi, BLE, LWIP, and application code. Over time, repeated
allocations of different sizes fragment the heap. Failures happen when the largest contiguous block shrinks, even if
total free heap is still large. We have seen field crashes caused by this.

!!!note "Why this matters more now"
    Disabling update entities by default in Home Assistant has had an unintended side effect: devices now stay up much
    longer. That's great for stability, but it also makes heap fragmentation much more likely to surface. Over long
    uptimes, small allocations fragment the heap, so you can have lots of "free heap" but no large contiguous block
    left. When something like a preferences write or other larger allocation happens, it can't fit anywhere and the
    device resets.

**Heap allocation after `setup()` should be avoided unless absolutely unavoidable.** Every allocation/deallocation cycle
contributes to fragmentation. ESPHome treats runtime heap allocation as a long-term reliability bug, not a performance
issue.

#### Avoiding hidden heap allocations

Helper functions that return `std::string` hide heap allocations. These are soft-deprecated and being replaced with
buffer-based APIs. When writing new code, use stack buffers instead.

**Examples of deprecated functions and their replacements:**

| Deprecated Function | Replacement |
|---------------------|-------------|
| `format_hex()` | `format_hex_to()` with stack buffer |
| `format_hex_pretty()` | `format_hex_pretty_to()` with stack buffer |
| `format_mac_address_pretty()` | `format_mac_addr_upper()` with stack buffer |
| `get_mac_address()` | `get_mac_address_into_buffer()` |
| `get_mac_address_pretty()` | `get_mac_address_pretty_into_buffer()` |

This is not an exhaustive list. Any function returning `std::string` that runs after `setup()` should be scrutinized.

**Example migration:**

```cpp
// Bad - heap allocation on every call
ESP_LOGD(TAG, "Data: %s", format_hex(data).c_str());

// Good - stack buffer, no heap allocation
char hex[64];  // Size appropriately for your data
ESP_LOGD(TAG, "Data: %s", format_hex_to(hex, data));
```

For formatting containers directly:

```cpp
// format_hex_to() has overloads for std::vector and std::array
std::vector<uint8_t> data = get_data();
char hex[256];
ESP_LOGD(TAG, "Received: %s", format_hex_to(hex, data));
```

For MAC addresses:

```cpp
char mac[MAC_ADDRESS_PRETTY_BUFFER_SIZE];
ESP_LOGD(TAG, "MAC: %s", format_mac_addr_upper(mac_bytes, mac));
```

#### STL container guidelines

Choose containers carefully on embedded systems:

1. **Compile-time-known sizes**: Use `std::array` instead of `std::vector` when size is known at compile time.

    ```cpp
    // Bad - generates STL realloc code
    std::vector<int> values;

    // Good - no dynamic allocation
    std::array<int, MAX_VALUES> values;
    ```

    Use `cg.add_define("MAX_VALUES", count)` to set the size from Python configuration.

2. **Fixed sizes with vector-like API**: Use `StaticVector` from `esphome/core/helpers.h` for compile-time fixed
   size with `push_back()` interface (no dynamic allocation).

    ```cpp
    // Bad - generates STL realloc code (_M_realloc_insert)
    std::vector<ServiceRecord> services;
    services.reserve(5);  // Still includes reallocation machinery

    // Good - compile-time fixed size, no dynamic allocation
    StaticVector<ServiceRecord, MAX_SERVICES> services;
    services.push_back(record1);
    ```

3. **Runtime-known sizes**: Use `FixedVector` from `esphome/core/helpers.h` when the size is only known at runtime.

    ```cpp
    // Bad - generates STL realloc code
    std::vector<TxtRecord> txt_records;
    txt_records.reserve(5);

    // Good - single allocation, no reallocation machinery
    FixedVector<TxtRecord> txt_records;
    txt_records.init(record_count);
    ```

4. **Small datasets (1-16 elements)**: Use `std::vector` or `std::array` with simple structs instead of
   `std::map`/`std::set`/`std::unordered_map`.

    ```cpp
    // Bad - 2KB+ overhead for red-black tree/hash table
    std::map<std::string, int> small_lookup;

    // Good - simple struct with linear search
    struct LookupEntry {
      const char *key;
      int value;
    };
    std::vector<LookupEntry> small_lookup;
    ```

    Linear search on small datasets is often faster than hashing/tree overhead.

5. **Avoid `std::deque`**: It allocates in 512-byte blocks regardless of element size, guaranteeing at least 512 bytes
   of RAM usage immediately. This is a major source of crashes on memory-constrained devices.

6. **Byte buffers**: Avoid `std::vector<uint8_t>` unless the buffer needs to grow. Use `std::unique_ptr<uint8_t[]>`.

    ```cpp
    // Bad - STL overhead for simple byte buffer
    std::vector<uint8_t> buffer;
    buffer.resize(256);

    // Good - minimal overhead, single allocation
    std::unique_ptr<uint8_t[]> buffer = std::make_unique<uint8_t[]>(256);
    ```

**Prioritize optimization effort for:**

- Core components (API, network, logger)
- Widely-used components (mdns, wifi, ble)
- Components causing flash size complaints

Note: Avoiding heap allocation after `setup()` is always required regardless of component type. The prioritization above
is about the effort spent on container optimization (e.g., migrating from `std::vector` to `StaticVector`).

### Gating optional features behind conditional compilation

ESPHome runs on devices with very limited RAM and flash. Every byte added to a base class, core component, or widely
used entity is paid by **every user**, on **every device**, whether they use the feature or not. Bloat is cumulative:
a 24 byte field here, a 200 byte method there, and over a few releases we have pushed users off the edge of what their
hardware can hold. This shows up as out of memory crashes, failed OTA updates on nearly full flash, and heap exhaustion
on devices that have been up for a long time.

**Rule of thumb:** if a new feature does not provide a clear, demonstrable benefit to the large majority of users of
the affected component, it must be gated behind a `USE_*` `#ifdef`. PRs that add such features without gating to base
entity classes, core components, or other widely used code paths will not be accepted until they are gated.

Exceptions are rare. Do not assume your feature qualifies; the default answer is "gate it."

Gating is a hard requirement, but it is not on its own a guarantee that the feature will be merged. The bar gets
higher as the user base for the feature gets smaller, and for truly niche features (those used by only a small
fraction of users) that touch base entity classes or shared component infrastructure, we also weigh the size of the
gated code path itself, the maintenance surface it introduces, and whether the same need could be met by a standalone
component, a lambda, or an external component.

We try to flag this concern early in review so contributors don't invest heavily in a direction we won't merge, but it
isn't always apparent right away, and we don't always have a good read on how many people will use a feature. PRs in
that gray area sometimes go stale because we can't reach a clear answer. The best way to avoid that is to ask in the
`#devs` channel on the [ESPHome Discord](https://esphome.io/chat) before writing the PR, so we can talk through the
design and gauge interest before code is written. When in doubt, gate aggressively and start the conversation early.

This applies with particular force to:

- **Base entity classes** (`Sensor`, `BinarySensor`, `Light`, `Switch`, `Climate`, `Cover`, `Fan`, and so on). Every
  entity instance carries the cost, so adding 16 bytes to `Sensor` multiplies across every sensor on every device.
- **Shared base classes** such as `Component`, `LightOutput`, `AddressableLight`, and similar infrastructure.
- **Core components** (`api`, `wifi`, `mdns`, `logger`, `network`).

**How to gate a feature:**

1. Add a plain `#define USE_*` line to `esphome/core/defines.h` (follow the alphabetical / surrounding pattern in
   that file). The checked-in `defines.h` deliberately defines every `USE_*` macro unconditionally so static analysis
   tools, IDEs, and `clangd` can resolve every guarded code path. **It is not consulted at firmware build time** —
   the comment at the top of the file says as much: the runtime build uses a separate, generated `defines.h` that
   contains only the macros the user's codegen actually emitted (via `cg.add_define()`). Adding your entry here makes
   the symbol visible to tooling without enabling it on real devices.
2. Set the define from the component's `to_code()` function only when the user actually configures the feature, e.g.
   `cg.add_define("USE_LIGHT_COLOR_TINT")` inside an `if config.get(CONF_COLOR_TINT) is not None:` branch (see the
   full Python example below). Use `cg.add_define()` for anything that changes the layout, size, or members of a
   header-visible class — it writes to the central defines header consumed by every translation unit, so the gated
   field exists or does not exist consistently across the whole build. Per-target `cg.add_build_flag("-D...")` is
   reserved for flags that don't affect header layout (e.g. tuning thresholds inside a `.cpp`), because if different
   translation units see the same class header with different `#ifdef` state you'll get silent ODR violations.
3. Wrap the C++ fields, methods, and call sites in `#ifdef USE_LIGHT_COLOR_TINT` / `#endif`.

**Example, gating new fields on a base class** (hypothetical color tint overlay on `LightState`):

```cpp
class LightState : public EntityBase {
 public:
#ifdef USE_LIGHT_COLOR_TINT
  void set_color_tint(uint8_t r, uint8_t g, uint8_t b, uint8_t amount) {
    this->tint_r_ = r;
    this->tint_g_ = g;
    this->tint_b_ = b;
    this->tint_amount_ = amount;
  }
#endif
  void apply_output(Color &c) {
#ifdef USE_LIGHT_COLOR_TINT
    if (this->tint_amount_ > 0)
      c = c.blend(Color(this->tint_r_, this->tint_g_, this->tint_b_), this->tint_amount_);
#endif
    // ...remaining output processing...
  }

 protected:
#ifdef USE_LIGHT_COLOR_TINT
  uint8_t tint_r_{0};
  uint8_t tint_g_{0};
  uint8_t tint_b_{0};
  uint8_t tint_amount_{0};
#endif
};
```

```python
# components/light/__init__.py  (imports and CONF_COLOR_TINT / CONF_RED / CONF_GREEN /
# CONF_BLUE / CONF_AMOUNT constants omitted)
async def to_code(config):
    var = await light.new_light(config)
    if (tint := config.get(CONF_COLOR_TINT)) is not None:
        # Both cg.add_define() and the setter call live inside the same `if` block, so the
        # define is set exactly when the setter is called. If the user didn't configure the
        # tint, neither runs and the gated fields/methods don't exist in this build.
        cg.add_define("USE_LIGHT_COLOR_TINT")
        cg.add(var.set_color_tint(tint[CONF_RED], tint[CONF_GREEN], tint[CONF_BLUE], tint[CONF_AMOUNT]))
```

The setter only exists when the define is set, so calling it unconditionally — outside the `if` — would fail to
compile in builds that do not enable the feature.

Without the `#ifdef`, every `LightState` instance on every device carries the four bytes and the blend code in the
output path, even on the vast majority of configurations that never enable it.

**Why we enforce this:**

- **RAM is shared.** Wi-Fi, networking stacks, BLE on chips that have it, and the application all draw from the same
  heap. Unused features that occupy RAM reduce the contiguous block available for everything else and bring users
  closer to the fragmentation cliff described above.
- **Flash fills up.** Many supported chips ship with as little as 1 MB of flash, much of it consumed by the partition
  table and OTA slot. New code paths that 95% of users never use still cost flash for 100% of users.
- **The cost is invisible to the contributor.** A feature looks "free" if it compiles and the contributor's device
  still boots, but the contributor is not the one running it on a 1 MB ESP8266 with 30 sensors.
- **We cannot remove bloat after the fact.** Once a field exists on a public base class, removing it is a breaking
  change that requires the deprecation process documented below.

If you are unsure whether a feature clears the bar to remain ungated, gate it. Gating is cheap, removing is expensive.

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
    - If a key is used in two or more components, it should be migrated to `esphome/components/const/__init__.py`.
    - If a key appears in three or more components, it **must** be migrated to `esphome/components/const/__init__.py` or CI checks will fail.
    - Many constants used in components are already defined in `esphome/const.py`; no new constants
      should be added there unless used in core code.
    - Create a separate PR if/when you wish to move a constant into `esphome/components/const/__init__.py`.
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
- **Internal Implementation**: `protected` and `private` members (including in components with global accessors)
- **Exception**: Methods that are exclusively called by Python codegen (typically configuration setters) are not public
  API, even if marked `public` in components with global accessors

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

1. **Add a deprecation warning** using compile-time warnings or runtime logs (when possible—see compatibility window note)
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
  // ESPDEPRECATED(message, when_deprecated)
  //   message: Description of what to use instead and when it will be removed
  //   when_deprecated: Version when the deprecation was added (not when it will be removed)
  ESPDEPRECATED("Use set_filter_mode() instead. Will be removed in ESPHome 2026.6.0", "2025.12.0")
  void set_mode(int mode) { this->set_filter_mode(static_cast<FilterMode>(mode)); }

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

#### Schema-driven UI hints (`visibility`)

Some configuration keys are valid YAML but a poor fit for a visual editor (the dashboard's
add-component form, the section editor, third-party schema-driven tooling, …). ESPHome's
`cv.Optional` and `cv.Required` accept a single opt-in `visibility=` keyword argument backed by
the `cv.Visibility` `StrEnum` that lets the field's author decide how editors should render it.
The kwarg is **purely advisory** — it doesn't affect validation in any way; ESPHome itself
ignores it at runtime — it just flows through the schema dump
(`script/build_language_schema.py`) so downstream consumers can act on it.

| Value | Semantics | Use when |
|---|---|---|
| _(unset, the default)_ | Render the field on the editor's main form. | The field is normal config — the user genuinely wants to see it. |
| `cv.Visibility.ADVANCED` | Render the field, but tuck it under the editor's "advanced settings" disclosure. | The default is right for ~all users; power users can still tune the YAML directly without crowding the form. |
| `cv.Visibility.YAML_ONLY` | Never render the field in a visual editor. | The knob is dangerous to expose in a UI even as advanced — a casual click could break boot or otherwise misconfigure the component. |

The values are points along a single axis of strictness:
`YAML_ONLY` > `ADVANCED` > _unset_. The single-axis shape encodes "yaml-only is strictly stronger
than advanced" at the type level — there's no way to ask for both at once, and no way to set a
contradictory state.

!!!example "Visibility kwarg in practice"
    ```python
    # Field belongs on the editor's "advanced settings" section
    cv.Optional(CONF_FOO, default=42, visibility=cv.Visibility.ADVANCED): cv.int_

    # Field never shows in a visual editor — YAML escape hatch
    # stays available for the rare power-user override.
    cv.Optional(CONF_BAR, visibility=cv.Visibility.YAML_ONLY): cv.string

    # Required accepts the same kwarg for symmetry. Use it
    # cautiously: hiding a Required field behind an advanced
    # disclosure can let users submit with the field unfilled.
    cv.Required(CONF_BAZ, visibility=cv.Visibility.ADVANCED): cv.boolean
    ```

For helpers that produce schemas behind a function call (like `cv.polling_component_schema`), prefer
adding an opt-in kwarg to the helper so callers stay declarative — for example,
`polling_component_schema` exposes `visibility=` so a time-platform call site can opt the inherited
`update_interval` into the advanced section without affecting sensors and other polling components.

##### Cascading

A stricter parent forces every descendant at least as strict. Schema consumers (the device-builder
catalog generator and similar) walk the parent chain when computing the *effective* visibility for
each field — a child can only ever be **stricter** than its parent, never more visible:

- A NESTED block marked `ADVANCED` puts every inner field under the same disclosure. An inner field
  with no `visibility` setting still ends up in the "advanced" section because the parent is.
- A NESTED block marked `YAML_ONLY` hides every descendant — otherwise the editor would render an
  unrooted control with no surrounding context to interpret it.
- An inner field marked `YAML_ONLY` under an `ADVANCED` parent stays hidden — the strictness
  ordering is monotonic.

The schema marker itself is per-field as the author wrote it; the cascade is a consumer concern,
not a mutation of the schema. This keeps the dump faithful to what's at each call site.

When in doubt:

- Don't set `visibility`. The default keeps the field on the main form, which is the right answer
  for the long tail of normal config keys.
- Reach for `Visibility.ADVANCED` when the field is *valid* but you'd be answering the user's
  question with a question if you led with it ("How often should I sync time?" — they don't know,
  the default is fine).
- Reach for `Visibility.YAML_ONLY` only when surfacing the field in a UI is actively unsafe.
  `setup_priority` is the canonical example: it exists on every component (via
  `core.COMPONENT_SCHEMA`'s extends), the default is correct in essentially every case, and a
  visual editor putting "Setup Priority" on every component's Advanced section is a foot-gun even
  there.

Adding a `visibility` value to an existing field is **not** a breaking change for YAML users — the
YAML still validates the same way. It can be a meaningful change for a visual editor, though, so
coordinate with downstream catalog consumers (e.g. esphome/device-builder) before flipping a
previously-shown field to `Visibility.YAML_ONLY`.

#### Python Functions and Classes

Unlike C++, most Python code in ESPHome is **internal implementation** unless explicitly documented:

- **Public API**: Only functions and classes documented in developer documentation or explicitly intended for use by
  external components
- **Internal Implementation**: All other Python code, even if not prefixed with underscore

!!!example "Python API Example"
    ```python
    # In esphome/components/my_component/__init__.py
    import esphome.codegen as cg
    import esphome.config_validation as cv
    from esphome.const import CONF_ID

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
# Example: Deprecating a configuration key with value transformation (based on ethernet component)
import logging
_LOGGER = logging.getLogger(__name__)

CONF_OLD_MODE = "clk_mode"
CONF_CLK = "clk"
CONF_MODE = "mode"
CONF_PIN = "pin"

# Map old values to new format
OLD_MODE_MAPPING = {
    "GPIO0_IN": ("CLK_EXT_IN", 0),
    "GPIO0_OUT": ("CLK_OUT", 0),
    "GPIO16_OUT": ("CLK_OUT", 16),
    "GPIO17_OUT": ("CLK_OUT", 17),
}

CLK_SCHEMA = cv.Schema({
    cv.Required(CONF_MODE): cv.enum({"CLK_EXT_IN", "CLK_OUT"}, upper=True),
    cv.Required(CONF_PIN): cv.int_,
})

def validate_config(config):
    # Remove before 2026.6.0
    if CONF_OLD_MODE in config:
        _LOGGER.warning(
            "The 'clk_mode' option is deprecated and will be removed in ESPHome 2026.6.0. "
            "Please update your configuration to use 'clk' instead."
        )
        mode_info = OLD_MODE_MAPPING[config[CONF_OLD_MODE]]
        config[CONF_CLK] = {CONF_MODE: mode_info[0], CONF_PIN: mode_info[1]}
        del config[CONF_OLD_MODE]
    elif CONF_CLK not in config:
        raise cv.Invalid("'clk' is a required option for this component.")
    return config

CONFIG_SCHEMA = cv.All(
    cv.Schema({
        cv.Optional(CONF_OLD_MODE): cv.enum(OLD_MODE_MAPPING, upper=True),  # Deprecated
        cv.Optional(CONF_CLK): CLK_SCHEMA,  # New format
    }),
    validate_config
)
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

    Blog posts should be submitted to the [developers.esphome.io](https://github.com/esphome/developers.esphome.io)
    repository in the `docs/blog/posts/` directory.

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
