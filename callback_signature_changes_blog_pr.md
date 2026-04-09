## PR Title

`Add blog post: Callback signature changes for text_sensor, text, and select`

---

## Description

Documents callback signature changes to reduce heap allocations:

**text_sensor and text:**
- `void(std::string)` -> `void(const std::string &)`
- Most code unaffected; only explicit `std::function` types need updates

**select (significant change):**
- `void(std::string, size_t)` -> `void(size_t)`
- String parameter removed; callbacks receive index only
- Use `select->option_at(index)` to get option string if needed

Related PRs: esphome/esphome#12503, #12504, #12505
