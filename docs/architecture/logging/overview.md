# Logging

Logging is an important function for both ESPHome developers and users alike.
This functionality is enabled when the
[logger component](https://esphome.io/components/logger/) is added to an
ESPHome device configuration:


```yaml
logger:
  level: DEBUG
```

Log messages can be retrieved over the device's hardware serial port or UART interface (if configured), over the network API (if network is configured), and MQTT (if both network and MQTT are configured).

## `ESP_LOG` Macro

The `ESP_LOG` macro is available to perform all of the necessary log functions in a space- and processing-efficient manner. The macro has the following signature (using the `DEBUG` log channel):

`void ESP_LOGD(const char * TAG, const char * msg, void **margs)`

`TAG` is usually defined in a component's header and/or at the top of the source code file as a 

A full example of a `VERBOSE` log message:
```c++
// Constant TAG placed somewhere in your source or header file
static const char *const TAG = "component_name";
// ...
ESP_LOGV(TAG, "Received data: %d", recv_data);
```
If logging over multiple lines, combine into a single log message (see [best practices](best_practices.md) for more information):

```c++
  ESP_LOGV(TAG,
           "Device properties updated:\n"
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

## Log Levels
ESPHome has seven log channels: one for configuration, and six for runtime messages of varying verbosity and severity.

 - `ESP_LOGCONFIG()`: Logged during component configuration. Typically used in
component `dump_config()` function.

In increasing order of verbosity, the runtime channels are:

 - `ERROR` (`ESP_LOGE()`): Indicates problems that prevent the ESPHome device from working correctly.
 - `WARN` (`ESP_LOGW()`): Warnings are recoverable issues like invalid sensor readings.
 - `INFO` (`ESP_LOGI()`): Informational messages that may be useful to a non-technically savvy user 
 - `DEBUG` (`ESP_LOGD()`): Messages that are important for normal device information.
 - `VERBOSE` (`ESP_LOGV()`): Messages that don't normally need to be seen but may add value when troubleshooting or preparing/commissioning a new device/configuration.
 - `VERY_VERBOSE` (`ESP_LOGVV()`): Detailed technical information, such as the content of data packets/messages being processed and/or processing state/status.

By default, `DEBUG` is the lowest severity level message type that are logged. To log less verbose messages, change the `logger` component's `level` to the desired log level, recompile, and reflash the firmware onto the device.

## Obtaining Log Data

In general, you can use `esphome logs` to retrieve real-time logs from a running ESPHome device over serial or the network API:

```bash
esphome logs path/to/configuration.yaml
```

If both network and serial connections for a single device are available, or if multiple devices are connected over serial, `esphome` will give you a choice of connection. You can automatically select the correct device using the `--device` flag:

```bash
esphome logs --device 192.168.1.111 path/to/configuration.yaml
esphome logs --device ttyACM1 path/to/configuration.yaml
```

!!! failure "Missing Logs over Network API"
   Some problems may be difficult to troubleshoot when using the Network API, either due to the errors occurring well before the device network stack is initialized, or if the network stack itself is causing an issue. If this is the case, you may need to use hardware serial to obtain logs.


To retrieve logs over serial, you can either configure your hardware's USB CDC if it has such hardware, or configure your device to use specific UART pins, which you
can then connect to your computer using:

- A deducated USB to UART adapter, or
- An [RP2040 Debug Probe](https://www.raspberrypi.com/products/debug-probe/) or another RP2040 device such as a Raspberry Pi Pico loaded with [debug probe firmware](github.com/raspberrypi/debugprobe). This will work for any UART-capable ESPHome device, not just RP2040 devices.

If your logs look garbled, make sure that your PC UART interface baud rate is
the same baud rate as your ESPHome device UART (default is 115200), and that
both your interface and device have a shared ground connection.

### Over MQTT

It is also possible to get ESPHome log messages over MQTT. You must have
[MQTT configured](https://esphome.io/components/mqtt/) with a `log_topic`
configuration option:

```yaml
mqtt:
  log_topic: ${mqtt_prefix}/logs
```

## Logging Best Practices

[Review the logging best practices guide](best_practices.md). In general, keep log messages short and to the point in order to avoid using too much processing power and network resources, and also to avoid overwhelming users and developers.
