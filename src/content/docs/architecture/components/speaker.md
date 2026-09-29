---
title: "Speaker"
---

The `speaker` component is a hardware abstraction base, not an [entity](/architecture/components/index). A speaker is an
audio *sink*: something you can push a stream of PCM audio bytes into. It is not shown to the user in the front-end
directly - instead it is consumed by higher-level audio components such as `media_player` or a voice assistant, which
feed it decoded audio data and drive its `on`/`off`/`playing` lifecycle. If you are writing a component that turns audio
data into sound on some piece of hardware (an I2S DAC, a Bluetooth link, etc.), you expose it as a speaker.

There is no starter component for `speaker` in the [starter-components](https://github.com/esphome/starter-components)
repository, so this page walks through the base class and platform module directly instead.

## Python

A speaker platform lives in a `speaker.py` file (or `speaker/__init__.py` package) inside your component's directory,
allowing the user to configure it under the `speaker:` block:

```yaml
speaker:
  - platform: my_component
    id: my_speaker
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import speaker
from esphome.const import CONF_ID

my_speaker_ns = cg.esphome_ns.namespace("my_speaker")
MySpeaker = my_speaker_ns.class_("MySpeaker", speaker.Speaker, cg.Component)
```

Note that `MySpeaker` inherits from both `speaker.Speaker` and a component base (`cg.Component` here).

### Configuration schema

As with `output`, there is no `speaker_schema()` / `new_speaker()` pair. `esphome.components.speaker` provides
`SPEAKER_SCHEMA`, built on top of `audio.AUDIO_COMPONENT_SCHEMA` (the common `bits_per_sample`, `num_channels` and
`sample_rate` options shared by audio components) plus an optional `audio_dac` for volume/mute control. Extend it and
add your own `CONF_ID`, since - again - there is no helper to declare it for you:

```python
CONFIG_SCHEMA = speaker.SPEAKER_SCHEMA.extend(
    {
        cv.Required(CONF_ID): cv.declare_id(MySpeaker),
    }
).extend(cv.COMPONENT_SCHEMA)
```

### Code generation

Create the variable yourself with `cg.new_Pvariable()`, then call `speaker.register_speaker()` to wire up the options
that `SPEAKER_SCHEMA` understands (currently just `audio_dac`, if configured):

```python
async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await speaker.register_speaker(var, config)
    await cg.register_component(var, config)
```

## C++

The C++ class inherits from `speaker::Speaker` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/speaker/speaker.h"

namespace esphome::my_speaker {

class MySpeaker : public speaker::Speaker, public Component {
 public:
  void start() override;
  void stop() override;
  bool has_buffered_data() const override;

  size_t play(const uint8_t *data, size_t length) override;
};

}  // namespace esphome::my_speaker
```

### Consuming audio data

`speaker::Speaker` has no `control()`/`Call` object and no `publish_state()` - it is a pure data sink, driven directly
by whichever component holds a pointer to it. The methods you implement are:

- `play(const uint8_t *data, size_t length)`: the core method. Write (or buffer) as much of `data` as you can and return
  the number of bytes actually consumed - callers are expected to retry with the remainder if you return less than
  `length`. A `play(const std::vector<uint8_t> &)` convenience overload is provided by the base class for you.
- `start()` / `stop()`: begin or immediately halt playback. `finish()` is an optional third option - "play out the
  buffer, then stop" - which defaults to calling `stop()` if you do not override it.
- `has_buffered_data()`: whether there is still audio queued up that has not finished playing.

```cpp
size_t MySpeaker::play(const uint8_t *data, size_t length) {
  size_t written = this->write_to_dma_buffer_(data, length);
  return written;
}
```

Before sending data, callers configure the stream format via `set_audio_stream_info()` (an `audio::AudioStreamInfo`
describing sample rate, bit depth and channel count); read it back with `get_audio_stream_info()` if your hardware needs
to be reconfigured to match.

### Useful members

- `is_running()` / `is_stopped()`: convenience checks against the internal `state_` (`STATE_STOPPED`, `STATE_STARTING`,
  `STATE_RUNNING`, `STATE_STOPPING`). Your implementation is responsible for updating `state_` as playback progresses.
- `set_volume(float)` / `get_volume()` and `set_mute_state(bool)` / `get_mute_state()`: forward to a configured
  `audio_dac` component when one is set via `set_audio_dac()`; override them if your hardware needs to handle volume or
  mute in software instead.
- `add_audio_output_callback(F &&callback)`: register a callback invoked with `(frames_played, timestamp_us)` so other
  components can track playback progress against wall-clock time.

### Notifying the audio DAC when audio starts

Some DACs and amplifiers with a built-in DSP (for example the TI TAS58xx family) only accept writes to their mixer, EQ
or other DSP memory while the I2S clocks are running, and may lose that state again when the clocks stop. Writing that
configuration in `setup()` is not reliable, so `audio_dac::AudioDac` provides an optional hook:

```cpp
virtual void on_audio_started() {}
```

If your speaker drives a linked `audio_dac`, call this hook from the main loop once your audio clocks are running and
stable - for example, when the state changes to `STATE_RUNNING` after the I2S channel has been enabled. Call it every
time playback starts, not only the first time. Guard the call with `USE_AUDIO_DAC` so builds without an audio DAC are
unchanged:

```cpp
void MySpeaker::loop() {
  // ...
  if (this->clocks_just_started_()) {
    this->state_ = speaker::STATE_RUNNING;
#ifdef USE_AUDIO_DAC
    if (this->audio_dac_ != nullptr) {
      this->audio_dac_->on_audio_started();
    }
#endif  // USE_AUDIO_DAC
  }
}
```

Do not call it from a FreeRTOS task. The DAC may run I2C transactions or change component state in this hook, and
those are only safe on the main loop. The `i2s_audio` speaker already calls it this way.

If you are writing an `audio_dac` component, override `on_audio_started()` to write any configuration that needs a
running clock. The default does nothing, so existing DACs need no changes.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
