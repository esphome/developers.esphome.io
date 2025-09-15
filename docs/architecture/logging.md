# Logging Best Practices

## Overview

Logging is an essential part of ESPHome for both debugging and monitoring. It's important to understand that logging
has performance implications, especially in networked environments.

This guide covers best practices for efficient logging in ESPHome components and platforms.

## Understanding Logger Overhead

### Network Impact

Each `ESP_LOG*` call in ESPHome results in:

1. **Format string processing** - The printf-style formatting is processed
2. **Memory allocation** - For the formatted message
3. **Serial output** - Written to the console/UART
4. **Network packet creation** - The log message is packaged for transmission
5. **Network transmission** - Sent over WiFi/Ethernet to connected clients

For devices with many sensors or components, this can result in thousands of network packets each time a client
connects, causing:

- Network congestion
- Delayed log streaming
- Potential timeouts in Home Assistant entity discovery
- Device loop blocking in extreme cases (100+ sensors)

### Flash Memory Impact

Each logging call also consumes flash memory:

- Each unique (format) string will consume dedicated space in flash
- Each function call adds to binary size

Embedded devices have limited flash memory available; inefficient use of logging results in significant amounts of
wasted space and time.

#### Minimizing Impact

- Do not use the component/platform name in log messages -- it's redundant because `TAG` already identifies the running 
  component/platform.
- Keep messages short and concise; avoid extra words which do not ease debugging.
- **Do not:**
    - repeat similar strings.
    - explain troubleshooting steps or ask questions.
    - include punctuation unless necessary; each message appears on a new line. For example, a period (`.`) or
      exclamation point (`!`) at the end of every message does not help with debugging and only wastes space.

#### Examples

!!! failure "Bad"

    ```cpp
    static const char *const TAG = "neat_temp_sensor.sensor";
    // ...
    ESP_LOGD(TAG, "Enabling neat_temp_sensor communication.");
    // ...
    ESP_LOGD(TAG, "Disabling neat_temp_sensor communication.");
    // ...
    ESP_LOGE(TAG, "I2C error during reading of neat_temp_sensor values! Is the sensor connected?");
    ```

    - Redundant platform name in messages
    - Long, repeating strings with only minor differences
    - Unnecessary text/characters and punctuation

!!! success "Good"

    ```cpp
    static const char *const TAG = "neat_temp_sensor.sensor";
    // ...
    ESP_LOGD(TAG, "Enabling");
    // ...
    ESP_LOGD(TAG, "Disabling");
    // ...
    ESP_LOGE(TAG, "Communication failed");
    ```

    - Short messages which may be shared by many components/platforms
    - TAG identifies the component/platform

## Configuration Logging (`ESP_LOGCONFIG`)

Configuration logging dumps the current component/platform configuration. This is particularly important to optimize
as it runs every time an API client connects (for example: Home Assistant, ESPHome Device Builder or `esphome logs`).

### The Problem

Consider a typical sensor configuration dump:

```cpp
void MyComponent::dump_config() {
  ESP_LOGCONFIG(TAG, "My Component:");
  ESP_LOGCONFIG(TAG, "  Address: 0x%02X", this->address_);
  ESP_LOGCONFIG(TAG, "  Update Interval: %ums", this->update_interval_);
  ESP_LOGCONFIG(TAG, "  Samples: %d", this->samples_);
  ESP_LOGCONFIG(TAG, "  Mode: %s", this->get_mode_str());
}
```

This generates five separate network packets for a single component. With 100 sensors, this becomes 500+ packets every
time a client connects.

### The Solution: Combine Related Log Messages

Combine related configuration fields into single log calls using newline characters:

```cpp
void MyComponent::dump_config() {
  ESP_LOGCONFIG(TAG,
                "My Component:\n"
                "  Address: 0x%02X\n"
                "  Update Interval: %ums\n"
                "  Samples: %d\n"
                "  Mode: %s",
                this->address_,
                this->update_interval_,
                this->samples_,
                this->get_mode_str());
}
```

This reduces five packets to one, an 80% reduction!

### Best Practices for Combined Logging

!!! important
    The default log buffer is 512 bytes.
    
    This limit applies to the _total formatted message size_, not the number of lines.

When combining log messages:

- Each `\n` adds only one byte
- Consider the length of substituted values (for example, `%s` might expand to 20+ characters/bytes for long strings)
- The log header (timestamp, level, tag) uses approximately 30 bytes
- Most combined ESP_LOGCONFIG calls stay well under this limit, even with 8-10 lines

1. **Use string literal concatenation** for readability:
   ```cpp
   ESP_LOGCONFIG(TAG,
                 "Component Name: %s\n"
                 "  Setting 1: %d\n"
                 "  Setting 2: %s",
                 name, value1, value2);
   ```

2. **Group related fields** that are always logged together:
   ```cpp
   // Good - these settings are related
   ESP_LOGCONFIG(TAG,
                 "UART Configuration:\n"
                 "  Baud Rate: %u\n"
                 "  Data Bits: %u\n"
                 "  Parity: %s\n"
                 "  Stop Bits: %u",
                 baud_rate_, data_bits_, parity_str, stop_bits_);
   ```

3. **Keep optional fields separate**:
   ```cpp
   // Always log these together
   ESP_LOGCONFIG(TAG,
                 "Sensor '%s'\n"
                 "  State Class: '%s'\n"
                 "  Unit: '%s'",
                 name, state_class, unit);
   
   // Optional field as separate call
   if (!icon.empty()) {
     ESP_LOGCONFIG(TAG, "  Icon: '%s'", icon);
   }
   ```

4. **Maintain visual hierarchy**:
   ```cpp
   // Preserve indentation in the output
   ESP_LOGCONFIG(TAG,
                 "Parent Component:\n"
                 "  Child Setting 1: %d\n"
                 "  Child Setting 2: %s\n"
                 "    Sub-setting: %d",
                 value1, value2, value3);
   ```

### What NOT to Optimize

Avoid complex string building or conditional formatting:

```cpp
// Bad - creates complexity and uses more flash
std::string config_str = "Settings:";
if (setting1) config_str += str_sprintf("\n  Setting1: %d", value1);
if (setting2) config_str += str_sprintf("\n  Setting2: %d", value2);
ESP_LOGCONFIG(TAG, "%s", config_str.c_str());

// Good - simple and clear
ESP_LOGCONFIG(TAG, "Settings:");
if (setting1) ESP_LOGCONFIG(TAG, "  Setting1: %d", value1);
if (setting2) ESP_LOGCONFIG(TAG, "  Setting2: %d", value2);
```

## Runtime Logging Best Practices

Runtime logging affects the ongoing operation of your component:

### 1. Use Appropriate Log Levels

We have macros to log messages at the following log levels:

```cpp
ESP_LOGVV(TAG, "Detailed trace info");   // VERY_VERBOSE - Usually compiled out
ESP_LOGV(TAG, "Verbose information");    // VERBOSE - Detailed logging for troubleshooting/commissioning
ESP_LOGD(TAG, "Debug information");      // DEBUG - For development
ESP_LOGI(TAG, "Informational message");  // INFO - Important user-facing events
ESP_LOGW(TAG, "Warning condition");      // WARNING - Potential issues
ESP_LOGE(TAG, "Error occurred");         // ERROR - Definite problems/unexpected behavior
```

In general, use:

- `ESP_LOGVV` to log detailed technical information, such as the content of data packets/messages being processed
  and/or processing state/status.
- `ESP_LOGV` to log messages that don't normally need to be seen but may add value when troubleshooting or
  preparing/commissioning a new device/configuration.
- `ESP_LOGD` to log messages that are necessary for normal use; we try to use it sparingly as, when it's too noisy, it
  becomes difficult to spot these and/or other important messages. Note that, as a project, we abuse this log level a
  bit; it's normally more verbose than "very verbose" but it is instead ESPHome's default log level and we treat it
  accordingly.
- `ESP_LOGI` to log information that a non-tech-savvy user might want to see; this log level should not contain any
  technical detail that a normal, non-developer human would not be able to make sense of at a glance.
- `ESP_LOGW` when something potentially bad happened, but we can likely continue without any real issues.
- `ESP_LOGE` when something really bad happened and we cannot continue and/or unexpected behavior is likely to be the
  result of the failure.

### 2. Avoid Logging in Tight Loops

```cpp
// Bad - logs every iteration
void loop() {
  float value = read_sensor();
  ESP_LOGD(TAG, "Sensor value: %.2f", value);  // Don't do this!
}

// Good - log only on change or periodically
void loop() {
  float value = read_sensor();
  if (abs(value - last_value_) > 0.1) {
    ESP_LOGD(TAG, "Sensor value changed: %.2f", value);
    last_value_ = value;
  }
}
```

### 3. Combine Related Runtime Messages

When multiple related events occur together:

```cpp
// Instead of:
ESP_LOGI(TAG, "Connection established");
ESP_LOGI(TAG, "IP Address: %s", ip.c_str());
ESP_LOGI(TAG, "Subnet: %s", subnet.c_str());
ESP_LOGI(TAG, "Gateway: %s", gateway.c_str());

// Use:
ESP_LOGI(TAG,
         "Connection established\n"
         "  IP Address: %s\n"
         "  Subnet: %s\n"
         "  Gateway: %s",
         ip.c_str(), subnet.c_str(), gateway.c_str());
```

