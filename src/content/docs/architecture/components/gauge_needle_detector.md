---
title: "Finding a needle angle with gauge_needle_detector"
---

`gauge_needle_detector` finds the needle angle in a grayscale image of an analog dial. It is a C++ library
component: it has no YAML configuration, and a consumer component instantiates it, gives it one crop per dial and
publishes the result. `analog_gauge_reader` is the first consumer.

The detector works on one byte per pixel. It does not crop, rotate or scale, and it does not turn the angle into a
value; that mapping belongs to the consumer, because it depends on the dial's angle range.

## Selecting the algorithms

Each algorithm is a separate translation unit behind its own define, so a build only carries the algorithms it uses.
A consumer lists the component in `AUTO_LOAD`, which adds its sources to the build, and enables the algorithms from
its own `to_code`, using the names returned by `algorithm_name()`:

```python
from esphome.components import gauge_needle_detector
from esphome.types import ConfigType

AUTO_LOAD = ["gauge_needle_detector"]


async def to_code(config: ConfigType) -> None:
    gauge_needle_detector.enable_detectors({"radial_profile"})
```

| Define | Algorithm |
| --- | --- |
| `USE_GAUGE_NEEDLE_INTENSITY_SCAN` | `legacy` |
| `USE_GAUGE_NEEDLE_RADIAL_PROFILE` | `radial_profile` |
| `USE_GAUGE_NEEDLE_HOUGH_TRANSFORM` | `hough_transform` |
| `USE_GAUGE_NEEDLE_TEMPLATE_MATCH` | `template_match` |

`enable_detectors()` accepts any iterable of these names, plus `auto` for all four. An unknown name raises
`ValueError`. It also sets `USE_GAUGE_NEEDLE_DETECTOR`, which enables the component itself, and
`USE_GAUGE_NEEDLE_PREPROCESSOR` when any algorithm other than `legacy` is enabled. `auto` and `debug` compare the
algorithms that are compiled in, so enable all of them to compare all four.

## Using a detector

```cpp
#include "esphome/components/gauge_needle_detector/gauge_needle_detector.h"

gauge_needle_detector::NeedleDetector detector;
```

Create one instance, call `reserve()` in `setup()` for the largest crop, and then call `detect()` for each frame:

```cpp
if (!detector.reserve(crop_width, crop_height)) {  // in setup()
  this->mark_failed(LOG_STR("Could not allocate the detector buffers"));
  return;
}

gauge_needle_detector::DetectorConfig config;
config.id = "dial_1";
config.algorithm = gauge_needle_detector::ALGORITHM_RADIAL_PROFILE;
config.needle_type = gauge_needle_detector::NEEDLE_TYPE_LIGHT;

const gauge_needle_detector::DetectionResult result =
    detector.detect(grayscale, crop_width, crop_height, config);
// result.angle: degrees, 0 = East, clockwise
// result.confidence: 0 to 1
```

The reservation is counted in pixels and never shrinks, so calling `reserve()` once per crop size also works. The
buffers are kept between calls, so `detect()` does not allocate. Call it from the main loop; a camera listener
already runs there.

`DetectorConfig` carries the per-dial tuning:

| Field | Meaning |
| --- | --- |
| `id` | Dial name used in log lines. Points to a string literal. |
| `needle_type` | `NEEDLE_TYPE_DARK` or `NEEDLE_TYPE_LIGHT` (the needle is darker or brighter than the face). |
| `algorithm` | One of the `ALGORITHM_*` values, including `ALGORITHM_AUTO`. |
| `min_scan_radius`, `max_scan_radius` | Scan window as a fraction of the dial radius, default 0.3 and 0.9. |
| `deadzone_diameter` | Centre circle in pixels that the detection ignores. |
| `debug` | Also run the other compiled-in detectors and log the comparison. |

`detect()` returns `{}` (angle 0, confidence 0) when:

- the image is null or a dimension is not positive,
- the crop has more pixels than were reserved,
- the scan window is empty, or the crop is too small to have one,
- the selected algorithm is not compiled in, or preprocessing fails.

An oversize crop, an empty window and a missing algorithm are each logged once per `NeedleDetector`, for the first
dial that hits the problem. A consumer should treat zero confidence as "no reading" and not use the angle.

## The algorithms

| Algorithm | Approach | When it helps |
| --- | --- | --- |
| `radial_profile` | Traces rays from the centre and keeps the longest bright run. | Default; clean dials with a clear needle. |
| `legacy` | Scores each ray of the raw crop by how many needle-coloured pixels it crosses. | Cheapest; works without preprocessing. |
| `hough_transform` | Votes edge pixels into a radial histogram, weighted by edge magnitude. | Broken, faint or cluttered needles. |
| `template_match` | Searches ray angles for the brightest average line. | Cross-checking another algorithm. |
| `auto` | Runs the compiled-in filtered algorithms and keeps the most confident result. | Calibration. |

`legacy` works on the raw crop. The other three work on a preprocessed image: a clipped contrast stretch followed by
a top-hat filter. The top-hat kernel is at least seven pixels across and grows with the dial radius.
`NeedleDetector` preprocesses once per `detect()` call and shares the result between the filtered algorithms.

The confidence of `legacy` is not comparable with the others, so `auto` only picks it when no filtered algorithm is
compiled in. With `debug` set it still runs, so that its result is logged.

The angle is measured from the centre of the crop, so the crop has to be centred on the dial. `deadzone_diameter`
and the scan radii are in crop pixels.

## The C++ interface

`Detector` is the strategy interface. A detector holds no per-frame state, so one instance serves every dial:

```cpp
class Detector {
 public:
  virtual ~Detector() = default;
  virtual Algorithm algorithm() const = 0;
  virtual bool needs_filtered_image() const { return true; }
  virtual DetectionResult detect(const uint8_t *raw, const uint8_t *filtered, const ScanWindow &window,
                                 const DetectorConfig &config, float *scores) = 0;
};
```

- `window` holds the crop size, its centre and the first and last radius to scan. `window.valid()` is false when
  there is nothing to scan.
- `filtered` is `nullptr` for a detector whose `needs_filtered_image()` returns `false`.
- `scores` is a workspace of `ANGLE_COUNT` (360) floats owned by the caller. The detectors share it, because they run
  one at a time.

`sin_lut()`, `cos_lut()`, `find_score_range()` and `ray_confidence()` in the same header are shared by the built-in
ray algorithms.

`Preprocessor` is the shared preprocessing step and can be used on its own:

```cpp
gauge_needle_detector::Preprocessor preprocessor;
preprocessor.reserve(width, height);  // once; returns false when memory runs out
if (preprocessor.prepare(raw, width, height, radius, gauge_needle_detector::NEEDLE_TYPE_LIGHT, false)) {
  const uint8_t *filtered = preprocessor.data();  // width * height bytes
}
```

It allocates three buffers of one byte per pixel.

`algorithm_name()` returns the configuration name as a `LogString`, so log it with `LOG_STR_ARG()`.

## Adding an algorithm

1. Add the enumerator to `Algorithm` and its name to the `AlgorithmNames` table, keeping both in the same order.
2. Add the class, with its source file guarded by a new `USE_GAUGE_NEEDLE_*` define.
3. Add the member to `NeedleDetector`, register it in the constructor behind the define, and raise `MAX_DETECTORS`.
4. Add the name and define to `ALGORITHM_DEFINES` in `__init__.py`, and the define to `esphome/core/defines.h`.

`NeedleDetector::detect()` selects a detector by its `algorithm()` value, so it needs no change. A detector that
needs the filtered image receives it from the shared preprocessor; one that works on the raw crop returns `false`
from `needs_filtered_image()`. `enable_detectors()` enables the preprocessor for every name except `legacy`, so
adjust it for another raw-crop detector.

## Tests

The algorithms have host unit tests in `tests/components/gauge_needle_detector/`. Run them with
`script/cpp_unit_test.py gauge_needle_detector`. They draw a synthetic needle on plain and textured crops and check
the angle found by `legacy`, the filtered algorithms and `auto`, as well as the input guards, the reservation and the
preprocessor output. The defines that `enable_detectors()` emits are covered by
`tests/component_tests/gauge_needle_detector/`.
