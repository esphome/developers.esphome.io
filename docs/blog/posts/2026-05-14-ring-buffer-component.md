---
date: 2026-05-14
authors:
  - bdraco
comments: true
---

# RingBuffer Moved Out of Core Into ring_buffer Helper Component

`RingBuffer` has moved from `esphome/core/ring_buffer.h` into a new `ring_buffer` helper component at `esphome/components/ring_buffer/ring_buffer.h` under the `esphome::ring_buffer` namespace. The old location is deprecated and will be removed in **ESPHome 2026.11.0**.

This is a **breaking change** for external components in **ESPHome 2026.5.0 and later**.

<!-- more -->

## Background

**[PR #16298](https://github.com/esphome/esphome/pull/16298): Move core ring buffer to helper component**

The core `RingBuffer` was an ESP32-only implementation used exclusively by audio components — `audio`, `i2s_audio`, `micro_wake_word`, `mixer`, `resampler`, `sound_level`, `speaker`, `voice_assistant`. Nothing outside that audio cluster touches it. Living in `esphome/core/` meant:

- The `ring_buffer.h` header was parsed for every build, regardless of platform or whether audio was in use. Linker stripping does keep unused code out of the final binary, but build-time parsing and tooling overhead still applied universally.
- Changes to `RingBuffer` couldn't be staged in an `external_components` PR — they always required a core change.
- The ESP32-only implementation lived alongside genuinely cross-platform core code.

Moving it into a real component (`esphome::ring_buffer::RingBuffer`) lets audio consumers `AUTO_LOAD` it the same way every other shared utility is pulled in, and opens the door to iterating on the implementation without touching core.

The old `esphome/core/ring_buffer.h` header now forwards to the new location with a compile-time deprecation warning. It will be removed in **2026.11.0** per the standard 6-month policy.

## What's Changing

### C++ include and namespace

```cpp
// Before
#include "esphome/core/ring_buffer.h"

std::unique_ptr<esphome::RingBuffer> buf = esphome::RingBuffer::create(1024);
```

```cpp
// After
#include "esphome/components/ring_buffer/ring_buffer.h"

std::unique_ptr<esphome::ring_buffer::RingBuffer> buf =
    esphome::ring_buffer::RingBuffer::create(1024);
```

### Python codegen — declare `AUTO_LOAD`

Any component whose C++ uses `RingBuffer` must auto-load the helper component so the build system pulls in its sources. In your component's `__init__.py`:

```python
AUTO_LOAD = ["ring_buffer"]
```

If your component already has an `AUTO_LOAD`, append `"ring_buffer"` to it.

## Who This Affects

**External audio / streaming components** that use `RingBuffer` directly — typically:

- Custom microphone / I²S audio pipelines
- Speaker / playback components
- Streaming protocol bridges (BLE audio, Nordic UART, etc.)
- Forks or extensions of `micro_wake_word`, `voice_assistant`, `speaker`

All in-tree consumers (`audio`, `i2s_audio`, `micro_wake_word`, `mixer`, `resampler`, `sound_level`, `speaker`, `voice_assistant`) were migrated in [esphome/esphome#16298](https://github.com/esphome/esphome/pull/16298).

**Non-audio components are unaffected.**

## Migration Guide

1. Update the include path:

    ```diff
    -#include "esphome/core/ring_buffer.h"
    +#include "esphome/components/ring_buffer/ring_buffer.h"
    ```

2. Update the namespace at every callsite:

    ```diff
    -esphome::RingBuffer::create(size);
    +esphome::ring_buffer::RingBuffer::create(size);
    ```

    If you have many callsites and they all live in your component's own namespace, a single `using esphome::ring_buffer::RingBuffer;` at the top of the file lets the rest of the code stay unchanged.

3. Add `AUTO_LOAD` in your component's `__init__.py`:

    ```python
    AUTO_LOAD = ["ring_buffer"]
    ```

The API of `RingBuffer` itself (`create()`, `read()`, `write()`, `available()`, `discard_bytes()`, etc.) is unchanged — only its location and namespace move.

## Timeline

- **2026.5.0:** New location active; old `esphome/core/ring_buffer.h` deprecated (compile warning).
- **2026.11.0:** Old header removed.

## Finding Code That Needs Updates

```bash
# C++ — find the old include
grep -rn 'esphome/core/ring_buffer.h' your_component/

# C++ — find old namespace usage
grep -rn 'esphome::RingBuffer' your_component/

# Python — find AUTO_LOAD declarations that need ring_buffer added
grep -rn 'AUTO_LOAD' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #16298](https://github.com/esphome/esphome/pull/16298) — Move core ring buffer to helper component
