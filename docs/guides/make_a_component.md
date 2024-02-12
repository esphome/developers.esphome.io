# Directory Structure

After you've :ref:`set up development environment <setup_dev_env>`, you will have a folder structure like this:

``` text
    esphome
    ├── __main__.py
    ├── automation.py
    ├── codegen.py
    ├── config_validation.py
    ├── components
    │   ├── __init__.py
    │   ├── dht12
    │   │   ├── __init__.py
    │   │   ├── dht12.cpp
    │   │   ├── dht12.h
    │   │   ├── sensor.py
    │   ├── restart
    │   │   ├── __init__.py
    │   │   ├── restart_switch.cpp
    │   │   ├── restart_switch.h
    │   │   ├── switch.py
    │  ...
```

As you can see, all components are in the "components" folder. Each component is in its own
subfolder which contains the Python code (.py) and the C++ code (.h and .cpp).

Suppose the user types in the following:


``` yaml
    hello1:

    sensor:
      - platform: hello2
```

In both cases, ESPHome will automatically look for corresponding entries in the "components"
folder and find the directory with the given name. For example the first entry will make ESPHome
look at the ``esphome/components/hello1/__init__.py`` file and the second entry will result in
``esphome/components/hello2/sensor/__init__.py`` or ``esphome/components/hello2/sensor.py``.

Let's leave what's written in those files for [python scripts], but for now you should also know that
whenever a component is loaded, all the C++ source files in the folder of the component
are automatically copied into the generated PlatformIO project. So you just need to add the C++
source files in the folder and the ESPHome core will copy them with no additional code required
by the integration developer.

.. note::
    For testing you can use :doc:`/components/external_components`.
