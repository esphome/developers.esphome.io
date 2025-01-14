# ESPHome Core Architecture


- CONFIG_SCHEMA
  - voluptuous
- to_code
  - Called after all validation is done
  - Given config object for this component
- FINAL_VALIDATE_SCHEMA
  - Allows validation of this components configuration against any other config

- consts
  - AUTO_LOAD
    - List of strings of components
    - Can be a function returning a list of strings of components
  - DEPENDENCIES
    - list of strings of components
      - "sensor"
      - "adc.sensor" or "sensor.adc" - double check
  - CODEOWNERS
    - list of gh usernames
    - Run `script/build_codeowners.py` to update files after altering
  - MULTI_CONF
    - True / False / Number of instances allowed
  - MULTI_CONF_NO_DEFAULT
    - True / False
    - Allows a component to be auto loaded without an instance of configuration
