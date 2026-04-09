## PR Title

`Add blog post: Build info and compilation_time API changes`

---

## Description

Documents changes to the build info API:

**Deprecated:**
- `App.get_compilation_time()` (removal 2026.7.0)
- `App.get_compilation_time_ref()` (removed)

**New constexpr methods:**
- `App.get_build_time()` - Unix timestamp
- `App.get_config_hash()` - FNV-1a config hash
- `App.get_config_version_hash()` - Config + version hash
- `App.get_build_time_string(buffer)` - Formatted string

**Behavior change:** API `compilation_time` now updates on every compile.

Related PR: esphome/esphome#12425
