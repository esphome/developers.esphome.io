# Advanced Topics

This section covers advanced component development topics in ESPHome. These features are typically used in more complex components or when optimizing for performance and resource usage.

## Component Loop Control

ESPHome's main loop runs at the configured `loop_interval_` (default ~16 ms, ~62.5 Hz / ~3750 component-phase calls per minute), calling each registered component's `loop()` method. This is fast enough to feel responsive but still wastes CPU cycles for components that don't need continuous updates. The loop control API allows components to dynamically enable or disable their participation in the main loop.

!!! note "Cadence change in 2026.5.0"
    Before [PR #15792](https://github.com/esphome/esphome/pull/15792), `loop()` could be emergently pulled forward to roughly double the configured rate when the scheduler had a timer due sooner than `loop_interval_/2`. Configs without scheduler activity weren't affected, but on devices with `set_interval`, `set_timeout`, or `PollingComponent` updates running at sub-`loop_interval_` cadences (common on busy ESP32 builds), every component's `loop()` ran at roughly double the documented rate. As of 2026.5.0, components run at the configured `loop_interval_` exactly, and `App.set_loop_interval()` actually saves power. See ["Choosing Between loop() and the Scheduler"](#choosing-between-loop-and-the-scheduler) below for what this means for periodic work.

On platforms with socket select support (ESP32, Host, and LibreTiny-based chips like BK72xx/RTL87xx), the loop also wakes up immediately when there is new data on monitored sockets (such as API connections and OTA updates), ensuring low-latency network communication without polling. ESP8266 and RP2040 platforms use a simpler TCP implementation without select support.

### Overview

Components can control their loop execution using three methods:

- **`disable_loop()`** - Removes the component from active loop execution
- **`enable_loop()`** - Re-adds the component to active loop execution
- **`enable_loop_soon_any_context()`** - Thread-safe version that can be called from ISRs, timers, or other threads

### When to Use Loop Control

Loop control is beneficial for:

1. **Event-driven components** - Components that respond to interrupts or callbacks rather than polling
2. **Conditional components** - Components that only need to run under specific conditions
3. **One-time operations** - Components that complete their work and no longer need updates
4. **Power optimization** - Reducing CPU usage for battery-powered devices

### Basic Usage

#### Disabling the Loop

Components typically disable their loop when they have no work to do:

```cpp
void MyComponent::loop() {
  if (!this->has_work()) {
    this->disable_loop();
    return;
  }

  // Do actual work
  this->process_data();
}
```

#### Re-enabling the Loop

Components re-enable their loop when new work arrives:

```cpp
void MyComponent::on_data_received() {
  this->data_available_ = true;
  this->enable_loop();  // Resume loop processing
}
```

#### Thread-Safe Enabling from ISRs

When called from interrupt handlers, timers, or other threads, use the thread-safe version:

```cpp
void IRAM_ATTR MyComponent::gpio_isr_handler() {
  // ISR context - cannot use enable_loop() directly
  this->enable_loop_soon_any_context();
}
```

See [Waking from ISR](#waking-from-isr) for per-platform notes.

### Real-World Examples

#### 1. Interrupt-Driven GPIO Binary Sensor

```cpp
void GPIOBinarySensor::loop() {
  if (this->use_interrupt_) {
    if (this->interrupt_triggered_) {
      // Process the interrupt
      bool state = this->pin_->digital_read();
      this->publish_state(state);
      this->interrupt_triggered_ = false;
    } else {
      // No interrupt, disable loop until next one
      this->disable_loop();
    }
  } else {
    // Polling mode - always check
    this->publish_state(this->pin_->digital_read());
  }
}

// ISR handler
void IRAM_ATTR gpio_interrupt_handler(void *arg) {
  GPIOBinarySensor *sensor = static_cast<GPIOBinarySensor *>(arg);
  sensor->interrupt_triggered_ = true;
  sensor->enable_loop_soon_any_context();
}
```

#### 2. State-Based Component (BLE Client)

```cpp
void BLEClientBase::loop() {
  if (!esp32_ble::global_ble->is_active()) {
    this->set_state(espbt::ClientState::INIT);
    return;
  }

  if (this->state_ == espbt::ClientState::INIT) {
    // Register with BLE stack
    auto ret = esp_ble_gattc_app_register(this->app_id);
    if (ret) {
      ESP_LOGE(TAG, "gattc app register failed. app_id=%d code=%d", this->app_id, ret);
      this->mark_failed();
    }
    this->set_state(espbt::ClientState::IDLE);
  }
  // READY_TO_CONNECT means we have discovered the device
  else if (this->state_ == espbt::ClientState::READY_TO_CONNECT) {
    this->connect();
  }
  // If idle, disable loop as set_state will enable it again when needed
  else if (this->state_ == espbt::ClientState::IDLE) {
    this->disable_loop();
  }
}

void BLEClientBase::set_state(espbt::ClientState st) {
  ESP_LOGV(TAG, "[%d] [%s] Set state %d", this->connection_index_, this->address_str_.c_str(), (int) st);
  ESPBTClient::set_state(st);
  if (st == espbt::ClientState::READY_TO_CONNECT) {
    // Enable loop when we need to connect
    this->enable_loop();
  }
}
```

#### 3. Network Event Handler (Ethernet)

```cpp
void EthernetComponent::eth_event_handler(void *arg, esp_event_base_t event_base,
                                         int32_t event, void *event_data) {
  switch (event) {
    case ETHERNET_EVENT_START:
      global_eth_component->started_ = true;
      global_eth_component->enable_loop_soon_any_context();
      break;
    case ETHERNET_EVENT_DISCONNECTED:
      global_eth_component->connected_ = false;
      global_eth_component->enable_loop_soon_any_context();
      break;
  }
}
```

#### 4. One-Time Task (Safe Mode)

```cpp
void SafeModeComponent::loop() {
  if (!this->boot_successful_ &&
      (millis() - this->safe_mode_start_time_) > this->safe_mode_boot_is_good_after_) {
    // Boot successful, no need to monitor anymore
    ESP_LOGI(TAG, "Boot successful; disabling safe mode checks");
    this->clean_rtc();
    this->boot_successful_ = true;
    this->disable_loop();  // Never need to check again
  }
}
```

### Implementation Details

#### Component State Management

Components track their loop state using internal flags:

- `COMPONENT_STATE_LOOP` - Component is actively looping
- `COMPONENT_STATE_LOOP_DONE` - Component has disabled its loop

#### Performance Considerations

With the main loop running at the configured `loop_interval_` (default 16 ms / ~62.5 Hz):

- An idle component with an empty `loop()` still consumes CPU cycles each tick
- 10 disabled components save ~37,500 function calls per minute (default cadence)
- Critical for ESP8266/ESP32 devices with limited CPU resources, and for power-managed configurations using `App.set_loop_interval()`

#### Thread Safety

The `enable_loop_soon_any_context()` method is specifically designed for cross-thread usage:

- Sets volatile flags that are checked by the main loop
- No memory allocation or complex operations
- Safe to call from ISRs, timer callbacks, or FreeRTOS tasks on any platform where ISRs are supported
- Multiple calls are idempotent (safe to call repeatedly)

### Best Practices

1. **Only disable your own loop** - Components should only call loop control methods on themselves, never on other components

2. **Clear state before disabling** - Ensure the component is in a clean state before disabling the loop

3. **Document loop dependencies** - If your component requires continuous looping, document why

4. **Prefer event-driven design** - Use interrupts, callbacks, or timers instead of polling when possible

5. **Test edge cases** - Verify behavior when rapidly enabling/disabling the loop

### Common Patterns

#### Conditional Compilation

Some components disable their loop based on compile-time configuration:

```cpp
void CaptivePortal::loop() {
#ifdef USE_ARDUINO
  if (this->dns_server_ != nullptr) {
    this->dns_server_->processNextRequest();
  } else {
    this->disable_loop();
  }
#else
  // No DNS server on ESP-IDF
  this->disable_loop();
#endif
}
```

#### BLE Components

Most BLE components inherit from parent classes (like `BLEClientNode`) that have a `loop()` method, but don't actually need it. They disable their loop immediately since all work is done through BLE callbacks and periodic `update()` calls:

```cpp
void Anova::loop() {
  // Parent BLEClientNode has a loop() method, but this component uses
  // polling via update() and BLE callbacks so loop isn't needed
  this->disable_loop();
}
```

### Debugging

To debug loop control issues:

1. Add logging when enabling/disabling:
   ```cpp
   ESP_LOGV(TAG, "%s loop disabled", this->get_component_source());
   ```

2. Check if your component is in the loop state:
   ```cpp
   bool is_looping = this->is_in_loop_state();
   ```

3. Use the Logger component's async support as a reference implementation

## Choosing Between loop() and the Scheduler

ESPHome offers several primitives for periodic or deferred work. Since the main-loop cadence fix in 2026.5.0 ([PR #15792](https://github.com/esphome/esphome/pull/15792)), the tradeoffs have shifted enough that some older patterns are now pessimizations.

### Quick rule of thumb

| Cadence / shape | Recommended primitive |
|---|---|
| Sub-`loop_interval_` (`< 16 ms`) wakes | `HighFrequencyLoopRequester` |
| Periodic, **interval < 250 ms** | `loop()` + `App.get_loop_component_start_time()` gate |
| Periodic, **250–500 ms** | Either; `loop()` usually still cheaper |
| Periodic, **≥ 500 ms** | `set_interval` |
| One-shot or rare reschedule | `set_timeout` |
| Run-once-on-next-loop | `defer` |

Crossover depends on how cheap your `loop()` "nothing to do" path is and whether the timer interval would force extra Phase A wakes. Use `App.get_loop_component_start_time()` rather than `millis()` — it's cached per tick.

### Why `loop()` wins for sub-second work

Each main-loop tick has two phases. **Phase A** runs every tick (drains wake notifications, runs due scheduler entries, feeds the watchdog). **Phase B** runs the component list only when `loop_interval_` elapsed, `HighFrequencyLoopRequester` is active, or a `wake_loop_*` raised the flag. A `set_interval(N)` with `N` smaller than (or unaligned with) `loop_interval_` forces extra Phase A wakes that each pay scheduler-dispatch + WDT-feed cost — often more than the work itself.

### RAM cost

`set_timeout`, `set_interval`, and `defer` store callbacks in `std::function`. With libstdc++ on 32-bit MCUs (the configuration ESPHome targets), the small-buffer optimization holds **~8 bytes** of capture inline; **larger captures spill to heap allocation**, fragmenting the heap over time. Other standard libraries differ, but ESPHome builds are GCC + libstdc++ in practice. Each registration adds its own `std::function` — three timers means three callback objects.

```cpp
this->set_interval(1000, [this]() { this->tick_(); });               // SBO-safe (one pointer)
this->set_interval(1000, [this, addr, name]() { this->ping_(...); }); // heap-allocated (> 8 bytes)
```

A `loop()` method costs one pointer in the application's `looping_components_` list per active component (regardless of how many distinct tasks the loop body performs) and no per-call allocation — `this` is already available. So a component doing three things at three different cadences via gated branches in `loop()` is one pointer of overhead; the same work split across three `set_interval` registrations is three `std::function`s plus their scheduler-entry storage.

### Other primitives

- **`set_interval` still wins** for intervals ≥ 500 ms, when many items share one cadence, or when you need named cancellation.
- **`set_timeout`** — one-shots and self-rescheduling timers with variable delays. Don't chain it as a hand-rolled `set_interval`.
- **`defer`** — run-once on the next main-loop iteration; use it to break recursion or escape interrupt context, not as a task queue.

## Waking the Main Loop from Background Threads

For components that receive events in background threads/FreeRTOS tasks (BLE callbacks, network events, platform callbacks, etc.) and need low-latency processing, use `App.wake_loop_threadsafe()` to immediately wake the main loop instead of waiting 0-16ms for the next loop timeout.

**Platform Support:** Available on all platforms. No setup or opt-in required — it just works.

- **ESP32/LibreTiny:** FreeRTOS task notifications (<1 µs)
- **ESP8266:** `esp_schedule()` to exit `esp_delay()` early
- **RP2040:** ARM `__sev()` to exit `__wfe()` early
- **Zephyr (nRF52):** `k_sem_give()` to exit `k_sem_take()` early
- **Host:** UDP loopback socket to wake `select()`

### Usage

Call from background thread/FreeRTOS task context:

```cpp
#include "esphome/core/application.h"

void MyComponent::background_callback(Event event) {
  this->pending_events_.push_back(event);

  // Only wake for time-critical events
  if (event.is_time_critical()) {
    App.wake_loop_threadsafe();
  }
}
```

No `#ifdef` guards, no socket dependency, no `AUTO_LOAD` — just call it.

**When to wake:**
- Interactive events (user pairing, passkey requests) — need immediate response
- Time-critical operations — latency matters for correctness
- Low-frequency events — won't cause wake storms

**When NOT to wake:**
- High-frequency events (scan results, RSSI reads) — avoid notification storms
- Non-time-critical operations — can wait for next loop iteration
- Events that batch well — queue multiple before processing

### Waking from ISR

For ISR handlers (e.g. UART RX ISR, GPIO ISR), use `enable_loop_soon_any_context()` on your component, or `App.wake_loop_any_context()` if you just need to wake the loop. Both auto-detect ISR vs task context. Platform notes:

- **ESP32:** ISR-safe via `vTaskNotifyGiveFromISR()`. A separate `App.wake_loop_isrsafe()` is also available when you already know you are in ISR context and want to forward the `xHigherPriorityTaskWoken` flag yourself.
- **ESP8266:** ISR-safe via `esp_schedule()`, which is IRAM. `App.wake_loop_isrsafe()` is also available; it takes no arguments since ESP8266 has no FreeRTOS task to notify, and the body is implemented inline and typically inlines into the `IRAM_ATTR` caller. For ISR safety, ensure the called code is IRAM-resident.
- **RP2040:** ISR-safe. The wake body is inlined into `enable_loop_soon_any_context()`, which is placed in `.time_critical` RAM via `IRAM_ATTR`.
- **LibreTiny:** ISR-safe via `vTaskNotifyGiveFromISR()` (same path as ESP32); `App.wake_loop_isrsafe()` is also available. `IRAM_ATTR` places handlers in executable RAM as expected, except on BK72xx where it is a no-op — the Beken SDK wraps every flash op in `GLOBAL_INT_DISABLE()` (FIQ+IRQ masked), so flash-resident ISR handlers are safe.
- **Zephyr (nRF52):** ISR-safe via `k_sem_give()`, which the Zephyr kernel allows from ISR context. `App.wake_loop_isrsafe()` is also available, takes no arguments (k_sem_give handles ISR scheduling internally), and does not require `IRAM_ATTR` — nRF52 runs ISRs directly from internal flash.

Example ISR using the explicit ISR-safe API on ESP32:

```cpp
void IRAM_ATTR MyComponent::gpio_isr(MyComponent *arg) {
  arg->pending_ = true;
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  App.wake_loop_isrsafe(&xHigherPriorityTaskWoken);
  if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}
```

## See Also

- Component Loop Control: [`esphome/core/component.h`](https://github.com/esphome/esphome/blob/dev/esphome/core/component.h) and [`esphome/core/component.cpp`](https://github.com/esphome/esphome/blob/dev/esphome/core/component.cpp)
- Wake Loop Threadsafe: PR [#11681](https://github.com/esphome/esphome/pull/11681)
- [Socket Consumption API](socket_consumption_api.md) - For components that use network sockets