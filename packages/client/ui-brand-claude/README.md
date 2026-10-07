---
description: "Claude brand occupants, page icon, and Claude palette and typography for the Web client, for users running Claude Code through the harness and for maintainers replacing brand presentation."
kind: "package-bundle"
---

# @deepseek-ai/dsh-client-ui-brand-claude

English | [中文](README.zh.md)

## Summary

Install this Profile Bundle to show the Claude mark and the name Claude Code in place of the shell's fish mark. It occupies the sidebar mark and name slots, shows an enlarged Claude mark alone in the blank-session hero with no headline text, points the page icon at the Claude mark, and applies Claude's colors and fonts while it is loaded. Choose it for a Profile that talks to Claude Code through [`dsh-llm-claude-code`](../../llm/llm-claude-code/README.md); the Claude mark is Anthropic's trademark, so a deployment offered to others needs Anthropic's permission to display it.

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

Install the package into a Profile and restart that Profile.

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-client-ui-brand-claude
```

The Bundle patch inserts one browser row, `ui-brand-claude`. The sidebar shows the Claude mark beside the name Claude Code, the new-Session hero shows the Claude mark beside the Claude Code tagline, and the browser tab shows the Claude mark as its icon. Removing the package returns every position to its previous occupant on the next Profile start. Do not also mount [`dsh-client-ui-brand-official`](../ui-brand-official/README.md) in an `official` build, because both occupy the same single-occupant sidebar slots.

While loaded, the package also restyles the whole Web client after Claude's design: a cream canvas and warm dark surfaces, coral primary buttons, switches, links, and focus rings, Inter body text, and EB Garamond for the hero tagline and Markdown headings h1 through h3. Settings → Appearance still chooses light, dark, or system; the Claude colors follow that choice. Chinese and other non-Latin text keeps the platform fonts.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`src/client/index.ts`](src/client/index.ts) registers the `brand.claude` dictionary, fills the two sidebar slots as one declaration-aware registration set, and fills `conversation.hero.brand.mark` (a 64px mark that replaces the host's requested size) and `conversation.hero.brand.headline` (an occupant that renders nothing, so the host's fallback headline stays hidden) as a second set. The page icon effect rewrites the `href` of every `link[rel~="icon"]` to an SVG data URL of the mark and restores each previous `href` on unload; runs without a document skip it. [`src/client/mark.ts`](src/client/mark.ts) holds the mark's path and color, and [`src/client/Brand.tsx`](src/client/Brand.tsx) renders the mark, the hero mark, the empty headline, and the translated name. The node half is an empty Loader seat.

[`src/client/theme.ts`](src/client/theme.ts) holds the Claude values as one `ctx.theme.overrideTokens` layer with a light and a dark value per token. It replaces the shared `neutral-bluish` scale with warm neutrals and the `deepseek` accent scale with coral, so component styles that read those scales directly change with the aliases; it also sets the brand, link, surface, and font tokens. The layer is removed on unload. [`src/fonts/fonts.css`](src/fonts/fonts.css) embeds the Latin subsets of Inter and EB Garamond from the same directory as data URIs, because client bundles inline stylesheets as text and the host serves no plugin font files; a test checks the embedded bytes against the `.woff2` files. The Desktop welcome window copies `eb-garamond-latin.woff2` instead, because its content security policy blocks data-URI fonts.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` and `conversation.hero.brand.headline` in the hero.
- [dsh-llm-claude-code](../../llm/llm-claude-code/README.md) — the Claude Code model route this brand accompanies.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.
- **The served icon files are unchanged** — the page icon changes after the client loads; the app manifest and the icon files the server sends still carry the previous mark.
- **Font coverage** — the embedded faces cover Latin text only; CJK text falls back to the platform fonts in both the body and the serif display stack.

- **Trademark** — the Claude mark belongs to Anthropic; displaying it in a deployment offered to others requires Anthropic's permission.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The package retains no mutable state beyond the icon links it restores, and its slot occupants, theme layer, and font stylesheet install and leave through plugin effects.
