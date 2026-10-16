---
title: "Using AI to create pull requests"
---

AI coding assistants can make contributing to ESPHome much easier, especially if you're new to the codebase, to C++
or to the GitHub workflow. We're happy to accept PRs written with AI help. What we can't accept is code that its
author doesn't understand: **you are responsible for everything in your PR**, however it was written, and you need to
be able to explain and defend every line of it in review.

## Recommended tool: Claude Code

Of the tools available today, we recommend [Claude Code](https://claude.com/claude-code). It runs in your terminal
(or in your editor) inside your local clone of the repository, so it can read the ESPHome codebase, follow the
existing conventions, run commands and make changes directly in your working tree.

You don't even need a development machine to use it. [Claude Code on the web](https://claude.ai/code) runs in your
browser and works on your GitHub fork in a cloud environment, where it can make changes, run the tests, push a branch
and open a PR for you. You'll still need real hardware to check that the change works on a device, but you can do
everything else from a browser.

It can walk you through the whole contribution process, not just the code. If you're unsure how to do something, ask
it; for example:

- "Help me fork esphome/esphome and set up a development environment."
- "Create a branch from upstream dev for a fix to the bme280 component."
- "Run the CI checks for the components I've changed and fix any failures."
- "Push this branch to my fork and open a draft PR against dev, filling in the PR template."

See [Creating a pull request from a fork](/contributing/forks-and-pull-requests) for the steps it will be carrying out.

## Check everything it produces

AI output looks convincing whether or not it is correct. Before you push, review the change as carefully as you would
review a PR from someone you don't know:

- Read every line of the diff and make sure you understand what it does and why.
- Build it and test it on real hardware. "It compiles" is not the same as "it works".
- Check it against the [codebase standards](/contributing/code#codebase-standards).
- Look for things you didn't ask for: unrelated changes, extra files, reformatted code or "improvements" outside the
  scope of your change. Remove them; they make the PR bigger and harder to review.
- Make sure the PR description describes what the change actually does, in your own words.

If a reviewer asks you why something was done a particular way, "the AI wrote it" is not an answer.

## Plan the work yourself; let the AI implement it

AI assistants are good at implementing a clear, specific instruction. They are **not** good at deciding the overall
strategy: which approach to take, how a component should be structured, how a large change should be split into
reviewable PRs, or whether a change fits where the project is heading. Left to decide for themselves, they tend to
produce changes that are larger and more complicated than necessary, or that solve a different problem from the one
you have.

So do the planning yourself, and give the assistant precise instructions:

- **Decide the approach first.** Read the relevant code and look at how similar components solve the same problem.
  For anything non-trivial, [talk to us on Discord](https://esphome.io/chat) in `#devs` before you start.
- **Break the work into small steps** and give them to the assistant one at a time. "Add a `humidity_offset` option
  to the bme280 sensor schema and apply it in `update()`" works much better than "improve the bme280 component".
- **Point it at examples.** "Implement this the same way the `sht4x` component handles heater settings" gives it a
  pattern to follow that reviewers already know.
- **Keep each PR small and focused**, as described in [Submitting your work](/contributing/submitting-your-work). An
  assistant will happily produce a 2000-line PR; that doesn't mean anyone can review it.

You can ask the assistant to suggest a plan, but treat its suggestion as a starting point to check, not a decision.

## Use it to write tests

Writing tests is one of the things AI assistants do best. Once your change is working, ask the assistant to write the
tests for it, such as C++ unit tests or Python tests that exercise the new behavior. Assistants are thorough at covering
edge cases and error paths that are tedious to write by hand.

They're also good at writing the [component test](/architecture/ci/component_tests) YAML files that every component
needs. Ask for test YAMLs that use every configuration option your change adds; the assistant can produce a file for
each platform, following the layout and naming used by the existing tests.

The same rule applies to tests as to any other code: read them, check that they test what they claim to test, and
make sure they fail when the code is wrong, not just pass when it's right.
