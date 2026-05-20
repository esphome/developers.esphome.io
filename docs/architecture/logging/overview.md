# Logging

Logging is an important function for both ESPHome developers and users alike.
This functionality is enabled when the
[logger component](https://esphome.io/components/logger/) is added to an
ESPHome device configuration:

```yaml
# Example: changing default log level for all components
logger:
  level: VERBOSE

# Example: changing log level for just `bmp581_base`
logger:
  logs:
    bmp581_base: VERBOSE
```

Log messages can be retrieved over the device's hardware serial port or UART interface (if configured), over the network API (if network is configured), and MQTT (if both network and MQTT are configured).

## `ESP_LOG` Macro

The `ESP_LOG` macro is available to perform all of the necessary log functions in a space- and processing-efficient manner. The macro has the following signature (using the `DEBUG` log channel):

`void ESP_LOGD(const char * TAG, const char * msg, ...)`

`TAG` is usually defined in a component's header and/or at the top of the source code file as a `static const char *const`. `msg` is a `printf`-style string, and any variables used to format the string are passed in the subsequent variadic argument.

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
```

## Log Levels
ESPHome has six runtime logging channels, from `ERROR` to `VERY_VERBOSE`.
In increasing order of verbosity, the channels are:

 - `ERROR` (`ESP_LOGE()`): Indicates problems that prevent the ESPHome device from working correctly.
 - `WARN` (`ESP_LOGW()`): Warnings are recoverable issues like invalid sensor readings.
 - `INFO` (`ESP_LOGI()`): Informational messages that may be useful to a non-technically savvy user, such as detected serial numbers.
 - `DEBUG` (`ESP_LOGD()`): Messages that are important for typical device diagnostics.
 - `VERBOSE` (`ESP_LOGV()`): Messages that don't normally need to be seen but may add value when troubleshooting or preparing/commissioning a new device/configuration.
 - `VERY_VERBOSE` (`ESP_LOGVV()`): Detailed technical information, such as the content of data packets/messages being processed and/or processing state/status.

In addition, ESPHome also has a configuration logging macro, `ESP_LOGCONFIG()`,
which is typically only used in a component's `dump_config()` function. When
developing your own component, remember to implement `dump_config()` and output
relevant configuration options.

By default, `ERROR`, `WARN`, `INFO`, and `DEBUG`level message types are logged, and `ESP_LOGCONFIG` messages are always logged. To change log level, you must edit your configuration's `logger` parameters, recompile, and reflash the firmware onto the device before these changes will be applied.

## Obtaining Log Data

In general, you can use `esphome logs` to retrieve real-time logs from a running ESPHome device over serial, using the ESPHome network API, or over MQTT. You can use the
`esphome` utility to automatically get logs over serial or the ESPHome network
API using the configuration file:

```bash
esphome logs path/to/configuration.yaml
```

If both network and serial connections for a single device are available, or if multiple devices are connected over serial, `esphome` will give you a choice of connection. You can automatically select the correct device using the `--device` flag:

```bash
esphome logs --device 192.168.1.111 path/to/configuration.yaml
esphome logs --device ttyACM1 path/to/configuration.yaml
```

To publish ESPHome log messages to MQTT, you must
[configure MQTT](https://esphome.io/components/mqtt/) with a `log_topic`
configuration option:

```yaml
mqtt:
  log_topic: ${mqtt_prefix}/logs
```

!!! important "Missing Logs over Network API"
    Some problems may be difficult to troubleshoot when using the Network API or MQTT logs, either due to the errors occurring well before the device network stack is initialized, or if the network stack itself is causing an issue. If you are unable to retrieve relevant logs due to network startup, you may need to use hardware serial to obtain logs. 

To retrieve logs over serial, you can either configure your hardware's USB CDC if it has such hardware, or configure your device to use specific UART pins, which you
can then connect to your computer using:

- A dedicated USB to UART adapter, or
- An [RP2040 Debug Probe](https://www.raspberrypi.com/products/debug-probe/) or another RP2040 device such as a Raspberry Pi Pico loaded with [debug probe firmware](https://github.com/raspberrypi/debugprobe). This will work for any UART-capable ESPHome device, not just RP2040 devices.

If your logs look garbled when using a serial connection, make sure that your
PC UART interface baud rate is the same baud rate as your ESPHome device UART
(default is 115200), and that both your interface and device have a shared
ground connection.

## Logging Best Practices

[Review the logging best practices guide](best_practices.md). In general, keep log messages short and to the point in order to avoid using too much processing power and network resources, and also to avoid overwhelming users and developers. Also remember to output your component's configuration using `ESP_LOGCONFIG()` in your component's `dump_config()` function.
