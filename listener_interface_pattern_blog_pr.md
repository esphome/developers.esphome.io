## PR Title

`Add blog post: Listener interface pattern for OTA and alarm control panel`

---

## Description

Documents two related changes to callback patterns:

**OTA Component:**
- `std::function` callbacks replaced with `OTAStateListener` interface
- Implement `on_ota_state()` method and register with `add_state_listener(this)`
- Python: Use `ota.request_ota_state_listeners()` in code generation

**Alarm Control Panel:**
- 7 per-state callbacks removed (`add_on_triggered_callback()`, etc.)
- Use unified `add_on_state_callback()` and check `get_state()` instead

Related PRs: esphome/esphome#12167, #12171
