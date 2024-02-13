---
title: setup your local esphome environment
date: 2024-01-31T00:00:00.000Z
categories:
  - codebase

---
<!--more-->

Here you would find the steps to setup your local esphome environment.
For developing new features to ESPHome, you will first need to set up a development environment.
This is only possible for `pip` installs.

## Setting Up Development Environment

```bash
    # Clone repos
    git clone https://github.com/esphome/esphome.git
    git clone https://github.com/esphome/esphome-docs.git

    # Install ESPHome
    cd esphome/
    script/setup
    # Start a new feature branch
    git checkout -b my-new-feature
    cd ..
```

The environment is now ready for use, but you need to activate the Python virtual environment
every time you are using it.

```bash
# Activate venv
source venv/bin/activate
```

Now you can open ESPHome in your IDE of choice (mine is CLion) with the PlatformIO
addons (see PlatformIO docs for more info). Then develop the new feature with the
guidelines below.

All PRs are automatically checked for some basic formatting/code mistakes with Github Actions.
These checks _must_ pass for your PR to be mergeable.

## Setting Up Git Environment

ESPHome's code-base is hosted on GitHub, and contributing is done exclusively through
"Pull Requests" (PRs) in the GitHub interface. So you need to set up your git environment
first.

When you want to create a patch for ESPHome, first go to the repository you want to contribute to
(esphome, etc) and click fork in the top right corner. This will create
a fork of the repository that you can modify and create git branches on.

```bash
# Clone your fork
git clone https://github.com/<YOUR_GITHUB_USERNAME>/<REPO_NAME>.git
# For example: git clone https://github.com/OttoWinter/esphome.git

# To continue you now need to enter the directory you created above
cd <REPO_NAME>
# For example: cd esphome

# Add "upstream" remote
git remote add upstream https://github.com/esphome/<REPO_NAME>.git
# For example: git remote add upstream https://github.com/esphome/esphome.git

# For each patch, create a new branch from latest dev
git checkout dev
git pull upstream dev
git checkout -b <MY_NEW_FEATURE>
# For example: git checkout -b gpio-switch-fix

# Make your modifications, then commit changes with message describing changes
git add .
git commit -m "<COMMIT_MESSAGE>"
# For example: git commit -m "Fix GPIO Switch Not Turning Off Interlocked Switches"

# Upload changes
git push -u origin <BRANCH_NAME>
# For example: git push -u origin gpio-switch-fix
```

Then go to your repository fork in GitHub and wait for a create pull request message to show
up in the top (alternatively go to branches and create it from there). Fill out the
Pull Request template outlining your changes; if your PR is not ready to merge yet please
mark it as a draft PR in the dropdown of the green "create PR" button.

**Review Process:** ESPHome's code base tries to have a high code standard. At the bottom
of the Pull Request you will be able to see the "Github Actions" continuous integration check which
will automatically go through your patch and try to spot errors. If the CI check fails,
please see the Github Actions log and fix all errors that appear there. Only PRs that pass the automated
checks can be merged!

**Catching up with reality**: Sometimes other commits have been made to the same files
you edited. Then your changes need to be re-applied on top of the latest changes with
a "rebase". More info [here](https://developers.home-assistant.io/docs/en/development_catching_up.html).

```bash

    # Fetch the latest upstream changes and apply them
    git fetch upstream dev
    git rebase upstream/dev
```
