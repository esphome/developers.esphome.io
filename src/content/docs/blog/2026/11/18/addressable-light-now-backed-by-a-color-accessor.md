---
title: "Addressable Light Now Backed by a Color Accessor"
date: 2026-11-18
authors: j9brown
---

Components that implement the `AddressableLight` interface must now provide an `ESPColorAccessor` to access the LED strip's color and effect data instead of overriding `AddressableLight::get_view_internal()`.  This change improves performance, prevents crashes, cleans up the API, and offers components more control over how their LED strip data is stored and how color correction is applied.

This is a **developer breaking change** for external components in **ESPHome 2026.11.0 and later**.

The user API remains fully backwards-compatible; users should not need to change their configurations or lambdas.

<!-- excerpt -->

## Background

**[PR #21577](https://github.com/esphome/esphome/pull/21577): Refactor ESPColorView and related types**

This change aims to improve the architecture of `AddressableLight` to better support current and future use-cases.

For example, fixing a possible null-pointer dereference for unallocated LED buffers previously required adding a comparison in `ESPColorView` on every LED access as well as code in every subclass of `AddressableLight` that implemented `get_view_internal()` to check whether the the buffer was allocated and skip the indexing calculations which was inefficient.  Moving common code out to a function in [PR #21447](https://github.com/esphome/esphome/pull/21447) helped a bit but it didn't resolve the underlying design issues.

Decoupling buffer access from the `AddressableLight` class enables further opportunities for code reuse and long term evolution.

As part of this change, we also took the opportunity to tidy up the API and add more documentation.

## What's Changing

This change introduces `ESPColorAccessor`, an abstract class, with virtual methods to get and set LED data by index according to some strategy determined by the implementation.

`AddressableLight` now has a field called `accessor_` that points to the `ESPColorAccessor` that provides access to its LED data.

When an `AddressableLight` component is constructed, its `accessor_` field initially points to the singleton `NullColorAccessor` that simply returns zero on every access until the component sets up the real accessor.  Thus the component is shielded from potential issues if the user attempts to get/set LEDs before the component has been setup or in case setup failed and the buffers were not allocated.

Once the `AddressableLight` component is ready to provide access to its LED data, it reassigns `accessor_` to point to the appropriate accessor instance which can be one of the following types:

- `BufferColorAccessor` is the base class for accessors that operate on a linear buffer whose layout is defined by a `ChannelColors` object.
- `CorrectedBufferColorAccessor` applies color correction and uncorrection during each access to the color data.  This is the most commonly used implementation as of the the time of this writing.
- `RawBufferColorAccessor` gets/sets raw color data without color correction and uncorrection.  It is useful for addressable light components that perform color correction elsewhere in the pipeline and for unit tests.
- Some other subclass of `ESPColorAccessor` that implements another strategy.  For example, `PartitionLightOutput` has a color accessor that resolves the provided index to an LED within a segment of some other addressable light component.

`AddressableLight` implements `operator[int32_t index]` to return an `ESPColorView` that holds its accessor pointer along with the requested index.  Likewise the component's range access functions, such as `all()`, return an `ESPColorRange` that holds the accessor pointer along with the start and end index of the range.  Thus `ESPColorView` and `ESPColorRange` remain the main user-facing API for LED access whereas `ESPColorAccessor` is hidden from their view and is mainly of interest to component developers.

This change breaks external addressable light components by removing the `AddressableLight::get_view_internal()` method and removing the `ESPColorView` constructor that those components previously used.  It was not practical to provide a deprecation path because the responsibilities of `ESPColorView` have changed significantly and there's nowhere to put the state that it used to hold (without resorting to some questionable hacks).  This post provides a migration guide.

The user API remains compatible with existing code though some function signatures have changed slightly such as to pass colors by value instead of by reference because they're small enough to fit in a register.

### Immediate benefits

- Flash size reduction for most components:
  - -658 bytes in `light` and `addressable_light`.
  - +497 bytes in `light_partition`.
  - Negligible change in `esp32_rmt_led_strip`, `i2s_clockless_led_strip`, and other outputs.
- Less copying of objects on the stack:
  - `ESPColorView` is 8 bytes (1 pointer + 1 index) instead of 24 bytes (6 pointers).
  - `ESPRangeView` is 8 bytes (1 pointer + 1 index) instead of 16 bytes (1 pointer + 3 indices).
  - `Color` is passed by value in a register instead of being passed by reference and copied to the stack.
- Components can implement their own `ESPColorAccessor` subclass when they need to do something special with less impact on the core architecture (as `light_partition` does).
- Begins to resolve some technical debt related to how `light_partition` applies color correction to a segment of an address light strip by isolating its dependencies.
- Cleans up the code a lot!

### Long-term benefits

With this new architecture, it becomes possible to implement new kinds of addressable light components that use the color buffer in different ways such as to defer color correction to a later point in the pipeline to improve color fidelity and dynamic range.  It should also be easier to make incremental changes such as perhaps adding support for 5-channel RGB/WW/CW LED strips someday.

### Removed APIs (effective immediately)

`AddressableLight`:

- `get_view_internal(int32_t)`: Set `accessor_` field instead.

`ESPColorView`:

- `ESPColorView(uint8_t *, uint8_t *, uint8_t *, uint8_t *, uint8_t *, const ESPColorCorrection *)`: Was used by `get_view_internal()`.  No replacement.
- `raw_set_color_correction(const ESPColorCorrection *)`: Was only used by `PartitionLightOutput` which now declares its own accessor and applies color correction as a wrapper.  No replacement.
- `get_color_correction()`: Guarded by `#ifdef` to only be included when the `PartitionLightOutput` is included in the build.  The eventual goal is to remove this method altogether to maintain encapsulation.

`interpret_index(int32_t, int32_t)`: Call sites updated to avoid size lookup in the common case where the index is positive.  No replacement.

### New APIs

`Color`:

- Added const to `operator==(const Color&)` and other non-mutating methods.
- Added `COLOR_CHANNEL_R`/`_G`/`_B`/`_W` that can be used to directly index into `Color::raw` for per-channel access.

`ChannelColors`:

- Changed to hold a union of `r`/`g`/`b`/`w` offsets as discrete fields and a `ColorChannels::raw` array for per-channel access with the new `COLOR_CHANNEL_*` constants.
- Added 0, 3, and 4 argument constructors to initialize the new union members properly.  **This change breaks designated initializers.**
- Added `get`, `get_channel()`, `set()`, and `set_channel()` methods to access LED data at a specific index within a buffer.
- Added `RESERVED_WHITE` to specify a 4 byte encoding without an actual white channel (as used by some SPI LED strips).

`ESPColorAccessor`:

- Defined the abstract base class and documentation about its invariants, particularly idempotence.
- Defined three concrete subclasses: `NullColorAccessor`, `CorrectedBufferColorAccessor`, and `RawBufferColorAccessor` as described earlier in this post.

`ESPColorSettable`:

- Pass `Color` and `ESPHSVColor` by value instead of by reference because they fit in a register and it results in smaller code.
- Added `set_channel()` to set an individual color channel and redirected the other accessors through it.

`ESPColorView`:

- Marked `final` for devirtualization.
- Added `operator=(const ESPColorView&)` for consistency with `ESPRangeView`.
- Added `get_raw()` and `set_raw()` for more efficient access of a complete color value.
- Added `get_channel()`, `get_channel_raw()`, `set_channel()`, and `set_channel_raw()` that operate on a channel index.
- Added `set_red_raw()`, `set_green_raw()`, `set_blue_raw()`, and `set_white_raw()` for consistency, cheap to do now that the colors are looked up by channel index.

`ESPRangeView`:

- Marked `final` for devirtualization.
- Now holds a pointer to an `ESPColorAccessor` instead of an `AddressableLight`.
- Inlined `interpret_index()` to avoid calculating `size()` in the common case where the index is positive.
- Added `get_channel()` and `set_channel()` that operate on individual color channels, redirected the other accessors.

`ESPRangeIterator`:

- Now holds a pointer to an `ESPColorAccessor` instead of copying the whole `ESPRangeView`.

`ESPColorCorrection`:

- Added `color_correct_channel()` and `color_uncorrect_channel()` to operate on an individual color channel.
- Redirected the existing methods over to the per-channel flavor.

`AddressableLight`:

- Added an `accessor_` field to hold the `ESPColorAccessor*`, it initially points to `NullColorAccessor::instance`.
- Added `const` qualifier to `get(int32_t)` to match `operator[]`.
- Inlined `interpret_index()` to avoid calculating `size()` in the common case where the index is positive.

Miscellaneous changes:

- Added `Inplace<T>` helper that reserves aligned storage for an object to be initialized in-place.
- Avoided accessing pixel color channels individually in core code when the whole `Color` could be used instead.
- Updated all LED strip component in tree.

## Who This Affects

**External components that subclass `AddressableLight`**

**Lambdas in YAML configurations** that call developer API functions that have been removed.

## Migration Guide

### Required changes

1. Determine the type of `ESPColorAccessor` that your component will need.

    The color accessor will be doing the work that was previously done by your component's implementation of `AddressableLight::get_view_internal(int32_t)`.  If, as in most cases, your buffer is a linear array of RGB or RGBW pixels packed into 3 or 4 bytes per pixel, then you can use `CorrectedBufferColorAccessor` and initialize it with a `ChannelColors` object that describes the layout.

    If `CorrectedBufferColorAccessor` isn't compatible with your buffer's layout or you need to do something special when accessing pixels then you can implement a new subclass of `ESPColorAccessor` (as was done for [`PartitionLightOutput`](https://github.com/esphome/esphome/blob/dev/esphome/components/partition/light_partition.h).

    Refer to the API documentation in [esp_color_view.h](https://github.com/esphome/esphome/blob/dev/esphome/components/light/esp_color_view.h) and [channel_colors.h](https://github.com/esphome/esphome/blob/dev/esphome/components/light/channel_colors.h) for details.

2. Declare the color accessor.

    Add a protected member variable to your component to hold the color accessor.  The `Inplace<T>` helper lets you initialize the object in-place without performing an extra heap allocation with `new` during `setup()`.

    ```cpp
    class MyComponent final : public esphome::light::AddressableLight {
     // ...
     protected:
      esphome::Inplace<esphome::light::CorrectedBufferColorAccessor> internal_accessor_;
    };
    ```

    Or, if your component already has everything it needs in its constructor to initialize the color accessor (such as the color data and effect data buffers), then you don't need `Inplace<T>`.

    ```cpp
    esphome::light::CorrectedBufferColorAccessor internal_accessor_;
    ```

3. Describe the layout of the color data if needed by your accessor.

    Use [`ChannelColors`](https://github.com/esphome/esphome/blob/dev/esphome/components/light/channel_colors.h) to describe the layout of the R, G, B, W channels.  The constructor arguments specify the offset of the R, G, B, and (optionally) W channels.  Here are some examples:

    ```cpp
    constexpr ChannelColors RGB(0, 1, 2); // 3-arg constructor implies NO_WHITE
    constexpr ChannelColors BGR(2, 1, 0, ChannelColors::NO_WHITE);
    constexpr ChannelColors WRGB(1, 2, 3, 0);
    constexpr ChannelColors GRBX(1, 0, 2, ChannelColors::RESERVED_WHITE);
    ```

4. Initialize the color accessor and assign `this->accessor_`.

    Typically your component should assign the color accessor during `setup()` after it has allocated the color data and effect data buffers.

    ```cpp
    void MyComponent::setup() {
      // Allocate color data and effect data buffers if needed
      // ...

      // Initialize the color accessor
      this->accessor_ = this->internal_accessor_.init(this->color_data_, this->effect_data_, this->channel_colors_, &this->correction_);
    }
    ```

    Or, if your component already has everything it needs in its constructor to initialize the color accessor, then you can initialize it there.

    ```cpp
    constexpr ChannelColors WRGB{1, 2, 3, 0};

    MyComponent::MyComponent(/*...*/)
      : internal_accessor_(this->color_data_, this->effect_data_, WRGB, &this->correction_) {
      this->accessor_ = &this->internal_accessor_;
    }
    ```

5. Delete your `get_view_internal()` implementation.

    Review your `get_view_internal()` implementation to confirm that your color accessor will match its behavior.  Then delete it.  So long, farewell!

## Complete migration example

### Before

Before migration, the component implements `AddressableLight::get_view_internal()`.

```cpp
class ESP32RMTLEDStripLightOutput final : public light::AddressableLight {
 // ...
 protected:
  light::ESPColorView get_view_internal(int32_t index) const override;

  uint8_t *buf_{nullptr};
  uint8_t *effect_data_{nullptr};
  light::ChannelColors channel_colors_{0, 1, 2, light::ChannelColors::NO_WHITE};
};

light::ESPColorView ESP32RMTLEDStripLightOutput::get_view_internal(int32_t index) const {
  const light::ChannelColors &colors = this->channel_colors_;
  uint8_t *led = this->buf_ + (index * colors.bytes_per_led());
  return {led + colors.r,
          led + colors.g,
          led + colors.b,
          colors.has_white() ? led + colors.w : nullptr,
          &this->effect_data_[index],
          &this->correction_};
}
```

### After

After migration, the component assigns `accessor_` to point to an appropriately initialized color accessor.

```cpp
class ESP32RMTLEDStripLightOutput final : public light::AddressableLight {
 // ...
 protected:
  Inplace<light::CorrectedBufferColorAccessor> internal_accessor_;

  uint8_t *buf_{nullptr};
  uint8_t *effect_data_{nullptr};
  light::ChannelColors channel_colors_{0, 1, 2}; // 3-arg constructor implies NO_WHITE
}

void ESP32RMTLEDStripLightOutput::setup() {
  // ...

  this->accessor_ = this->internal_accessor_.init(this->buf_, this->effect_data_, this->channel_colors_, &this->correction_);
}
```

### Backwards compatible alternative

This example shows how to support older and newer versions of ESPHome, when desired, by wrapping the modified portions with `#if` to preserve backwards compatibility.

```cpp
#include "esphome/core/version.h"

class ESP32RMTLEDStripLightOutput final : public light::AddressableLight {
 // ...
 protected:
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 11, 0)
  Inplace<light::CorrectedBufferColorAccessor> internal_accessor_;
#else
  light::ESPColorView get_view_internal(int32_t index) const override;
#endif

  uint8_t *buf_{nullptr};
  uint8_t *effect_data_{nullptr};
  light::ChannelColors channel_colors_{0, 1, 2, light::ChannelColors::NO_WHITE}; // 4-arg constructor is compatible with both versions
};

void ESP32RMTLEDStripLightOutput::setup() {
  // ...

#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 11, 0)
  this->accessor_ = this->internal_accessor_.init(this->buf_, this->effect_data_, this->channel_colors_, &this->correction_);
#endif
}

#if ESPHOME_VERSION_CODE < VERSION_CODE(2026, 11, 0)
light::ESPColorView ESP32RMTLEDStripLightOutput::get_view_internal(int32_t index) const {
  const light::ChannelColors &colors = this->channel_colors_;
  uint8_t *led = this->buf_ + (index * colors.bytes_per_led());
  return {led + colors.r,
          led + colors.g,
          led + colors.b,
          colors.has_white() ? led + colors.w : nullptr,
          &this->effect_data_[index],
          &this->correction_};
}
#endif
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #21577: Refactor ESPColorView and related types](https://github.com/esphome/esphome/pull/21577)
