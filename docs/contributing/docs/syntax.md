---

---

Syntax

* * *

Here's a quick RST primer:

Title hierarchy is based on order of occurrence, not on type of character used to underline it. This
documents establish the following character order for better consistency.

-   **Headers**: You can write titles like this:

    ```reStructuredText
        My Title
        ========
    ```

    and section headers like this:

    ```reStructuredText
        My Sub Section
        --------------
    ```

    and sub-section headers like this:

    ```reStructuredText
        My Sub-sub Section
        ******************
    ```

    .. note::

        The length of the bar below the text **must** match the title Text length.
        Also, titles should be in Title Case

-   **Links**: To create a link to an external resource (for example <https://www.google.com>), use
    ``\`Link text <link_url>\`__``. For example:

    ```reStructuredText
        `Google.com <https://www.google.com>`__
```


    [Google.com](<https://www.google.com>)

-   **References**: To reference another document, use the `:doc:` and `:ref:` roles (references are set up globally and can be used between documents):

    ```rreStructuredText
        .. _my-reference-label:

        Section to cross-reference
        --------------------------

        See :ref:`my-reference-label`, also see :doc:`/components/switch/gpio`.
        :doc:`Using custom text </components/switch/gpio>`.
    ```

    See :ref:`devices`, also see :doc:`/components/switch/gpio`.
    :doc:`Using custom text </components/switch/gpio>`.

-   **Inline code**: To have text appear `like this`, use double backticks:

    ```reStructuredText
    To have text appear ``like this``, use double backticks.
    ```

    To have text appear `like this`, use double backticks.

-   **Code blocks**: To show a sample configuration file, use the `code-block` directive:

    ```reStructuredText
    .. code-block:: yaml

        # Sample configuration entry
        switch:
            - platform: gpio
            name: "Relay #42"
            pin: GPIO13
    ```
    ```yaml

        # Sample configuration entry
        switch:
          - platform: gpio
            name: "Relay #42"
            pin: GPIO13
    ```
    .. note::

        Please note the empty line after the ``code-block`` directive. That is necessary.

-   **Images**: To show images, use the `figure` directive:

    ``` reStructuredText
    .. figure:: images/dashboard_states.png
        :align: center
        :width: 40.0%

        Optional figure caption.
    ```

    {{< figure src="images/dashboard_states.png" title="Optional figure caption." width="40%" >}}

    .. note::

        All images in the documentation need to be as small as possible to ensure
        fast page load times. For normal figures the maximum size should be at most
        about 1000x800 px or so. Additionally, please use online tools like
        https://tinypng.com/ or https://tinyjpg.com/ to further compress images.

-   **Notes and warnings**: You can create simple notes and warnings using the `note` and `warning`
    directives:

    ```rst
        .. note::

            This is a note.

        .. warning::

            This is a warning.
    ```

    .. note::

        This is a note.

    .. warning::

        This is a warning.

-   **Italic and boldface font families**: To _italicize_ text, use one asterisk around the text. To put
    **a strong emphasis** on a piece of text, put two asterisks around it.

    ```rst
        *This is italicized.* (A weird word...)
        **This is very important.**
    ```
    _This is italicized._ (A weird word...)
    **This is very important.**

-   **Ordered and unordered list**: The syntax for lists in RST is more or less the same as in Markdown:

    .. code-block:: rst

        - Unordered item

          - Unordered sub-item

        - Item with a very long text so that it does not fully fit in a single line and
          must be split up into multiple lines.

        1. Ordered item #1
        2. Ordered item #2

    -   Unordered item

        -   Unordered sub-item

    -   Item with a very long text so that it does not fully fit in a single line and
        must be split up into multiple lines.

    1.  Ordered item #1
    2.  Ordered item #2

-   **imgtable**: ESPHome uses a custom RST directive to show the table on the front page (see
    [index.rst](https://github.com/esphome/esphome-docs/blob/current/index.rst).
    New pages need to be added to the `imgtable` list. The syntax is CSV with <PAGE NAME>, <FILE NAME> (without RST),
    <IMAGE> (in top-level images/ directory), <COMMENT> (optional - short text to describe the component). The aspect ratio of these images should be 8:10 (or 10:8) but exceptions are possible.

    Because these images are served on the main page, they need to be compressed heavily. SVGs are preferred over JPGs
    and JPGs should be max. 300x300px.
    If you have imagemagick installed, you can use this command to convert the thumbnail:

    .. code-block:: bash

        convert -sampling-factor 4:2:0 -strip -interlace Plane -quality 80% -resize 300x300 in.jpg out.jpg

reStructured text can do a lot more than this, so if you're looking for a more complete guide
please have a look at the [Sphinx reStructuredText Primer](http://www.sphinx-doc.org/en/master/usage/restructuredtext/basics.html).
