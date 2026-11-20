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

A bus that can run transfers in the background, such as `gpio` with `use_rmt: true`, defines `USE_ONE_WIRE_RMT`. A
device can then hand the bus a whole transaction and return at once:

```cpp
#ifdef USE_ONE_WIRE_RMT
struct Transaction {
  uint64_t address;         // 0: Skip ROM, otherwise Match ROM
  const uint8_t *write_data;
  uint8_t write_len;
  uint8_t *read_data;       // only defined when the status is OK
  uint8_t read_len;
  void (*on_done)(void *context, TransactionStatus status);
  void *context;
};

virtual bool OneWireBus::submit(Transaction *transaction);
#endif
```

A transaction is reset, ROM selection, `write_data`, then `read_data`, with nothing else on the bus in between.

- The caller owns the `Transaction`, usually as a member, and keeps it valid until `on_done` has run. The bus keeps
  queued transactions in a list inside the objects, so it allocates no memory.
- `submit()` returns `false` only while this transaction is still pending. Nothing changes in that case, so skip the
  cycle.
- `on_done` runs in the main loop. It can run before `submit()` returns: every bus gets a default `submit()` that runs
  the transaction at once through the blocking calls above. `USE_ONE_WIRE_RMT` is global, so a bit-banged bus in the
  same configuration uses that default.
- `TransactionStatus`: `OK`, `NO_PRESENCE` (no device answered the reset), `BUS_LOW` (the bus is held low),
  `CAPTURE_ERROR`, `TIMEOUT` or `HARDWARE_ERROR`.

`dallas_temp` uses two transactions: start the conversion, then read the scratch pad after the conversion time.

```cpp
// dallas_temp.h
one_wire::Transaction convert_{.write_len = 1, .on_done = on_convert_done, .context = this};

// dallas_temp.cpp
void DallasTemperatureSensor::update() {
  this->convert_.address = this->address_;
  this->convert_.write_data = &DALLAS_COMMAND_START_CONVERSION;
  if (!this->bus_->submit(&this->convert_))
    ESP_LOGD(TAG, "skipping a cycle, still converting");
}

void DallasTemperatureSensor::on_convert_done(void *context, one_wire::TransactionStatus status) {
  auto *self = static_cast<DallasTemperatureSensor *>(context);
  self->set_timeout(CONVERSION_TIMEOUT_ID, self->millis_to_wait_for_conversion_(),
                    [self] { self->bus_->submit(&self->read_); });
}
```

Keep the blocking code for builds without `USE_ONE_WIRE_RMT`.
