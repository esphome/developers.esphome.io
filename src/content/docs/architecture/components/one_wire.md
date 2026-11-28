---
title: "Interfacing via 1-Wire"
---

A 1-Wire device component, such as `dallas_temp`, talks to its bus through `one_wire::OneWireBus`. The bus is a
platform of the `one_wire` component; `gpio` is the usual one.

## Python

```python
from esphome.components import one_wire

DEPENDENCIES = ["one_wire"]

CONFIG_SCHEMA = (
    sensor.sensor_schema(MyOneWireSensor, ...)
    .extend(one_wire.one_wire_device_schema())
    .extend(cv.polling_component_schema("60s"))
)


async def to_code(config):
    var = await sensor.new_sensor(config)
    await cg.register_component(var, config)
    await one_wire.register_one_wire_device(var, config)
```

`one_wire_device_schema()` adds `one_wire_id` and either `address` or `index`. `register_one_wire_device()` sets the
bus and the address on the object.

## C++

The class inherits from `one_wire::OneWireDevice`. It holds the bus in `this->bus_` and the device's ROM address in
`this->address_`.

```cpp
class MyOneWireSensor : public sensor::Sensor, public PollingComponent, public one_wire::OneWireDevice { ... };
```

### Blocking access

`send_command_(cmd)` resets the bus, selects this device and writes `cmd`. After that, `this->bus_->read8()`,
`write8()`, `read64()` and `write64()` transfer the data:

```cpp
if (!this->send_command_(0xBE))  // read scratch pad
  return;
for (uint8_t &byte : this->scratch_pad_)
  byte = this->bus_->read8();
```

Every call waits until its bits are on the bus. With the bit-banged `gpio` bus, interrupts are disabled for each reset
and each time slot, and the main loop waits for the whole transfer. A scratch pad read takes several milliseconds.

### Non-blocking transactions

A device can hand the bus a whole transaction and return at once. A bus that can run transfers in the background,
such as `gpio` with `use_rmt: true`, then runs it while the main loop goes on:

```cpp
struct Transaction {
  uint64_t address;          // 0: Skip ROM, otherwise Match ROM
  const uint8_t *write_data;
  uint8_t *read_data;        // only defined when the status is TRANSACTION_STATUS_OK
  void (*on_done)(void *context, TransactionStatus status);
  void *context;
  uint8_t write_len;
  uint8_t read_len;
  TransactionLink link;      // owned by the bus, leave it out of initializers

  bool is_pending() const;
};

virtual bool OneWireBus::submit(Transaction *transaction);
```

A transaction is reset, ROM selection, `write_data`, then `read_data`, with nothing else on the bus in between.

- The caller owns the `Transaction`, usually as a member, and keeps it valid until `on_done` has run. The bus keeps
  queued transactions in a list inside the objects (`link`), so it allocates no memory. `Transaction` is an aggregate,
  so designated initializers work. They must follow the order of the fields above.
- `submit()` returns `false` only while this transaction is still pending. Nothing changes in that case, so skip the
  cycle.
- Call `submit()` from the main loop only. `on_done` runs in the main loop, and it can run before `submit()` returns:
  every bus gets a default `submit()` that runs the transaction at once through the blocking calls above. So a device
  that uses `submit()` works on every bus.
- The default `submit()` can only report a failed reset. The blocking calls cannot report write or read errors, so
  check the read data, for example with its CRC.
- `TransactionStatus` values all start with `TRANSACTION_STATUS_`: `OK`, `NO_PRESENCE` (no device answered the reset),
  `BUS_LOW` (the bus is held low, or a bridge such as DS248x could not run the reset), `CAPTURE_ERROR`, `TIMEOUT` or
  `HARDWARE_ERROR`.

`dallas_temp` uses one transaction for both steps: start the conversion, then read the scratch pad after the
conversion time.

```cpp
// dallas_temp.h
one_wire::Transaction transaction_{
    .read_data = this->scratch_pad_, .on_done = on_transaction_done, .context = this, .write_len = 1};

// dallas_temp.cpp
void DallasTemperatureSensor::update() {
  if (this->transaction_.is_pending()) {
    ESP_LOGD(TAG, "'%s': skipping a cycle, bus busy", LOG_STR_ARG(this->get_log_name()));
    return;
  }
  this->submit_(&DALLAS_COMMAND_START_CONVERSION, 0);
}

void DallasTemperatureSensor::submit_(const uint8_t *command, uint8_t read_len) {
  this->transaction_.write_data = command;
  this->transaction_.read_len = read_len;
  this->bus_->submit(&this->transaction_);
}
```

When the conversion step is done, `on_done` schedules the read step with `set_timeout()`. When the read step is done,
it checks the CRC and publishes.
