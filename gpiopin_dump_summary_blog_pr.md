## PR Title

`Add blog post: GPIOPin::dump_summary() buffer-based API`

---

## Description

Documents the breaking change where `GPIOPin::dump_summary()` now uses a buffer-based API instead of returning `std::string`.

**Key changes:**
- Old: `virtual std::string dump_summary() const;`
- New: `virtual size_t dump_summary(char *buffer, size_t len) const;`

Affects 22+ GPIO implementations. Old method deprecated until 2026.7.0.

Related PR: esphome/esphome#12760
