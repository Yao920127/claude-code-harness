---
description: "web 存取服務（ctx.web）：部署方與外掛作者如何透過可互換的提供者搜尋 web 與抓取 URL，以及統一的選擇策略與錯誤詞彙。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web

[English](README.md) | 中文

## 概述

使用 `dsh-web` 搜尋 web 或抓取 URL，而無需讓呼叫方依賴特定廠商。它為每項操作選擇可用後端，併為呼叫方提供一致的取消、錯誤和結果上限。在呼叫 `ctx.web.search()` 或 `ctx.web.fetch()` 的外掛或工具中選擇它；已交付的 `dsh-tool-web` 工具會為你載入它。搜尋或抓取需要已設定且可用的提供者，因為本包自身不發起網路請求。

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

需要 web 存取的組合會載入 `dsh-web` 服務並掛載至少一個後端——搜尋提供者和／或抓取提供者——外掛或工具作者隨後直接呼叫 `ctx.web.search()` 與 `ctx.web.fetch()`。服務會為每次呼叫解析後端，因此除非呼叫方設定了提供者 id，否則它們看不到提供者 id。

### 何時選擇

當外掛或工具必須搜尋或抓取、又不希望硬編碼廠商時選擇本服務；只使用已交付的 `web_search`／`web_fetch` 工具的組合會透過 `dsh-tool-web` 自動載入本服務。當組合從不存取 web 時，你不需要它。服務本身不增加任何網路存取能力：沒有至少一個可用提供者時，每次呼叫都會以結構化 `WebError` 失敗。

### 最小設定

載入服務並讓唯一掛載的後端自動選擇，或用 `searchProvider`／`fetchProvider` 固定提供者 id。環境變數 `$DSH_WEB_SEARCH_PROVIDER` 與 `$DSH_WEB_FETCH_PROVIDER` 提供相同欄位，不是另一條優先順序鏈。`searchProvider` 是即時設定：每次搜尋都讀取其目前值，因此寫入設定即可切換提供者而無需重新啟動。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-exa'
- name: '@deepseek-ai/dsh-web-fetch-http'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `searchProvider` | （未設定） | 固定的搜尋提供者 id；未設定時僅在恰好一個可用時自動選擇 |
| `fetchProvider` | （未設定） | 固定的抓取提供者 id；未設定時僅在恰好一個可用時自動選擇 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 搜尋與抓取

`search()` 執行一次查詢，返回可選的提供者答案與可引用的來源列表；服務強制執行 `request.maxResults`：截斷 `sources[]` 並設定 `truncated`。`fetch()` 取得一個 URL，返回其最終 URL、狀態碼、解碼後的正文與截斷標誌；非 2xx 回應是結果，不是錯誤。

```text
// Search the web; sources[] is capped to maxResults:
const result = await ctx.web.search({ query: 'deepseek harness', maxResults: 8 })

// Fetch one URL; a non-2xx response is a result, not an error:
const page = await ctx.web.fetch({ url: 'https://example.com' })
```

兩個呼叫都接受可選的 `AbortSignal`，用於把取消轉發給提供者。規範化的請求與結果形狀是呼叫方賴以建置的約定；[web 子系統](../../../docs/subsystems/web.zh.md) 參考中的詞彙章節對其有窮盡式描述。

### 提供者選擇

每次呼叫都在執行時解析提供者，註冊或載入順序從不影響結果。已設定的提供者 id 在已註冊且可用時優先；沒有設定 id 時，服務執行唯一可用的提供者，或在情況不明時明確失敗：

| 情況 | 結果 |
|---|---|
| 已設定 id 已註冊且可用 | 執行該提供者 |
| 已設定 id 未註冊 | `WEB_PROVIDER_CONFIGURED_MISSING` |
| 已設定 id 已註冊但不可用 | `WEB_PROVIDER_CONFIGURED_UNAVAILABLE` |
| 無 id，恰好一個已註冊的可用提供者 | 執行它 |
| 無 id，沒有可用提供者 | `WEB_PROVIDER_UNAVAILABLE` |
| 無 id，多個可用提供者 | `WEB_PROVIDER_AMBIGUOUS` |

提供者的可用性是一項廉價的區域性檢查——例如其 API 金鑰是否存在——並且從不發起網路呼叫，因此選擇保持快速且確定。

### 失敗與恢復

失敗丟擲 `WebError`，攜帶穩定、可按機器路由的 code；訊息補充細節，例如缺失的提供者 id 或歧義候選集合。呼叫方按 code 路由並決定如何降級。要改變一次呼叫使用的後端，請重新設定固定的 id、掛載或解除安裝提供者，或修正提供者設定使其可用性檢查透過。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包建立在一個刻意的分離之上：

- **一個 seam，兩個獨立操作。** 搜尋與抓取沒有共享請求 schema 或業務邏輯，但它們共用一個服務，使提供者選擇、取消、錯誤與產品設定只有一個歸屬方。並行的 `Search`／`Fetch` 方法對是有意為之。
- **選擇絕不依賴順序。** 能力要麼固定提供者 id，要麼在恰好註冊一個可用提供者時自動選擇；`search()`／`fetch()` 在執行時解析提供者。
- **服務擁有結果上限。** `maxResults` 由 seam 在提供者返回後強制執行，因此超量返回的提供者絕不可能洩漏超出呼叫方要求的來源。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`WebRuntime` 服務、兩個提供者註冊表與執行時選擇 |
| [`src/types.ts`](src/types.ts) | 詞彙：請求／結果型別、封閉的 `WebFetchBody` 聯合與 `WebError` 分類體系 |
| — | 不釋出執行時不變式配套項；提供者對映是私有資料，服務會在每次呼叫時執行提供者選擇並強制執行結果上限；該 seam 不釋出獨立註冊表，也不釋出請求／結果觀測流。 |

### 資料模型

請求與結果型別定義了呼叫方賴以建置的規範化詞彙——`Search` 請求／結果對與 `Fetch` 請求／結果對各一組——窮盡式欄位與 JSDoc 見 [`src/types.ts`](src/types.ts) 與 [web 子系統](../../../docs/subsystems/web.zh.md) 參考。兩個刻意的選擇塑造了它們：`WebFetchBody` 是這裡擁有的封閉聯合（`html` | `text`），因此新增型別會破壞編譯，直到每個消費方都處理它；`WebError` 繼承 `HarnessError`，攜帶開放的字串 `code`，因此消費方必須容忍提供者專有的取值。來源欄位保持可選，因為並非每個提供者都返回全部欄位。

### 選擇流程

執行時，服務先按設定 id、再按唯一可用提供者解析提供者，沒有明確贏家時丟擲對應的 `WebError`。搜尋結果隨後經過 `capSources`：把 `sources[]` 截斷到 `maxResults` 並標記 `truncated`。註冊基於 effect：提供者隨呼叫 fiber 註冊，fiber 釋放時登出；同一能力型別下重複的 id 會在註冊時被拒絕。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞彙逐步進入已交付後端、面向模型的工具與設計依據。

- [web 子系統](../../../docs/subsystems/web.zh.md)——窮盡式的搜尋／抓取請求與結果、提供者可用性與錯誤碼。
- [web 包對映](../README.zh.md)——六包家族與各角色。
- [dsh-tool-web](../tool-web/README.zh.md)——建置於本服務之上的面向模型 `web_search` 與 `web_fetch` 工具。
- [dsh-web-fetch-http](../web-fetch-http/README.zh.md)——已交付的匿名 HTTP(S) 抓取後端。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web)——每個受支援設定欄位及其源宣告。
- [web 能力 seam 決策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜尋與抓取為何共用一項提供者選擇服務。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，透過 `dsh-tool-web`：該工具把 seam 規範化的搜尋結果與抓取正文渲染給模型，而本服務不貢獻任何提示詞或 schema。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本服務單獨使用時在哪些方面不完整。它們是目前包約束。

- **沒有觀測介面**：沒有提供者變更事件或能力狀態查詢；可用性只能透過執行搜尋或抓取並按丟擲的 code 路由來觀測，無提供者失敗是通用的 `WEB_PROVIDER_UNAVAILABLE`，不列舉逐提供者原因（見 [Agent Note](../../../.agents/notes/archived/simplification/2026-07-04-drop-unconsumed-web-observation-surface.md)）。
- **搜尋請求只攜帶 `query` 與 `maxResults`**：提供者無關的控制項（新近程度、域名過濾條件、區域提示、搜尋深度）暫緩至後端都能誠實支援時（見 [seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)）。
- **`WebFetchBody` 沒有 `pdf` 分支**：可提取文字的 PDF 支援屬於明確的延期工作；封閉聯合會使新增該分支成為跨 web 包、由編譯強制執行的變更。
- **提供者支援的頁面提取不屬於 `fetch()` 範圍**：Firecrawl/Tavily 風格的 `web_extract` 能力延期，而不會擴充功能抓取操作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和相關 Agent Note 為準。

#### 未來：觀測提供者狀態

沒有提供者變更事件或能力狀態查詢；消費方只能透過執行呼叫並按丟擲的 code 路由來觀測可用性。如果消費方需要逐提供者原因，恢復一個小的觀測介面是可行的，但已歸檔的簡化筆記記錄了為何放棄此前的那個介面。

</details>
