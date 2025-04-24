![logo-docs](/images/logo-docs.svg)

# Contributing to `esphome-docs`

Our documentation can always be improved. We rely on contributions from our users to do so. If you notice an issue (for
example, spelling/grammar mistakes) or if you want to share your awesome new setup, we encourage you to submit a pull
request (PR).

The ESPHome documentation is built using [Sphinx](http://www.sphinx-doc.org) and uses
[reStructuredText](http://docutils.sourceforge.net/rst.html) for all source (`.rst`) files.

If you're not familiar with rST, see [rST syntax](#rst-syntax) for a quick primer.

## Documentation guidelines

- Use the English language (duh...)
- Documentation for any given component/platform should contain a **minimal** example for the component/platform.
  In the example, **do not include:**
    - Optional configuration variables
    - Dependent components (Instead, include a sentence explaining the dependency and a link to the dependency's
      documentation)
- Pin numbers used in examples should be the string `GPIOXX` -- not a specific pin number.
- If a component/platform is used exclusively/primarily on a single specific board (perhaps with dedicated pin
  numbers), a complete configuration for the component/platform on that specific board may be included as an example
  _at the end of the document._ This example must be clearly identified as being for that specific hardware and it may
  not replace the generic example configuration provided near the top of the document.
- An image is worth a thousand words; please use them wherever possible. Regardless, don't forget to optimize them so
  pages load quickly! You might try using [https://tinyjpg.com](https://tinyjpg.com) and/or
  [https://tinypng.com](https://tinypng.com).
- When using highly accurate, domain-specific terminology, be sure that it does not interfere with a new user's ability
  to understand the content.
- Be sure to target the correct **base branch** of the `esphome-docs` repository:
    - **Fixes/improvements** for documentation must target the `current` branch.
    - **New features** must target the `next` branch.
- **Create new branches in your fork** for each pull request; to avoid confusion (and other potential issues), do not
  make changes directly in the `next` and `current` branches in your fork.
- Wrap lines in all files at no more than 120 characters. This makes reviewing PRs faster and easier. Exceptions should
  be made only for lines which contain long links or other specific content/metadata that cannot be wrapped.

## Contributing changes via GitHub

This guide essentially goes over the same material found in
[GitHub's Editing files in another user's repository](https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files#editing-files-in-another-users-repository).
You may also find that page helpful to read.

At the bottom of each page in the docs, there is an "Edit this page on GitHub" link. Click this link and you'll see
something like this:

![A screenshot of an rST file opened in GitHub, with the edit button circled](/images/ghedit_1.png)

Click the edit button to start making changes. If you're unsure about syntax, see our [quick primer](#rst-syntax).

Once you've made your changes, give them a useful name and click "Propose changes". At this point, you've made the
changes to your own personal copy of the docs in GitHub, but you still need to submit them to us.

![The commit creation screen in GitHub, with the commit title and "Propose changes" button circled](/images/ghedit_2.png)

To do that, you need to create a "Pull request" (PR):

![The pull request prompt screen in GitHub with the "Create pull request" button circled](/images/ghedit_3.png)

Complete the pull request form, replacing the `[ ]` with `[x]` to indicate that you have followed the instructions.
**Note that there must be no spaces around the `x`** when you populate it.

![The pull request creation screen in GitHub with the "Create pull request" button circled](/images/ghedit_4.png)

After a few minutes, you'll see either a green check ✅ or a red ❌ next to your commit in your pull request:

![The pull request with a commit with a red x next to it](/images/ghedit_ci_failed.png)

If you see the red ❌, there is at least one error preventing your pull request from being fully processed. Click on the
❌, then click on "Details" next to the lint step to determine what's wrong with your change(s).

![Failed lint substep of build, with "details" link circled](/images/ghedit_ci_details.png)

![Log messages showing reason for failed build](/images/ghedit_ci_logs.png)

In this example, you need to go to line 136 of `pzemac.rst` and adjust the number of `===` so that it completely
underlines the section heading.

Once you make that change, the pull request will be tested & built again; ideally, this time where will be no remaining
errors. If, however, more errors are discovered, simply repeat the process above to correct them.

!!! note

    All tests must be passing before we will review (and merge) a pull request.

## Build

!!! note

    The easiest way is to use the [esphome-docs container image](https://ghcr.io/esphome/esphome-docs/):

    ```bash
    docker run --rm -v "${PWD}/":/workspaces/esphome-docs -p 8000:8000 -it ghcr.io/esphome/esphome-docs
    ```

    ...with `PWD` referring to the root of the `esphome-docs` git repository. Then, to see the preview, go to
    `<HOST_IP>:8000` in your browser.

    This way, you don't have to install the dependencies to build the documentation.

To check your documentation changes locally, you first need install Sphinx (with **Python 3**).

```bash
# in ESPHome-Docs repo:
pip install -r requirements.txt
```

Then, use the provided Makefile to build the changes and start a live-updating web server:

```bash
# Start web server on port 8000
make live-html
```

## rST syntax

Here's a quick RST primer:

Title hierarchy is based on order of occurrence, not on type of character used to underline it. For consistency, we
adhere to the following order:

### Headers

You can write titles like this:

```rst
My Title
========
```

and section headers like this:

```rst
My Section
----------
```

and sub-section headers like this:

```rst
My Sub-section
**************
```

and sub-sub-section headers like this:

```rst
My Sub-sub-section
^^^^^^^^^^^^^^^^^^
```

!!! note
    - The length of the bar below the text **must** match the title text length.
    - Section titles should use Title Case.

### Links

Create a link to an external resource (for example: https://www.google.com) like this:

```rst
`Google.com <https://www.google.com>`__
```

[Google.com](https://www.google.com)

!!! note
    Referral links are only permitted if they provide a direct benefit to the ESPHome project.
    This policy applies to all official ESPHome documentation and websites.

### References

To reference another document, use the `:doc:` and `:ref:` roles (references are set up globally
and can be used between documents):

```rst
.. _my-reference-label:

Section to cross-reference
--------------------------

See :ref:`my-reference-label`, also see :doc:`/components/switch/gpio`.
:doc:`Using custom text </components/switch/gpio>`.
```

See [Supported Microcontrollers](https://esphome.io/components/#devices), also see
[GPIO Switch](https://esphome.io/components/switch/gpio).
[Using custom text](https://esphome.io/components/switch/gpio).

### Inline code

To have text appear `like this`, use double backticks:

```rst
To have text appear ``like this``, use double backticks.
```

To have text appear `like this`, use double backticks.

### Code blocks

To show a sample configuration file, use the `code-block` directive:

```rst
.. code-block:: yaml

    # Sample configuration entry
    switch:
      - platform: gpio
        name: "Relay #42"
        pin: GPIOXX
```

```yaml
# Sample configuration entry
switch:
  - platform: gpio
    name: "Relay #42"
    pin: GPIOXX
```

!!! note
    Note that a blank line is *required* after every `code-block` directive.

### Collapsible section

To add a collapsible section, use the `collapse` directive:

```rst
.. collapse:: Details

    Something small enough to escape casual notice.
```

```rst
.. collapse:: A long code block

    .. code-block:: yaml

        # Sample configuration entry
        switch:
          - platform: gpio
            name: "Relay #42"
            pin: GPIOXX
```

The `:open:` flag can be used to have the section open by default.

```rst
.. collapse:: Open
    :open:

    This section is open by default.
```

!!! note
    - The `:open:` flag must immediately follow the `collapse` directive without a blank line between them.
    - A blank line is *required* after every `collapse` directive.

### Tabs

To group content into tabs, use the `tabs` directive. The tabs directive defines a tab set.
Basic tabs are added using the `tab` directive (without s), which takes the tab’s label as an argument:

```rst
.. tabs::

    .. tab:: Apples

        Apples are green, or sometimes red.

    .. tab:: Pears

        Pears are green.

    .. tab:: Oranges

        Oranges are orange.
```

Tabs can also be nested inside one another:

```rst
.. tabs::

    .. tab:: Stars

        .. tabs::

            .. tab:: The Sun

                The closest star to us.

            .. tab:: Proxima Centauri

                The second closest star to us.

            .. tab:: Polaris

                The North Star.

    .. tab:: Moons

        .. tabs::

            .. tab:: The Moon

                Orbits the Earth

            .. tab:: Titan

                Orbits Jupiter
```

!!! note
    - A blank line is *required* after every `tabs` directive.
    - The contents of each tab can be displayed by clicking on the tab that you wish to show.
      Clicking again on the tab that is currently open will hide its content, leaving only the tab set labels visible.
    - For advanced features like tab-groupings, refer to https://sphinx-tabs.readthedocs.io/en/latest/

### Images

Use the `figure` directive to display an image:

```rst
.. figure:: images/dashboard_states.png
    :align: center
    :width: 40.0%

    Optional figure caption.
```

!!! note
    All images in the documentation need to be as small as possible to minimize page load times. Typically, the
    maximum size should be roughly 1000x800 px or so. Additionally, please use online tools like
    [tinypng](https://tinypng.com) or [tinyjpg](https://tinyjpg.com) to further compress images.

### Notes and warnings

You can create simple notes and warnings using the `note` and `warning` directives:

```rst
.. note::

    This is a note.

.. warning::

    This is a warning.
```

!!! note
    This is a note.

!!! warning
    This is a warning.

### Italic and boldface font families

To *italicize* text, use one asterisk around the text. To put
**a strong emphasis** on a piece of text, put two asterisks around it.

```rst
*This is italicized.* (A weird word...)

**This is very important.**
```

*This is italicized.* (A weird word...)

**This is very important.**

### Ordered and unordered lists

The syntax for lists in RST is more or less the same as in Markdown:

```rst
- Unordered item

  - Unordered sub-item

- Item with a very long text so that it does not fully fit in a single line and
  must be split up into multiple lines.

1. Ordered item #1
2. Ordered item #2
```

- Unordered item

    - Unordered sub-item

- Item with a very long text so that it does not fully fit in a single line and
  must be split up into multiple lines.

1. Ordered item #1
1. Ordered item #2

### imgtable

ESPHome uses a custom RST directive to show the table on the main documentation page (see
[`components/index.rst`](https://github.com/esphome/esphome-docs/blob/current/components/index.rst)). New pages need to
be added to the `imgtable` list. The syntax is CSV with `<PAGE NAME>`, `<FILE NAME>` (without RST), `<IMAGE>` (in the
top-level `images/` directory), `<COMMENT>` (optional; short text to describe the component). The aspect ratio of these
images should be 8:10 (or 10:8) but exceptions are possible.

Because these images are served on the main page, they need to be compressed heavily. SVGs are preferred over JPGs
and JPGs should be no more than 300x300px.

If you have imagemagick installed, you can use this command to convert the thumbnail:

```bash
convert -sampling-factor 4:2:0 -strip -interlace Plane -quality 80% -resize 300x300 in.jpg out.jpg
```

reStructured text can do a lot more than this; if you're looking for a more complete guide, please have a look at the
[Sphinx reStructuredText Primer](http://www.sphinx-doc.org/en/master/usage/restructuredtext/basics.html).
