## PR Title

`Add blog post: Stack-based formatting helpers replace heap-allocating functions`

---

## Description

Documents the soft-deprecation of heap-allocating string helpers in favor of stack-based alternatives to prevent heap fragmentation.

**Deprecated functions:**
- `format_hex()` -> `format_hex_to()`
- `format_hex_pretty()` -> `format_hex_pretty_to()`
- `get_mac_address()` -> `get_mac_address_into_buffer()`
- `get_mac_address_pretty()` -> `get_mac_address_pretty_into_buffer()`
- `value_accuracy_to_string()` -> `value_accuracy_to_buf()`
- `get_object_id()` -> `get_object_id_to()`
- `MideaData::to_string()` -> `MideaData::to_str()`
- `ABBWelcomeData::to_string()` -> `ABBWelcomeData::format_to()`

Related PRs: esphome/esphome#13156, #13157, #13158, #13159, #12799, #12629
