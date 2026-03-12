# Documenting Components

Components documents must be placed in the `content/components` folder. The file name must match the component name itself, i.e. the folder name
given inside ESPHome's component folder for the component.

The component folder has a folder for each platform e.g. `sensor`, `binary_sensor`, `output`, etc. Your component can be of one of these platforms
or it can actually implement many, there is no hard rule on where to put your document(s) in this case, of course if your component is only inside
the `sensor` platform, then place the file in that folder.

The first paragraph must be a simple description of the component, in the following paragraphs you can add technical information and link datasheets,
we prefer to link to manufacturers sources and do not allow linking to e-commerce sites.

After this information you can add a picture of the component, please do not use copyrighted material.

The next part is the example configuration, this should be titled:

```yaml
# Example configuration entry:

component:
  name: MY Component
  enable_pin: GPIOXX # Use GPIOXX and don't use a number
```

Do not add additional configuration not needed for the component, e.g. `esphome:` or `api:` section.

## Documenting properties

The properties should always be title with `Configuration variables:` string. It can be prefixed with `#` signs to denote a title but it is
not strictly needed.

Each property must be described in a `-` list. The property format should be:

```
- **property_name** (<required or optional>, <property type>, <templatable>): Property description.
  Defaults to `default value`.
```

- property_name must be an identifier as in the yaml key.
- required or optional are exactly `**Required**` (bold) or `*Optional*` italics.
- property type can be many options, like string, number, list, enum, float, etc. Can be omitted.
- templatable is the link to templatable docs, which is (TODO: Link here) and indicates the property accepts `!lambda` values.
- Defaults to `value`. Is the last sentence. It should always be specified for optional properties when the value is a scalar value.

### Nesting properties documentations

Some properties are itself a dictionary of values, these can be documented by indenting on the list of properties, following the same
property format.

### Documenting enums values

To document Enum values indent on the property description and add a list of the values. The Enum value should be `back-tick quoted`, e.g.

```
- **color** (*Optional*, enum): The preferred color for painting. Defaults to `RED`.

  - `RED`: Use the red color
  - `BLUE`: Use blue color
```

### Additional property information

After the list of properties, sometimes explaining a property in the list itself can be to complex, for those case you can add a title
with the property name in backticks ``` , e.g. `# ``on_boot ``` and below add a description of the property. You can also add here detail of
the property components in case of properties which are dictionaries.

## Documenting Actions and Conditions

Actions and conditions must be titled

`<component-name>.<action-name>` Action
or
`<component-name>.<condition-name>` Condition

After the title add a short description, can also add an example configuration entry and must add Configuration variables: if applies.
As an exception of this rule the actions and conditions which do not belong to a component, the component name is not used and is just
the action name, e.g. `if`, `and`, etc.

## Documenting complex components

When a component has platforms, e.g. it has a hub but it also is a sensor component (e.g. ads1115) you can document them in the same file.
There are specific titles that should be used to mainain consistency. After each title add a short description for the component

- Component/Hub
  Use this title to document a root component that your platform component needs to be configured, e.g. ads1115.
- `xxx` Component
  Replace `xxx` with your component name, this allows to document a component when the file and platform does not match the component name.
  This is ideal when a single document is made for different components.
- Over SPI and Over I2C
  Use these titles when you have a component and they are supporting `_spi` and/or `_i2c` versions, e.g. rc522. Usually those are documented in the same
  file but configuration slightly varies. Provide a different "Configuration variables:" for each component.
