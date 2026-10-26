---
title: "Microphone"
---

The `microphone` component is a hardware abstraction base, not an [entity](/architecture/components/index). A
microphone is an audio *source*: it captures PCM audio and hands each buffer to whichever components registered a
callback. It is not shown to the user in the front-end directly. Instead it is consumed by components such as
`voice_assistant`, `micro_wake_word` or `sound_level`. If you are writing a component that captures audio from some
piece of hardware (an I2S ADC, a PDM microphone, etc.), you expose it as a microphone.

## Python

A microphone platform lives in a `microphone.py` file (or `microphone/__init__.py` package) inside your component's
directory, allowing the user to configure it under the `microphone:` block:

```yaml
microphone:
  - platform: my_component
    id: my_microphone
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
from esphome.components import audio, microphone
import esphome.config_validation as cv
from esphome.const import CONF_ID
from esphome.types import ConfigType

my_microphone_ns = cg.esphome_ns.namespace("my_microphone")
MyMicrophone = my_microphone_ns.class_("MyMicrophone", microphone.Microphone, cg.Component)
```

### Configuration schema

Extend `microphone.MICROPHONE_SCHEMA`, which adds the `on_data` trigger on top of `audio.AUDIO_COMPONENT_SCHEMA` (the
optional `bits_per_sample`, `num_channels` and `sample_rate` options). Then tell the audio validation which formats
your hardware produces with `audio.set_stream_limits()`, so components that consume the audio can check their
requirements against it:

```python
def _set_stream_limits(config: ConfigType) -> ConfigType:
    audio.set_stream_limits(
        min_bits_per_sample=16,
        max_bits_per_sample=16,
        min_channels=1,
        max_channels=2,
        min_sample_rate=16000,
        max_sample_rate=16000,
    )(config)
    return config


CONFIG_SCHEMA = cv.All(
    microphone.MICROPHONE_SCHEMA.extend(
        {
            cv.GenerateID(): cv.declare_id(MyMicrophone),
        }
    ).extend(cv.COMPONENT_SCHEMA),
    _set_stream_limits,
)
```

If the user can choose the format, set the limits from the configured values, as `i2s_audio` and `usb_audio` do.

### Code generation

Create the variable yourself, then call `microphone.register_microphone()` to build the `on_data` automations:

```python
async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await microphone.register_microphone(var, config)
```

## C++

The C++ class inherits from `microphone::Microphone` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/microphone/microphone.h"

namespace esphome::my_microphone {

class MyMicrophone : public microphone::Microphone, public Component {
 public:
  void start() override;
  void stop() override;

 protected:
  static void capture_task_(void *params);
};

}  // namespace esphome::my_microphone
```

### Starting and stopping

`start()` and `stop()` are called by consumers and by the `microphone.capture` and `microphone.stop_capture` actions.
Several consumers can share one microphone, so count the calls: keep capturing until every `start()` has been matched
by a `stop()`, and ignore a `stop()` with no matching `start()`. Change `state_`
(`STATE_STOPPED`, `STATE_STARTING`, `STATE_RUNNING`, `STATE_STOPPING`) from the main loop as the hardware starts and
stops. In `setup()`, set `audio_stream_info_` to the format your hardware produces, because consumers such as
`resampler` read it in their own `setup()` to size their buffers.

### Publishing audio

Captured audio is passed to the registered callbacks with `publish_audio_()`. It takes the audio as a
`std::span<const uint8_t>` (a `std::vector<uint8_t>` converts to one), the format of that audio, and the time it was
captured. Callbacks run on the thread that calls `publish_audio_()`, usually the microphone's own capture task, and
finish before it returns, so you can reuse the buffer right away:

```cpp
void MyMicrophone::capture_task_(void *params) {
  auto *mic = static_cast<MyMicrophone *>(params);
  // The task's own copy of the format, so the main loop can never change it mid-stream
  const audio::AudioStreamInfo stream_info = mic->audio_stream_info_;
  while (mic->running_) {  // std::atomic<bool>, set and cleared by the main loop
    if (!mic->has_data_callbacks_()) {
      vTaskDelay(pdMS_TO_TICKS(READ_DURATION_MS));  // Nobody is listening, so skip the read
      continue;
    }
    size_t bytes_read = mic->read_from_hardware_(mic->buffer_.data(), mic->buffer_.size());
    if (bytes_read == 0)
      continue;
    int64_t capture_time_us = mic->first_frame_time_();
    mic->publish_audio_(std::span<const uint8_t>(mic->buffer_.data(), bytes_read), stream_info, capture_time_us);
  }
}
```

Each buffer holds interleaved PCM samples in the format you pass with it. Publish whole frames only; `MicrophoneSource`
drops a partial frame at the end of a buffer.

The capture time is when the buffer's first frame was captured, in `esp_timer_get_time()` microseconds. Take it as
close to the hardware as you can, for example in the DMA receive interrupt. If your platform cannot tell, leave the
argument out; it defaults to 0, which means "unknown".

Muting is handled by the base class: while `set_mute_state(true)` is in effect (the `microphone.mute` action),
callbacks receive zeros in place of your audio, so do not mute in your own code. Capturing continues.

> [!WARNING]
> Calling `this->data_callbacks_.call(data)` with a `std::vector<uint8_t>` still works, but it is deprecated and will be
> removed in 2027.5.0. Use `publish_audio_(data, stream_info)` instead, and `has_data_callbacks_()` in place of
> `data_callbacks_.size() > 0`.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).

## Consuming microphone audio

A component that needs audio registers a callback with `add_data_callback()`. The callback receives a
`microphone::AudioCapture`:

```cpp
this->mic_->add_data_callback([this](const microphone::AudioCapture &capture) {
  this->process_(capture.data, capture.stream_info, capture.capture_time_us);
});
```

- `data` is the audio as a `std::span<const uint8_t>`. It is only valid during the call.
- `stream_info` is the format of `data`. Use it rather than calling `get_audio_stream_info()` from the callback. The
  main loop may change the microphone's format while your callback runs on another thread, but the format in the
  capture always matches its data.
- `capture_time_us` is when the first frame was captured, in `esp_timer_get_time()` microseconds, or 0 when the
  microphone does not provide one.

Register the callback once, in `setup()`. Callbacks cannot be removed, and adding one while the microphone's task is
running is not safe. Callbacks run on the microphone's thread, so copy the audio into a ring buffer or similar rather
than doing slow work in the callback.

> [!WARNING]
> Callbacks that take `const std::vector<uint8_t> &` still work, but they are deprecated and will be removed in
> 2027.5.0. Each buffer is copied into a new vector for them, so switch to `const microphone::AudioCapture &`.

### MicrophoneSource

Most consumers should not register on the microphone directly. `microphone::MicrophoneSource` keeps only the channels
the consumer asks for, converts them to its bits per sample, applies an optional gain, and only passes audio while the
consumer has started it. `MicrophoneSource::add_data_callback()` takes the same callbacks as the microphone; the
`stream_info` in each capture is the converted format, and the capture time is passed through unchanged. It does not
change the sample rate: pass `sample_rate=` to `final_validate_microphone_source_schema()` so a mismatch is caught in
validation, or put a `resampler` microphone in between. A passive source, created with
`microphone_source_to_code(config, passive=True)`, never starts or stops the microphone and only receives audio while
another component has it running.

In Python, add `microphone.microphone_source_schema()` to your schema, check it against the microphone in final
validation with `microphone.final_validate_microphone_source_schema()`, and create the source with
`microphone.microphone_source_to_code()`. `default={}` picks the device's only microphone:

```python
import esphome.codegen as cg
from esphome.components import microphone
import esphome.config_validation as cv
from esphome.const import CONF_ID, CONF_MICROPHONE
from esphome.types import ConfigType

DEPENDENCIES = ["microphone"]

my_consumer_ns = cg.esphome_ns.namespace("my_consumer")
MyConsumer = my_consumer_ns.class_("MyConsumer", cg.Component)

CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(MyConsumer),
        cv.Optional(CONF_MICROPHONE, default={}): microphone.microphone_source_schema(
            min_bits_per_sample=16, max_bits_per_sample=16
        ),
    }
).extend(cv.COMPONENT_SCHEMA)

FINAL_VALIDATE_SCHEMA = cv.Schema(
    {
        cv.Required(CONF_MICROPHONE): microphone.final_validate_microphone_source_schema(
            "my_consumer", sample_rate=16000
        ),
    },
    extra=cv.ALLOW_EXTRA,
)


async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    mic_source = await microphone.microphone_source_to_code(config[CONF_MICROPHONE])
    cg.add(var.set_microphone_source(mic_source))
```

In C++, call `start()` and `stop()` on the `MicrophoneSource` rather than on the microphone; both are safe to call more
than once. Use `get_audio_stream_info()` for the format of the converted audio.
