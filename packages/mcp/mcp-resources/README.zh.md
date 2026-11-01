---
description: "透過共享工具、顯式伺服器選擇和 agent 作用域存取，按需發現與讀取 MCP 資源。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-resources

[English](README.md) | 中文

## 概述

`dsh-mcp-resources` 讓模型發現和讀取已設定 MCP 伺服器提供的文件。隨附 profile 在呼叫方作用域中設定了伺服器時，自動提供三個共享工具。每個工具都要求顯式指定伺服器名稱，並且僅在呼叫時讀取內容。資源文字進入對話歷史；二進位制載荷仍可供程式化呼叫方存取，並以說明文字呈現給模型。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延後工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

隨附 profile 已經統一掛載本包一次。你只需為所需伺服器設定 [MCP 用戶端](../mcp-client/README.zh.md)條目。

### 伺服器設定

透過[用戶端設定](../mcp-client/README.zh.md#use-this-package)在目標作用域中新增伺服器。本包沒有設定欄位。

呼叫方沒有已設定 MCP 伺服器時，在 native 或 PTC 模式下都看不到 MCP 提示詞文字或資源工具。設定伺服器後會啟用三個共享資源工具，包括由其他提供者掛載用戶端的伺服器，以及沒有工具或指令的伺服器。只要用戶端條目保持啟用，連線失敗就不會移除共享工具；資源呼叫會報告連線錯誤。

### 發現與讀取

掛載系統提示片語裝服務時，提示詞列出呼叫 agent 可見的伺服器名稱。將其中一個名稱作為 `server` 呼叫 `list_mcp_resources` 或 `list_mcp_resource_templates`。未提供遊標時，MCP SDK 收集伺服器的全部分頁；顯式提供遊標時返回一頁；將其中的 `nextCursor` 原樣作為 `cursor` 傳入，以請求下一頁。使用相同的 `server` 名稱和顯式 `uri`，透過 `read_mcp_resource` 讀取已列出的 URI 或展開後的範本。

每個操作都在呼叫 agent 的作用域中解析伺服器。缺少伺服器參數或伺服器不可用時，會在派發前失敗。連線所有者負責請求取消、超時與恢復；失敗的請求仍表現為失敗的工具呼叫。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部細節——點選展開</summary>

[base](../../bundle/base/README.zh.md) 與獨立的 [sdk-minimal](../../bundle/sdk-minimal/README.zh.md) bundle 分別擁有以下設定行：

```yaml
- id: mcp-resources
  name: '@deepseek-ai/dsh-mcp-resources'
```

作用域中的首個提供者註冊該作用域的共享工具；移除最後一個提供者會移除本地工具註冊，繼承的提供者與工具仍然可見。資源服務獨立於首個提供者外掛擁有共享工具 effect，因此解除安裝該提供者不會移除其他伺服器仍需要的工具。提供者選擇與伺服器名稱提示詞使用同一作用域註冊表。每次呼叫都在派發前解析伺服器。

規範結果為程式化呼叫方保留完整 JSON。純文字渲染器新增伺服器歸屬資訊，並將字串值的 `blob` 欄位替換為說明其 base64 長度的文字；URI、MIME 型別與文字欄位仍保留在渲染後的 JSON 中。工具流水線負責記錄結果。伺服器指令歸 MCP 用戶端及其已記錄的系統提示詞段落所有。

| 原始碼 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 作用域提供者選擇與伺服器名稱提示詞上下文 |
| [`src/tools.ts`](src/tools.ts) | 共享資源操作與參數 schema |
| [`src/render.ts`](src/render.ts) | 帶歸屬資訊且不內聯二進位制載荷的文字投影 |

不釋出 `./invariant` 配套入口：工具、提示詞名稱與派發均源於同一組由 effect 擁有的提供者註冊。它們沒有可供核對的獨立觀測值；註冊表 effect 檢查不屬於執行時不變式。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

以下頁面介紹伺服器設定、執行機制與資源存取決策。

- [MCP 用戶端](../mcp-client/README.zh.md)——伺服器傳輸、指令與連線生命週期。
- [工具子系統](../../../docs/subsystems/tools.zh.md)——規範值與模型可見結果。
- [資源可見性決策](../../../.agents/notes/implemented/feature/2026-09-13-mcp-resources-in-profiles.zh.md)——profile 統一掛載及由已設定伺服器決定的可見性。
- [資源與指令決策](../../../.agents/notes/implemented/feature/2026-09-12-mcp-resources-and-instructions.zh.md)——作用域、按需存取及未納入的機制。

-----

<a id="model-experience"></a>
## 模型體驗

### 共享資源工具

#### 模型看到什麼

[生成的工具 schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-mcp-resources)定義了呼叫方可見的所有已設定伺服器共享的三個工具。沒有這類伺服器時，native schema、PTC 宣告與繫結以及伺服器名稱提示詞均不存在。啟用的用戶端連線、斷開或重試時，這些共享工具定義保持不變。掛載系統提示詞裝配且存在可見提供者時，`MCP resource servers` 段落顯示 `Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: <JSON array>.` 名稱來自同一作用域註冊表，包括既沒有工具也沒有指令的伺服器。註冊表為空時不貢獻該段落。

#### Token 影響

沒有呼叫方可見的已設定伺服器時，本包不增加工具或提示詞 token。否則，三個共享定義帶來固定的 schema 開銷，伺服器名稱段落增加按序排列的可見名稱 JSON 列表。資源列表和文件僅在操作返回後增加內容。

#### KV Cache 影響

新增呼叫方可見的首個伺服器或移除最後一個伺服器，會改變後續工具 schema 或 PTC 宣告字首。可見名稱變化時更新伺服器名稱段落；替換同名提供者不會改變該文字。單純的連線失敗不會改變共享定義或名稱。

### 資源結果

#### 模型看到什麼

成功結果以 `MCP server: <server>` 開頭，隨後是換行和返回的 JSON。每個字串值的 `blob` 都變為 `[binary resource: <length> base64 characters; available to programmatic callers]`。伺服器提供的文字、中繼資料與續傳遊標仍然可見。

#### Token 影響

渲染後的結果向工具歷史新增文字。二進位制說明文字替代載荷的 base64 token 開銷；本包不設定額外的文字大小限制。

#### KV Cache 影響

每個結果追加到歷史中，不改寫此前的結果。後續讀取可以返回已變化的伺服器內容並追加不同結果；本包不會重新整理此前已記錄的內容。

## 已知限制與延後工作

<a id="known-limitations-and-deferred-work"></a>

資源存取由顯式呼叫按需發起。

- 不具備 MCP `resources` 能力的已設定伺服器仍會出現在伺服器名稱提示詞中，並保持共享資源工具可用。SDK 返回空的資源列表與範本列表；不受支援的讀取會失敗。
- `tools.restrict()` 在註冊過濾條件時檢查全域或祖先作用域提供的名稱。引用這些作用域中不存在的資源工具名稱會報未知工具錯誤。註冊在呼叫方自身作用域中的資源工具不受 allow/deny 掩碼過濾。
- 不支援資源訂閱與更新通知；再次呼叫列表或讀取工具以取得目前內容。
- 二進位制資源不會投影為原生圖片或音訊。程式化呼叫方保留其規範 base64 值。
- 呼叫方必須提供伺服器名稱。共享工具不會聚合不同伺服器；分頁遵循 MCP SDK。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
