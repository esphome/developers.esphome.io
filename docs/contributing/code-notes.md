# Contributing to ESPHome -- important notes

## Delays in code

**Code in** `loop()`, `update()` **and** `setup()` **must not block**.

Methods like `delay()` should be avoided and **delays longer than 10 ms are not permitted**. Because ESPHome uses a
single-threaded loop for all components, if your component blocks, it will delay the whole loop, negatively impacting
other components. This can result in a variety of problems such as network connections being lost.

If your code **must** wait for something to happen (for example, your sensor requires hundreds of milliseconds to
initialize and/or take a reading), then you'll need to implement a state machine to facilitate this. For example, your
code can send the "take reading" command, return, and, when the next iteration of `loop()` or `update()` is called,
it then attempts to read back the measurement from the sensor.

`loop()` is called every 16 ms (assuming no other components delay this, which may happen from time to time) and
`update()` is called at an interval defined in the user configuration for the component, but only for
[`PollingComponent`](https://esphome.io/api/classesphome_1_1_polling_component).

For any [`Component`](https://esphome.io/api/classesphome_1_1_component) (which is nearly everything), the well-known
`set_timeout` method is also available; this can be a handy alternative to implementing a state machine.

## Custom components

*"I read that support for custom components was removed...so now what do I do???"*

ESPHome's "custom component" mechanism was a holdover from Home Assistant's feature by the same name. It existed before
[external components](https://esphome.io/components/external_components) and offered a way to "hack in" support for
devices which were not officially supported by ESPHome.

### Why were custom components removed?

There are several reasons for this change.

- Custom components are very fragile:
    - There is no validation. You can easily configure a custom component incorrectly and there will be no warning.
    - Types are not checked. You might incorrectly pass a variable of an incorrect type or unit to a custom component
      resulting in compiler errors, unexpected behavior and/or crashes.
    - Custom components are difficult to use. You have to manually copy all of the custom component's files into *just
      the right location* on your system or else you will receive compiler errors and the component won't work.
    - Custom components lack flexibility and almost always require C++ code changes when you want them to work even
      *slightly* differently than the original author intended/designed. For example, a simple change of input units
      (`cm` to `m`, for example) could require significant changes to the C++ code, depending on how the original
      author designed the custom component.

- [External components](https://esphome.io/components/external_components) initially require a bit more effort by the
  developer but are ultimately more robust and are easier to use and share:
    - Just like any other ESPHome component/platform:
        - They are configured entirely in YAML.
        - Their YAML configuration is validated.
    - They do not require the user to:
        - Manually copy files onto their system.
        - Touch/edit any C++ code.
    - They tend to be more flexible since they are configured in YAML (as opposed to editing C++ code to make changes).

### What's the difference?

Custom components are typically (more or less) just the [runtime](/architecture/overview/#runtime) part of an ESPHome component/platform. On
the other hand, [external components](https://esphome.io/components/external_components) are just like any other
ESPHome component -- the only difference is that they are *external* in the sense that they are not "officially" a part
of ESPHome.

In terms of implementation, custom components just lack the Python part of an ESPHome component, specifically:

- [Config Validation](/architecture/overview/#config-validation)
- [Code Generation](/architecture/overview/#code-generation)

As such, most custom components can be made into
[external components](https://esphome.io/components/external_components) simply by adding the required Python parts to
make the custom component into a proper, complete ESPHome component.

### What's next?

We encourage all custom component developers to extend their custom component(s) into proper
[external components](https://esphome.io/components/external_components); doing so will make your custom component
easier to share and use. As you do so, be sure to have a look at the the sections above as it walks through ESPHome
(component) architecture. In addition, it's often helpful to take a look at other, similar
[components](https://github.com/esphome/esphome/tree/dev/esphome/components) and adapt them to fit the needs of your
custom component. For common hardware devices such as [sensors](https://esphome.io/components/sensor/index), this is
often a reasonably trivial exercise and [we are happy to help you along!](https://discord.gg/KhAMKrd)
