---
title: "Setting up a development environment"
---

You need a development environment if you wish to develop ESPHome -- new components or otherwise.

In short, ESPHome is set up to use a Python virtual environment.

This guide will walk you through the steps to set up an environment you can use for development.

> [!NOTE]
> The instructions that follow apply for Linux and macOS. Windows users can still develop ESPHome and its
> components, but the process is slightly different and covered at the bottom of this guide.

## Requirements

- Python 3.11 or newer
- `pip` (Python package manager)
- Familiarity with `git` and GitHub

> [!NOTE]
> ESPHome's code and documentation is hosted on [GitHub](https://github.com); we use this to collaborate on all
> changes.
>
> As a deep-dive into how `git` and [GitHub](https://github.com) works is beyond the scope of this documentation,
> we'll assume that you're already familiar with these tools and just walk through the basic steps required to get
> started.
>
> If you're not familiar with `git` and/or [GitHub](https://github.com) or if you'd just like more detail on any of
> the steps that follow, you should read through the
> [GitHub documentation](https://docs.github.com/en). While there's a lot there (and it's consequently probably a
> bit daunting), if you just want to submit your own work to ESPHome, we might suggest you start with the
> [Fork a repo guide](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo).

## Set up the local repository

Before you start, you need your own fork of the ESPHome repository cloned to your computer. Follow
[Creating a pull request from a fork](/contributing/forks-and-pull-requests) to create the fork, clone it and add the
`upstream` remote, then come back here.

## Run the `setup` script

Once the local clone is set up, you can now run the setup script.

Linux/macOS

```bash
script/setup
```

On Windows with python install manager:

```powershell
script\setup.bat
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
venv\Scripts\Activate.ps1
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

This folder is conveniently listed in the ESPHome `.gitignore` file, so it will not be added to git.

## Make your changes

You're now ready to make (and test!) your changes. Do your work on a new branch, then commit it, push it to your fork
and open a PR, as described in [Creating a pull request from a fork](/contributing/forks-and-pull-requests).

<details open>
<summary>Windows</summary>

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

- If `uv` is installed, which can be done using `pip install uv`, it massively simplifies the above process.
  UV automagically takes care of all the checks using just one command:

    ```bash
    uv pip install git+https://github.com/username/esphome.git@branch --system
    ```

    The `--system` flag is only necessary when running Python on Windows.

</details>
