---
title: "Media Player"
---

The `media_player` component is one of ESPHome's core [entity](/architecture/components/index) types. A media player
represents a device that can play audio - streaming a URL, playing a queued announcement, adjusting volume, and
responding to transport commands like play/pause/stop. Unlike a [switch](/architecture/components/switch), which only
toggles a boolean, a media player accepts a richer set of commands and reports back a small state machine (idle,
playing, paused, announcing) rather than a single on/off value.

Like the other entity types, `media_player` is a *platform* base. Individual components (for example `speaker`,
`sendspin` or `speaker_source`) register a media player and implement the logic that actually decodes and outputs
audio.

## Python

A media player platform lives in a `media_player.py` file (or a `media_player/__init__.py` package) inside your
component's directory. This file name tells ESPHome that the component provides a `media_player` platform, allowing
the user to configure it under the `media_player:` block:

```yaml
media_player:
  - platform: my_component
    name: "My Media Player"
```

The typical imports and class declaration look like this:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import media_player

my_media_player_ns = cg.esphome_ns.namespace("my_media_player")
MyMediaPlayer = my_media_player_ns.class_("MyMediaPlayer", media_player.MediaPlayer, cg.Component)
```

Note that `MyMediaPlayer` inherits from both `media_player.MediaPlayer` and a component base (`cg.Component` here).

### Configuration schema

Use the `media_player.media_player_schema()` helper. It returns a schema pre-populated with the options common to
every media player - `name`, `id`, `icon`, `entity_category`, and the `on_state` / `on_idle` / `on_play` / `on_pause`
/ `on_announcement` automations - and lets you pass defaults for your device:

```python
CONFIG_SCHEMA = media_player.media_player_schema(MyMediaPlayer).extend(cv.COMPONENT_SCHEMA)
```

Passing your class (`MyMediaPlayer`) as the first argument tells the helper which class to declare the ID for, so you
do not need a separate `cv.GenerateID()`.

### Code generation

In `to_code`, use the `media_player.new_media_player()` helper. It calls `cg.new_Pvariable()` for you *and* generates
all the code to apply the common media player options and callback automations from the configuration:

```python
async def to_code(config):
    var = await media_player.new_media_player(config)
    await cg.register_component(var, config)
```

If your component owns a media player as a child (rather than *being* a media player), use
`await media_player.register_media_player(var, config)` instead, having declared the ID yourself.

## C++

The C++ class inherits from `media_player::MediaPlayer` alongside its component base:

```cpp
#include "esphome/core/component.h"
#include "esphome/components/media_player/media_player.h"

namespace esphome::my_media_player {

class MyMediaPlayer : public media_player::MediaPlayer, public Component {
 public:
  media_player::MediaPlayerTraits get_traits() override;

 protected:
  void control(const media_player::MediaPlayerCall &call) override;
};

}  // namespace esphome::my_media_player
```

### Reporting supported features

The base class needs to know what your device can do before the front-end will offer controls for it. Implement
`get_traits()` and mark the optional features you support on a `MediaPlayerTraits` instance - a base set of features
(`PLAY_MEDIA`, `STOP`, `VOLUME_SET`, `VOLUME_MUTE`, `MEDIA_ANNOUNCE`, `BROWSE_MEDIA`) is already included for you:

```cpp
media_player::MediaPlayerTraits MyMediaPlayer::get_traits() {
  media_player::MediaPlayerTraits traits;
  traits.set_supports_pause(true);
  return traits;
}
```

### Handling commands

The one method you *must* implement is `control()`. The front-end builds a `MediaPlayerCall` (via `make_call()`) and
the base class dispatches it here. A single call may carry a command, a new volume, a media URL to play, or an
announcement flag - inspect only what is set:

```cpp
void MyMediaPlayer::control(const media_player::MediaPlayerCall &call) {
  if (call.get_media_url().has_value()) {
    this->play_url_(*call.get_media_url(), call.get_announcement().value_or(false));
    this->state = media_player::MEDIA_PLAYER_STATE_PLAYING;
  }

  if (call.get_volume().has_value()) {
    this->volume = *call.get_volume();
    this->set_hardware_volume_(this->volume);
  }

  if (call.get_command().has_value()) {
    switch (*call.get_command()) {
      case media_player::MEDIA_PLAYER_COMMAND_PLAY:
        this->resume_();
        this->state = media_player::MEDIA_PLAYER_STATE_PLAYING;
        break;
      case media_player::MEDIA_PLAYER_COMMAND_PAUSE:
        this->pause_();
        this->state = media_player::MEDIA_PLAYER_STATE_PAUSED;
        break;
      case media_player::MEDIA_PLAYER_COMMAND_STOP:
        this->stop_();
        this->state = media_player::MEDIA_PLAYER_STATE_IDLE;
        break;
      case media_player::MEDIA_PLAYER_COMMAND_MUTE:
        this->set_muted_(true);
        break;
      case media_player::MEDIA_PLAYER_COMMAND_UNMUTE:
        this->set_muted_(false);
        break;
      default:
        break;
    }
  }

  this->publish_state();
}
```

A few important details:

- `MediaPlayerCall`'s getters (`get_command()`, `get_volume()`, `get_media_url()`, `get_announcement()`) all return
  `optional<T>`, since a single call typically only sets one or two of them.
- Set `this->state` and/or `this->volume` yourself to reflect what actually happened, then call `publish_state()`
  once at the end to notify the front-end. The base class does not do this for you.
- `MediaPlayerState` also has an `ANNOUNCING` value - switch to it while playing a one-off announcement (e.g. a text
  to speech notification) so the front-end shows the player is temporarily busy, then return to the previous state
  once playback finishes.

### Useful members

- `state`: the current `MediaPlayerState` (`IDLE` / `PLAYING` / `PAUSED` / `ANNOUNCING` / `ON` / `OFF`).
- `volume`: the current volume, `0.0` to `1.0`.
- `publish_state()`: notifies the front-end of the current `state` and `volume`.
- `is_muted()`: override this if your hardware can report mute state; defaults to `false`.

## Exposing multiple media players from one component

Hardware sometimes drives more than one audio output from a single device - a multi-room amplifier with several
speaker outputs, or a multi-channel DAC hub with one player per output zone. There are two established ways to model
this.

### A hub plus a `type` on the platform

With a top-level hub already configured, add one `media_player:` entry per output zone, distinguished by `type`, via
`cv.typed_schema()` with `key=CONF_TYPE`:

```yaml
multiroom_amp:
  id: the_amp

media_player:
  - platform: multiroom_amp
    type: zone_a
    name: "Kitchen"
  - platform: multiroom_amp
    type: zone_b
    name: "Patio"
```

```python
from esphome.const import CONF_TYPE
from .. import CONF_MULTIROOM_AMP_ID, MultiroomAmp, MultiroomAmpZone

_HUB_ID_SCHEMA = cv.Schema({cv.GenerateID(CONF_MULTIROOM_AMP_ID): cv.use_id(MultiroomAmp)})
CONFIG_SCHEMA = cv.typed_schema(
    {
        "zone_a": media_player.media_player_schema(MultiroomAmpZone).extend(_HUB_ID_SCHEMA),
        "zone_b": media_player.media_player_schema(MultiroomAmpZone).extend(_HUB_ID_SCHEMA),
    },
    key=CONF_TYPE,
)

async def to_code(config):
    var = await media_player.new_media_player(config)
    await cg.register_component(var, config)
    await cg.register_parented(var, config[CONF_MULTIROOM_AMP_ID])
```

Each zone is a first-class platform entry with the full option set, adding another zone later is purely additive,
and different zones can use different C++ classes if their capabilities diverge (for example one zone with a DAC
that supports announcements, another without).

### Sub-configs on a single platform entry

Some components instead nest each output as an optional sub-key under one platform entry (`zone_a:`, `zone_b:` under
a single `- platform: multiroom_amp`). Unlike `sensor_schema()`, `media_player_schema()` requires a class argument,
so each sub-config still passes one explicitly, typically the same shared class:

```python
CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(): cv.declare_id(MultiroomAmp),
        cv.Optional("zone_a"): media_player.media_player_schema(MultiroomAmpZone),
        cv.Optional("zone_b"): media_player.media_player_schema(MultiroomAmpZone),
    }
).extend(cv.COMPONENT_SCHEMA)
```

No `SUB_MEDIA_PLAYER` macro exists, so declare the pointer members and setters by hand, and null-check them before
use - the user may configure only one output:

```cpp
class MultiroomAmp : public Component {
 public:
  void set_zone_a_media_player(media_player::MediaPlayer *p) { this->zone_a_media_player_ = p; }
  void set_zone_b_media_player(media_player::MediaPlayer *p) { this->zone_b_media_player_ = p; }
 protected:
  media_player::MediaPlayer *zone_a_media_player_{nullptr};
  media_player::MediaPlayer *zone_b_media_player_{nullptr};
};
```

### Choosing between them

Neither pattern is the "modern" one and neither is deprecated. They express different relationships between a device
and its outputs, so let the hardware decide:

- **Sub-configs** fit when the outputs are a small, fixed set driven by a single amplifier or DAC - for example a
  two-channel board where both outputs are always present together. This keeps one physical device to one YAML
  block.
- **A hub plus `type`** fits when the outputs are independent things that happen to share a connection - especially
  when a hub component already exists because the device or transport must be configured once, or when the set of
  outputs is large, open-ended, or different outputs need different C++ classes or update strategies.

If both descriptions fit your device equally well, follow whichever pattern the surrounding component already uses.
In a new component with no hub, sub-configs are usually the smaller change.

See [Exposing multiple sensors from one component](/architecture/components/sensor#exposing-multiple-sensors-from-one-component) for a fully worked example of both patterns.

For everything else, the component implements the usual set of methods
[as described here](/architecture/components/index#common-methods).
