---
title: "Noise stream"
---

`noise::NoiseStream` encrypts a byte stream between two ESPHome devices that hold the same key. The header is
`esphome/components/noise/noise_stream.h`, and the implementation is `noise_stream.cpp`. It is compiled only when a
component calls `noise.require_stream()` from `to_code`, which defines `USE_NOISE_STREAM`.

The session is Noise_NNpsk0_25519_ChaChaPoly_SHA256, the pattern the API uses, with its own prologue, so an API
peer never completes a stream handshake. Frames use the API wire format: an indicator byte, a 16-bit big endian
length and the payload. Handshake payloads start with the same status byte, and a responder that fails a handshake
sends the same reject reasons, so a wrong key is reported as `Handshake MAC failure` on both ends.

The stream knows no transport. Its methods that move bytes are templates on a link type with the calls of the
[TCP client link](/architecture/components/tcp_client_link/): `connected()`, `read()`, `tx_free()`, `tx_tail()`,
`tx_commit()`, `flush_tx()`, `close()`, `note_attempt()`, `note_io()`, `check_idle()` and `reconnect_interval()`.
Nothing is virtual.

- The constructor takes the key, a pointer to 32 bytes that outlive the stream, and whether this end speaks
  first. The TCP client is the initiator.
- `up(link)` once per loop, also while the link is down. It returns true while the session is secure, and it is
  inline then and while the link is down. While the link is up and the session is not, it runs the handshake; a
  failed handshake, or one not finished 60 seconds after the connection came up, closes the link and calls
  `note_attempt()`. While it waits for the peer it calls `check_idle()`, so the link's idle timeout holds during
  the handshake too. A down link resets the session.
- When a handshake ends without a session, an initiator holds its next attempt: while the link is down, `up()`
  keeps calling `note_attempt()`, so the link's own retry waits longer. The wait follows the API's outgoing
  connection: it starts at `reconnect_interval()`, doubles after each further failure up to 300 seconds and varies
  at random by up to 20% either way, and the link's interval is the shortest wait. A successful handshake resets
  it. If the link connects before the hold has run out, because one loop pass took longer than
  `reconnect_interval()`, `up()` closes it again without a handshake. A responder waits only the link's interval.
- `read(link, buf, len)` returns plaintext with the same results as `TcpClientLink::read()`. It reads until `len`
  bytes are there or the link has nothing more, so a short count means the socket is drained. Handing out
  plaintext of a frame read earlier involves no socket read, so `read()` calls `note_io()` whenever it returns bytes.
- `queue(link, data, len)` adds plaintext to an open frame in the link's buffer and returns how many bytes fit.
  `tx_free(link)` is the room one `queue()` call grants. `flush(link)` encrypts the open frame in place, appends
  its MAC and sends. Bytes written between two flushes share one frame of at most 480 plaintext bytes, so the
  stream keeps only a receive buffer of about 500 bytes. When the link was closed under an open frame, `flush()`
  drops the frame, resets the session and returns false.
- A responder takes the spare ephemeral key when one is ready, as the API server does. With the API in the build,
  the API server refills the slot; without it, a responder prepares a new key while its link is down. An initiator
  leaves the slot alone.

A component keeps a `NoiseStream *` beside its link and routes its reads, writes and flushes through it when the
pointer is set. A client that dials out:

```python
import esphome.codegen as cg
from esphome.components import noise, socket
from esphome.components.const import CONF_HOST
import esphome.config_validation as cv
from esphome.const import CONF_ENCRYPTION, CONF_ID, CONF_KEY, CONF_PORT
from esphome.core import CORE
from esphome.types import ConfigType

DOMAIN = "my_link"
MULTI_CONF = True


def AUTO_LOAD() -> list[str]:
    # Reads the raw config: an AUTO_LOAD that takes the config runs after the
    # DEPENDENCIES checks of other components
    base = ["socket"]
    raw = (CORE.raw_config or {}).get(DOMAIN)
    confs = raw if isinstance(raw, list) else [raw]
    # Without a config (tooling) the maximal set
    if CORE.raw_config is None or any(
        isinstance(conf, dict) and CONF_ENCRYPTION in conf for conf in confs
    ):
        base.append("noise")
    return base


my_link_ns = cg.esphome_ns.namespace("my_link")
MyLink = my_link_ns.class_("MyLink", cg.Component)

CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(MyLink),
            cv.Required(CONF_HOST): socket.ipv4_host,
            cv.Required(CONF_PORT): cv.port,
            cv.Optional(CONF_ENCRYPTION): noise.STREAM_ENCRYPTION_SCHEMA,
        }
    ).extend(cv.COMPONENT_SCHEMA),
    socket.consume_sockets(1, DOMAIN),
)

FINAL_VALIDATE_SCHEMA = noise.final_validate_stream_key(DOMAIN)


async def to_code(config: ConfigType) -> None:
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    socket.require_tcp_client_link()
    cg.add(var.set_host(config[CONF_HOST]))
    cg.add(var.set_port(config[CONF_PORT]))
    if (encryption := config.get(CONF_ENCRYPTION)) is not None:
        # This side dials, so it speaks first
        stream = noise.new_stream(config[CONF_ID], encryption[CONF_KEY], True)
        cg.add(var.set_noise_stream(stream))
```

`new_stream(owner_id, key, initiator)` calls `require_stream()`, creates the stream with the key in flash and, for
a side that answers (`initiator` false, as on a server), turns on the spare ephemeral key.

`STREAM_ENCRYPTION_SCHEMA` requires the key. `final_validate_stream_key(owner)` rejects a key that equals the
`api` or `esphome` OTA key, because the peer device holds the stream key; a key the API gets at runtime cannot be
compared.

`USE_NOISE_STREAM` exists only when a component in the build asked for the stream, and `noise` is loaded only with
`encryption`, so the include, the member, the setter and every use sit under the guard:

```cpp
#ifdef USE_NOISE_STREAM
#include "esphome/components/noise/noise_stream.h"
#endif

socket::TcpClientLink link_;
// The state loop() saw last; the rising edge starts a session.
bool link_was_up_{false};
// Session bytes can wait in the stream while the socket shows none.
bool rx_pending_{false};
#ifdef USE_NOISE_STREAM
noise::NoiseStream *noise_{nullptr};
void set_noise_stream(noise::NoiseStream *stream) { this->noise_ = stream; }
#endif
void set_host(const char *host) { this->link_.set_host(host); }
void set_port(uint16_t port) { this->link_.set_port(port); }

void setup() override {
  this->link_.begin(TAG);
#ifdef USE_NOISE_STREAM
  if (this->noise_ != nullptr) {
    this->noise_->set_log_tag(TAG);
  }
#endif
}

void loop() override {
  this->link_.poll();
  bool up = this->link_up_();
  if (up != this->link_was_up_) {
    this->link_was_up_ = up;
    // The handshake's last read can leave session bytes that ready() does not show.
    this->rx_pending_ = up;
  }
  if (!up) {
    return;
  }
  if (this->rx_pending_ || this->link_.ready()) {
    uint8_t buf[64];
    ssize_t count = this->read_(buf, sizeof(buf));
    // Hand count bytes on; a full buffer means more may wait.
    this->rx_pending_ = count == static_cast<ssize_t>(sizeof(buf));
  }
  this->flush_();
}

bool link_up_() {
#ifdef USE_NOISE_STREAM
  if (this->noise_ != nullptr) {
    return this->noise_->up(this->link_);
  }
#endif
  return this->link_.connected();
}

ssize_t read_(uint8_t *buf, size_t len) {
#ifdef USE_NOISE_STREAM
  if (this->noise_ != nullptr) {
    return this->noise_->read(this->link_, buf, len);
  }
#endif
  return this->link_.read(buf, len);
}

size_t queue_(const uint8_t *data, size_t len) {
#ifdef USE_NOISE_STREAM
  if (this->noise_ != nullptr) {
    return this->noise_->queue(this->link_, data, len);
  }
#endif
  return this->link_.queue(data, len);
}

bool flush_() {
#ifdef USE_NOISE_STREAM
  if (this->noise_ != nullptr) {
    return this->noise_->flush(this->link_);
  }
#endif
  return this->link_.flush_tx();
}
```

Call `set_log_tag(TAG)` from `setup()`; it names the stream's log lines. On the rising edge, read once even if
`link_.ready()` is false. `up()` and `flush()` reset the session when they find the link closed, so a component
calls `reset()` only when it closes the link itself and may reopen it before its next `up()`.
