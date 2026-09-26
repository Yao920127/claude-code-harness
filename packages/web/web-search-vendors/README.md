---
description: "Model-vendor native web search providers for ctx.web: how deployments select the Claude API, OpenAI, xAI, Gemini, OpenRouter, Mistral, or Z.AI to answer web searches."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-vendors

English | [中文](README.zh.md)

## Summary

With `dsh-web-search-vendors`, the harness can answer web searches through the native search of seven model vendors: the Claude API `web_search` server tool, the OpenAI and xAI Responses API `web_search` tool, Gemini grounding with Google Search, the OpenRouter `web` plugin, the Mistral Conversations API `web_search` tool, and the Z.AI Web Search API. Mount it when a deployment wants to choose among these vendors with its own keys. Each provider resolves its key for every search, so an unconfigured vendor fails only when it is selected. The model-facing `web_search` tool lives in `dsh-tool-web`.

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

Mount the plugin in a composition that loads the web service, then select one of its providers with the web service's `searchProvider`. The shipped base bundle mounts it; the **Search provider** page on the Plugins page changes the selection and stores the selected vendor's key.

### When to choose it

Choose a provider from this package when a deployment already holds a key for that vendor and prefers its search index, citation style, or pricing. Choose [`dsh-web-search-claude-code`](../web-search-claude-code/README.md) instead when the host has a signed-in Claude Code installation and no Anthropic API key.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: openai
- name: '@deepseek-ai/dsh-web-search-vendors'
```

| Provider id | Config section | Default key reference | Default model or engine | Vendor search |
|---|---|---|---|---|
| `claude-api` | `claude` | `ANTHROPIC_API_KEY` | `claude-opus-5` | Messages API `web_search_20260209` server tool |
| `openai` | `openai` | `OPENAI_API_KEY` | `gpt-6-astra` | Responses API `web_search` tool |
| `xai` | `xai` | `XAI_API_KEY` | `grok-4.7` | Responses API `web_search` tool |
| `gemini` | `gemini` | `GEMINI_API_KEY` | `gemini-3.8-flash` | `generateContent` with `google_search` |
| `openrouter` | `openrouter` | `OPENROUTER_API_KEY` | `openrouter/auto` | Chat completions with the `web` plugin |
| `mistral` | `mistral` | `MISTRAL_API_KEY` | `mistral-medium-latest` | Conversations API `web_search` tool |
| `zai` | `zai` | `ZAI_API_KEY` | `search-prime` | Standalone Web Search API |

Every section accepts `apiKeyEnv`, `baseURL`, and `model`; for `zai`, `model` names the search engine. The `claude` section also accepts `toolType` (`web_search_20260209`, or `web_search_20250305` for models older than Claude Opus 4.6 and Sonnet 4.6), `maxUses`, and `maxTokens`. A key reference resolves through the credentials service when one is composed and through the launch environment otherwise. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-web-search-vendors) is the exhaustive source for every field.

### What a search returns

Model vendors return a generated answer as `content` and the pages they used as `sources`. Sources keep the vendor's title and, where the vendor links an answer passage to a page, that passage as `snippet`; the Claude API joins each result to the excerpt its citation quotes. Z.AI returns search results without an answer. Sources are unique by URL, and the web service applies the request's `maxResults`.

### Failures and recovery

A missing key surfaces as `WEB_PROVIDER_CREDENTIAL_MISSING` before any request. HTTP errors, refusals, unparseable bodies, and replies without any source surface as `WEB_PROVIDER_ERROR` naming the vendor; cancellation surfaces as `WEB_ABORTED`. Redirects fail without contacting the target.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the providers; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

- **One vendor request, one mapping.** Each provider sends one vendor request and maps only the fields that vendor documents; shared credential, cancellation, and error handling live in one base class.
- **No invented sources.** A reply without any citeable page fails instead of returning answer text alone, because the tool promises sources.
- **The Claude API through its SDK.** The Claude API provider uses the official Anthropic SDK; a paused server-tool turn is resumed up to three times before the arrived blocks are mapped.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: per-vendor config sections, credential resolution, provider registration |
| [`src/common.ts`](src/common.ts) | Base provider: key resolution, JSON dispatch, cancellation and error vocabulary, source helpers |
| [`src/anthropic.ts`](src/anthropic.ts) | Claude API provider over the Anthropic SDK |
| [`src/vendors.ts`](src/vendors.ts) | OpenAI, xAI, Gemini, OpenRouter, Mistral, and Z.AI providers |
| — | No runtime invariant companion is published; each provider is stateless between searches, so no independent observation can diverge. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Web package map](../README.md) — every search and fetch provider and its role.
- [dsh-web](../web/README.md) — provider selection and the live `searchProvider` setting.
- [dsh-tool-web](../tool-web/README.md) — the model-facing `web_search` tool that renders these sources.
- [Multi-vendor search decision](../../../.agents/notes/implemented/feature/2026-09-26-multi-vendor-web-search.md) — why these vendors, and why search requests are not logged separately.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which retains this provider's `maxResults`-bounded answer text, URLs, titles, and snippets, or its `<vendor> search failed: <error>`, `<vendor> API error (HTTP <status>) from <url>: <body>`, `<vendor> returned no web sources; the request may not have triggered web search`, and `<vendor> search aborted` failures under the consumer's error wrapper.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The vendor request is not a Session event.** Unlike the DeepSeek provider, these providers do not log their auxiliary request; the query the model sent and the result it received stay in the tool call and tool result.
- **Qwen, Groq, and Kimi are not offered.** Their search responses carry no documented structured source list this package can map without guessing.
- **Settings edit only the provider choice and the key.** Endpoints, models, and tool limits are composition configuration; the Plugins page does not edit them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and undecided directions. It is explicitly non-authoritative — shipped behavior, limits, and rationale live in the sections above and the linked Agent Notes.

#### Future: live vendor settings

Making the per-vendor sections volatile would let the Plugins page edit models and endpoints; the key-per-reference page would then read each section's `apiKeyEnv` instead of the shipped default.

</details>
