# Advanced Topics

This section covers advanced component development topics in ESPHome. These features are typically used in more complex components or when optimizing for performance and resource usage.

## Component Loop Control

ESPHome's main loop runs approximately every 7ms (~7000 times per minute), calling each component's `loop()` method. This high frequency ensures responsive behavior but can waste CPU cycles for components that don't need continuous updates. The loop control API allows components to dynamically enable or disable their participation in the main loop.

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

With the main loop running every ~7ms:

- An idle component with an empty `loop()` still consumes CPU cycles
- 10 disabled components save ~70,000 function calls per minute
- Critical for ESP8266/ESP32 devices with limited CPU resources

#### Thread Safety

The `enable_loop_soon_any_context()` method is specifically designed for cross-thread usage:

- Sets volatile flags that are checked by the main loop
- No memory allocation or complex operations
- Safe to call from ISRs, timer callbacks, or FreeRTOS tasks
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

### See Also

- Source: [`esphome/core/component.h`](https://github.com/esphome/esphome/blob/dev/esphome/core/component.h) and [`esphome/core/component.cpp`](https://github.com/esphome/esphome/blob/dev/esphome/core/component.cpp)