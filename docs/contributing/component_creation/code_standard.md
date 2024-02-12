# Codebase Standards

Standard for the esphome-core codebase:

- The C++ code style is based on the
  [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html) with a few modifications.

  - function, method and variable names are ``lower_snake_case``
  - class/struct/enum names should be ``UpperCamelCase``
  - constants should be ``UPPER_SNAKE_CASE``
  - fields should be ``protected`` and ``lower_snake_case_with_trailing_underscore_`` (DO NOT use private)
  - It's preferred to use long variable/function names over short and non-descriptive ones.
  - All uses of class members and member functions should be prefixed with
    ``this->`` to distinguish them from global functions in code review.
  - Use two spaces, not tabs.
  - Using ``#define`` s is discouraged and should be replaced with constants.
  - Use ``using type_t = int;`` instead of ``typedef int type_t;``

- New components should dump their configuration using ``ESP_LOGCONFIG``
  at startup in ``dump_config()``
- ESPHome uses a unified formatting tool for all source files (but this tool can be difficult to install).
  When creating a new PR in GitHub, see the Github Actions output to see what formatting needs to be changed
  and what potential problems are detected.

- The number of external libraries should be kept to a minimum. If the component you're developing has a simple
  communication interface, please consider implementing the library natively in ESPHome.

  - This depends on the communication interface of course - if the library is directly working
    with pins or doesn't do any I/O itself, it's ok. However if it's something like I²C, then ESPHome's
    own communication abstractions should be used. Especially if the library accesses a global variable/state
    like ``Wire`` there's a problem because then the component may not modular (i.e. not possible
    to create two instances of a component on one ESP)

- Integrations **must** use the provided abstractions like ``Sensor``, ``Switch`` etc.
  Integration should specifically **not** directly access other components like for example
  publish to MQTT topics.

- Implementations for new devices should contain reference links for the datasheet and other sample
  implementations.
- Please test your changes :)

.. note::
    You can also run the lint and Github Actions checks through a docker image:

    ``` bash
        # Full lint+test suite
        docker run --rm -v "${PWD}/":/esphome -it ghcr.io/esphome/esphome-lint script/fulltest

        # Run lint only over changed files
        docker run --rm -v "${PWD}/":/esphome -it ghcr.io/esphome/esphome-lint script/quicklint
    ```

    If you are using Windows and have docker installed the syntax is slightly different.
    If you have cloned esphome to ``c:\edev\esphome`` the volume format is ``c/edev/esphome``

    ``` bash
        # convert the volume format
        $current_dir=(Get-Location).Path.ToLower().Replace(':','').Replace('\','/')
        # Run lint only over changed files from powershell
        docker run --rm -v "$($current_dir):/esphome" -it ghcr.io/esphome/esphome-lint script/quicklint
  	```
    