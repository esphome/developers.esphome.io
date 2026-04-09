# Breaking Changes Since 66263b40e That Need Blog Posts

Based on the new documentation criteria, the following PRs merged since commit 66263b40e1a9434e4dbc050cf201d586e1dd699b should have blog posts because they affect **core functionality, base entity classes, or components with global accessors**.

## Core Changes

### esphome/esphome#11704 - [core] Reduce action framework argument copies by 83%
**Commit:** 1446e7174ac96a7158d9d51fb21020e965d72873
**Why blog post:** Changes to core action framework that affects all automation actions
**Type:** Clean break (performance optimization requiring signature changes)

## Base Entity Class Changes - Select

### esphome/esphome#11623 - [select] Refactor to index-based operations
**Commit:** 6f7e54c3f3ba979eee8f4200a8b298a7dfd61b68
**Why blog post:** Significant changes to Select base entity class, changes public API
**Type:** With deprecation (6-month window, `.state` member deprecated)
**RAM Savings:** 28-32 bytes per Select instance
**Note:** This one has excellent deprecation documentation and migration guide

### esphome/esphome#11514 - [select] Store options in flash
**Commit:** f3634edc22a9c9e939c5bede697bad5aa89fef4d
**Why blog post:** Changes to Select base entity class storage
**Type:** Clean break (memory optimization)

## Base Entity Class Changes - Climate

### esphome/esphome#11466 - [climate] Replace std::set with FiniteSetMask
**Commit:** 7ed7e7ad262853dcd553b36fbc9844212f703d6a
**Why blog post:** Significant changes to Climate base entity class (already flagged in PR review)
**Type:** Clean break (cannot maintain backward compatibility with signature changes)
**Savings:** ~440 bytes heap + significant flash per climate entity
**Note:** Comprehensive migration guide in PR

### esphome/esphome#11621 - [climate] Replace std::vector<std::string> with const char*
**Commit:** 42833c85f5fd50313f7dcf965434508aeb030c67
**Why blog post:** Changes to Climate base entity class custom modes API
**Type:** Clean break (signature changes)

## Base Entity Class Changes - Fan

### esphome/esphome#11483 - [fan] Use std::vector for preset modes
**Commit:** 3f05fd82e50d43ec878939049a7ef10119571ad2
**Why blog post:** Changes to Fan base entity class preset mode storage
**Type:** Clean break (changes container type)

## Base Entity Class Changes - Light

### esphome/esphome#11487 - [light] Store effect names in flash
**Commit:** f2f6c597ef3768a37507acb5c4831ad7e858cf6f
**Why blog post:** Changes to Light base entity class effect storage
**Type:** Clean break (memory optimization)

### esphome/esphome#11348 - [light] Use bitmask instead of std::set for color modes
**Commit:** fdecda3d65a5474be4d9ccaf0ea3ee56f84548d2
**Why blog post:** Changes to Light base entity class color mode storage
**Type:** Clean break (signature changes)

## Base Entity Class Changes - Event

### esphome/esphome#11463 - [event] Replace std::set with FixedVector
**Commit:** 0de79ba29144a38ba4de245990dc033cc0cddd1c
**Why blog post:** Changes to Event base entity class storage
**Type:** Clean break (signature changes)

---

## Required Blog Posts

Each entity type and core change needs its own separate blog post:

### 1. **Select Entity Class Changes** (#11623, #11514) ✅ DONE ✅ SUBMITTED
- Index-based operations refactor
- Store options in flash
- Migration guide already excellent in PR #11623
- **Blog post:** `docs/blog/posts/2025-11-07-select-entity-index-operations.md`
- **PR summary:** `select_entity_blog_pr_short.md`
- **PR:** https://github.com/esphome/developers.esphome.io/pull/67

### 2. **Climate Entity Class Changes** (#11466, #11621) ✅ DONE
- Replace std::set with FiniteSetMask for trait storage
- Replace std::vector<std::string> with const char* for custom modes
- ~440 bytes heap savings per climate entity
- Migration guide already in PR #11466
- **Blog post:** `docs/blog/posts/2025-11-07-climate-entity-optimizations.md`
- **PR summary:** `climate_entity_blog_pr_short.md`
- **PR:** https://github.com/esphome/developers.esphome.io/pull/68

### 3. **Fan Entity Class Changes** (#11483) ✅ DONE
- Use std::vector for preset modes, preserve config order
- Container type change
- **Blog post:** `docs/blog/posts/2025-11-07-fan-entity-preset-modes.md`
- **PR summary:** `fan_entity_blog_pr_short.md`
- **PR:** https://github.com/esphome/developers.esphome.io/pull/69

### 4. **Light Entity Class Changes** (#11487, #11348) ✅ DONE ✅ SUBMITTED
- Store effect names in flash (const char*)
- Use bitmask (2 bytes) instead of std::set for color modes
- ~80 bytes base std::set overhead + per-member overhead savings
- Much faster O(1) lookups with bitmask
- **Blog post:** `docs/blog/posts/2025-11-07-light-entity-optimizations.md`
- **PR summary:** `light_entity_blog_pr_short.md`
- **PR:** https://github.com/esphome/developers.esphome.io/pull/70

### 5. **Event Entity Class Changes** (#11463) ✅ DONE
- Replace std::set<std::string> with std::vector<const char *> for event type storage (complete change in one release)
- Eliminates ~80 bytes std::set overhead + per-node overhead + std::string heap allocations
- Stores event type strings in flash (ESP32) or rodata (ESP8266)
- Setter accepts initializer_list or vector (same pattern as Climate custom modes)
- last_event_type moved to private with getter for pointer lifetime safety
- No intermediate step - goes directly to const char* to avoid two breaking changes
- **Blog post:** `docs/blog/posts/2025-11-07-event-entity-optimizations.md`
- **PR summary:** `event_entity_blog_pr_short.md`

### 6. **Core Action Framework Changes** (#11704) ✅ DONE
- Reduce action framework argument copies by 83%
- Affects all automation actions
- **Blog post:** `docs/blog/posts/2025-11-06-action-framework-const-ref.md`
- **PR summary:** `core_action_framework_blog_post_pr.md`
- **PR:** https://github.com/esphome/developers.esphome.io/pull/66

**Total: 6 blog posts needed (all complete)**

All are "mid-cycle" changes that will be in the next release.

**Note:** Event entity changes span two PRs in the same release (2025.11.0):
1. First PR (already merged): std::set<std::string> → FixedVector<std::string>
2. PR #11463 (this blog post): FixedVector<std::string> → std::vector<const char *>

External components migrate once from std::set<std::string> to std::vector<const char *>.

## Excluded (Already Announced)

### esphome/esphome#11591 - [core] Remove deprecated schema constants
**Reason:** Already announced in https://developers.esphome.io/blog/2025/05/14/_schema-deprecations/
**Type:** Removal of previously deprecated code (6-month deprecation period expired)
