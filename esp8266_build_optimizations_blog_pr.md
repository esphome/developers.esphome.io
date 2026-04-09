## PR Title

`Add blog post: ESP8266 build optimizations for Serial and waveform code`

---

## Description

Documents ESP8266 build optimizations that exclude unused features:

**Serial Objects (#12736):**
- `Serial`/`Serial1` excluded by default
- External components: Call `enable_serial()` or `enable_serial1()`
- Users: Add `enable_serial: true` to esp8266 config

**Waveform/PWM Code (#12690):**
- Waveform subsystem excluded by default (saves 596 bytes RAM)
- External components: Call `require_waveform()` for `analogWrite`/`tone`

Related PRs: esphome/esphome#12736, #12690
