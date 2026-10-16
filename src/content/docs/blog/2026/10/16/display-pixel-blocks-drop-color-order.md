---
title: "Display Pixel Blocks Drop the Color Order and Get a Driver Hook"
date: 2026-10-16
authors: clydebarrow
---

ESPHome 2026.11.0 removes the `ColorOrder` argument from `Display::draw_pixels_at()` and from the `ColorUtil` color conversions. Pixel blocks and packed colors are always RGB. `draw_pixels_at()` is no longer virtual: a display driver that copies blocks itself now overrides the protected `draw_pixels_()`. The forms that take a `ColorOrder` still work, with a deprecation warning, until 2027.5.0.

This is a **developer breaking change** for external display components in **ESPHome 2026.11.0 and later**, with a deprecation period until **2027.5.0**.

<!-- excerpt -->

## Background

`draw_pixels_at()` hands a display a whole block of pixels at once. LVGL uses it to flush what it has rendered, and `image` uses it for opaque RGB565 and RGB images. It took a `ColorOrder`, but every caller passed `COLOR_ORDER_RGB`, and the BGR and GRB conversions in `ColorUtil` were never used and did not agree with each other. The panel color order (`color_order: bgr` in YAML) is a separate setting that panel drivers apply with their MADCTL register, and it is unchanged.

`draw_pixels_at()` was also the virtual function drivers overrode. A driver that overrode one form hid the other forms for calls made through the driver's own type, so the public call and the driver hook are now separate functions.

### Changes

- [PR #20884](https://github.com/esphome/esphome/pull/20884): drops the color order from `draw_pixels_at()` and `ColorUtil`, and adds the `draw_pixels_()` hook.

## What's Changing

### Display

```cpp
// OLD - public and virtual; drivers overrode it
virtual void draw_pixels_at(int x_start, int y_start, int w, int h, const uint8_t *ptr, ColorOrder order,
                            ColorBitness bitness, bool big_endian, int x_offset, int y_offset, int x_pad);

// NEW - public and not virtual; callers use these
void draw_pixels_at(int x_start, int y_start, int w, int h, const uint8_t *ptr, ColorBitness bitness,
                    bool big_endian, int x_offset, int y_offset, int x_pad);
void draw_pixels_at(int x_start, int y_start, int w, int h, const uint8_t *ptr, ColorBitness bitness,
                    bool big_endian);

// NEW - protected and virtual; drivers override this one
virtual void draw_pixels_(int x_start, int y_start, int w, int h, const uint8_t *ptr, ColorBitness bitness,
                          bool big_endian, int x_offset, int y_offset, int x_pad);
```

The base `draw_pixels_()` draws the block per pixel through `draw_pixel_at()`, as the old base `draw_pixels_at()` did. See [Drawing blocks of pixels](/architecture/components/display#drawing-blocks-of-pixels) for the rules an override must follow.

### ColorUtil

```cpp
// OLD
Color c = display::ColorUtil::to_color(value, display::COLOR_ORDER_RGB, display::COLOR_BITNESS_565);
uint16_t v = display::ColorUtil::color_to_565(color, display::COLOR_ORDER_RGB);
uint8_t v = display::ColorUtil::color_to_332(color, display::COLOR_ORDER_RGB);
display::Rgb565ToMono to_mono(display::COLOR_ORDER_RGB);

// NEW
Color c = display::ColorUtil::to_color(value, display::COLOR_BITNESS_565);
uint16_t v = display::ColorUtil::color_to_565(color);
uint8_t v = display::ColorUtil::color_to_332(color);
display::Rgb565ToMono to_mono;
```

`color_to_565(color)` and `color_to_332(color)` were already valid calls, since the order defaulted to RGB; they now go to the new functions.

## Who This Affects

**Standard YAML configurations** need no changes.

**Code that calls `draw_pixels_at()`** with a `ColorOrder`, for example from a lambda, keeps working until 2027.5.0 and gets a deprecation warning. Drop the order:

```cpp
// OLD
it.draw_pixels_at(0, 0, w, h, buffer, display::COLOR_ORDER_RGB, display::COLOR_BITNESS_565, true);

// NEW
it.draw_pixels_at(0, 0, w, h, buffer, display::COLOR_BITNESS_565, true);
```

Until you migrate, such a call draws correctly but per pixel, even on a display that can copy blocks.

**External display drivers that override `draw_pixels_at()`** keep working until 2027.5.0: their override still receives every block, as RGB, and its call to `display::Display::draw_pixels_at(...)` for anything it cannot copy still draws per pixel. Overriding a deprecated function does not produce a warning, so check your driver by hand. To migrate, rename the override and drop the order:

```cpp
// OLD
void draw_pixels_at(int x_start, int y_start, int w, int h, const uint8_t *ptr, display::ColorOrder order,
                    display::ColorBitness bitness, bool big_endian, int x_offset, int y_offset, int x_pad) override {
  if (bitness != display::COLOR_BITNESS_565 || order != display::COLOR_ORDER_RGB || ...) {
    display::Display::draw_pixels_at(x_start, y_start, w, h, ptr, order, bitness, big_endian, x_offset, y_offset,
                                     x_pad);
    return;
  }
  ...
}

// NEW
void draw_pixels_(int x_start, int y_start, int w, int h, const uint8_t *ptr, display::ColorBitness bitness,
                  bool big_endian, int x_offset, int y_offset, int x_pad) override {
  if (bitness != display::COLOR_BITNESS_565 || ...) {
    display::Display::draw_pixels_(x_start, y_start, w, h, ptr, bitness, big_endian, x_offset, y_offset, x_pad);
    return;
  }
  ...
}
```

The fallback must call `display::Display::draw_pixels_()`. Calling `draw_pixels_at()` there would call your own override again.

**Code that uses `ColorUtil` with a `ColorOrder`** gets a deprecation warning; drop the order as shown above. If you relied on BGR or GRB packing, swap the channels of the `Color` yourself before converting.

## Finding Code That Needs Updates

```bash
grep -rnE 'draw_pixels_at|COLOR_ORDER_(RGB|BGR|GRB)|Rgb565ToMono\(' --include='*.cpp' --include='*.h' --include='*.yaml'
```

`COLOR_ORDER_RGB` and `COLOR_ORDER_BGR` also appear in panel drivers that set the MADCTL color order; those uses are unchanged.

## Timeline

- **ESPHome 2026.11.0:** `draw_pixels_at()` and `ColorUtil` take no color order; drivers override `draw_pixels_()`. The forms with a `ColorOrder` are deprecated.
- **ESPHome 2027.5.0:** the forms with a `ColorOrder` are removed. An override of the old `draw_pixels_at()` no longer compiles.

## Questions?

If you have questions about these changes or need help migrating your external component, please ask in the [ESPHome Discord](https://discord.gg/KhAMKrd) or open a [discussion on GitHub](https://github.com/esphome/esphome/discussions).
