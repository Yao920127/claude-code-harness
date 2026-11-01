---
description: "ctx.web 的 Perplexity 搜尋提供者：部署方如何掛載 OpenAI 相容的 Perplexity 搜尋，獲得生成答案與引用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-perplexity

[English](README.md) | 中文

## 概述

有了 `dsh-web-search-perplexity`，harness 可以透過 Perplexity 搜尋 web，一次呼叫同時獲得模型生成的答案與可引用來源。當部署持有 Perplexity API 金鑰、並希望獲得生成答案時選擇它。Perplexity 沒有結果數量控制，因此返回的來源會在事後被截斷到請求的上限。Perplexity 省略結構化結果中繼資料時，來源退回為只含 URL 的引用。面向模型的 `web_search` 工具位於 `dsh-tool-web`。

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

在已載入 web 服務的組合中掛載本提供者；它以 `perplexity` 搜尋提供者身份註冊，因此當它是唯一可用的搜尋後端時，`ctx.web.search()` 會自動解析到它——也可以用 `searchProvider: perplexity` 固定。

### 何時選擇

當部署持有 Perplexity API 金鑰、並希望一次搜尋同時獲得模型生成的答案與可引用來源時選擇此後端。金鑰為空或端點基址無法解析時，提供者不可用——每次搜尋呼叫都會以結構化錯誤失敗。

### 最小設定

載入 web 服務與本提供者；API 金鑰退回到啟動環境中的 `$PERPLEXITY_API_KEY`，其餘設定都有安全預設值。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-perplexity'
  config:
    apiKey: !!js process.env.PERPLEXITY_API_KEY
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `apiKey` | `$PERPLEXITY_API_KEY` | Perplexity API 金鑰；為空或缺失時提供者不可用 |
| `baseURL` | `https://api.perplexity.ai` | 端點基址；追加 `/chat/completions`。無法解析時提供者不可用 |
| `model` | `sonar` | 搜尋模型名稱 |
| `maxTokens` | `1024` | 生成答案 token 上限（`max_tokens`）；必須是正整數 |
| `searchRecency` | （未設定） | 以 `search_recency_filter` 傳送的新近程度視窗：`day`、`week`、`month` 或 `year`。未設定時不傳送過濾條件 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-perplexity)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 搜尋返回什麼

`content` 攜帶 Perplexity 的生成答案。`sources[]` 優先使用結構化 `search_results[]`（`url`、`title`、`snippet`、`publishedAt` 取自 `date`），僅當 `search_results` 缺失時才退回到只含 URL 的 `citations[]` 陣列——這正是服務上 `title`／`snippet`／`publishedAt` 為可選欄位的原因。Perplexity 不公開結果數量控制，因此服務透過截斷並標記來強制執行 `maxResults`。

### 失敗與恢復

提供者失敗——HTTP 錯誤、網路失敗、回應體無法解析或結構不符——以 `WebError` `WEB_PROVIDER_ERROR` 呈現；中止請求以 `WEB_ABORTED` 呈現。HTTP 重定向會在存取 `Location` 指向的目標之前被拒絕，並以 `WEB_PROVIDER_ERROR` 呈現。呼叫方根據錯誤碼進行路由；面向模型的 `web_search` 工具會在自己的錯誤包裝層內把失敗呈現給模型。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋提供者背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該提供者是 Perplexity chat-completions 端點之上的薄介面卡，遵循兩條刻意的規則：

- **生成答案直接用作 `content`。** 與其他搜尋後端不同，Perplexity 返回模型生成的答案，本提供者將其作為規範化 `content` 欄位直接傳遞。
- **結構化來源優先；只含 URL 的引用是退回。** `search_results[]` 攜帶可移植欄位；`citations[]` 只攜帶 URL，服務詞彙把這些欄位設為可選，正是為了這種情況。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：設定 schema、環境變數退回、提供者註冊 |
| [`src/provider.ts`](src/provider.ts) | `PerplexitySearchProvider`：請求分發、中止分類、答案與來源對映 |
| [`src/types.ts`](src/types.ts) | chat-completions 回應的 Perplexity 協定型別 |
| — | 不釋出執行時不變數配套入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變資料關係。 |

### 請求與對映流程

`search()` 以 `redirect: 'error'` 把查詢連同模型、token 上限與可選新近程度過濾條件 POST 到 `{baseURL}/chat/completions`。回應的 `content` 變為 `content`；存在 `search_results[]` 時它變為 `sources[]`，否則每個 `citations[]` 條目變為只含 URL 的來源；服務在返回路徑上應用最終的 `maxResults` 上限。中止——名為 `AbortError` 的 `DOMException`——變為 `WEB_ABORTED`；其餘情況變為 `WEB_PROVIDER_ERROR`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞彙逐步進入服務、面向模型的工具與設計依據。

- [web 子系統](../../../docs/subsystems/web.zh.md)——窮盡式的搜尋請求／結果詞彙與錯誤碼。
- [web 包對映](../README.zh.md)——六包家族與各角色。
- [dsh-web](../web/README.zh.md)——本提供者註冊進入的 web 服務。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染本提供者來源的面向模型 `web_search` 工具。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-perplexity)——每個受支援設定欄位及其源宣告。
- [web 能力 seam 決策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜尋與抓取為何共用一項提供者選擇服務。

-----

<a id="model-experience"></a>
## 模型體驗

### 輔助 Perplexity 請求

#### 模型看到的內容

獨立的 Perplexity 模型透過 chat-completions 端點將 `<query>` 原樣作為唯一使用者訊息接收。該請求不屬於工作階段模型上下文。

#### Token 影響

每次搜尋都會產生獨立的提供者 token；`maxTokens` 限制生成答案。

#### KV Cache 影響

與工作階段請求快取相互獨立。同一模型路由下的相同查詢可能複用提供者快取；查詢或路由改變會建立不同字首。

### 間接的工作階段工具結果

#### 模型看到的內容

透過 `dsh-tool-web`，工作階段模型會看到生成答案及結構化結果中繼資料，或只含 URL 的引用。該提供者確切的錯誤訊息為 `Perplexity search aborted`、`Perplexity search request failed: <error>` 和 `Perplexity returned an unprocessable response body: <error>`；HTTP 失敗保留提供者訊息。錯誤包裝層屬於消費方。

#### Token 影響

註冊不會直接產生工作階段 token。答案與來源 token 取決於資料，來源數量受服務限制；保留的結果或錯誤會重複傳送，直到發生壓縮（compaction）。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提供者在哪些情況下不合適。它們是目前包約束。

- **引用退回來源只含 URL**——Perplexity 省略結構化 `search_results[]` 時，來源不含 `title`／`snippet`／`publishedAt`，因此工具只渲染純主機名標籤。
- **超量返回的來源仍會增加 token 消耗與延遲**——協定沒有結果數量控制，`maxResults` 只能由服務在事後截斷。
- **只公開 `model`／`maxTokens`／`searchRecency`**——Perplexity 的其他搜尋控制項（域名過濾條件、`web_search_options` 上下文大小、圖片）等待提供者無關的服務欄位（見 [seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)）。
- **按錯誤形狀分類中止**——只有名為 `AbortError` 的 `DOMException` 才對映為 `WEB_ABORTED`；攜帶自定義原因的中止（例如 `dsh-timeout` 的 `TimeoutReason`）呈現為 `WEB_PROVIDER_ERROR`。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和相關 Agent Note 為準。

#### 未來：更寬的 Perplexity 控制面

Perplexity 的域名過濾條件、`web_search_options` 上下文大小與圖片支援仍未公開。公開它們需要先有提供者無關的服務欄位，讓家族以一個協調一致的控制項、而非廠商專有參數的方式新增。

</details>
