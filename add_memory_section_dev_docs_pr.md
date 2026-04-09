## PR Title

`Add memory management section to contributing guide`

---

## Description

Add documentation about heap allocation and memory management for ESP devices.

**Key points:**
- Heap allocation after `setup()` should be avoided unless absolutely unavoidable
- Documents why this matters more now (longer uptimes due to HA disabling update entities by default)
- Lists soft-deprecated `std::string`-returning helpers and their replacements
- STL container guidelines (`std::array`, `StaticVector`, `FixedVector`, avoid `std::deque`)

Related: esphome/esphome#13156
