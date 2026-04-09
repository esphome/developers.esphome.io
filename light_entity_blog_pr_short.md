## PR Title

`[blog] Add breaking change blog post for Light entity memory optimizations`

## Summary

Adds blog post documenting breaking changes in Light entity class (esphome/esphome#11487, esphome/esphome#11348).

**Breaking changes:**
- Effect name storage changed from `std::string` to `const char*` (saves string allocation overhead per effect) - **External components likely affected**
- Color mode storage changed from `std::set<ColorMode>` to `ColorModeMask` (uint16_t bitmask, 2 bytes; saves ~80 bytes base std::set overhead plus per-member overhead; much faster O(1) lookups) - **Mostly backward compatible** (ColorModeMask provides .count(), .insert(), .erase() for std::set compatibility; no core components needed changes; breaking edge case: explicitly passing std::set<ColorMode> to set_supported_color_modes() will fail)
- External components with custom effects must update constructors

Blog post includes motivation section explaining why these optimizations matter (ESP8266 ~40KB heap, light components commonly used, overhead multiplies across effects/modes), complete migration guide covering both changes, lifetime safety patterns for effect names, ColorModeMask usage details, and grep commands. Includes:
- Motivation: Light memory footprint impact on ESP8266 devices
- Effect constructor migration (std::string → const char*)
- ColorModeMask backward compatibility (.count(), .insert(), .erase() still work)
- Capability check improvements (manual loop → supports_color_capability())
- Iterator support for ColorModeMask

**Files:**
- `docs/blog/posts/2025-11-07-light-entity-optimizations.md` - Blog post
- `docs/blog/.authors.yml` - Add bdraco author (since PRs #66, #67, #68, #69 haven't merged yet)
