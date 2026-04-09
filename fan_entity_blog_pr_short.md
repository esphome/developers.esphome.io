## PR Title

`[blog] Add breaking change blog post for Fan entity preset mode optimizations`

## Summary

Adds blog post documenting breaking changes in Fan entity class (esphome/esphome#11483).

**Breaking changes:**
- Preset mode storage changed from `std::set<std::string>` to `std::vector<const char*>` (~80 bytes for std::set plus at least 24 bytes overhead per preset)
- **User-facing**: Preset modes now display in YAML order instead of alphabetical order
- External components must update container types and lookup logic

Blog post includes complete migration guide, lifetime safety patterns, grep commands, and explanation of user-facing behavior change. Includes:
- Note about std::find_if flash overhead for ESP8266 devices
- Performance context for linear search with typical preset counts (3-6 items)
- Explicit lifetime safety warning for dynamic modes example
- Motivation about limited heap for ESP8266 devices

**Files:**
- `docs/blog/posts/2025-11-07-fan-entity-preset-modes.md` - Blog post
- `docs/blog/.authors.yml` - Add bdraco author (since PRs #66, #67, #68 haven't merged yet)
