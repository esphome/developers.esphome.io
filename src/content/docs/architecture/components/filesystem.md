---
title: "Filesystems"
---

The `filesystem` component is the base for filesystems on a [storage device](/architecture/components/storage/). A
filesystem platform implements `filesystem::Filesystem`, and other components open files on it. The base class mounts
the filesystem, follows media changes and hands out `File` and `Dir` handles, so a platform only maps the calls onto
its filesystem library.

## Writing a platform

A platform is a `filesystem.py` file in the component's directory:

```python
import esphome.codegen as cg
from esphome.components import filesystem
from esphome.types import ConfigType

my_fs_ns = cg.esphome_ns.namespace("my_fs")
MyFs = my_fs_ns.class_("MyFs", filesystem.Filesystem)

CONFIG_SCHEMA = filesystem.filesystem_schema(MyFs)


async def to_code(config: ConfigType) -> None:
    var = await filesystem.new_filesystem(config)
    await cg.register_component(var, config)
```

- `filesystem_schema()` gives the `id`, `storage_id`, `max_open_files`, `max_open_dirs`, `format_if_mount_failed` and
  the component options; extend it with the platform's own.
- `new_filesystem()` creates the variable with the block device as its first constructor argument, followed by any
  extra arguments passed to it, and sets the pool sizes.
- Call `cg.register_component()` from the platform's own `to_code()`, as for a storage platform.

## The filesystem

Derive from `filesystem::Filesystem` and implement the `fs_*()` hooks:

```cpp
class MyFs final : public filesystem::Filesystem {
 public:
  explicit MyFs(storage::BlockDevice *device) : Filesystem(device) {}

 protected:
  filesystem::FsError fs_init(uint8_t max_files, uint8_t max_dirs) override;
  filesystem::FsError fs_mount() override;
  void fs_unmount() override;
  filesystem::FsError fs_open(uint8_t slot, const char *path, uint8_t flags) override;
  int32_t fs_read(uint8_t slot, void *buf, uint32_t len) override;
  // ... and the rest of the fs_*() hooks
};
```

- `fs_init()` is called once from `setup()` with the pool sizes, so the platform can allocate one file or directory
  object per slot.
- A `slot` is an index below the pool size. The base class hands slots out and frees them, so a platform keeps no
  table of open files.
- `fs_read()`, `fs_write()`, `fs_seek()`, `fs_tell()` and `fs_size()` return a byte count or position, or a negative
  `FsError`.
- The base class calls `fs_unmount()` after a media change with handles still open. It must drop them without writing
  to the media, which may now be a different card.
- Read and write the media through `get_device()`; the block device checks ranges and feeds the watchdog.
- Positions and sizes are `int32_t`, so a file holds at most 2 GiB - 1 bytes. A platform refuses to open a larger file
  and fails a write that would grow a file past the limit.
- The base class sets the setup priority to `setup_priority::HARDWARE - 1`, after the block device and before the
  components that use files.

`tests/components/filesystem/fake_fs.h` is a small filesystem in RAM that implements every hook.

## Using a filesystem

A component that reads or writes files takes the filesystem with `filesystem.FILESYSTEM_ID_SCHEMA`, which adds a
`filesystem_id` option, and validates paths with `filesystem.validate_path`:

```python
CONFIG_SCHEMA = cv.Schema(
    {
        cv.Required(CONF_PATH): filesystem.validate_path,
    }
).extend(filesystem.FILESYSTEM_ID_SCHEMA)


async def to_code(config: ConfigType) -> None:
    fs = await cg.get_variable(config[filesystem.CONF_FILESYSTEM_ID])
    filesystem.request_open_handles(config[filesystem.CONF_FILESYSTEM_ID], files=1)
```

The `max_open_files` and `max_open_dirs` options cover the user's lambdas. A component that keeps handles open calls
`request_open_handles()` from its `to_code()`, and the handles are added to the pools. A component that opens a file
and closes it in the same call needs no reservation.

In C++, `open()` returns a `File` and `open_dir()` a `Dir`. Both close when they go out of scope and can be moved.
Check a handle with `if (file)`, and read the reason for a failure from `last_error()`. A handle stops being open
when the media it was opened on is unmounted or changed. `fs_error_to_string()` gives
the name of an `FsError` for a log line.

Handles opened on earlier media fail with `FS_ERROR_CLOSED` once the media changes, so a component that keeps a file
open opens it again when `if (!file)` is true or a call fails that way. `on_shutdown()` closes every handle still open,
so the data written reaches the media before a restart.

Every call must come from the main loop. A call from a log callback while the filesystem mounts or formats returns
`FS_ERROR_BUSY`, so it cannot change the filesystem in the middle of that operation. `unmount()` returns the first error
from closing the open handles. A call can take hundreds of milliseconds on an SD card, and `format()` or `space()`
several seconds on a large one, so spread large transfers over several loop passes.
