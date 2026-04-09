# PR Summary

## Suggested Title

`[blog] Add breaking change blog post for action framework const ref optimization`

## What does this add?

Blog post documenting the breaking change in esphome/esphome#11704 where action/trigger/condition signatures were updated to use const references instead of pass-by-value.

External components with custom actions must update their method signatures (`void play(Ts... x)` → `void play(const Ts&... x)`). The change provides 83% fewer heap allocations in the automation execution path.

Blog post includes migration guide, compilation error examples, and a grep command to find code that needs updating.
