---
title: "Storage devices"
---

The `storage` component is the base for devices that store data in fixed size blocks, such as an SD card or a buffer
in RAM. A storage platform implements `storage::BlockDevice`, and a filesystem or other consumer reads and writes the
device through it. `ram_disk` is the smallest platform and a good model for a new one.

## Writing a platform

A platform is a `storage.py` file in the component's directory:

```python
import esphome.codegen as cg
from esphome.components import storage
import esphome.config_validation as cv
from esphome.const import CONF_ID
from esphome.types import ConfigType

my_disk_ns = cg.esphome_ns.namespace("my_disk")
MyDisk = my_disk_ns.class_("MyDisk", storage.BlockDevice, cg.Component)

CONFIG_SCHEMA = storage.block_device_schema(MyDisk).extend(
    {
        cv.Optional("cache"): storage.storage_size_range(min_size=1024, max_size=65536),
    }
)


async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
```

- `block_device_schema()` gives the `id` and the component options; extend it with the platform's own.
- Call `cg.register_component()` from the platform's own `to_code()`. It names the component after the module that
  calls it, so a call from a shared helper would log every platform's components as `storage`.
- Validate sizes with `storage.storage_size` (an integer, or a binary suffix such as `64KB`, where KB is 1024 bytes),
  `storage.storage_size_range(min_size, max_size)` and `storage.block_size` (a power of two from 128 to 64 KiB). Use
  `storage_size_range()` instead of adding `cv.int_range()`, which would make the language schema show an integer.

## The device

Derive from `storage::BlockDevice` and `Component`, set the geometry, and implement the transfers:

```cpp
class MyDisk final : public storage::BlockDevice, public Component {
 public:
  void setup() override;
  void dump_config() override { this->dump_geometry_(TAG); }

 protected:
  storage::StorageError device_read(uint32_t block, uint32_t offset, void *buf, uint32_t len) override;
  storage::StorageError device_program(uint32_t block, uint32_t offset, const void *buf, uint32_t len) override;
};
```

`geometry_` describes the media:

- `block_size`: the erase unit in bytes.
- `block_count`: the number of blocks. 0 means no media, and `has_media()` returns false.
- `read_size` and `program_size`: a read or write offset and length must be a multiple of these. Both default to 1.
- `flags`: `BLOCK_FLAG_NEEDS_ERASE` (programming only clears bits), `BLOCK_FLAG_REMOVABLE`, `BLOCK_FLAG_READ_ONLY`
  and `BLOCK_FLAG_TRIM` (the device has a use for `trim()`).

The public `read()`, `program()`, `erase()`, `sync()` and `trim()` check the media, the read-only flag, the range and
the alignment before they call the driver, so the `device_*()` methods get only valid requests. An access may span
several blocks. `device_erase()`, `device_sync()` and `device_trim()` are optional and return success by default;
`device_trim()` is called only when `BLOCK_FLAG_TRIM` is set. Return `STORAGE_ERROR_IO` or `STORAGE_ERROR_TIMEOUT`
when the hardware fails.

The public transfers feed the watchdog when the calling task is one the watchdog watches, so a driver does not need to
feed it between blocks.

## Media changes

Set `block_count` once the media is ready, and to 0 when it goes away, then call `media_changed_()`.
`get_media_generation()` returns a counter that changes on each call, so a consumer can tell that what it cached
about the media, such as a mounted filesystem, is stale. Keep `block_count` at 0 until the device can serve
requests: `ram_disk` sets it only after its buffer is allocated.

## Locking

By default nothing locks, and every call must come from the main loop. A component that uses a device from another
task, such as a filesystem used through the C library, calls `storage.request_lock()` from its `to_code()`. Each
transfer then holds `mutex()`, an `esphome::Mutex`. A driver that touches the device from its own `loop()` or timers
must hold `mutex()` too:

```cpp
void MyDisk::loop() {
  const std::scoped_lock lock{this->mutex()};
  // check for card removal, flush a cache, ...
}
```

`get_geometry()`, `has_media()`, `get_capacity()` and `get_media_generation()` do not lock. A caller on another task
that needs the geometry to stay as it is holds `mutex()` while it uses it.

## Using a device

A component that stores data on a device takes it with `storage.STORAGE_ID_SCHEMA`, which adds a `storage_id` option:

```python
CONFIG_SCHEMA = cv.Schema({...}).extend(storage.STORAGE_ID_SCHEMA)


async def to_code(config: ConfigType) -> None:
    device = await cg.get_variable(config[storage.CONF_STORAGE_ID])
```

Each call returns a `StorageError`; `storage_error_to_string()` gives its name for a log line. The YAML condition
`storage.has_media` and `has_media()` in a lambda tell whether media is present.
