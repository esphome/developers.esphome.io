# Setting up a development environment

In order to develop ESPHome itself, or new ESPHome components, you will need to set up a development environment. This
guide will walk you through these steps.

## Developing with a Python virtual environment

*Note: These instructions apply for Linux and macOS. Windows users can still develop ESPHome and its components,
but the process is slightly different and not covered (yet) in this guide.*

### Requirements

- Python 3.12 or newer
- `pip` (Python package manager)

### Using `git` and GitHub

All of ESPHome's code and documentation is hosted on [GitHub](https://github.com); we use this to collaborate on all
changes. As a deep-dive into how `git` and [GitHub](https://github.com) works is beyond the scope of this
documentation, we'll assume that you're already familiar with these tools and just walk through the basic steps
required to get started.

If you're not familiar with `git` and/or [GitHub](https://github.com) or if you'd just like more detail on any of the
steps that follow, you should read through the
[GitHub documentation](https://docs.github.com/en). While there's a lot there (and it's consequently probably a bit
daunting), if you just want to submit your own work to ESPHome, we might suggest you start
[here](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo).

### Set up the local repository

First you will need a "Fork" of the ESPHome repository. You can do this by visiting the
[ESPHome repository](https://github.com/esphome/esphome), clicking the **Fork** button and following the instructions
on GitHub to complete the fork.

Once the fork is created, you can clone the repository to your local machine:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/NAME_OF_FORK.git
cd NAME_OF_FORK
git remote add updtream https://github.com/esphome/esphome.git
```

Once the local clone is set up, you can now run the setup script.

```bash
script/setup
```

This will create a Python virtual environment and install the requirements.

### Activating the virtual environment

To use the virtual environment, you need to activate it. This needs to be done for each new terminal session and is
done by running:

```bash
source venv/bin/activate
```

Then ESPHome can be run directly from that terminal:

```bash
esphome compile some-config-file.yaml
```

At this point, it is also good to create an empty directory named `config`. You should store all of your ESPHome
configurations in this directory.

This folder is listed in the ESPHome `.gitignore` file, so it will not be added to git.

### Creating your own working branch

Always do your work in a new branch created from the latest ESPHome upstream `dev` branch; do not commit changes
directly to the `dev` branch.

```bash
git checkout dev
git pull upstream dev

git checkout -b my-new-feature
```

This branch should contain your work for this new feature.

After you've run the above commands, you're ready to make (and test!) your changes. Once you're satisfied with your
changes, it's time to stage and commit them:

```bash
git add .
git commit -m "Look mom, I'm contributing to ESPHome!"
```

After you've committed your changes, you can push your branch up to your fork in GitHub:

```bash
git push -u origin my-new-feature
```

Once you've pushed your branch, if you wish, you can
[submit your work for integration into ESPHome](submitting-your-work.md).