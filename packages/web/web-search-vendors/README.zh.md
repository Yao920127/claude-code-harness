---
description: "ctx.web 的模型廠商原生網頁搜尋提供者：部署如何選擇 Claude API、OpenAI、xAI、Gemini、OpenRouter、Mistral 或 Z.AI 回答網頁搜尋。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-vendors

[English](README.md) | 中文

## 概述

藉助 `dsh-web-search-vendors`，harness 可以透過七家模型廠商的原生搜尋回答網頁搜尋：Claude API 的 `web_search` 伺服器端工具、OpenAI 與 xAI Responses API 的 `web_search` 工具、Gemini 的 Google 搜尋落實（grounding）、OpenRouter 的 `web` 外掛、Mistral Conversations API 的 `web_search` 工具，以及 Z.AI 的網頁搜尋 API。部署想用自己的金鑰在這些廠商之間選擇時掛載它。每個提供者在每次搜尋時解析自己的金鑰，因此未設定的廠商只在被選中時失敗。面向模型的 `web_search` 工具位於 `dsh-tool-web`。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已載入 web 服務的組合中掛載本外掛，再用 web 服務的 `searchProvider` 選擇其中一個提供者。出廠的 base bundle 已掛載它；外掛頁的**搜尋來源**頁面可以更改選擇並儲存所選廠商的金鑰。

### 何時選擇

部署已持有某家廠商的金鑰，並偏好其搜尋索引、引用方式或價格時，選用本包中的對應提供者。若 Host 已登入 Claude Code 而沒有 Anthropic API 金鑰，改用 [`dsh-web-search-claude-code`](../web-search-claude-code/README.zh.md)。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: openai
- name: '@deepseek-ai/dsh-web-search-vendors'
```

| 提供者 id | 設定分割槽 | 預設金鑰引用 | 預設模型或引擎 | 廠商搜尋 |
|---|---|---|---|---|
| `claude-api` | `claude` | `ANTHROPIC_API_KEY` | `claude-opus-5` | Messages API `web_search_20260209` 伺服器端工具 |
| `openai` | `openai` | `OPENAI_API_KEY` | `gpt-6-astra` | Responses API `web_search` 工具 |
| `xai` | `xai` | `XAI_API_KEY` | `grok-4.7` | Responses API `web_search` 工具 |
| `gemini` | `gemini` | `GEMINI_API_KEY` | `gemini-3.8-flash` | 帶 `google_search` 的 `generateContent` |
| `openrouter` | `openrouter` | `OPENROUTER_API_KEY` | `openrouter/auto` | 帶 `web` 外掛的 chat completions |
| `mistral` | `mistral` | `MISTRAL_API_KEY` | `mistral-medium-latest` | Conversations API `web_search` 工具 |
| `zai` | `zai` | `ZAI_API_KEY` | `search-prime` | 獨立的網頁搜尋 API |

每個分割槽都接受 `apiKeyEnv`、`baseURL` 與 `model`；對 `zai` 而言，`model` 指定搜尋引擎。`claude` 分割槽另外接受 `toolType`（`web_search_20260209`，或供早於 Claude Opus 4.6 與 Sonnet 4.6 的模型使用的 `web_search_20250305`）、`maxUses` 與 `maxTokens`。組合了憑證服務時金鑰引用經由它解析，否則從啟動環境讀取。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-vendors)是所有欄位的完整來源。

### 搜尋返回什麼

模型廠商以 `content` 返回生成的回答，以 `sources` 返回其使用的頁面。來源保留廠商提供的標題；廠商把回答片段關聯到頁面時，該片段作為 `snippet`；Claude API 會把每條結果與其引用所摘錄的文字對應起來。Z.AI 只返回搜尋結果，不返回回答。來源按 URL 去重，web 服務再施加請求的 `maxResults`。

### 失敗與恢復

缺少金鑰時在發出任何請求前以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失敗。HTTP 錯誤、拒答、無法解析的回應體以及不含任何來源的回覆都以寫明廠商的 `WEB_PROVIDER_ERROR` 失敗；取消以 `WEB_ABORTED` 失敗。重定向不會聯絡目標就直接失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節說明提供者背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **一個廠商請求，一種對映。** 每個提供者只傳送一個廠商請求，並只對映該廠商文件說明的欄位；共享的憑證、取消與錯誤處理位於同一個基類。
- **不虛構來源。** 回覆不含任何可引用頁面時直接失敗，而不是隻返回回答文字，因為工具承諾返回來源。
- **經由 SDK 呼叫 Claude API。** Claude API 提供者使用官方 Anthropic SDK；伺服器端工具輪次暫停時最多續跑三次，再對映已收到的內容塊。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：各廠商設定分割槽、憑證解析、註冊提供者 |
| [`src/common.ts`](src/common.ts) | 提供者基類：金鑰解析、JSON 請求、取消與錯誤詞彙、來源輔助函式 |
| [`src/anthropic.ts`](src/anthropic.ts) | 基於 Anthropic SDK 的 Claude API 提供者 |
| [`src/vendors.ts`](src/vendors.ts) | OpenAI、xAI、Gemini、OpenRouter、Mistral 與 Z.AI 提供者 |
| — | 不釋出執行時不變數伴隨包；每個提供者在兩次搜尋之間不儲存狀態，因此不存在可能分歧的獨立觀察。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [Web 包地圖](../README.zh.md)——每個搜尋與抓取提供者及其職責。
- [dsh-web](../web/README.zh.md)——提供者選擇與即時生效的 `searchProvider` 設定。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染這些來源的面向模型的 `web_search` 工具。
- [多廠商搜尋決策](../../../.agents/notes/implemented/feature/2026-09-26-multi-vendor-web-search.zh.md)——為什麼是這些廠商，以及為什麼不單獨記錄搜尋請求。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，經由 `dsh-tool-web`：它保留本提供者受 `maxResults` 限制的回答文字、URL、標題與片段，或把 `<vendor> search failed: <error>`、`<vendor> API error (HTTP <status>) from <url>: <body>`、`<vendor> returned no web sources; the request may not have triggered web search` 與 `<vendor> search aborted` 失敗包在消費方的錯誤包裝中。

#### KV Cache 影響

不直接造成失效；請求字首的變化由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **廠商請求不是 Session 事件。** 與 DeepSeek 提供者不同，這些提供者不記錄其輔助請求；模型傳送的查詢與收到的結果保留在工具呼叫與工具結果中。
- **不提供 Qwen、Groq 與 Kimi。** 它們的搜尋回應沒有本包無需猜測即可對映的、有文件說明的結構化來源列表。
- **設定頁只編輯提供者選擇與金鑰。** 端點、模型與工具限制屬於組合設定；外掛頁不編輯它們。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作備註——點選展開</summary>

本開發備註是給維護者的工作背景：未決問題與尚未確定的方向。它明確不具權威性——已釋出的行為、限制與理由位於上面各節及所連結的 Agent Note。

#### 後續：即時的廠商設定

把各廠商分割槽設為 volatile 後，外掛頁就能編輯模型與端點；按引用寫入金鑰的頁面屆時會讀取各分割槽的 `apiKeyEnv`，而不是出廠預設值。

</details>
