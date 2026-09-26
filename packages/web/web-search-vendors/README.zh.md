---
description: "ctx.web 的模型厂商原生网页搜索提供方：部署如何选择 Claude API、OpenAI、xAI、Gemini、OpenRouter、Mistral 或 Z.AI 回答网页搜索。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-vendors

[English](README.md) | 中文

## 概述

借助 `dsh-web-search-vendors`，harness 可以通过七家模型厂商的原生搜索回答网页搜索：Claude API 的 `web_search` 服务端工具、OpenAI 与 xAI Responses API 的 `web_search` 工具、Gemini 的 Google 搜索落地（grounding）、OpenRouter 的 `web` 插件、Mistral Conversations API 的 `web_search` 工具，以及 Z.AI 的网页搜索 API。部署想用自己的密钥在这些厂商之间选择时挂载它。每个提供方在每次搜索时解析自己的密钥，因此未配置的厂商只在被选中时失败。面向模型的 `web_search` 工具位于 `dsh-tool-web`。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已加载 web 服务的组合中挂载本插件，再用 web 服务的 `searchProvider` 选择其中一个提供方。出厂的 base bundle 已挂载它；插件页的**搜索来源**页面可以更改选择并保存所选厂商的密钥。

### 何时选择

部署已持有某家厂商的密钥，并偏好其搜索索引、引用方式或价格时，选用本包中的对应提供方。若 Host 已登录 Claude Code 而没有 Anthropic API 密钥，改用 [`dsh-web-search-claude-code`](../web-search-claude-code/README.zh.md)。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: openai
- name: '@deepseek-ai/dsh-web-search-vendors'
```

| 提供方 id | 配置分区 | 默认密钥引用 | 默认模型或引擎 | 厂商搜索 |
|---|---|---|---|---|
| `claude-api` | `claude` | `ANTHROPIC_API_KEY` | `claude-opus-5` | Messages API `web_search_20260209` 服务端工具 |
| `openai` | `openai` | `OPENAI_API_KEY` | `gpt-6-astra` | Responses API `web_search` 工具 |
| `xai` | `xai` | `XAI_API_KEY` | `grok-4.7` | Responses API `web_search` 工具 |
| `gemini` | `gemini` | `GEMINI_API_KEY` | `gemini-3.8-flash` | 带 `google_search` 的 `generateContent` |
| `openrouter` | `openrouter` | `OPENROUTER_API_KEY` | `openrouter/auto` | 带 `web` 插件的 chat completions |
| `mistral` | `mistral` | `MISTRAL_API_KEY` | `mistral-medium-latest` | Conversations API `web_search` 工具 |
| `zai` | `zai` | `ZAI_API_KEY` | `search-prime` | 独立的网页搜索 API |

每个分区都接受 `apiKeyEnv`、`baseURL` 与 `model`；对 `zai` 而言，`model` 指定搜索引擎。`claude` 分区另外接受 `toolType`（`web_search_20260209`，或供早于 Claude Opus 4.6 与 Sonnet 4.6 的模型使用的 `web_search_20250305`）、`maxUses` 与 `maxTokens`。组合了凭据服务时密钥引用经由它解析，否则从启动环境读取。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-vendors)是所有字段的完整来源。

### 搜索返回什么

模型厂商以 `content` 返回生成的回答，以 `sources` 返回其使用的页面。来源保留厂商提供的标题；厂商把回答片段关联到页面时，该片段作为 `snippet`；Claude API 会把每条结果与其引用所摘录的文字对应起来。Z.AI 只返回搜索结果，不返回回答。来源按 URL 去重，web 服务再施加请求的 `maxResults`。

### 失败与恢复

缺少密钥时在发出任何请求前以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失败。HTTP 错误、拒答、无法解析的响应体以及不含任何来源的回复都以写明厂商的 `WEB_PROVIDER_ERROR` 失败；取消以 `WEB_ABORTED` 失败。重定向不会联系目标就直接失败。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明提供方背后的设计决策；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 设计理念

- **一个厂商请求，一种映射。** 每个提供方只发送一个厂商请求，并只映射该厂商文档说明的字段；共享的凭据、取消与错误处理位于同一个基类。
- **不虚构来源。** 回复不含任何可引用页面时直接失败，而不是只返回回答文字，因为工具承诺返回来源。
- **经由 SDK 调用 Claude API。** Claude API 提供方使用官方 Anthropic SDK；服务端工具轮次暂停时最多续跑三次，再映射已收到的内容块。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：各厂商配置分区、凭据解析、注册提供方 |
| [`src/common.ts`](src/common.ts) | 提供方基类：密钥解析、JSON 请求、取消与错误词汇、来源辅助函数 |
| [`src/anthropic.ts`](src/anthropic.ts) | 基于 Anthropic SDK 的 Claude API 提供方 |
| [`src/vendors.ts`](src/vendors.ts) | OpenAI、xAI、Gemini、OpenRouter、Mistral 与 Z.AI 提供方 |
| — | 不发布运行时不变量伴随包；每个提供方在两次搜索之间不保存状态，因此不存在可能分歧的独立观察。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Web 包地图](../README.zh.md)——每个搜索与抓取提供方及其职责。
- [dsh-web](../web/README.zh.md)——提供方选择与实时生效的 `searchProvider` 设置。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染这些来源的面向模型的 `web_search` 工具。
- [多厂商搜索决策](../../../.agents/notes/implemented/feature/2026-09-26-multi-vendor-web-search.zh.md)——为什么是这些厂商，以及为什么不单独记录搜索请求。

-----

<a id="model-experience"></a>
## 模型体验

间接地，经由 `dsh-tool-web`：它保留本提供方受 `maxResults` 限制的回答文字、URL、标题与片段，或把 `<vendor> search failed: <error>`、`<vendor> API error (HTTP <status>) from <url>: <body>`、`<vendor> returned no web sources; the request may not have triggered web search` 与 `<vendor> search aborted` 失败包在消费方的错误包装中。

#### KV Cache 影响

不直接造成失效；请求前缀的变化由上述消费方负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **厂商请求不是 Session 事件。** 与 DeepSeek 提供方不同，这些提供方不记录其辅助请求；模型发送的查询与收到的结果保留在工具调用与工具结果中。
- **不提供 Qwen、Groq 与 Kimi。** 它们的搜索响应没有本包无需猜测即可映射的、有文档说明的结构化来源列表。
- **设置页只编辑提供方选择与密钥。** 端点、模型与工具限制属于组合配置；插件页不编辑它们。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作备注——点击展开</summary>

本开发备注是给维护者的工作背景：未决问题与尚未确定的方向。它明确不具权威性——已发布的行为、限制与理由位于上面各节及所链接的 Agent Note。

#### 后续：实时的厂商设置

把各厂商分区设为 volatile 后，插件页就能编辑模型与端点；按引用写入密钥的页面届时会读取各分区的 `apiKeyEnv`，而不是出厂默认值。

</details>
