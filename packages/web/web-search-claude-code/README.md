---
description: "The Claude Code search provider for ctx.web: how a host with a signed-in Claude Code installation answers web searches without an API key."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-claude-code

English | [中文](README.zh.md)

## Summary

With `dsh-web-search-claude-code`, the harness answers web searches through Claude Code's built-in `WebSearch` tool, using the host's own Claude Code sign-in instead of an API key. Each search runs one Claude Code query whose only tool is `WebSearch` and whose answer is structured output listing the pages used. Choose it when the host has Claude Code installed and signed in; the CCH bundle selects it by default. The model-facing `web_search` tool lives in `dsh-tool-web`.

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

Mount the provider in a composition that loads the web and subprocess services; it registers as the `claude-code` search provider. Select it with the web service's `searchProvider`, or on the Plugins page's **Search provider** page.

### When to choose it

Choose this provider when the host's Claude Code sign-in should pay for searches and no vendor key is configured. Choose a provider from [`dsh-web-search-vendors`](../web-search-vendors/README.md) when a deployment holds a vendor API key or runs where Claude Code is not signed in.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: claude-code
- name: '@deepseek-ai/dsh-web-search-claude-code'
```

| Field | Default | Meaning |
|---|---|---|
| `model` | empty | Claude Code model; empty uses the model the host's Claude Code settings select |
| `maxTurns` | `4` | Maximum agent turns for one search |
| `env` | `{}` | Extra environment variables for the Claude Code process |
| `disposeGraceMs` | `3000` | Grace period before the process tree is force-killed at release |

### What a search returns

The answer becomes `content`, and each listed page becomes a source with its URL, title, and supporting passage. Sources with an unparseable URL or a repeated URL are dropped; the web service applies the request's `maxResults`, which the prompt also states.

### Failures and recovery

A result other than success, a query that ends without a result, and process failures surface as `WEB_PROVIDER_ERROR`; a process failure message asks the user to sign in with the Claude Code CLI. Output without any valid source also fails. Cancellation stops the query and surfaces as `WEB_ABORTED`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the provider; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **The official product runs the search.** The provider starts the pinned Claude Code CLI through the Agent SDK instead of reading its stored sign-in, the same stance as the [Claude Code model route](../../llm/llm-claude-code/README.md).
- **Only `WebSearch` is available.** The query restricts the tool list and allows only that tool, so a search cannot edit files or run commands in the host's home directory.
- **Validate at the process boundary.** Structured output is checked field by field before it becomes a result.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema and provider registration |
| [`src/provider.ts`](src/provider.ts) | The provider: query options, process ownership, result validation |
| — | No runtime invariant companion is published; each search owns and releases its own process, so no independent observation can diverge. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Web package map](../README.md) — every search and fetch provider and its role.
- [dsh-subagent-claude-code](../../subagent/subagent-claude-code/README.md) — the process spawn and ownership this provider reuses.
- [Multi-vendor search decision](../../../.agents/notes/implemented/feature/2026-09-26-multi-vendor-web-search.md) — why Claude Code search exists beside the vendor providers.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which retains this provider's `maxResults`-bounded answer text, URLs, titles, and snippets, or its `Claude Code search failed: <error>. Sign in with the Claude Code CLI on the host, then retry.`, `Claude Code search ended without a result (<subtype>)`, `Claude Code search returned no web sources`, and `Claude Code search aborted` failures under the consumer's error wrapper.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Each search starts a Claude Code process.** Searches take longer than a direct API call and count against the signed-in account's usage.
- **The search request is not a Session event.** The query the model sent and the result it received stay in the tool call and tool result; Claude Code keeps no transcript of the search.
- **Offering the host's sign-in to other users of a hosted deployment requires Anthropic's approval**, as for the Claude Code model route.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and undecided directions. It is explicitly non-authoritative — shipped behavior, limits, and rationale live in the sections above and the linked Agent Notes.

#### Future: a reused process

A long-lived Claude Code process would remove per-search startup time, but would need its own idle and failure lifetime.

</details>
