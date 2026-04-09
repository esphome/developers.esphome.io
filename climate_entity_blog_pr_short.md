## PR Title

`[blog] Add breaking change blog post for Climate entity class optimizations`

## Summary

Adds blog post documenting breaking changes in Climate entity class (esphome/esphome#11466 and esphome/esphome#11621).

**Breaking changes:**
- Enum trait storage changed from `std::set<EnumType>` to `FiniteSetMask` (~440 bytes heap saved per climate)
- Custom modes changed from `std::vector<std::string>` to `std::vector<const char*>` (~48 bytes per ClimateCall)
- Custom mode members now private, must use accessor methods and protected setters
- `add_supported_custom_*()` removed, use `set_supported_custom_*()` instead

Blog post includes complete migration guide, API compatibility notes, lifetime safety patterns, and grep commands.

Also includes `.authors.yml` update (bdraco) since esphome/developers.esphome.io#66 and esphome/developers.esphome.io#67 haven't merged yet.
