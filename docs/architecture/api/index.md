# API

ESPHome uses [Protocol Buffers (commonly known as "Protobuf")](https://protobuf.dev). This mechanism facilitates
serializing messages sent between the application running on the device and [Home Assistant](http://home-assistant.io).

## Modifying the API

When making changes to the API, it's important that both sides (ESPHome and Home Assistant) are updated together.

At a high level, changes must be made to:

- [ESPHome](https://github.com/esphome/esphome)
- [aioesphomeapi](https://github.com/esphome/aioesphomeapi)
- [Home Assistant core](https://github.com/home-assistant/core)
- [Home Assistant docs](https://github.com/home-assistant/home-assistant.io), if adding/changing a user-facing
  platform/feature

### ESPHome

**API component directory structure:**
```
esphome
├─ components
│ ├─ api
│ │ ├─ api_connection.cpp
│ │ ├─ api_connection.h
│ │ ├─ api_frame_helper.cpp
│ │ ├─ api_frame_helper.h
│ │ ├─ api_noise_context.h
│ │ ├─ api_options.proto
│ │ ├─ api_pb2_service.cpp
│ │ ├─ api_pb2_service.h
│ │ ├─ api_pb2.cpp
│ │ ├─ api_pb2.h
│ │ ├─ api_server.cpp
│ │ ├─ api_server.h
│ │ ├─ api.proto
│ │ ├─ client.py
│ │ ├─ custom_api_device.h
│ │ ├─ homeassistant_service.h
│ │ ├─ list_entities.cpp
│ │ ├─ list_entities.h
│ │ ├─ proto.cpp
│ │ ├─ proto.h
│ │ ├─ subscribe_state.cpp
│ │ ├─ subscribe_state.h
│ │ ├─ user_services.cpp
│ │ ├─ user_services.h
```

The `.proto` files contain the protobuf definitions; these files should be modified as necessary to accommodate changes
to the API.

After editing the `.proto` files, the `script/api_protobuf/api_protobuf.py` script should be run. This script will
regenerate the `api_pb2` files based on the changes made in the `.proto` files.
**Do not edit the `api_pb2` files manually.**

### `aioesphomeapi`

This is the Python client for ESPHome which runs in Home Assistant; it must be updated to be consistent with the
changes made to ESPHome itself.

### Home Assistant core

Support must be implemented to integrate the ESPHome implementation into Home Assistant.

### Home Assistant docs

If user-facing functionality has been added and/or changed, the documentation must be updated so that users can
understand the functionality.
