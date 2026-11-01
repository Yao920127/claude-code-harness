---
description: "面向 agent（智慧代理）開發者與維護者、經工作區授權且面向模型的工作階段歷史工具，用於選擇、設定或排查既往工作階段搜尋、追蹤與事件讀取。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-session-query

[English](README.md) | 中文

## 概述

使用 `dsh-tool-session-query` 可讓模型搜尋既往工作階段、檢查事件匹配、追蹤工作階段或事件關係，並讀取精確事件資料。它的五個只讀工具返回無遊標文字；只有目標工作階段的 `cwd` 與呼叫方完全匹配時才允許跨工作階段存取，沒有 `cwd` 的呼叫方只能檢查自己。搜尋會排除呼叫方工作階段，並在達到部署結果上限時要求模型縮小查詢。本包是 opt-in；啟用後，每次模型請求都會增加固定指引與五個工具 schema。

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

當 agent 應該能搜尋自己的既往工作階段並檢查其關係與事件時掛載本包。常用路徑是顯式的：在 `ctx.sessionQuery`（由 `dsh-session-query-sqlite` 支撐）之上掛載外掛，然後讓模型呼叫這些工具。

### 何時選擇

當部署需要模型驅動的既往工作檢索時選擇它——例如 coding agent（程式設計智慧代理）在開始任務前搜尋更早工作階段中做過的事。只需要程式化檢索時避免使用：`ctx.sessionQuery` 本身服務程式碼呼叫方，無需面向模型的 schema、提示詞與授權層。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxSearchResults` | `100` | 一次搜尋呼叫返回的最大已授權命中數 |
| `searchTimeoutMs` | `30000` | 附加到兩個全文搜尋工具的協作式截止時間 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-session-query)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 模型可以做什麼

| 工具 | 模型得到什麼 |
|---|---|
| `session_search` | 匹配字面查詢的工作階段，經排序，帶標題與最佳匹配摘錄；始終省略呼叫方工作階段 |
| `session_event_search` | 一個已授權工作階段內匹配字面查詢的事件；針對目前工作階段時，在呼叫它的步驟之前停止 |
| `session_trace` | 一個工作階段的已授權祖先鏈與後代樹；未授權邊界以不含隱藏 id 的標記出現 |
| `session_event_trace` | 一個事件的位置替換與被引用源事件關係 |
| `session_event_read` | 一個完整未刪節事件（JSON），以及可選的相鄰事件摘要 |

工作區授權是保守的：跨工作階段存取要求目標與呼叫方工作階段的 `cwd` 嚴格相等，沒有 `cwd` 的呼叫方只能檢查自己。請求的父 id 會在搜尋前去重並按權限檢查；缺失與跨工作區猜測行為完全相同。搜尋結果無遊標：結果達到上限時請模型縮小查詢，絕不暴露提供者遊標、偏移、分頁大小或模型可控上限。工具邊界的時間戳是帶時區限定的 ISO 8601，並轉換為包含端點的 epoch 毫秒過濾器。

### 失敗與恢復

每個可信查詢服務呼叫都經過一個錯誤淨化器：呼叫方取消被精確保留，語料庫與提供者診斷進入內部日誌，不安全或不可列印的失敗退回到固定 `SESSION_QUERY_TOOL_FAILED` 程式碼與訊息。本地參數驗證與授權錯誤保留精確的工具自有訊息（目標在呼叫方工作區之外時為 `SESSION_QUERY_TOOL_UNAUTHORIZED`）。本包不執行位元組或字元截斷，也不匯入 spill 後端；需要限制內聯輸出的部署應掛載 `@deepseek-ai/dsh-spill-policy`，它可以在保留完整結果的同時替換過大的已渲染文字。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本消費方建立在一個分離與三項承諾之上：

- **窄而只讀的工具。** 五個帶扁平 snake-case schema 的工具，每個都引導一個後續步驟；遊標、偏移、分頁大小或模型可控上限永遠不會到達模型。
- **授權來自呼叫方，絕不由模型提供。** 呼叫方身份來自 `ToolExecution.exec.agent`；工作區是字串精確 `cwd` 相等，並對照每次結果觀察到的 header 重新驗證。
- **一個模型邊界淨化器。** 每個可信 `ctx.sessionQuery` 呼叫都經過服務邊界，它保留取消，並將診斷與分類失敗限制在邊界內。
- **不引入第二種截斷格式。** 結果保持完整；通用 spill 策略負責有界內聯輸出。

設計歷史記錄在[面向模型的工作階段查詢工具筆記](../../../.agents/notes/archived/feature/2026-07-24-model-facing-session-query-tools.md)與 [session-search-not-shipped-default 筆記](../../../.agents/notes/archived/feature/2026-08-02-session-search-not-shipped-default.md)中。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：設定、提示詞章節、五個工具註冊 |
| [`src/input.ts`](src/input.ts) | 模型 schema、參數規範化、過濾器建構 |
| [`src/workspace-access.ts`](src/workspace-access.ts) | 呼叫方身份、工作區授權、標題存取、血緣投影 |
| [`src/service-boundary.ts`](src/service-boundary.ts) | 可信呼叫與模型安全錯誤轉換 |
| [`src/operations.ts`](src/operations.ts) | 五個操作工作流 |
| [`src/presentation.ts`](src/presentation.ts) | 文字結果渲染與工具呼叫卡片 |

### 操作流程

每個執行器先派生呼叫方，把模型的參數規範化為服務過濾器，對照呼叫方工作區授權目標（或請求的父 id），然後透過服務邊界收集結果。兩個搜尋工具在觀察世代仍有效時內部翻頁消費提供者遊標，停在 `maxSearchResults`；由於一次搜尋會消費與世代繫結的提供者遊標，兩個搜尋工具與同級工具呼叫排他執行，而三個精確追蹤/讀取工具選擇並行執行。血緣輸出用不含隱藏工作階段 id 的標記替換未授權祖先與後代邊界。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工具表面逐步進入底層服務、schema 目錄與設計證據。

- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-session-query)——模型看到的五個工具 schema。
- [dsh-session-query](../session-query/README.zh.md)——這些工具呼叫的服務。
- [dsh-session-query-sqlite](../session-query-sqlite/README.zh.md)——兩個搜尋工具背後的全文後端。
- [工作階段查詢子系統參考](../../../docs/subsystems/session-query.zh.md)——工具之下的型別級約定。
- [面向模型的工作階段查詢工具](../../../.agents/notes/archived/feature/2026-07-24-model-facing-session-query-tools.md)——工作區授權、無遊標結果與 spill 決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

模型會收到一個固定的既往歷史指引章節。

##### 既往歷史指引

```markdown
Use session_search to find relevant work from prior sessions, or session_event_search to search earlier events in one session. Search results are cursor-free and workspace-scoped. Follow a useful hit with session_trace, session_event_trace, or session_event_read when you need lineage, relationships, or exact data.
```

#### Token 影響

外掛掛載期間，每次請求都存在一個固定精簡章節。

#### KV Cache 影響

外掛與指引文字不變時，字首穩定。

### 工具 schema

#### 模型看到什麼

模型會看到生成的 [`session_search`、`session_event_search`、`session_trace`、`session_event_trace` 與 `session_event_read` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-session-query)。搜尋過濾器會增加固定 schema token，而遊標、工作區路徑、輸出分頁與模型可控結果上限仍不存在。

#### Token 影響

可見期間，每次請求都會傳送五個固定只讀 schema。

#### KV Cache 影響

工具可見性與定義不變時，字首穩定。

### 工具結果

#### 模型看到什麼

每次成功呼叫都會發出一個純文字塊。搜尋結果包含標題與最佳匹配摘錄；追蹤包含全部已授權關係；事件讀取包含未經刪節的目標 JSON。通用 spill 策略可以用其預覽、不透明定位資訊與取回指引替換過大的內聯文字。

#### Token 影響

結果取決於資料，並保留在已記錄工具歷史中直到壓縮（compaction）；`maxSearchResults` 限制搜尋命中數。

#### KV Cache 影響

僅追加的結果文字位於可重用請求字首之後，不會使較早的快取條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **搜尋有上限且無延續**——搜尋最多返回部署上限，匹配更多時會請模型縮小查詢；不提供延續 token。
- **保守的工作區身份**——工作區身份是字串精確 `cwd` 相等，因此符號連結等價的路徑不共享權限。
- **無 spill 策略時內聯載荷**——未掛載通用 spill 策略的自定義組合會以內聯方式接收完整追蹤與事件載荷。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 未來：更寬泛的工作區語義

字串精確 `cwd` 相等是刻意保守的選擇；符號連結感知或規範路徑的工作區身份會改變哪些工作階段共享權限，尚未決定。

</details>

**執行時不變式：** 不釋出伴生入口。這個只讀模型介面卡不擁有任何超出註冊表範圍的事件關係或可變資料關係；這些註冊表已經負責驗證註冊。
