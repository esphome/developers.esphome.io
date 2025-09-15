# Setting up a development environment

You need a development environment if you wish to develop ESPHome -- new components or otherwise.

In short, ESPHome is set up to use a Python virtual environment.

This guide will walk you through the steps to set up an environment you can use for development.

!!!note
    The instructions that follow apply for Linux and macOS. Windows users can still develop ESPHome and its
    components, but the process is slightly different and covered at the bottom of this guide.

## Requirements

- Python 3.10 or newer
- `pip` (Python package manager)
- Familiarity with `git` and GitHub

!!!note
    ESPHome's code and documentation is hosted on [GitHub](https://github.com); we use this to collaborate on all
    changes.

    As a deep-dive into how `git` and [GitHub](https://github.com) works is beyond the scope of this documentation,
    we'll assume that you're already familiar with these tools and just walk through the basic steps required to get
    started.

    If you're not familiar with `git` and/or [GitHub](https://github.com) or if you'd just like more detail on any of
    the steps that follow, you should read through the
    [GitHub documentation](https://docs.github.com/en). While there's a lot there (and it's consequently probably a
    bit daunting), if you just want to submit your own work to ESPHome, we might suggest you start
    [here](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo).

## Set up the local repository

First you will need a "Fork" of the ESPHome repository. You can do this by visiting the
[ESPHome repository](https://github.com/esphome/esphome), clicking the **Fork** button and following the instructions
on GitHub to complete the fork.

Once the fork is created, you can clone the repository to your local machine:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/NAME_OF_FORK.git
cd NAME_OF_FORK
git remote add upstream https://github.com/esphome/esphome.git
```

## Run the `setup` script

Once the local clone is set up, you can now run the setup script.

```bash
script/setup
```

This will create a Python virtual environment and install various other requirements.

## Activate the virtual environment

To use the virtual environment, you need to activate it. This needs to be done for each new terminal session and is
done by running:

Linux/macOS:
```bash
source venv/bin/activate
```
Windows (PowerShell):
```powershell
venv\Scripts\Activate
```

## Run `esphome`

With the virtual environment activated, ESPHome can be run directly from that terminal:

```bash
esphome compile some-config-file.yaml
```
...or:

```bash
esphome run some-config-file.yaml --device /dev/tty.your_usb_device
```

## Create your `config` directory

At this point, it is also good to create an empty directory named `config`. You should store all of your ESPHome
configurations in this directory.

This folder is listed in the ESPHome `.gitignore` file, so it will not be added to git.

## Create your own working branch

Always do your work in a new branch created from the latest ESPHome upstream `dev` branch; do not commit changes
directly to the `dev` branch.

```bash
git checkout dev
git pull upstream dev

git checkout -b my-new-feature
```

This branch should contain your work for this new feature.

After you've run the above commands, you're ready to make (and test!) your changes!

## Commit and push your work

Once you're satisfied with your changes, it's time to stage and commit them:

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

???+ Windows

    ## Testing Development Changes on Windows

    **In the examples below:**

    - `username` is your GitHub username.
    - `branch` is the branch name you've used for your work.

    **To test changes when using Windows:**

    - Create a branch in your remote fork of the main ESPHome GitHub repo
    - Install from your fork in the same manner you would
      [install ESPHome manually](https://esphome.io/guides/installing_esphome) but with one of the following commands:

        ```bash
        pip install --pre https://github.com/username/esphome/archive/branch.zip
        ```
        OR
        ```bash
        pip install git+https://github.com/username/esphome.git@branch
        ```

    - To test changes to the repo without modifying version numbers, a subsequent pip update can be performed using
      flags `--no-deps` along with `--force-reinstall` as follows:

        ```bash
        pip install git+https://github.com/username/esphome.git@branch --no-deps --force-reinstall
        ```

        This will ensure that pip only compiles and reinstalls ESPHome and not its dependencies.
