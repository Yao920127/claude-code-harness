---
description: "面向程式化用戶端與維護者的僅自動化 ACP（Agent Client Protocol）伺服器，用於透過 JSON-RPC stdio 驅動 DeepSeek Harness agent（智慧代理）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-acp

[English](README.md) | 中文

## 概述

`dsh-acp` 讓受信程式透過標準 [ACP](https://agentclientprotocol.com) 自動操作持久 DeepSeek Harness agent：建立或恢復工作階段、選擇模型與推理強度、掛載 MCP 伺服器、提交或取消工作、接收語義更新，並獨立關閉工作階段。程序外 subagent、測試執行器與腳本化控制器適合選擇它；它刻意不提供 DSH 專用呈現資料與互動式 UI 功能。持久化支援跨程序重新啟動列出、恢復與關閉工作階段，但不支援刪除、fork、transcript（文字記錄）回放與附加目錄。執行 `pnpm dsh --profile acp` 可啟動伺服器；儲存庫用戶端使用 `dsh-subagent-acp`。

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

當腳本、測試執行器或另一個 harness 需要透過標準自動化協定端到端執行 agent 工作時，使用本包。常用路徑是：啟動伺服器、建立或恢復工作階段、按需掛載 MCP 伺服器並選擇模型選項、傳送提示詞、消費語義更新，再關閉工作階段。

### 何時選擇

當自動化應擁有互動時選擇它：管理持久工作階段、工具、模型選擇與權限的程序外 subagent、測試執行器或腳本化控制器。當人類需要 DSH 專用呈現卡片、計劃、標題、todo、終端檢視或 elicitation 時請避開；本伺服器刻意只提供標準 ACP v1 介面。

### 最小設定

伺服器建立的每個工作階段都使用此處設定的提供者與模型。兩個欄位都是可選的，以便由另一個 agent/request 監聽器提供；可執行的演示組合會同時設定兩者。Stdout 只承載協定流量，因此請讓日誌遠離它。

```yaml
- name: '@deepseek-ai/dsh-acp'
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `provider` | — | 每個工作階段 agent 的提供者路由 |
| `model` | — | 每個工作階段 agent 的模型 |
| `sessionListPageSize` | `100` | 單頁 `session/list` 返回的最大摘要數量 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-acp)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 啟動伺服器

`pnpm dsh --profile acp` 會啟動隨附的 stdio 伺服器。`acp` profile 會掛載工作階段持久化，因此用戶端可以列出、恢復和關閉持久工作階段。[`@deepseek-ai/dsh-subagent-acp`](../../subagent/subagent-acp/README.zh.md) 會啟動同一 profile 來執行程序外委派。

<a id="protocol-contract"></a><a id="standard-acp-v1-surface"></a>
### 協定約定

一個連線可以同時執行多個工作階段，彼此獨立。用戶端發出的呼叫如下：

| 呼叫 | 你會得到什麼 |
|---|---|
| `initialize` | 穩定 ACP v1，以及 `session/list`、`session/resume`、`session/close` 與 Streamable HTTP MCP 支援；圖片提示詞只在持久附件儲存和設定的確切路由支援時公佈。 |
| `authenticate` | 立即成功；伺服器不需要身份驗證。 |
| `session/new` | 全新持久 agent；其絕對工作區與 stdio 或 HTTP MCP 伺服器會在釋出前透過驗證，並返回完整設定選項狀態。 |
| `session/list` | 按確定的新到舊順序分頁返回已持久化、可恢復的根工作階段；可選絕對 `cwd` 篩選會儘可能使用物理目錄標識。 |
| `session/resume` | 恢復一個已持久化且非活躍的工作階段；組合前驗證其規範工作區，並恢復日誌但不回放舊更新。 |
| `session/close` | 停穩式取消、更新 drain、後代釋放、持久化 flush，並且只釋放指定 Agent 作用域。 |
| `session/set_config_option` | 序列更新公佈的 `model` 或 `reasoning_effort`，並返回完整結果狀態。 |
| `session/prompt` | 有序文字、資源連結與受支援圖片，每個工作階段一次一個提示詞；Agent 空閒且有序更新交付後才結算。 |
| `session/cancel` / `$/cancel_request` | 提示詞所擁有的取消路徑；沒有進行中的 ACP 提示詞時取消自主工作，未知工作階段 id 則為空操作。 |
| `session/update` | 已提交 assistant 訊息與 thought、通用工具生命週期、設定變化與上下文用量，按工作階段序列交付。 |
| `session/request_permission` | 帶一次性允許／拒絕選項的權限提示；你的用戶端可以自動回答。 |

工作階段設定從即時 LLM（大語言模型）服務目錄提供不透明的提供者／模型選項，並在確切模型宣告推理選項時提供 `reasoning_effort`。提示詞會在非同步圖片准入前快照該選擇，並在該輪次的每個模型步驟中固定它；並行選項變更從下一輪次開始生效。ACP 用戶端是受信控制器：stdio MCP 條目授權其絕對命令與環境，HTTP 條目授權其絕對 HTTP(S) URL 與 header；初始連線或發現失敗會復原尚未釋出的 Agent。不支援的介面會被省略或拒絕：`session/load`、刪除、fork、附加目錄、SSE（Server-Sent Events）或 ACP 傳輸 MCP、mode、命令、計劃、終端、用戶端檔案系統操作與 elicitation。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋伺服器如何實作上述行為，並指出實作它的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

伺服器是刻意採用標準公開協定的自動化傳輸。三項承諾塑造了它：

- **只傳送標準語義更新。** 協定承載已提交訊息與 thought、通用工具生命週期、設定與上下文用量；原始提供者增量、重試嘗試、DSH 呈現資料與不受支援內容不會進入協定。
- **誠實的能力與設定狀態。** `initialize` 只公佈已掛載支援，拓撲變化會發布完整設定選項，提示詞則固定其准入時的確切路由。
- **停穩後才結算。** 提示詞與關閉操作只在其擁有的准入、Agent 活動、有序更新、後代、持久化與釋放達到所需終態後才結算。

決策歷史記錄在 [ACP 作為僅面向自動化的協定筆記](../../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.zh.md) 與[多工作階段筆記](../../../.agents/notes/archived/feature/2026-06-14-acp-multi-session.md) 中。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、`AgentSideConnection` 接線、按工作階段記錄、准入與結算、清理 |
| [`src/content.ts`](src/content.ts) | 協定內容准入與投影：圖片驗證、路由重查、提示詞重建、assistant 塊轉換 |
| [`src/codec.ts`](src/codec.ts) | 輪次結束到 ACP `stopReason` 的純對映 |
| — | 不釋出執行時不變式伴生入口；本傳輸不擁有持久包內事件流；協定與生命週期測試覆蓋其對映。 |

### 准入與提示詞結算

每個工作階段只允許一個正在處理的提示詞。准入先驗證整個提示詞批次、快照所選路由、重新檢查 Agent 是否為同一物件與圖片能力、持久化圖片附件，然後才把使用者訊息入隊——先於准入完成的取消絕不會讓遲到的輪次入隊。入隊後，工作階段模組會將該快照與 inbox 訊息關聯起來，直至該訊息被認領，並在提示詞變數與該輪次的每個模型步驟中固定相同的提供者、模型與推理強度。按工作階段更新會序列交付；已提交圖片會重新讀取並驗證完整性，因此圖片缺失或損壞會讓關聯提示詞失敗，而不是發出預留位置。結算優先順序依次為顯式取消、已提交輸出失敗、區間內 Agent 失敗、關聯輪次結束。

### 清理與連線歸屬

每個工作階段模組擁有其 Agent 控制代碼、MCP 掛載、未來與輪次固定的模型選擇、提示詞槽位、更新鏈和記憶化關閉操作。顯式關閉、用戶端斷開與 Cordis 釋放使用同一停穩式清理流程：停止新工作、取消提示詞准入與 Agent 活動、drain 已提交更新、按子優先順序釋放可繼續後代、flush 持久化並釋放所擁有的 Agent 作用域。工作階段關閉後，已持久化的狀態仍可供列出與恢復；共享上下文的其他工作階段或前端不受影響。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從匹配的用戶端逐步進入自動化約定背後的設計記錄。

- [dsh-subagent-acp](../../subagent/subagent-acp/README.zh.md)——spawn 並驅動本伺服器的程序外 ACP 用戶端。
- [ACP 作為僅面向自動化的協定](../../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.zh.md)——自動化約定及其協定邊界的決策記錄。
- [在單個連線上多路複用並行 ACP 工作階段](../../../.agents/notes/archived/feature/2026-06-14-acp-multi-session.md)——按工作階段隔離、歸屬與清理決策。
- [擴充功能實操手冊](../../../docs/cookbook/extension-cookbook.zh.md)——本包作為擴充功能作者的僅自動化完整範例。

-----

<a id="model-experience"></a>
## 模型體驗

### 提示詞內容

#### 模型看到什麼

`session/prompt` 會在一條使用者訊息中保留文字與圖片順序：相鄰文字會拼接，資源連結則表示為帶方括號的 `[resource_link name=… uri=…]` 引用，模型可以使用自身工具開啟它。內聯圖片 base64 在批次准入後即被丟棄，因此持久訊息只包含經過驗證的附件引用。協定中繼資料、用戶端能力、權限選擇與工作階段 id 絕不進入模型請求。

#### Token 影響

提示詞內容、工具呼叫／結果和持久圖片引用會保留在該工作階段中直到上下文壓縮（context compaction）。並行工作階段保留獨立上下文。

#### KV Cache 影響

只要所選路由與組裝後的字首保持不變，就僅追加。模型變更會使下一個 ACP 輪次改用新路由。

### 權限決策

#### 模型看到什麼

不會直接看到任何內容。所屬工具透過常規工具結果路徑記錄其結果：允許、拒絕、取消或不可用。

#### Token 影響

只有所屬工具的結果會貢獻 token。

#### KV Cache 影響

僅透過所屬工具的結果追加。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是協定對比或任務積壓。

- **僅一個主 workspace**——附加目錄仍不支援。
- **僅光柵提示詞圖片**——PNG、JPEG、WebP 與 GIF 要求持久附件儲存及確切的圖片能力路由。
- **僅 MCP 工具**——MCP resource 與 prompt 沒有 DSH 消費方。
- **沒有 transcript 回放或互動式擴充功能**——工作階段刪除、fork、`session/load`、mode、命令、計劃、終端、用戶端檔案系統操作與 elicitation 仍不屬於此自動化介面。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
