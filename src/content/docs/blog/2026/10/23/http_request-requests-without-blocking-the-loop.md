---
title: "http_request: Requests That Do Not Block the Loop"
date: 2026-10-23
authors: clydebarrow
---

ESPHome 2026.11.0 adds a way to run an HTTP request from a component without stopping the main loop while it waits for the server. `HttpRequestComponent::begin()` starts the request, `HttpContainer::poll()` moves it forward from `loop()`, and `HttpContainer::read_available()` reads the body without waiting for data that has not arrived. The `http_request.get`, `post` and `send` actions now use it.

This is a **new developer-facing feature** in **ESPHome 2026.11.0 and later**. Existing code does not need to change: `start()`, `get()` and `post()` still block until the response headers arrive, as before.

<!-- excerpt -->

## Background

`start()` returns once the response headers have arrived, so the main loop stops for the DNS lookup, the connection, the TLS handshake and the wait for the server. On an ESP32-S3 an ordinary HTTPS GET held the loop for 2.5 s. The new calls split the request into steps that each return quickly.

### Changes

- [PR #21486](https://github.com/esphome/esphome/pull/21486): adds `begin()`, `poll()` and `read_available()`, and runs the HTTP request actions through them.

## New API

```cpp
namespace esphome::http_request {

enum class HttpRequestProgress : uint8_t {
  HTTP_REQUEST_PROGRESS_PENDING,  // still connecting, sending, or waiting for the response headers
  HTTP_REQUEST_PROGRESS_DONE,     // headers received; status_code is set and the body can be read
  HTTP_REQUEST_PROGRESS_FAILED,   // no response
};

class HttpRequestComponent {
 public:
  // Returns nullptr when the request cannot be started
  virtual std::shared_ptr<HttpContainer> begin(const char *url, const char *method, std::string &&body,
                                               const std::vector<Header> &request_headers,
                                               const std::vector<std::string> &lower_case_collect_headers,
                                               uint32_t timeout_ms);
};

class HttpContainer {
 public:
  virtual HttpRequestProgress poll();
  // Like read(), but returns 0 at once when no data has arrived yet
  virtual int read_available(uint8_t *buf, size_t max_len);
};

}  // namespace esphome::http_request
```

The rules:

- Call `poll()` from `loop()` until it returns something other than `HTTP_REQUEST_PROGRESS_PENDING`. Each call does a limited amount of work. Once `poll()` has returned `HTTP_REQUEST_PROGRESS_DONE` or `HTTP_REQUEST_PROGRESS_FAILED`, further calls return the same value.
- After `HTTP_REQUEST_PROGRESS_DONE`, `status_code`, `content_length` and the collected headers are set, as they are after `start()`. A server that accepts the request but sends no response within the timeout gives `DONE` with `status_code` set to `-1`, the same as `start()`.
- `HTTP_REQUEST_PROGRESS_FAILED` means the request could not be completed: the connection failed, the timeout passed before the connection was made, or a redirect could not be followed.
- Always call `end()` on the container once you are done with it, including after a failure, and when you give up on a request that is still pending.
- `read_available()` returns the number of bytes read, `0` when no data has arrived yet, or a negative value on an error. As with `read()`, use `is_read_complete()` to tell the end of the body from a pause in the data, and keep your own timeout for a body that stops arriving.

## Platform support

On ESP32 with ESP-IDF 5.5.3 or later, the request runs in steps. On older ESP-IDF versions `begin()` still returns at once and `poll()` still moves the request through its steps, but the `poll()` that connects blocks until the connection is made, and the one that waits for the response blocks until the headers arrive. On every other platform, `begin()` performs the whole request, `poll()` returns `HTTP_REQUEST_PROGRESS_DONE` straight away, and `read_available()` calls `read()`. Code written for the new API therefore works everywhere; it blocks only where the platform cannot avoid it.

On ESP-IDF 5.5.3 and later a few parts still pause the loop:

- The first connection to each host waits for the DNS lookup and the TCP connection, typically a few hundred milliseconds. An unreachable host still blocks for the whole timeout.
- The TLS handshake takes about 300 ms of processor time.
- Over HTTPS, a read waits until the complete TLS record that it started has arrived.

## Example

A component that fetches a URL and reads the body in short slices:

```cpp
void MyComponent::update() {
  if (this->container_ != nullptr)
    return;  // previous request still running
  this->container_ = this->parent_->begin(this->url_, "GET", std::string(), {}, {}, this->parent_->get_timeout());
  if (this->container_ == nullptr) {
    this->status_set_warning();
    return;
  }
  this->reading_ = false;
  this->enable_loop();
}

void MyComponent::loop() {
  if (this->container_ == nullptr) {
    this->disable_loop();
    return;
  }
  if (!this->reading_) {
    auto progress = this->container_->poll();
    if (progress == http_request::HttpRequestProgress::HTTP_REQUEST_PROGRESS_PENDING)
      return;
    if (progress == http_request::HttpRequestProgress::HTTP_REQUEST_PROGRESS_FAILED ||
        this->container_->status_code != 200) {
      this->finish_(false);
      return;
    }
    this->reading_ = true;
    this->last_data_time_ = millis();
  }
  uint8_t buf[256];
  int len = this->container_->read_available(buf, sizeof(buf));
  if (len > 0) {
    this->consume_(buf, len);
    this->last_data_time_ = millis();
  } else if (len < 0) {
    this->finish_(false);
  } else if (this->container_->is_read_complete()) {
    this->finish_(true);
  } else if (millis() - this->last_data_time_ >= this->parent_->get_timeout()) {
    this->finish_(false);
  }
}

void MyComponent::finish_(bool ok) {
  this->container_->end();
  this->container_ = nullptr;
  this->status_clear_warning();
  if (!ok)
    this->status_set_warning();
  this->disable_loop();
}
```

## Who This Affects

**External components that:**

- Make HTTP requests with `start()`, `get()` or `post()` and want to stop blocking the loop: switch to `begin()` and `poll()`.
- Implement their own `HttpRequestComponent` back end: the default `begin()` calls `perform()`, so nothing has to change. Override `begin()`, and `poll()` and `read_available()` on your container, to add support that does not block.

**Standard YAML configurations are not affected**, apart from the action behaviour described in the [HTTP Request](https://esphome.io/components/http_request/) documentation.

## Supporting Multiple ESPHome Versions

`begin()`, `poll()` and `read_available()` do not exist before 2026.11.0. Guard each use; `start()` returns once the headers have arrived, so the `poll()` step is skipped there.

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 11, 0)
  this->container_ = this->parent_->begin(url, "GET", std::string(), headers, collect, timeout);
#else
  this->container_ = this->parent_->start(url, "GET", "", headers, collect);
#endif

  // in loop()
  if (!this->reading_) {
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 11, 0)
    auto progress = this->container_->poll();
    if (progress == http_request::HttpRequestProgress::HTTP_REQUEST_PROGRESS_PENDING)
      return;
    if (progress == http_request::HttpRequestProgress::HTTP_REQUEST_PROGRESS_FAILED) {
      this->finish_(false);
      return;
    }
#endif
    if (this->container_->status_code != 200) {
      this->finish_(false);
      return;
    }
    this->reading_ = true;
  }
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 11, 0)
  int len = this->container_->read_available(buf, sizeof(buf));
#else
  int len = this->container_->read(buf, sizeof(buf));
#endif
```

## Questions?

If you have questions about the new API, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #21486: Run requests from the action without blocking the loop](https://github.com/esphome/esphome/pull/21486)
- [HTTP Request component](https://esphome.io/components/http_request/)
