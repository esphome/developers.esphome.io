## PR Title

`[blog] Add breaking change blog post for Event entity memory optimizations`

## Summary

Adds blog post documenting breaking changes in Event entity class across two PRs in 2025.11.0 release.

**Two PRs in same release:**
1. [PR #11463](https://github.com/esphome/esphome/pull/11463) (merged): std::set<std::string> → FixedVector<std::string>
2. [PR #11767](https://github.com/esphome/esphome/pull/11767) (this blog post): FixedVector<std::string> → FixedVector<const char *>

**Combined breaking changes (for external components):**
- Event type storage changed from `std::set<std::string>` to `FixedVector<const char *>`
- Eliminates ~80 bytes std::set overhead + per-node overhead + std::string heap allocations
- Stores event type strings in flash (ESP32) or rodata (ESP8266)
- **Breaking:** Loop variables must change from `const std::string &` to `const char *`
- **Breaking:** Comparisons must use `strcmp()` instead of `==` operator
- **Breaking:** get_event_types() returns `const FixedVector<const char *> &` instead of `std::set<std::string>`
- **Breaking:** `last_event_type` field now private - use `get_last_event_type()` getter (ensures pointer lifetime safety)
- Setter accepts initializer_list, FixedVector, or std::vector (same pattern as Select options)
- Initializer list syntax still works (no core components needed changes except web_server)
- Lookups changed from O(log n) tree traversal to O(n) linear search with strcmp (faster for typical 1-5 event types due to cache locality)

Blog post includes:
- Motivation: Event type memory footprint (std::set + std::string overhead for small datasets)
- Complete change from std::set<std::string> to FixedVector<const char *>
- Platform-specific benefits (ESP32 flash storage, ESP8266 rodata + no std::string overhead)
- Setter/getter signature changes (accepts initializer_list, FixedVector, or std::vector)
- Migration guide with strcmp examples
- FixedVector<const char *> benefits (single allocation, no reallocation overhead)
- Performance context for small datasets (1-5 items)
- Pointer lifetime safety with private last_event_type
- References to both PR #11463 (std::set → FixedVector<std::string>) and PR #11767 (FixedVector<const char *>)

**Files:**
- `docs/blog/posts/2025-11-07-event-entity-optimizations.md` - Blog post
- `docs/blog/.authors.yml` - Add bdraco author (since PRs #66, #67, #68, #69, #70 haven't merged yet)
