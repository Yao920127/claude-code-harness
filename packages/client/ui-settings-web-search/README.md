---
description: "The search-provider settings page on the dsh web client's Plugins page: which provider answers web searches and the key it reads."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-web-search

English | [中文](README.zh.md)

## Summary

Open **Plugins** in the sidebar and select **Search provider** in the Official group to choose which provider answers web searches and to store the key that provider reads. The page stages what is typed and writes it only on save; the key is written through the credentials domain rather than the settings document, so its literal never rides a response. The page exists while the Host serves the `web` namespace.

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

The **Search provider** page lists every shipped provider; its first option returns to the composition default, and an overridden choice carries an **Overridden** badge with **Reset to default**. A provider that reads a stored key shows an **API key** control addressed by that provider's shipped reference, such as `OPENAI_API_KEY`, and one save writes both the choice and the key. The key starts blank on every load and reports only whether a key is configured; a blank draft keeps the stored key, and the control is disabled when the credential cannot be written from here. Exa and Perplexity read their keys from the launch environment and say so; Claude Code uses the host's sign-in and needs no key. Nothing is written until **Save**; leaving the page drops the drafts. The choice takes effect from the next search.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for. The browser half binds the `web` namespace through `ctx.configForms.get` and keeps the staged form in `SearchProviderCardController` over the shared `SettingsFormModel` of `ui-primitives`. It stages `searchProvider` and, as the form's one secret control, the key of the effective provider, whose reference comes from the shipped provider table in `search-providers.ts`: the write goes to `remote.credentials.set` under that reference, and success is read back from `remote.credentials.describe`, whose answer is dropped when the reference changed while it was in flight. The controller re-reads the credential when the scope changes and when the Host reports `credentials/reference-updated` for the watched reference, since a key written on the Models page changes no settings section. The page registers `SearchProviderCard` into the Plugins page's `plugins.item` slot through `ctx.configForms.whileServed`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-plugin-manager](../ui-plugin-manager/README.md) — the Plugins page and the `plugins.item` slot the page registers into.
- [ui-settings](../ui-settings/README.md) — the settings scope and the served-namespace watch the page rides.
- [ui-primitives](../ui-primitives/README.md) — the settings form model and fields the page renders.
- [credentials](../../credentials/README.md) — the credential-reference seam the key writes through.
- [web](../../web/web/README.md) — the web service that registers the `web` namespace and selects the search provider.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Provider-specific fields** — each provider's own namespace, such as the DeepSeek provider's endpoint and per-request search budget in `web-search-deepseek`, stays at its composed value and is changed in `cordis.yml`; the page edits only the provider choice and its key.
- **Runtime invariant:** No companion is published. The page holds no owned relationship of its own: what it shows derives from the settings mirror and the credentials domain, and what it writes the Host validates.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
