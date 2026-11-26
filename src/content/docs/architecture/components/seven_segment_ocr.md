---
title: "Reading a seven-segment display with seven_segment_ocr"
---

`seven_segment_ocr` reads the digits of a seven-segment display out of a grayscale image. It is a C++ library
component: it has no YAML configuration, and a consumer component gives it one crop per frame and publishes the
result. `ssocr_reader` is the first consumer.

The reader works on one byte per pixel. It does not crop, rotate or scale, and it does not publish anything; the
consumer owns the entities and the timing.

Digits must be upright: correct the skew of slanted LCDs before calling `recognize()`, because the side probes
expect the two strokes on each side to share a column.

## Using it

Create one instance, call `reserve()` once with the widest crop that `recognize()` will see, and then call
`recognize()` for each frame:

```cpp
#include "esphome/components/seven_segment_ocr/seven_segment_ocr.h"

class MeterReader : public Component {
 public:
  void setup() override {
    if (!this->ocr_.reserve(CROP_WIDTH))
      this->mark_failed(LOG_STR("Could not allocate the OCR column projection"));
  }

 protected:
  // Call this once the consumer has copied a new frame into crop_.
  void process_crop_() {
    const auto result = this->ocr_.recognize(this->crop_, CROP_WIDTH, CROP_HEIGHT, DIGIT_COUNT);
    if (result.complete())
      this->value_sensor_->publish_state(result.value);
  }

  seven_segment_ocr::SevenSegmentOCR ocr_;
  uint8_t *crop_{nullptr};
  sensor::Sensor *value_sensor_{nullptr};
};
```

`recognize()` modifies the image in place, so pass a buffer that the consumer owns. Pixels above `threshold_level`
(default `128`) become `255` and the rest become `0`, so bright digits on a dark background are expected.

## The result

| Field | Meaning |
| --- | --- |
| `value` | The digits as a number. Only meaningful when `complete()` is true. |
| `digits` | Digit runs found, including runs past the expected count. |
| `expected` | The digit count passed to `recognize()`. |
| `unknown` | Runs whose lit segments matched no digit. |
| `confidence` | Mean segment decision margin, 0 (at the boundary) to 1 (decisive). |
| `overflow` | Set when the digits do not fit in the 32-bit `value`; nothing is accumulated. |

`complete()` is true when `digits == expected`, `unknown == 0` and `overflow` is false, so extra runs on a misaligned
crop make it false instead of publishing a shifted reading.

## The recognition steps

1. Threshold the image.
2. Count the lit pixels of every column.
3. Group consecutive columns with more lit pixels than `height / 40` (rounded down, at least 1) into
   digit runs. Runs narrower than `height / 30` pixels (rounded down, at least 2), or whose tallest
   column has fewer than `height / 3` (rounded down) lit pixels, are ignored as noise or marks such
   as decimal points and signs.
4. Sample seven segment positions per run, each through a 3x3 window. The side probes use the strongest column of the
   left and right half, so the vertical strokes can sit at the run edges or inset.
5. Look the resulting seven-bit mask up in the digit table.

A run narrower than a third of the image height is a single bar. The fixed probes cannot separate the left and right
side of such a digit, so it is read as a `1` when both of its halves are lit.

## Memory

`reserve()` allocates one two-byte column counter per image column. `recognize()` reuses it and allocates nothing.
The segment positions and digit masks are constant tables in flash.

## Tests

The component has host unit tests in `tests/components/seven_segment_ocr/`. Run them with
`script/cpp_unit_test.py seven_segment_ocr`. They render every digit at two scales and cover the
confidence, the narrow one-bar digit, edge and inset strokes, a decimal point, extra digits, unknown segment masks,
a half-height bar, missing digits, a value that would overflow, the threshold, and the bad-input guards.
