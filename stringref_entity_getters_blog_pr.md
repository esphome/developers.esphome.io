## PR Title

`Add blog post: Entity getters now return StringRef`

---

## Description

Documents the breaking change where entity component getters now return `StringRef` instead of `const char*` or `std::string`.

**Affected methods:**
- Fan: `get_preset_mode()`
- Select: `current_option()`
- Climate: `get_custom_fan_mode()`, `get_custom_preset()`
- Event: `get_last_event_type()`
- Light: `LightEffect::get_name()`, `LightState::get_effect_name()`

**Key migration points:**
- Use `.empty()` instead of `!= nullptr`
- Use `==` operator instead of `strcmp()`
- Use `%.*s` format with `size()` and `c_str()` for logging

Related PRs: esphome/esphome#13092, #13095, #13103, #13104, #13105
