---
description: "Traditional Chinese (Taiwan) for the Web client, converted from the Simplified Chinese copy, for users who read Traditional Chinese and for maintainers of the language pack."
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-locale-zh-hant

English | [中文](README.zh.md)

## Summary

Install this Profile Bundle to read the Web client in Traditional Chinese with Taiwan phrasing. It adds a `zh-TW` language, labeled 繁體中文, to Settings → General → Language. The language ships no dictionaries: every text comes from the Simplified Chinese copy and is converted with OpenCC's Simplified-to-Taiwan phrase conversion, so every package that ships Chinese copy is covered without a second translation.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Install the package into a Profile, restart that Profile, and pick 繁體中文 in Settings → General → Language. A browser whose first matching language is `zh-TW` selects it on its own.

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-client-locale-zh-hant
```

The Bundle patch inserts one browser row, `locale-zh-hant`. Removing the package removes the language from the selector on the next Profile start, and an active selection falls back to the browser or default language.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`src/client/index.ts`](src/client/index.ts) registers the language through `ctx.locale.addLanguage()` with fallback `zh` and a `derive` rewrite. The locale service passes every text the language obtains from its fallback chain through that rewrite, so dictionaries registered before or after this plugin are converted alike. The rewrite uses the `opencc-js/cn2t` entry with `from: 'cn'` and `to: 'twp'` and memoizes each converted string. The node half is an empty Loader seat.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-client-locale](../locale/README.md) — language packs, fallback chains, and the `derive` rewrite this package supplies.
- [OpenCC](https://github.com/BYVoid/OpenCC) — the conversion dictionaries behind `opencc-js`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Conversion, not translation** — wording follows the Simplified Chinese copy; OpenCC substitutes characters and common Taiwan terms, but phrasing a Taiwan translator would choose differently stays as converted.
- **Browser copy only** — model-visible text, Host logs, and documentation keep their authored language.
- **Bundle size** — the Simplified-to-Traditional dictionaries add about a megabyte to this plugin's browser bundle.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The package owns one language registration whose lifetime is its plugin effect.
