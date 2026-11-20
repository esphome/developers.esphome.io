---
title: "Finding a needle angle with gauge_needle_detector"
---

`gauge_needle_detector` finds the needle angle in a grayscale image of an analog dial. It is a C++ library
component: it has no YAML configuration, and a consumer component instantiates it, gives it one buffer per dial and
publishes the result. `analog_gauge_reader` is the first consumer.

The detector works on one byte per pixel. It does not crop, rotate or scale, and it does not turn the angle into a
value; that mapping belongs to the consumer, because it depends on the dial's angle range.

## Selecting the algorithms

Each algorithm is a separate translation unit behind its own define, so a build only carries the algorithms it uses.
A consumer enables them from its own `to_code`, using the names returned by `algorithm_name()`:

```python
from esphome.components import gauge_needle_detector

gauge_needle_detector.enable_detectors({"radial_profile"})
```

| Define | Algorithm |
| --- | --- |
| `USE_GAUGE_NEEDLE_INTENSITY_SCAN` | `legacy` |
| `USE_GAUGE_NEEDLE_RADIAL_PROFILE` | `radial_profile` |
| `USE_GAUGE_NEEDLE_HOUGH_TRANSFORM` | `hough_transform` |
| `USE_GAUGE_NEEDLE_TEMPLATE_MATCH` | `template_match` |

`USE_GAUGE_NEEDLE_DETECTOR` enables the component itself and is emitted by its own `to_code`, so a consumer only has
to `AUTO_LOAD` the component and call `enable_detectors()`. `auto` and `debug` compare every algorithm, so they need
all four defines.

## Using a detector

```cpp
#include "esphome/components/gauge_needle_detector/gauge_needle_detector.h"

gauge_needle_detector::NeedleDetector detector;
```

Create one instance, call `reserve()` once when the crop size is known, and then call `detect()` for each frame:

```cpp
detector.reserve(crop_width, crop_height);  // once, in setup()

gauge_needle_detector::DetectorConfig config;
config.id = "dial_1";
config.algorithm = gauge_needle_detector::ALGORITHM_RADIAL_PROFILE;
config.needle_type = gauge_needle_detector::NEEDLE_TYPE_LIGHT;

const gauge_needle_detector::DetectionResult result =
    detector.detect(grayscale, crop_width, crop_height, config);
// result.angle: degrees, 0 = East, clockwise
// result.confidence: 0 to 1
```

`DetectorConfig` carries the per-dial tuning:

| Field | Meaning |
| --- | --- |
| `id` | Dial name used in log lines. Points to a string literal. |
| `needle_type` | `NEEDLE_TYPE_DARK` or `NEEDLE_TYPE_LIGHT` (the needle is darker or brighter than the face). |
| `algorithm` | One of the `ALGORITHM_*` values, or `ALGORITHM_AUTO`. |
| `min_scan_radius`, `max_scan_radius` | Scan window as a fraction of the dial radius, default 0.3 and 0.9. |
| `deadzone_diameter` | Centre circle in pixels that the detection ignores. |
| `debug` | Also run the other compiled-in detectors and log the comparison. |

`detect()` returns `{}` (angle 0, confidence 0) when the image is null or a dimension is not positive. Call it from
the main loop; a camera listener already runs there. The buffers are kept between calls, so a steady stream of
equally sized crops does not allocate after `reserve()`.

## The algorithms

| Algorithm | Approach | When it helps |
| --- | --- | --- |
| `radial_profile` | Traces rays from the centre and keeps the longest bright run. | Default; clean dials with a clear needle. |
| `legacy` | Scores each ray of the raw crop by how many needle-coloured pixels it crosses. | Cheapest; works without preprocessing. |
| `hough_transform` | Votes edge pixels into a radial histogram, weighted by edge magnitude. | Broken, faint or cluttered needles. |
| `template_match` | Searches ray angles for the brightest average line. | Cross-checking another algorithm. |
| `auto` | Runs every compiled-in algorithm and keeps the most confident result. | Calibration. |

`legacy` works on the raw crop. The other three work on a preprocessed image: CLAHE, a top-hat filter whose kernel
scales with the dial radius, and a 3x3 median filter. `NeedleDetector` preprocesses once per `detect()` call and
shares the result between the filtered algorithms.

The angle is measured from the centre of the crop, so the crop has to be centred on the dial. `deadzone_diameter`
and the scan radii are in crop pixels.

## The C++ interface

`Detector` is the strategy interface. A detector holds no per-frame state, so one instance serves every dial:

```cpp
class Detector {
 public:
  virtual Algorithm algorithm() const = 0;
  virtual bool needs_filtered_image() const { return true; }
  virtual DetectionResult detect(const uint8_t *raw, const uint8_t *filtered, int width, int height,
                                 const DetectorConfig &config) = 0;
};
```

`filtered` is `nullptr` for a detector whose `needs_filtered_image()` returns `false`. The built-in detectors keep
their scratch arrays as members: two 360-entry `float` arrays for `radial_profile` and `legacy`, a 360-entry `int`
accumulator and a one-byte-per-pixel edge map for `hough_transform`.

`Preprocessor` is the shared preprocessing step and can be used on its own:

```cpp
gauge_needle_detector::Preprocessor preprocessor;
preprocessor.reserve(width, height);
if (preprocessor.prepare(raw, width, height, radius, gauge_needle_detector::NEEDLE_TYPE_LIGHT, false)) {
  const uint8_t *filtered = preprocessor.data();  // width * height bytes
}
```

`algorithm_name()` returns the configuration name as a `LogString`, so log it with `LOG_STR_ARG()`.

## Adding an algorithm

Add the enumerator to `Algorithm` and its name to the `AlgorithmNames` table, add the class, add it to the
`NeedleDetector` constructor behind a new `USE_GAUGE_NEEDLE_*` define, and extend the `DetectorConfig::algorithm`
selection in `NeedleDetector::detect()`. A detector that needs the filtered image receives it from the shared
preprocessor; one that works on the raw crop returns `false` from `needs_filtered_image()`.

## Tests

The algorithms have host unit tests in `tests/components/gauge_needle_detector/`. Run them with
`script/cpp_unit_test.py gauge_needle_detector`. They draw a synthetic needle and check the angle for `legacy`, that
the filtered detectors and `auto` return a well-formed result, the bad-input guards, and the preprocessor output.

Note that the tests use a textured crop for the filtered algorithms: CLAHE turns a uniform background into a flat
bright image, and the top-hat filter then removes a needle that sits on it.
