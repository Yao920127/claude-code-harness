---
description: "面向使用者與維護者的事件溯源工作階段日誌與記憶體儲存說明，用於建置、檢查或擴充功能每個 agent（智慧代理）互動背後的持久記錄。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session

[English](README.md) | 中文

## 概述

`dsh-session` 在僅追加的工作階段日誌中記錄每個模型可見事實，並從該記錄派生模型歷史。消費方可以檢查、回放、fork 和重新整理工作階段，同時保留歷史事件；壓縮（compaction）會在活躍對話中隱藏被取代的條目，但不會刪除它們。除非新增持久化後端，否則工作階段僅保留在記憶體中；永續性檢查點會等待設定的後端。agent 需要可重建的工作階段記錄時請選擇本包；它本身不呼叫模型。

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

在必須存在工作階段的任何地方掛載 `dsh-session`。它在記憶體中建立並持有事件溯源的 `Session` 實例；持久儲存由訂閱 `session/event` 流的持久化外掛疊加。

### 建立與檢查工作階段

`ctx.sessions.create()` 建置繫結到呼叫方 fiber 的即時工作階段；`get(id)` 與 `list()` 查詢工作階段，`fork()` 從即時工作階段的精確字首建立子工作階段。

```text
const session = ctx.sessions.create(sessionId, { meta: { cwd: '/workspace' } })
ctx.sessions.get(sessionId)      // the live session
ctx.sessions.list()              // every live session, in creation order
```

### 追加與派生

`session.append(type, data, opts?)` 提交一個型別化事件——它先快照並凍結載荷、驗證其為無損 JSON，再通知觀察者。`session.deriveMessages()` 把日誌投影為模型看到的 `Message[]`，採用增量且有快取的方式：

```text
session.append('user/message', { role: 'user', content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } },
  { surfaceOp: 'append' })
session.deriveMessages()         // the derived model history
```

表層事件（`system/message`、`developer/message`、`user/message`、`assistant/message`、`tool/result`）在型別化事件與追加輸入中都必須帶有 `surfaceOp`。替換操作僅接受 `{ op: 'replace', startSeq, endSeq }`，端點為包含邊界的 `SessionSeq`，按目前 surface 順序解釋。assistant 訊息會嵌入精確、緊湊的提供者流，並禁止 `sourceEventSeqs`。已知僅日誌事件禁止這兩個中繼資料欄位，且從不產生訊息。

`developer/message` 儲存工具新增名稱，以及指向更早 `request/header` 的 `headerSeq` 引用。僅在存在新增塊時必須攜帶該引用，每個名稱必須在所引用的請求頭中恰好對應一個完整模式。移除塊僅記錄工具名稱，不攜帶請求頭引用。重新啟動、fork 和 surface 替換保留歷史請求頭；較早新增的定義不由目前註冊表或最新請求頭決定。`sourceEventSeqs` 繼續描述派生來源及被替換節點。

外掛用 `@messageProjection` 宣告修改內容的事件，並透過 `ctx.sessions.registerMessageProjection()` 註冊純處理器。Session 在接受事件前呼叫處理器，並快取其不可變訊息更新。缺少處理器時拒絕追加和恢復，解除安裝已經使用的處理器後也會拒絕讀取快取。獨立建構函式和 `foldSurface(events, projections)` 必須顯式接收處理器。重建函式將摺疊結果的 `projectedMessages` 傳給 `deriveEventMessage()`，即時實例方法自動應用相同的投影。[外掛擁有訊息投影](../../../.agents/notes/implemented/architecture/2026-09-11-plugin-owned-message-projections.zh.md)說明職責劃分和離線裝配。

追加、seed/restore 與事件 adoption/snapshot 會拒絕任何 `header.system` 及恰好為空的可選請求頭欄位（`tools: []`、`adapterDefaults: {}`），而不規範化輸入。工具結果的 `data.error` 僅在一等訊息的 `isError === true` 時允許存在；失敗標識仍是可選的。被拒絕的追加不會改變日誌、派生狀態或事件流。Adoption 驗證事件區域性中繼資料，但不驗證所引用的歷史或替換端點是否屬於 surface。

`system/message` 承載渲染後的系統提示詞：第一條是 surface 第 0 號節點，准入依據已準備呼叫的能力，不具備能力的路由將非空渲染文字歸併到首個系統節點，延續中的 `in-history` 序列則在快取歷史之後追加；空系統節點不投影為訊息，因此清除提示詞必須為所有生效的系統節點記錄空內容替換，而非僅替換最新節點；當第 0 號節點是 `system/message` 時，surface 摺疊拒絕覆蓋它的替換，除非替換事件本身是恰好覆蓋該節點的 `system/message`，而後續系統節點不受保護，壓縮範圍可以遮蔽它們（[決策](../../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.zh.md)）。

### 讀取日誌

`session.seq` 無需物化陣列即可讀取目前日誌長度，`session.eventAt(seq)` 按序列號讀取單個已接受且深度凍結的事件。`session.snapshotEvents(fromSeq?, toSeqExclusive?)` 會物化半開區間的凍結穩定快照；目前完整快照會快取到下一次追加。`eventAt()`、`snapshotEvents()` 和 `ownEvents()` 已棄用：現有邏輯可以暫不遷移，但禁止新增生產呼叫。儲存庫測試檔案可以在限定範圍的 lint 豁免下使用這三個讀取方法（[策略](../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.zh.md)）。只需要長度的呼叫方使用 `seq`。

工作階段日誌位置使用兩種數字型別。`SessionSeq` 標識已有事件或包含端點的事件水位；`SessionLogOffset` 標識間隙、字首長度或讀取邊界，並且可以等於事件數量。`SessionSeqCursor` 新增 `-1` 這個“尚無事件”值，`OptionalSessionSeq` 則在缺失本身屬於資料時使用 `null`。建構函式會驗證非負安全整數，brand 在執行時會被擦除，因此持久 JSON 與 wire 值仍是普通數字。

### 派生工作階段的 fork

`ctx.sessions.fork(source, boundary?, childSessionId?)` 從即時源工作階段複製包含切點的精確事件字首（預設：最後一個事件）。`dsh-session/fork` 的 `buildForkSeed` 在複製事件之後放置繼承標記，僅為開放步驟補缺失的錯誤工具結果，並以 `forked` 原因關閉步驟和輪次。已關閉的步驟與輪次保持原樣，包括歷史缺失結果。標記和結束事件屬於子工作階段；`inheritedEventCount` 只統計複製的字首。

邏輯 `SessionHeader.isSeeded` 欄位報告是否存在 fork 歷史，而不公開位置整數。`Session.inheritedEventCount` 保留經過驗證的精確 `SessionLogOffset`；`ownEvents()` 返回從該切點開始的事件，`isOwnSeq(seq)` 只接受已存在且由子工作階段擁有的位置。底層帶 seed 建構必須顯式提供 `seed` 與 `inheritedEventCount`，因為建構 seed 可以在繼承字首之後包含子工作階段自有的設定事件。

### 重新整理持久狀態

`ctx.sessions.flush(session)` 分發需等待完成的永續性檢查點：每個持久化監聽器都會重新整理，呼叫在所有監聽器結算後完成。需要立即永續性屏障的生產方應等待它，而不是假定延後寫入已經排空。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該包如何實作上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該包建立在事件溯源之上：`Session` 是型別化 `SessionEvent` 的僅追加日誌，其他一切——模型歷史、transcript（文字記錄）、遙測、標題、持久化——都從這條流派生。surface 是派生投影：一個增量管理器驗證追加候選、根據已提交事件推進有序檢視，透過 `replaceGeneration` 跟蹤位置替換，透過 `contentGeneration` 跟蹤位置替換和外掛擁有的訊息變更。模型可見即已記錄：任何到達模型請求的內容都必須能從日誌重建。每個完成結算的模型嘗試都會提交一個事件：`assistant/message` 攜帶組裝後的模型可見 message 及其緊湊帶時間 stream，`assistant/attempt` 則保留失敗、重試、取消或 stream error attempt，且不新增模型歷史。如果程序在 settlement 前硬中斷，則不會留下持久 attempt stream。

### 請求頭

`request/header` 儲存非歷史請求封裝的完整規範快照，原因為 `initial`、`resume`、`change` 或 `series`。顯式訊息序列起點、表層替換或外掛擁有的訊息變更會在請求封裝不變時寫入 `series` 快照；同時發生變化時使用 `startsSeries: true`。同一序列內的步驟、重試與普通後續輪次繼承最新快照。`adapterDefaults` 區分由介面卡解析的值與顯式設定，`foldRequestHeader()` 選擇最新快照。這種自包含記錄以每個訊息序列增加儲存為代價，支援區域性視窗渲染與精確重建；細節由[可重建請求 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.zh.md)負責。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`SessionStore` 服務、儲存生命週期、`fork`、`flush` |
| [`src/types.ts`](src/types.ts) | `SessionEventMap`、`SessionEvent`、`UserMessage`、`SessionHeader`、`TurnEndReasonMap` |
| [`src/surface.ts`](src/surface.ts) | 有序 surface 投影、替換驗證、`deriveEventMessage` |
| [`src/request-header.ts`](src/request-header.ts) | `request/header` 摺疊與重建 |
| [`dsh-util-values`](../../util/values/README.zh.md) | 共享無損 JSON 驗證與分離式快照 |
| [`src/repair.ts`](src/repair.ts) | 崩潰遺留日誌的冷修復 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套：序號、輪次／步驟閉合、工具呼叫／結果配對 |

### 追加驗證

每次追加都會使用共享的迭代式 `snapshotJsonValue()` 流程，對每個巢狀值只讀取、驗證並複製一次，因此有狀態的 getter 無法給驗證提供一個值、給儲存提供另一個值。非無損 JSON 載荷（BigInt、迴圈、稀疏陣列、`-0`、特殊原型）會在追加位置被拒絕，先於任何後端重新整理。追加路徑會建構每個 `SessionSeq`；surface 事件還會驗證標記形態、被引用的源事件序號，以及替換的完整遮蔽節點覆蓋。

### 派生歷史

`deriveMessages()` 快取深度凍結的派生訊息，每次呼叫返回新陣列。surface 事件型別（`system/message`、`developer/message`、`user/message`、`assistant/message`、`tool/result`）提供記錄的訊息身份和內容，空內容的 system 和 developer 節點不派生訊息。外掛擁有的投影修改派生內容，不修改記錄的訊息。替換和投影決策使快取失效。嵌入式 Assistant stream 與 `assistant/attempt` 事件只保留回放和診斷資料。

### 請求頭

迴圈在每個迴圈實例邊界及變更時記錄完整規範 `request/header` 快照（呼叫設定、介面卡預設值、組裝後的工具 schema——渲染後的系統提示詞是 `system/message` surface 節點，不是 header 狀態）；`foldRequestHeader(events)` 透過選擇最新快照來重建它，使每個對話請求都成為日誌的純函式。路由中繼資料（`request/context`）是獨立的已記錄狀態，僅在提供者、模型、容量或 `systemPromptUpdate` 模式變化時追加；它在提示詞與使用者訊息准入之後記錄實際已準備呼叫的模式，而非提供准入決策。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域時再閱讀以下頁面。

- [工作階段子系統](../../../docs/subsystems/session.zh.md)——完整事件詞彙、surface 型別與生成的服務 API。
- [持久化子系統](../../../docs/subsystems/persistence.zh.md)——後端如何讓該日誌持久化。
- [Core 子系統](../../../docs/subsystems/core.zh.md)——寫入並派生工作階段的迴圈。
- [生成持久化目錄](../../../docs/persistence-catalog.zh.md)——每個工作階段事件及其載荷與宣告位置。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 派生訊息歷史

#### 模型看到什麼

模型會接收 `system/message`、`developer/message`、`user/message`、`assistant/message` 與 `tool/result` surface 條目中的訊息，並應用日誌中的投影，系統提示詞在先。訊息標識、角色、來源及未修改的內容塊保持不變，投影不生成標識。直接提示詞與注入上下文仍是獨立的 `user/message` 事件，各事件的來源保留其出處。嵌入式 stream、`assistant/attempt`、邊界與其他僅日誌事實不新增訊息。

#### Token 影響

追加的 surface 條目會在後續步驟中重新傳送。`replace` surface 操作會從未來輸入中移除被遮蔽條目，但不刪除其原始日誌記錄。

#### KV Cache 影響

追加的 surface 條目會保留可複用字首。即使底層事件日誌保持僅追加，`replace` 操作也會從首條被遮蔽訊息起使快取複用失效。

### 崩潰修復結果

#### 模型看到什麼

如果恢復發現 assistant 工具請求沒有持久 `tool/call`，其合成 `TOOL_NOT_STARTED` 結果內容為 `The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.`。如果持久 `tool/call` 沒有結果，其 `TOOL_OUTCOME_UNKNOWN` 結果內容為 `The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.`。

Fork 生成的結果只描述繼承記錄：父工作階段可能已經在所選事件之後啟動或完成呼叫。`TOOL_NOT_STARTED` 表示字首中沒有啟動記錄；`TOOL_OUTCOME_UNKNOWN` 表示有啟動記錄但沒有結果。兩者都要求模型僅對只讀或冪等操作直接重試；有副作用的操作需要先驗證外部狀態或詢問使用者。參見 [fork 決策](../../../.agents/notes/implemented/feature/2026-08-18-arbitrary-seq-session-fork.zh.md)。

#### Token 影響

未受損工作階段的 token 增量為零。恢復時，每個修復後的呼叫都會新增保留的、針對具體風險的錯誤文字。

#### KV Cache 影響

保持僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 已記錄的請求頭

#### 模型看到什麼

工作階段從請求頭重建有效工具模式和呼叫設定；提供者專用的延遲宣告與保留宣告在分發時派生。`toolHistory()` 快取對已提交請求頭和 developer 訊息的有狀態歸約，後續讀取僅處理新增事件。它透過歷史 `headerSeq` 解析新增定義，返回不可變快照，並在顯式新請求序列或保留定義發生變化時重新建立宣告。以未變化的定義恢復保留名稱時序列繼續，由記錄的新增重新提供該工具。迴圈請求和壓縮呼叫均使用此狀態。 請求頭缺少對應更新記錄時，使用完整有效宣告。 允許同名工具的 schema 變化，即使在 `in-history` 路由上也會使字首複用失效；註冊時對照歷史工具進行拒絕檢查留待後續實作（[原因](../../../.agents/notes/implemented/architecture/2026-09-20-dynamic-tool-updates.zh.md)）。系統提示詞仍屬於 `deriveMessages()`；請求頭事件不新增訊息或提示詞副本。

#### Token 影響

日誌記錄不產生重複 token。各系統節點與 schema 仍會產生正常的逐請求開銷。

#### KV Cache 影響

記錄日誌不會導致失效，精確重建會保持請求字首一致。後續請求頭若更改設定或 schema，可能從第一處差異開始使複用失效；替換 surface 第 0 號節點的提示詞變更會從第一個 token 起使複用失效，而歷史內追加則保持直到已快取歷史末尾的字首可複用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工作階段儲存何時需要特別留意。它們是目前包約束，不是任務積壓。

- **Store API 僅接受活躍源工作階段** — 已持久化但未載入的源工作階段透過 Host 觀察路徑處理。Fork 僅閉合開放尾部，不修復先前已閉合步驟中缺失的結果。
- **`SESSION_FORMAT_VERSION` 命名[目前邏輯表示](../../../docs/session-format-status.zh.md)**——目前讀取器拒絕已退役的 `header.system`，並驗證 `system/message` 載荷與受保護頭節點的重寫。歷史 header 與事件歸相鄰格式包所有；[相鄰遷移鏈](../../session/session-format-catalog/README.zh.md)在建構 `Session` 前轉換受支援的歷史，寫開啟只發布目前格式的後繼代際。同版本未知事件要求信封顯式帶有 `ignorable` 標記，但這不保證結構遷移的安全性（[機制](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)）。
- **`TurnEndReasonMap` 不含 ACP（Agent Client Protocol）命名的 `refusal`／`max_turn_requests` 變體**：受生產方約束；只有當介面卡或迴圈首次產生這些變體時才加入。
- **fork 之外沒有工作階段樹**：基於分支工作階段的 pi 風格條目樹被推遲，除非消費方需要超越基於邊界的 forking 的能力。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
