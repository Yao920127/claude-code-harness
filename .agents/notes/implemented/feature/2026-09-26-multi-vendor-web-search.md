# Agent Note: Multi-vendor web search

Status: implemented

English | [中文](2026-09-26-multi-vendor-web-search.zh.md)

## Problem

Shipped compositions mounted only the DeepSeek search provider, which needs a DeepSeek API key. A CCH installation that signs in through Claude Code and holds no DeepSeek key therefore had no working `web_search`, and users with keys for other model vendors could not use those vendors' search. The web service also read its selected provider once at startup, so no settings surface could switch providers.

## Decision

Two provider packages join the [web seam](../architecture/2026-06-24-web-capability-seam.md). [`dsh-web-search-claude-code`](../../../../packages/web/web-search-claude-code/README.md) runs one Claude Code query per search, with the host's sign-in, whose only tool is `WebSearch` and whose answer is JSON-schema structured output. [`dsh-web-search-vendors`](../../../../packages/web/web-search-vendors/README.md) registers the Claude API, OpenAI, xAI, Gemini, OpenRouter, Mistral, and Z.AI providers, each with its own credential reference resolved per search. The Claude API provider uses the official Anthropic SDK with the `web_search` server tool.

The base bundle mounts the vendor providers, Exa, and Perplexity beside DeepSeek and keeps DeepSeek selected. The CCH bundle mounts the Claude Code provider and selects it. `dsh-web`'s `searchProvider` is volatile and read at every search, so the new **Search provider** page on the Plugins page switches providers and stores the selected provider's key through the credentials domain without a restart.

## Alternatives considered

**One package per vendor.** Seven packages would repeat the same credential, cancellation, and error handling and seven README pairs for providers that differ only in one request and one mapping.

**Log each auxiliary vendor request as a Session event, as DeepSeek does.** Every vendor would add a durable event type, persistence-type review, and SDK expected outputs. The model-visible input is already the tool call's query, and the model-visible output is the tool result; Perplexity and Exa already follow this rule.

**Include Qwen, Groq, and Kimi.** Their search responses have no documented structured source list, so a mapping would guess at fields or return answer text without sources.

**Read Claude Code's stored sign-in and call the Messages API directly.** It would bypass the product whose sign-in it borrows; the [Claude Code model route](2026-09-25-claude-code-model-route.md) rejected the same shortcut.

## Consequences

Selecting a vendor without a stored key fails with `WEB_PROVIDER_CREDENTIAL_MISSING` naming the reference. The settings page knows each provider's shipped key reference, so a deployment that changes a vendor's `apiKeyEnv` must also store that key under the new reference. Claude Code searches start a process per search and count against the signed-in account. Vendor defaults for models and endpoints are composition configuration. Unit tests cover each vendor's request and mapping, credential and cancellation failures, proxy egress, the Claude Code query options and output validation, the live provider switch, and the settings page; a Loader composition test selects both new provider families through the shipped headless profile.
