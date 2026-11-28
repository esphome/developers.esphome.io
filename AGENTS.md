# Agent guide

Developer documentation for people writing ESPHome components. Pages are Markdown in `src/content/docs/`, built with
Astro Starlight.

## Where documentation goes

- A component's developer documentation lives on that component's page,
  `src/content/docs/architecture/components/<component>.md`, named after the ESPHome component (`uart.md`, `wifi.md`,
  `web_server_idf.md`). Add a `##` section to that page. Do not create a page for one class, helper or feature of a
  component, such as a base class in `uart`.
- Before writing, search for the class or function name (`grep -rn <name> src/content/docs`) and extend the section
  that already mentions it.
- Only a component that has no page yet gets a new one, named after the component and listed in the sidebar in
  `astro.config.mjs`, in the matching group: *Common hardware interfaces* for a bus, *Entity base classes* for an
  entity platform, otherwise with the other components.
- Topics that span components (automations, socket consumption, loop control in `advanced.md`) stay on their topic
  pages.
- Core helpers (`esphome/core`) go in `contributing/code.md`, next to the related helpers. The native API and logging
  have their own pages under `architecture/`. Neither goes under `components/`.

## Writing

- Check every claim against the merged code in `esphome/esphome`: names, types, defaults and limits.
- Plain English, short sentences, lines wrapped at 120 characters.
- Lead a section with what to call and a short real example, and end it with the release and PR that added it, as
  the existing sections do: "It is available in ESPHome 2026.12.0 and later (esphome/esphome#12345)."
- Fill in the pull request template. When the change documents an esphome pull request, link the two both ways.
