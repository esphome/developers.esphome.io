---
title: CLI commands
description: Documentation for the command line interface of ESPHome.
weight: 3
kind: page

---
# Command Line Interface

## Base Usage

ESPHome's command line interface always has the following format

```bash
esphome [OPTIONS] <COMMAND> <CONFIGURATION...> [ARGUMENTS]
```

## esphome base options

### Option `-h` or `--help`

Output possible <commands> and [arguments].
!!! Note
    You can also use ``--help`` for any command to get arguments specific to that command.

```bash
esphome <some_command> --help
```

### Option `-v` or `--verbose`

Enable verbose esphome logs.

### Option `-q` or `--quiet`

Disable all esphome logs.

### Option `-s` or `--substitution KEY VALUE`

*(can be issued multiple times)*

Defines or overrides substitution KEY with value VALUE.

Please see [command line substitutions](#command-line-substitutions) for details.

## esphome commands
!!note
    You can specify multiple configuration files in the command line interface for some commands,
    just list all files after the <COMMAND> like so:

    ```console
    esphome run livingroom.yaml kitchen.yaml
    ```

## ``run`` Command

The ``esphome run <CONFIG>`` command is the most common command for ESPHome. It

* Validates the configuration
* Compiles a firmware
* Uploads the firmware (over OTA or USB)
* Starts the log view

```bash
esphome run [--device UPLOAD_PORT] [--no-logs] [--topic TOPIC] [--username USERNAME] [--password PASSWORD] [--client-id CLIENT_ID] [--host-port HOST_PORT] <CONFIG>

```

### Option `--device UPLOAD_PORT`

Manually specify the upload port/IP to use. For example ``/dev/cu.SLAB_USBtoUART``, or ``192.168.1.176``
to perform an OTA.

### Option `--no-logs`

Disable starting log view.

### Option `--topic TOPIC`

Manually set the topic to subscribe to for MQTT logs (defaults to the one in the configuration).

### Option `--username USERNAME`

Manually set the username to subscribe with for MQTT logs (defaults to the one in the configuration).

### Option `--password PASSWORD`

Manually set the password to subscribe with for MQTT logs (defaults to the one in the configuration).

### Option `--client-id CLIENT_ID`

Manually set the client ID to subscribe with for MQTT logs (defaults to a randomly chosen one).

### Option `--host-port HOST_PORT`

Specify the host port to use for legacy Over the Air uploads.

## ``config`` Command

The `esphome config <CONFIG>` validates the configuration and displays the validation result.

```bash
esphome config <CONFIG>

```

## ``compile`` Command

The `esphome compile <CONFIG>` validates the configuration and compiles the firmware.

```bash
esphome compile [--only-generate] <CONFIG>

```

### Option `--only-generate`

If set, only generates the C++ source code and does not compile the firmware.

## ``upload`` Command
The `esphome upload <CONFIG>` validates the configuration and uploads the most recent firmware build.

```bash
esphome upload [--device UPLOAD_PORT] [--host-port HOST_PORT] <CONFIG>
```

### Option `--device UPLOAD_PORT`
Manually specify the upload port/IP address to use. For example ``/dev/cu.SLAB_USBtoUART``, or ``192.168.1.176`` to perform an OTA.

### Option `--host-port HOST_PORT`

Specify the host port to use for legacy Over the Air uploads.

## ``clean-mqtt`` Command

The ``esphome clean-mqtt <CONFIG>`` cleans retained MQTT discovery messages from the MQTT broker.
See [](#mqtt-using_with_home_assistant).

```bash
esphome clean-mqtt [--topic TOPIC] [--username USERNAME] [--password PASSWORD] [--client-id CLIENT_ID] <CONFIG>

```

### Option `--topic TOPIC`

Manually set the topic to clean retained messages from (defaults to the MQTT discovery topic of the
node).

### Option `--username USERNAME`

Manually set the username to subscribe with.

### Option `--password PASSWORD`

Manually set the password to subscribe with.

### Option `--client-id CLIENT_ID`

Manually set the client ID to subscribe with.

##  ``wizard`` Command

The `esphome wizard <CONFIG>` command starts the ESPHome configuration creation wizard.

```bash
esphome wizard <CONFIG>

```

##  ``mqtt-fingerprint`` Command

The `esphome mqtt-fingerprint <CONFIG>` command shows the MQTT SSL fingerprints of the remote used
for SSL MQTT connections. See :ref:`mqtt-ssl_fingerprints`.

```bash
esphome mqtt-fingerprint <CONFIG>

```

##  ``version`` Command

The `esphome version` command shows the current ESPHome version and exits.

```bash
esphome version
```

##  ``clean`` Command

The `esphome clean <CONFIG>` command cleans all build files and can help with some build issues.

```bash
esphome clean <CONFIG>

```

##  ``dashboard`` Command

The `esphome dashboard <CONFIG>` command starts the ESPHome dashboard server for using ESPHome
through a graphical user interface. This command accepts a configuration directory instead of a
single configuration file.

```bash
esphome dashboard [--port PORT] [--username USERNAME] [--password PASSWORD] [--open-ui] <CONFIG>

```

### Option `--port PORT`

Manually set the HTTP port to open connections on (defaults to 6052)

### Option `--username USERNAME`

The optional username to require for authentication.

### Option `--password PASSWORD`

The optional password to require for authentication.

### Option `--open-ui`

If set, opens the dashboard UI in a browser once the server is up and running.

##  ``logs`` Command

The `esphome logs <CONFIG>` command validates the configuration and shows all logs.

```bash
esphome logs [--topic TOPIC] [--username USERNAME] [--password PASSWORD] [--client-id CLIENT_ID] [--device SERIAL_PORT] <CONFIG>

```

### Option `--topic TOPIC`

Manually set the topic to subscribe to.

### Option `--username USERNAME`

Manually set the username.

### Option `--password PASSWORD`

Manually set the password.

### Option `--client-id CLIENT_ID`

Manually set the client id.

### Option `--device SERIAL_PORT`

Manually specify a serial port/IP to use. For example ``/dev/cu.SLAB_USBtoUART``.

## Using Bash or ZSH auto-completion

ESPHome's command line interface provides the ability to use auto-completion features provided by Bash or ZSH.

You can register ESPHome for auto-completion by adding the following to your ~/.bashrc file:

``` console
eval "$(register-python-argcomplete esphome)"
```

For more information, see [argcomplete](https://kislyuk.github.io/argcomplete/) documentation.