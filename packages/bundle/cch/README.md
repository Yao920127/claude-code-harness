---
description: "The CCH (Claude Code Harness) profile bundle: Claude Code as the default model route with the Claude brand and Traditional Chinese, for users composing a CCH profile and for maintainers of the CCH Desktop build."
kind: "package-bundle"
---

# @deepseek-ai/dsh-cch

English | [中文](README.zh.md)

## Summary

Stack `dsh-cch` after `dsh-base` and `dsh-web-app` to make a profile a CCH profile: new Sessions start on the Claude Code model route, which signs in with the host's own Claude Code login, and the DeepSeek model routes, DeepSeek account settings, and official DeepSeek brand occupants stay unmounted. The bundle depends on [`dsh-llm-claude-code`](../../llm/llm-claude-code/README.md), [`dsh-client-locale-zh-hant`](../../client/locale-zh-hant/README.md), and [`dsh-client-ui-brand-claude`](../../client/ui-brand-claude/README.md); list those bundles before it. The CCH Desktop build lists all four in every new Desktop profile, and the shipped `cch` CLI profile composes the same list, so `pnpm cch web` serves the Web application Desktop shows.

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

Install the four CCH bundles into a Profile in this order, then restart it:

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-llm-claude-code @deepseek-ai/dsh-client-locale-zh-hant @deepseek-ai/dsh-client-ui-brand-claude @deepseek-ai/dsh-cch
```

| Row | Change |
|---|---|
| `agent-default-model` | Default model `claude-code` / `default`, the model your Claude Code settings select |
| `locale` | Interface language `zh-TW` (Traditional Chinese) until a language is chosen in Settings |
| `llm-deepseek`, `llm-deepseek-account` | Disabled, so the model selector lists only Claude models |
| `ui-brand-official` | Disabled, so the Claude brand occupies the sidebar in official builds |
| `ui-settings-account` | Disabled, so Settings offers no DeepSeek account sign-in |
| `workspace-controller` | Default Workspace under `<Documents>/claude-code-harness/default-workspace` |
| `web-search-claude-code` (inserted), `web` | Web search runs Claude Code's `WebSearch` with the same sign-in; the Plugins page's **Search provider** page selects another provider |
| `ui-sidebar-browser` | Enabled in every CCH profile, as on Desktop |

Your own settings, which the Web application saves to the profile patch, apply after this bundle and override these rows.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package's substance is [`cordis.patch.yml`](cordis.patch.yml), an id-targeted patch list over rows `dsh-base` and `dsh-web-app` insert; [`src/index.ts`](src/index.ts) carries no runtime API. A patch replaces a row's whole configuration, so the `agent-default-model` entry restates the complete selection.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-llm-claude-code](../../llm/llm-claude-code/README.md) — the Claude Code model route this bundle selects by default.
- [dsh-base](../base/README.md) — the core rows this bundle patches.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the Claude Code model route it selects, which owns that route's model-facing behavior.

#### KV Cache effect

The bundle itself adds no request prefix; the selected route owns any cache effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Existing Desktop profiles keep their bundle list** — only a Desktop profile created by the CCH build lists the CCH bundles; an older profile needs them added.
- **DeepSeek routes stay installed** — the rows are disabled, not removed, so re-enabling one in the profile patch restores it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The bundle is a patch list and owns no runtime relationship.
