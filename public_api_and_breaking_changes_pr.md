# PR Summary

## Suggested Title

`[docs] Add comprehensive Public API and Breaking Changes documentation`

## What does this implement/fix?

Adds a new comprehensive section to the contributing guide that documents ESPHome's public API contract and breaking change policy for both C++ and Python.

## Key Additions

**Public API Definitions:**
- **Components**: Only documented features at esphome.io are public API
- **Core/Base Entity Classes/API Component**: All `public` C++ members are public API (except API component methods exclusively called by Python codegen)
- **Python**: Only documented configuration schemas are public API

**Breaking Changes Policy:**
- 6-month deprecation window when possible
- Clean breaks allowed for signature changes, deep refactorings, and resource constraints
- Blog posts required for significant changes to core functions/entity classes
- PR description templates with migration guides

**Real-World Examples:**
- esphome/esphome#11623 (`select` refactor) - breaking change with deprecation period
- esphome/esphome#11466 (`climate` FiniteSetMask) - clean break due to signature changes

**Developer Guidance:**
- Complete deprecation process for both C++ and Python
- Breaking changes checklist
- Best practices with code examples
- When to write blog posts

## Why This Documentation

Clarifies the often-confusing question: "What is actually considered breaking?" Developers now have clear guidance on:
- When `public` C++ members can be changed freely (components) vs. when they can't (core/base entities)
- The difference between deprecation periods and clean breaks
- How to properly document breaking changes in PR descriptions
