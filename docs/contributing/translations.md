# Translating the ESPHome Device Builder

The ESPHome Device Builder (the web dashboard) is translated by the community using
[Lokalise](https://lokalise.com/), an online translation platform. You don't need to know how to code or how to use
Git to help — everything happens in your browser on Lokalise.

**[Join the ESPHome Device Builder translation project on Lokalise](https://app.lokalise.com/public/974668436a17ffd6803f51.79180045/)**

## How it works

The English strings are the single source of truth. They live in `src/translations/en.json` in the
[`esphome/device-builder-frontend`](https://github.com/esphome/device-builder-frontend) repository, and that is the
**only** translation file committed to the repository. Every other language lives in Lokalise.

The flow looks like this:

1. A developer adds or changes an English string in `en.json` and merges it to `main`.
2. CI automatically uploads the new and changed English source strings to Lokalise. Your translations in other
   languages are never touched — only the English base strings are updated, and new keys are added.
3. You (the translator) fill in or improve the translations for your language on Lokalise.
4. When a new release is built, the latest translations are downloaded from Lokalise and bundled into the released
   wheel.

This means your translations ship automatically: there's nothing to commit, no pull request to open, and no need to
wait for a maintainer to merge anything. Translations are pulled in at build time, so every release ships with the
latest copy from Lokalise.

!!! note

    You can contribute even if your language already shows as fully translated. Proofreading existing strings and
    voting on alternative phrasings is just as valuable as filling in blanks.

## Getting started

1. Click the link above to open the public ESPHome Device Builder project on Lokalise.
2. Sign in or create a free Lokalise account and join the project.
3. Pick your language and start translating. Lokalise shows you the English source string alongside an input box for
   your translation.

## Translation placeholders

Some strings contain placeholders wrapped in curly brackets, for example:

```text
Discovered {count} devices
Failed to ignore "{name}"
```

The text inside the curly brackets (`{count}`, `{name}`, etc.) is a **runtime argument** — the dashboard replaces it
with a live value when the string is shown. You **must** keep these placeholders exactly as they appear in the English
source and you must **not** translate the text inside them. You are free to move a placeholder to wherever it reads
naturally in your language.

```text
✅  Se descubrieron {count} dispositivos
❌  Se descubrieron {cantidad} dispositivos   (placeholder name was translated)
```

### Plurals

Plurals are handled inside a single string using [ICU MessageFormat](https://lokalise.com/blog/complete-guide-to-icu-message-format/#pluralization),
not with separate keys. A plural string looks like this:

```text
{count, plural, one {Discovered # device} other {Discovered # devices}}
```

The `{count, plural, …}` wrapper tells the dashboard to choose the wording that matches the value of `count`, and the
`#` is replaced with that number. Each branch (`one`, `other`, and so on) holds the text for one plural category.

Languages have different plural categories. English only needs `one` and `other`, but yours may need more — Polish, for
example, uses `one`, `few`, `many`, and `other`. Lokalise shows the categories your language requires and gives you an
input box for each one; fill in the wording that is correct for that category.

The old `_singular` / `_plural` key suffixes are no longer used.

## Rules

- **Only native speakers should submit translations.** A fluent, natural translation is far better than a literal one.
- **Don't translate proper nouns** such as *ESPHome*, *Home Assistant*, or *Wi-Fi*.
- **Keep placeholders intact.** Never translate or rename the text inside `{}` (see above).
- **Keep translations concise.** The dashboard UI has limited space; buttons and labels that grow too long may
  overflow or be truncated. Where possible, check that your translation fits.
- **Match the tone of the source.** The dashboard uses friendly, plain language — avoid overly formal or technical
  phrasing unless that's the norm for software in your language.

## Adding a new language

Adding a new language is **just a Lokalise change** — there is no code change required.

1. [Sign up for a free Lokalise account](https://app.lokalise.com/public/974668436a17ffd6803f51.79180045/) and join
   the project, then leave a comment tagging `@ESPHome` to request that your language be added.
2. Translate the strings. Be sure to fill in the two top-level keys that the language picker needs:
    - `language` — the language's own name (autonym), e.g. `Français`, `Deutsch`, `日本語`.
    - `flag` — a flag emoji to show next to it in the picker, e.g. `🇫🇷`.
3. The next release picks up the new language automatically, and it appears in the dashboard's language picker named
   and flagged — no code change needed.

!!! note

    Lokalise uses underscore-style locale codes (e.g. `zh_CN`); these are automatically converted to the BCP 47
    filenames the repository uses (e.g. `zh-CN.json`) when translations are downloaded. You don't need to worry about
    this as a translator.

## Thanks to Lokalise

Translations are managed with [Lokalise](https://lokalise.com/), who generously provide their localization platform to
the project free of charge. Thank you for supporting open source and helping bring the ESPHome Device Builder to more
people in their own language.
