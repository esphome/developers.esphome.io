---
title: 'ESPHome Docs'
discription: 'One of the areas of ESPHome that can always be improved is the documentation.
If you see an issue somewhere, a spelling mistakes or if you want to share your awesome
setup, please feel free to submit a pull request.'
kind: section

weight: 1

menu:
  main:
    parent: contrib
    identifier: docs

---

## Contributing to ESPHome-Docs
The ESPHome documentation is built using `sphinx <http://www.sphinx-doc.org/>`** and uses
`reStructuredText <http://docutils.sourceforge.net/rst.html>`** for all source files.

If you're not familiar with writing rST, see :ref:`rst-syntax` for a quick refresher.


## Build

* * *

.. note::

>    The easiest way is to use the `esphome-docs container image <ghcr.io/esphome/esphome-docs/>`__:
>
>    ``` bash
>    docker run --rm -v "${PWD}/":/data/esphomedocs -p 8000:8000 -it ghcr.io/esphome/esphome-docs
>    ```
>    With ``PWD`` referring to the root of the ``esphome-docs`` git repository. Then go to ``<CONTAINER_IP>:8000`` in your browser.
>
>    This way, you don't have to install the dependencies to build the documentation.

To check your documentation changes locally, you first need install Sphinx (with **Python 3**).

``` bash
# in ESPHome-Docs repo:
pip install -r requirements.txt
```
Then, use the provided Makefile to build the changes and start a live-updating web server:

```bash
# Start web server on port 8000
make live-html
```

## Notes

Some notes about the docs:

-   Use the English language (duh...)
-   An image tells a thousand words, please use them wherever possible. But also don't forget to shrink them, for example
    I often use <https://tinypng.com/>
-   Try to use examples as often as possible (also while it's great to use highly accurate,
    and domain-specific lingo, it should not interfere with new users understanding the content)
-   Fixes/improvements for the docs themselves should go to the `current` branch of the
    esphomedocs repository. New features should be added against the `next` branch.
-   Always create new branches in your fork for each pull request.

.. \_rst-syntax:

