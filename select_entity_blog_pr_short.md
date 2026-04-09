## PR Title

`[blog] Add breaking change blog post for Select entity class optimizations`

## Summary

Adds blog post documenting breaking changes in Select entity class (esphome/esphome#11623 and esphome/esphome#11514).

**Breaking changes:**
- Options storage changed from `std::vector<std::string>` to `FixedVector<const char*>` (hard break)
- `.state` member deprecated, removed in 2026.5.0 (use `current_option()`)

Blog post includes complete migration guide, version guard examples, and grep commands for finding affected code.

Also includes `.authors.yml` update (bdraco) since esphome/developers.esphome.io#66 hasn't merged yet.
