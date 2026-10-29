---
title: "Creating a pull request from a fork"
---

Only ESPHome maintainers can push branches to the ESPHome repositories, so everyone else contributes through a
**fork**: your own copy of the repository on GitHub. You push your work to a branch in your fork, then open a
**pull request (PR)** asking for that branch to be merged into the ESPHome repository.

This page walks through the whole process using the main [`esphome/esphome`](https://github.com/esphome/esphome)
repository as the example. The same steps work for the other ESPHome repositories; only the repository name and the
base branch change (see [choosing the base branch](#choosing-the-base-branch)).

## Create the fork

1. Sign in to [GitHub](https://github.com) with your **personal** account.
1. Go to the [ESPHome repository](https://github.com/esphome/esphome) and click the **Fork** button near the top
   right of the page.
1. Leave the owner set to your personal account and the repository name as `esphome`. Leaving **Copy the `dev`
   branch only** checked is fine; you will create your own branches from the upstream repository anyway.
1. Click **Create fork**.

You now have a repository at `https://github.com/YOUR_GITHUB_USERNAME/esphome`.

> [!IMPORTANT]
> Fork into your personal account, not a GitHub organization. Forks owned by an organization do not allow
> maintainers to push to the branch behind your PR. When a PR only needs a small change before it can be approved
> (such as a simple formatting fix in the docs), a maintainer will often make it directly rather than leaving a
> review, but they can't do that on an organization's fork.

You only need to create the fork once. Reuse it for all of your future PRs.

## Clone the fork

Clone your fork to your computer and add the ESPHome repository as a second remote called `upstream`:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/esphome.git
cd esphome
git remote add upstream https://github.com/esphome/esphome.git
```

You now have two remotes:

- `origin` is your fork. You push your branches here.
- `upstream` is the ESPHome repository. You fetch the latest changes from here, but you never push to it.

You can check this with `git remote -v`.

> [!TIP]
> If you use the [GitHub CLI](https://cli.github.com), `gh repo fork esphome/esphome --clone` creates the fork, clones
> it and sets up both remotes in one step.

From here, follow [Setting up a development environment](/contributing/development-environment) to run the setup
script and activate the virtual environment.

## Create a branch for your change

Every PR needs its own branch, created from the latest upstream code. Never commit to `dev` (or any other base branch)
in your fork; keeping it untouched means it can always be brought up to date cleanly.

```bash
git fetch upstream
git checkout -b my-new-feature upstream/dev
```

Give the branch a short name that describes the change, for example `fix-bme280-humidity` or `add-sht45`.

## Commit and push

Make your changes, test them, then commit:

```bash
git add path/to/changed/files
git commit -m "[bme280] Fix humidity reading when oversampling is disabled"
```

Push the branch to your fork. The `-u` option links your local branch to the branch in your fork so later pushes
only need `git push`:

```bash
git push -u origin my-new-feature
```

## Open the pull request

1. Go to your fork on GitHub. Right after a push, GitHub shows a banner offering to **Compare & pull request** for
   the branch you just pushed; click it. If the banner has gone, open the **Branches** page of your fork and click
   **New pull request** next to your branch.
1. Check the branches at the top of the page:
   - **base repository** must be `esphome/esphome` and **base** must be `dev`.
   - **head repository** must be your fork and **compare** must be your branch.
1. Give the PR a title that describes the change. For code changes, start it with the component name in square
   brackets, for example `[bme280] Fix humidity reading when oversampling is disabled`.
1. Fill in the PR template, following the rules in
   [submitting a pull request](/contributing/submitting-your-work#submitting-a-pull-request).
1. Make sure **Allow edits by maintainers** is checked.
1. Click **Create pull request**. If the PR [should be a draft](/contributing/submitting-your-work#submitting-a-pull-request),
   use the arrow next to the button to choose **Create draft pull request** instead.

With the GitHub CLI, `gh pr create --repo esphome/esphome --base dev` does the same from your terminal.

Then read [Submitting your work](/contributing/submitting-your-work) to find out what happens next: the automated
checks, how review works and how to keep your PR moving.

## Update your PR

To respond to review comments or fix a failing check, commit to the same branch and push again:

```bash
git add path/to/changed/files
git commit -m "Address review comments"
git push
```

The PR updates automatically; don't open a new one. Add new commits rather than rewriting the ones already pushed;
see [updating your branches](/contributing/submitting-your-work#updating-your-branches) for how to bring in newer
upstream changes, and why you should [not force-push](/contributing/submitting-your-work#do-not-force-push).

## Start your next PR

When you start a new piece of work, go back to the latest upstream code and create a fresh branch, rather than
reusing the branch from a previous PR:

```bash
git fetch upstream
git checkout -b my-next-feature upstream/dev
```

Each PR should contain one change. Unrelated changes on the same branch end up in the same PR, which makes it bigger
and slower to review.

## Choosing the base branch

The base branch is the branch your PR is merged into. It depends on the repository:

| Repository                                                                          | Base branch                                  |
|-------------------------------------------------------------------------------------|----------------------------------------------|
| [`esphome/esphome`](https://github.com/esphome/esphome)                             | `dev`                                        |
| [`esphome/esphome.io`](https://github.com/esphome/esphome.io)                       | `current` for fixes, `next` for new features |
| [`esphome/developers.esphome.io`](https://github.com/esphome/developers.esphome.io) | `main`                                       |

When the base branch is not `dev`, use it in place of `upstream/dev` when you create your branch, so your branch
starts from the code it will be merged into.
