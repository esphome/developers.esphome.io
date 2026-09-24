---
title: "Sendspin"
---

The `sendspin` component is a *hub*, not an [entity](/architecture/components/index). It runs the device side of the
[Sendspin](https://www.sendspin-audio.com) synchronized audio protocol on top of the `sendspin-cpp` library: a WebSocket
server that a Sendspin server such as Music Assistant discovers over mDNS and connects to. Everything the user sees -
the media player, the media source that feeds audio into the speaker pipeline, the metadata sensors, the album art
images - is a separate *child* component attached to the hub. The hub is ESP32 only.

A Sendspin client advertises a set of *roles* to the server in its `client/hello` message, and the server only sends
what a role asks for. The hub supports six of them:

- `player` - the audio stream (FLAC, Opus or PCM) plus the server's volume, mute and delay commands. Consumed by the
  `media_source` platform.
- `controller` - transport commands towards the server and the playback state of the client's group. Consumed by the
  `media_player` platform and the `sendspin.switch` action.
- `metadata` - title, artist, album, track progress and so on. Consumed by the `sensor` and `text_sensor` platforms.
- `artwork` - album and artist art in the format and size each consumer asked for. Consumed by the `image` platform.
- `color` - a palette the server derives from the album art.
- `visualizer` - timestamped loudness, beat, spectrum, onset and dominant frequency data for the playing audio.

A role is compiled in only when a child component asks for it. Requesting a role defines `USE_SENDSPIN_<ROLE>` for the
C++ build; a role nobody requested is disabled in the library instead (`CONFIG_SENDSPIN_ENABLE_<ROLE>=n`), so its code
stays out of the firmware.

## Python

A child component depends on the hub and takes a reference to it under `sendspin_id`. Since a device has a single
hub, the ID is normally left for ESPHome to generate:

```python
import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components.sendspin import CONF_SENDSPIN_ID, SendspinHub, request_metadata_support
from esphome.const import CONF_ID

DEPENDENCIES = ["sendspin"]

my_component_ns = cg.esphome_ns.namespace("my_component")
MyComponent = my_component_ns.class_("MyComponent", cg.Component)


def _request_roles(config):
    request_metadata_support()
    return config


CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(MyComponent),
            cv.GenerateID(CONF_SENDSPIN_ID): cv.use_id(SendspinHub),
        }
    ).extend(cv.COMPONENT_SCHEMA),
    cv.only_on_esp32,
    _request_roles,
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await cg.register_parented(var, config[CONF_SENDSPIN_ID])
```

### Requesting roles

`esphome.components.sendspin` exports one `request_<role>_support()` function per role: `request_artwork_support`,
`request_color_support`, `request_controller_support`, `request_metadata_support`, `request_player_support` and
`request_visualizer_support`. Call the ones you need from a validator in your `CONFIG_SCHEMA`, as above, rather than
from `to_code`: validation of the whole configuration finishes before any code generation starts, so a request made
there is guaranteed to be recorded by the time the hub generates its own code and decides which roles to build.

Two roles carry configuration that the child supplies while requesting them:

- `register_player_config(config)` requests the player role and stores the `media_source` configuration (sample rate,
  buffer size, codec preferences, delays) that the hub turns into the library's `PlayerRoleConfig`. Only one player
  configuration is allowed per device.
- `register_artwork_preference(config)` requests the artwork role, records one image slot's preference (source,
  format, size and display offset) and returns the slot index the child must keep; up to four slots are available.

The visualizer role's configuration is a library struct that the child builds itself and hands to the hub in
`to_code`, together with the component that will receive the data:

```python
from esphome.components.sendspin import request_visualizer_support, sendspin_library_ns

VisualizerRoleConfig = sendspin_library_ns.struct("VisualizerRoleConfig")
VisualizerSupportObject = sendspin_library_ns.struct("VisualizerSupportObject")
VisualizerSpectrumConfig = sendspin_library_ns.struct("VisualizerSpectrumConfig")
VisualizerDataType = sendspin_library_ns.enum("VisualizerDataType", is_class=True)
VisualizerSpectrumScale = sendspin_library_ns.enum("VisualizerSpectrumScale", is_class=True)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await cg.register_parented(var, config[CONF_SENDSPIN_ID])

    hub = await cg.get_variable(config[CONF_SENDSPIN_ID])
    spectrum = cg.StructInitializer(
        VisualizerSpectrumConfig,
        ("n_disp_bins", 16),
        ("scale", VisualizerSpectrumScale.MEL),
        ("f_min", 40),
        ("f_max", 12000),
    )
    support = cg.StructInitializer(
        VisualizerSupportObject,
        ("types", [VisualizerDataType.BEAT, VisualizerDataType.LOUDNESS, VisualizerDataType.SPECTRUM]),
        ("buffer_capacity", 16384),
        ("rate_max", 30),
        ("spectrum", spectrum),
    )
    cg.add(hub.set_visualizer_config(cg.StructInitializer(VisualizerRoleConfig, ("support", support))))
    cg.add(hub.set_visualizer_listener(var))
```

`sendspin_library_ns` is the library's global `sendspin` namespace, which is where its structs, enums and listener
interfaces live. The hub and its children live in `esphome::sendspin_` (`sendspin_ns` in Python); the trailing
underscore keeps the two apart.

## C++

Children inherit from `sendspin_::SendspinChild`, or from `sendspin_::SendspinPollingChild` when they need a
`PollingComponent`. Both combine the component base with `Parented<SendspinHub>` and pin the setup priority one step
after the hub's, so `this->parent_` has completed its `setup()` by the time yours runs. Do not override
`get_setup_priority()`.

```cpp
#include "esphome/components/sendspin/sendspin_hub.h"

namespace esphome::my_component {

class MyComponent final : public sendspin_::SendspinChild {
 public:
  void setup() override;
};

}  // namespace esphome::my_component
```

### Fan-out roles

For roles that several children may share, the hub implements the library's listener interface itself and fans each
event out through a `CallbackManager`. Subscribe in `setup()`:

```cpp
void MyComponent::setup() {
  this->parent_->add_metadata_update_callback([this](const sendspin::ServerMetadataStateObject &metadata) {
    // Every field is a std::optional. An all-empty object means the connection was lost.
    if (metadata.title.has_value()) {
      this->show_title_(*metadata.title);
    }
  });
}
```

All of these fire on the main loop, from the hub's `loop()`, unless noted:

- `add_group_update_callback()` - a `GroupUpdateObject` whenever the server changes the group the client belongs to.
  Available regardless of roles.
- Controller: `add_controller_state_callback()` with the group's `ServerStateControllerObject`, and
  `add_controller_state_clear_callback()` when the connection is lost. `send_client_command()` sends a transport
  command, and optionally a volume or mute, to the server.
- Metadata: `add_metadata_update_callback()` with a `ServerMetadataStateObject`. A lost connection delivers a
  default-constructed object (every field `nullopt`), so treat an absent field as cleared rather than as no update.
  `get_track_progress_ms()` interpolates the track position between updates.
- Artwork: `add_image_decode_callback()` hands over the encoded image bytes on the library's decode thread, so do the
  decoding there and nothing else; `add_image_display_callback()` and `add_image_clear_callback()` fire on the main
  loop when the frame should be shown or dropped. Every delivery must be acknowledged with `artwork_frame_done()`
  before the library releases the next one for that slot.
- Color: `add_color_callback()` with a `ServerColorStateObject` whose colors (background, primary, accent and the
  foreground colors for dark and light backgrounds) are each `std::optional`. A lost connection delivers a
  default-constructed object, like metadata.

### Single-consumer roles

The player and visualizer roles each belong to exactly one child, which implements the library's listener interface
directly. The hub only stores the configuration and the listener it is given from codegen and registers the role with
the client before starting the server.

- Player: the child implements `sendspin::PlayerRoleListener`; codegen calls `set_listener()` and
  `set_player_config()` on the hub (`register_player_config()` takes care of the latter). `get_player_role()` returns
  the library's `PlayerRole` once the hub is set up; the media source keeps that pointer and drives the role directly.
- Visualizer: the child implements `sendspin::VisualizerRoleListener`; codegen calls `set_visualizer_config()` and
  `set_visualizer_listener()`. The data callbacks - `on_loudness()`, `on_beat()`, `on_spectrum()`, `on_peak()` and
  `on_f_peak()` - fire on the library's drain thread at each datum's playback time, so they must be thread safe: copy
  the values into atomics and render from the main loop. The stream lifecycle callbacks
  (`on_visualizer_stream_start()`, `on_visualizer_stream_end()`, `on_visualizer_stream_clear()`) fire on the main
  loop.

### Talking to the server

`connect_to_server()`, `disconnect_from_server()` and `update_state()` forward to the client. All three are no-ops
until the hub has finished `setup()`, and must be called from the main loop.
