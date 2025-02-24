# Setting up a developement environment

In order to develop ESPHome itself, or new ESPHome components, you will need to set up a 
development environment. This guide will walk you through these steps.

## Developing with a Python virtual environment

*Note: These instructions apply for Linux and macOS. Windows users can still develop ESPHome and its components,
but the process is slightly different and not covered in this guide.*

### Requirements

- Python 3.12 or newer
- `pip` (Python package manager)

### Set up the local repository

First you will need a "Fork" of the ESPHome repository. You can do this by visiting 
the [ESPHome repository](https://github.com/esphome/esphome), clicking the **Fork** button 
and following the instructions on GitHub to complete the fork.

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

To use the virtual environment, you need to activate it. This needs to be
done for each new terminal session and is done by running:

```bash
source venv/bin/activate
```

Then ESPHome can be run directly from that terminal:

```bash
esphome compile some-config-file.yaml
```

At this stage, it is also good to create an empty `config` directory that will be used for 
your ESPHome configurations.

This folder is listed in the ESPHome `.gitignore` file, so it will not be added to git.

### Creating your own working branch

Always do your work in a new branch, created from the latest ESPHome upstream `dev` branch.

```bash
git checkout dev
git pull upstream dev

git checkout -b my-new-feature
```

This branch should contain your work for this new feature. Once you are done and have committed
your changes, you can push your branch and create a pull request to the ESPHome repository.

```bash
git push -u origin my-new-feature
```
