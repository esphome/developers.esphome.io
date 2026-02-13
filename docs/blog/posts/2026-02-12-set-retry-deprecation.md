---
date: 2026-02-12
authors:
  - bdraco
comments: true
---

# set_retry Deprecated: Use set_timeout or set_interval Instead

The `set_retry`, `cancel_retry`, and `RetryResult` APIs are deprecated. They will be removed in ESPHome 2026.8.0. Use `set_timeout` or `set_interval` instead.

This is a **breaking change** for external components in **ESPHome 2026.2.0 and later**.

<!-- more -->

## Background

**[PR #13845](https://github.com/esphome/esphome/pull/13845): Deprecate set_retry, cancel_retry, and RetryResult**

The `set_retry` API has several problems that make it unsuitable for ESPHome's embedded environment:

1. **Hidden heap allocation.** Every `set_retry` call does a `std::make_shared<RetryArgs>()`, allocating on the heap. This is invisible to component authors and contributes to fragmentation on devices that run for months.

2. **Wasted flash and RAM.** The retry machinery — `RetryArgs` struct, `retry_handler()`, `set_retry_common_()`, multiple overloads, and the heavier `std::function<RetryResult(uint8_t)>` template instantiation — is compiled into every firmware whether or not any component uses it.

3. **Confusing immediate-first-execution semantics.** `set_retry` executes the callback immediately (delay=0) before waiting `initial_wait_time` for subsequent attempts. Callers expected it to wait first, like `set_interval` does.

4. **The abstraction didn't match real usage.** All internal callers were using `set_retry` as a fixed-interval poll (backoff factor 1.0, always returning `RETRY`). These are trivially served by `set_interval` + counter or chained `set_timeout`.

All internal usage has been removed in companion PRs: [#13841](https://github.com/esphome/esphome/pull/13841) (lps22), [#13842](https://github.com/esphome/esphome/pull/13842) (ms8607), [#13843](https://github.com/esphome/esphome/pull/13843) (speaker), [#13844](https://github.com/esphome/esphome/pull/13844) (esp32_hosted).

## What's Changing

All overloads of `set_retry` and `cancel_retry`, plus the `RetryResult` enum, are marked `ESPDEPRECATED`. They will produce compiler warnings now and be removed in 2026.8.0.

```cpp
// All of these are deprecated:
this->set_retry("name", 100, 5, [](uint8_t) { return RetryResult::RETRY; });
this->set_retry(100, 5, [](uint8_t) { return RetryResult::RETRY; });
this->cancel_retry("name");
RetryResult result = RetryResult::DONE;
```

## Who This Affects

External components that call `set_retry` or `cancel_retry`, or use `RetryResult`.

**Standard YAML configurations are not affected.**

## Migration Guide

### Pattern 1: Fixed-interval polling (most common)

The most common `set_retry` usage is polling at a fixed interval until a condition is met. Replace with `set_interval` and a counter:

```cpp
// Before
void MyComponent::update() {
  this->trigger_measurement();
  this->set_retry("read", 5, 10, [this](uint8_t remaining) {
    if (this->data_ready()) {
      this->read_data();
      return RetryResult::DONE;
    }
    return RetryResult::RETRY;
  });
}

// After
static constexpr uint32_t INTERVAL_READ = 0;  // numeric ID

void MyComponent::update() {
  this->trigger_measurement();
  this->read_attempts_remaining_ = 10;
  this->set_interval(INTERVAL_READ, 5, [this]() {
    if (this->data_ready()) {
      this->cancel_interval(INTERVAL_READ);
      this->read_data();
    } else if (--this->read_attempts_remaining_ == 0) {
      this->cancel_interval(INTERVAL_READ);
    }
  });
}
```

Note: `set_interval` waits before the first execution, unlike `set_retry` which fired immediately. This is usually the desired behavior — it gives the hardware time to complete the operation before the first read attempt.

### Pattern 2: Retry with backoff

For retries with increasing delays, use chained `set_timeout`:

```cpp
// Before
this->set_retry("reset", 5, 3, [this](uint8_t remaining) {
  if (this->try_reset()) {
    return RetryResult::DONE;
  }
  return RetryResult::RETRY;
}, 5.0f);  // backoff factor

// After
void MyComponent::setup() {
  this->reset_attempts_remaining_ = 3;
  this->reset_interval_ = 5;
  this->try_reset_();
}

void MyComponent::try_reset_() {
  if (this->try_reset()) {
    // Success
    return;
  }
  if (--this->reset_attempts_remaining_ > 0) {
    uint32_t delay = this->reset_interval_;
    this->reset_interval_ *= 5;  // backoff factor
    this->set_timeout("reset", delay, [this]() { this->try_reset_(); });
  } else {
    this->mark_failed();
  }
}
```

### Pattern 3: Wait for state transition

For waiting until something reaches a target state:

```cpp
// Before
this->set_retry("wait_stop", 50, 3, [this](uint8_t remaining) {
  if (this->state_ == STATE_STOPPED) {
    this->on_stopped();
    return RetryResult::DONE;
  }
  return RetryResult::RETRY;
});

// After
this->wait_attempts_remaining_ = 3;
this->set_interval("wait_stop", 50, [this]() {
  if (this->state_ == STATE_STOPPED) {
    this->cancel_interval("wait_stop");
    this->on_stopped();
  } else if (--this->wait_attempts_remaining_ == 0) {
    this->cancel_interval("wait_stop");
  }
});
```

## Supporting Multiple ESPHome Versions

```cpp
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 2, 0)
// New API - set_interval with counter
this->read_attempts_remaining_ = 10;
this->set_interval(INTERVAL_READ, 5, [this]() {
  if (this->data_ready()) {
    this->cancel_interval(INTERVAL_READ);
    this->read_data();
  } else if (--this->read_attempts_remaining_ == 0) {
    this->cancel_interval(INTERVAL_READ);
  }
});
#else
// Old API - set_retry (works but allocates on heap)
this->set_retry("read", 5, 10, [this](uint8_t remaining) {
  if (this->data_ready()) {
    this->read_data();
    return RetryResult::DONE;
  }
  return RetryResult::RETRY;
});
#endif
```

## Timeline

- **ESPHome 2026.2.0 (February 2026):** Deprecation warnings active
- **ESPHome 2026.8.0 (August 2026):** `set_retry`, `cancel_retry`, and `RetryResult` removed

## Finding Code That Needs Updates

```bash
# Find set_retry usage
grep -rn 'set_retry' your_component/
grep -rn 'cancel_retry' your_component/
grep -rn 'RetryResult' your_component/
```

## Questions?

If you have questions about migrating your external component, please ask in:

- [ESPHome Discord](https://discord.gg/KhAMKrd) - #devs channel
- [ESPHome GitHub Discussions](https://github.com/esphome/esphome/discussions)

## Related Documentation

- [PR #13845: Deprecate set_retry](https://github.com/esphome/esphome/pull/13845)
- [PR #13841: lps22 migration](https://github.com/esphome/esphome/pull/13841)
- [PR #13842: ms8607 migration](https://github.com/esphome/esphome/pull/13842)
- [PR #13843: speaker migration](https://github.com/esphome/esphome/pull/13843)
- [PR #13844: esp32_hosted migration](https://github.com/esphome/esphome/pull/13844)
