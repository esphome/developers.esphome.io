---
title: "Decoding images from a source with runtime_image"
---

`runtime_image::RuntimeImage` decodes an image into a buffer at run time. The usual way is to feed it data with
`feed_data()`, which for JPEG means the whole file has to be in memory first and is then decoded in one long call.
A decoder that supports it can instead read its input itself through a `DecodeSource`, and decode a little at a time,
so only the decoder's own small buffer is needed and each call stays short enough for `loop()`.

JPEG supports this. BMP, PNG and QOI do not; check `decoder_supports_source()` and fall back to `feed_data()`.

## The source

Implement `runtime_image::DecodeSource`:

```cpp
class MySource : public runtime_image::DecodeSource {
 public:
  int32_t read(uint8_t *buf, uint32_t len) override;
  bool seek(uint32_t position) override;
};
```

- `read()` returns the number of bytes copied, or a negative value on error. Return fewer than `len`, even 0, when
  no more has arrived yet; the decoder then waits instead of failing.
- `seek()` moves to a position counted from the start of the image and returns false on error. A decoder seeks back
  while it reads the headers, so keep what it has read until `begin_source()` returns.
- The source must stay valid until the decode ends.

## Decoding

```cpp
if (!image->begin_decode(total_size, runtime_image::JPEG) || !image->decoder_supports_source())
  return;  // or decode with feed_data()
int result = image->begin_source(&this->source_);
if (result != 0)
  return;  // a DecodeError
```

Then call `decode_step()` from `loop()` until it stops returning `DECODE_STEP_MORE`:

```cpp
const uint32_t start = millis();
do {
  const int result = image->decode_step();
  if (result == runtime_image::DECODE_STEP_MORE)
    continue;
  if (result == runtime_image::DECODE_STEP_DONE) {
    image->end_decode();
  } else if (result != runtime_image::DECODE_STEP_NEED_DATA) {
    // a DecodeError; DECODE_ERROR_READ means the source failed
    image->release();
  }
  return;
} while (millis() - start < 20);
```

- `total_size` must be the exact size of the image. A JPEG decoder needs it before it starts, so a download without
  a `Content-Length` has to be fed with `feed_data()` instead.
- `DECODE_STEP_NEED_DATA` means the source returned less than the decoder needs. Call `decode_step()` again once more
  has arrived; the decoder carries on from where it stopped.
- Each JPEG step decodes one row of 8x8 or 16x16 pixel blocks.
- The image is not shown until the last step, so a display never draws a half-decoded image.
- `release()` part way through ends the decode, and the next `begin_decode()` starts afresh.

`online_image` uses this to decode a JPEG while it downloads; see `DownloadSource` in
`esphome/components/online_image/download_buffer.h`.

This API was added in ESPHome 2026.11.0.
