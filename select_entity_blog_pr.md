# PR Summary

## Suggested Title

`[blog] Add breaking change blog post for Select entity class optimizations`

## What does this add?

Blog post documenting the breaking changes in PRs #11623 and #11514 where the Select entity class was optimized for memory and performance:

**PR #11623 (Index-Based Operations):**
- Refactored Select to use indices internally instead of strings
- Deprecated the public `.state` member (6-month migration window until 2026.5.0)
- Added `current_option()` method to replace `.state` access
- Saves ~32 bytes per SelectCall operation immediately
- Will save ~28 bytes per Select instance after `.state` removal

**PR #11514 (Store Options in Flash):**
- Changed option storage from `std::vector<std::string>` to `FixedVector<const char*>`
- **Hard breaking change** - old `set_options(std::vector<std::string>)` API completely removed
- Saves 164-7428 bytes depending on number of select entities and options

External components with custom select entities must update their code. The blog post includes:
- Complete migration guide with before/after examples
- Guidance on supporting multiple ESPHome versions (where possible)
- Example of handling runtime-determined options (rare case)
- grep commands to find code that needs updating

This PR also includes the `.authors.yml` update (adding bdraco) since PR #66 hasn't merged yet.

## Files Changed
- `docs/blog/posts/2025-11-07-select-entity-index-operations.md` (new blog post)
- `docs/blog/.authors.yml` (add bdraco)
