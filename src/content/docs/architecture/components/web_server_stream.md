---
title: "Streaming HTTP responses"
---

`web_server_idf::AsyncStreamResponse` keeps one HTTP response open for as long as the client stays connected and
lets a component write to it from the main loop without blocking. The web server's event stream (`/events`) is
built on it. It exists only on ESP32 (ESP-IDF), in `esphome/components/web_server_idf/web_server_idf.h`.

Use it for a response that has no end, such as a live audio or sensor stream. A normal request that sends a
reply and finishes does not need it.

## Lifecycle

1. **Start, in the request handler (HTTP server task).** Allocate the response and call `begin()` once with the
   status, the content type and any extra headers. `begin()` sends the response head and makes the object the
   session's context. Hand the pointer to the main loop, for example through a slot guarded by a mutex or an
   atomic, and return from the handler.
2. **Wait until it is attached.** The HTTP server commits the session context only after the handler returns.
   Write only once `is_attached()` is true.
3. **Write from the main loop.** `write()` never blocks. It returns the number of bytes accepted, which can be
   fewer than offered; keep the rest and continue from there. `0` means the socket is full right now; `-1` means
   the stream failed and is closing. Writes that make no progress for `SEND_STALL_TIMEOUT_MS` (20 s) close the
   stream.
4. **Call `loop()` on every main loop pass.** It keeps the session fresh in the HTTP server's least recently used
   list, so idle sockets are purged before a live stream, and it retries a pending close.
5. **Close and delete.** Call `close()` to end the stream; it is safe to call more than once. Delete the object
   only once `safe_to_delete()` is true, which waits until the session is gone and no queued server work still
   points at it. The class has no virtual destructor, so delete it through the type it was created as.

The example serves one client at a time and answers any other request with 503 while a stream is open, so a
second client never replaces a stream that is still in use. `busy_` and `pending_` are `std::atomic` members.

```cpp
static constexpr HttpHeader STREAM_HEADERS[] = {
    {"Cache-Control", "no-store"},
    {"Connection", "close"},
};

void MyStream::handleRequest(AsyncWebServerRequest *request) {  // HTTP server task
  if (this->busy_.exchange(true)) {  // one client at a time; loop() clears it after the delete
    request->send(503);
    return;
  }
  auto *stream = new AsyncStreamResponse();
  stream->begin(request, HTTPD_200, "application/octet-stream", STREAM_HEADERS);
  this->pending_.store(stream);  // picked up by loop()
}

void MyStream::loop() {  // main loop
  if (AsyncStreamResponse *stream = this->pending_.exchange(nullptr))
    this->stream_ = stream;
  if (this->stream_ == nullptr)
    return;
  this->stream_->loop();
  if (this->stream_->is_attached() && !this->stream_->is_closing()) {
    ssize_t sent = this->stream_->write(this->data_ + this->pos_, this->len_ - this->pos_);
    if (sent > 0) {
      this->pos_ += sent;
      if (this->pos_ == this->len_)
        this->stream_->close();  // nothing more to send
    }
    // sent < 0: the stream failed and is already closing
  }
  if (this->stream_->safe_to_delete()) {
    delete this->stream_;
    this->stream_ = nullptr;
    this->busy_.store(false);
  }
}
```

## Raw and chunked bodies

Without a `Transfer-Encoding` header the body is raw bytes and the stream ends when the connection closes, which
suits an endless stream (send `Connection: close`). For a chunked response, pass
`{"Transfer-Encoding", "chunked"}` as the first header and frame each chunk yourself, as the event stream does.

## Sockets

A component that keeps streaming clients open registers them with
`web_server_base.add_httpd_clients()`; see the [Socket Consumption API](/architecture/components/socket_consumption_api/).
