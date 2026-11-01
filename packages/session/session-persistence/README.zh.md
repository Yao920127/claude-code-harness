---
description: "面向使用者與維護者的持久工作階段儲存 seam 說明，用於選擇持久化後端、恢復工作階段，或按共享服務約定建置後端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-persistence

[English](README.md) | 中文

## 概述

本包讓應用透過後端無關的 API 持久儲存並恢復工作階段事件日誌。讀者可以建立、開啟、檢查、列出、追加、讀取、重新整理和關閉已儲存工作階段，同時保持連續且僅追加的歷史記錄。只有完成 flush 才構成永續性屏障；讀取方不會收到撕裂尾部或無效記錄，並且每個後端實例內每個工作階段只允許一個寫入方。若希望每個工作階段使用一份壓縮日誌，可選用隨產品交付的 [JSONL 後端](../session-persistence-jsonl/README.zh.md)；也可以實作具備相同可觀察保證的其他後端。

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

掛載一個持久化後端即可讓工作階段持久化。後端把自己註冊為 `ctx.sessionPersistence`，並把每個已釋出工作階段的即時事件路由進該工作階段的活躍寫控制代碼；agent-loop——工作階段在生產環境中的釋出點——在釋出之前取得每個工作階段的寫控制代碼，因此組合中的其他部分不變。

### 選擇後端

seam 隨產品交付 [JSONL](../session-persistence-jsonl/README.zh.md) 後端。它為每個工作階段儲存一份僅追加的 `.jsonl.zstd` 日誌。第三方後端可以直接實作該服務；必須遵守的[後端約定](#understand-the-implementation)見下文。

### 服務提供什麼

掛載後端後，五個服務方法定址已儲存工作階段：

```text
const handle = await ctx.sessionPersistence.create(header)     // store a new session, take write ownership
const handle = await ctx.sessionPersistence.open(id, 'write')  // claim single-writer ownership of an existing session
const reader = await ctx.sessionPersistence.open(id, 'read')   // observe without ownership
const snap = await ctx.sessionPersistence.stat(id)             // header + revision (+ eventCount / sizeBytes) without a log read
const all = await ctx.sessionPersistence.list()                // one snapshot per visible stored session
await ctx.sessionPersistence.delete(id)                        // permanently remove every stored generation; false when absent
await ctx.sessionPersistence.flush()                           // backend-wide durability barrier over every active write handle
```

服務級 `flush()` 排空每個活躍寫控制代碼已路由的事件並把其工作階段實體化，效果與各控制代碼自己的 `flush` 完全相同；失敗按工作階段聚合為一個 `AggregateError` 而不中途放棄清掃，清掃途中被關閉的控制代碼視同已 flush，因為 close 本身會持久排空。

每一次日誌讀寫都流經返回的 `SessionHandle`；不存在按 id 定址的 append 或 load 方法。`handle.read(offset?, length?)` 返回 `{ eventState, events }`：外層 slice 屬於呼叫方，`eventState` 則區分由呼叫方獨佔的 `detached` 事件圖與可能同時位於後端快取中的 `shared-frozen` 事件圖。該狀態由生成方確定，即使切片為空也會保留。兩種狀態都能直接接管而無需複製；需要可變事件的消費方必須先克隆事件。讀取絕不包含撕裂尾部，同一控制代碼上的重複讀取絕不會觀察到比先前讀取更舊的狀態，寫控制代碼也能讀到自己成功的 append。`handle.append(events)` 追加一個連續批次，其第一個 `seq` 等於已儲存 next-seq；完成時的持久化是盡力而為的——批次被接受、有序，並對同一後端實例上的讀取可見，只有完成的 `flush` 才承諾它在崩潰後依然存在（交付的 JSONL 後端恰好會立即持久化每個批次）。`handle.flush()` 是永續性屏障，同時把空的已建立工作階段實體化，使其可被持久列出。`handle.close()` 冪等且不可取消：讀控制代碼釋放本地資源；寫控制代碼完成待處理的持久化並釋放寫所有權。一旦某次 `append` 或 `flush` 完成，其後在同一後端實例上開始的讀取——無論經由任何控制代碼，還是經由 `stat`/`list`——至少能觀察到該字首。

### 所有權與可見性

`create` 與 `open(id, 'write')` 取得程序內單寫者所有權：在持有者活躍期間第二次以寫模式開啟會以 `SessionAlreadyOwnedError` 拒絕，對已佔用 id 執行 `create` 會以 `SessionAlreadyExistsError` 拒絕，在 `read` 控制代碼上執行修改會以 `SessionReadOnlyError` 拒絕——一種控制代碼型別，執行時拒絕。對已關閉控制代碼的任何操作會以 `SessionHandleClosedError` 拒絕，`SessionOwnershipLostError` 標記寫所有權已永久丟失的寫控制代碼（關閉並重新開啟）。已建立的工作階段自 `create` 完成之刻起即可在本程序內被觀察到，而後端可以把物理實體化推遲到第一次 `append` 或 `flush`；其他程序只能看到已實體化的工作階段，一個在崩潰前從未實體化的工作階段等於從未存在。

### 即時寫路徑與關閉排空

即時寫路徑由後端自持：它一次性安裝工作階段監聽器，把每個已釋出工作階段的事件按 id 路由到該工作階段的活躍寫控制代碼——`session/event` 複製進有界的內部批處理視窗，`session/flush` 是即時的永續性與錯誤觀察屏障，`session/disposed` 執行最終排空並關閉控制代碼。沒有活躍寫控制代碼的已釋出工作階段不做任何持久化。後臺寫入失敗時按序保留其事件、暫停自動路徑並記入日誌；下一次顯式 flush 會重試，並在再次失敗時明確返回拒絕。`close()` 本身會先經由仍然開啟的儲存排空路由緩衝區再釋放所有權，因此即便根 fiber 的 dispose（資源釋放）並行執行各 fiber 的 disposer，後端拆卸時的關閉清掃也能保證應用關閉不丟資料。

### 恢復與崩潰恢復

持久化返回物理上有效的日誌；語義修復屬於讀方。中途崩潰的工作階段保留其未閉合的最終輪次——單個輪次可能很大，而這些事件在崩潰前已持久追加；只有從未確認的撕裂尾部中不完整的碎片會被丟棄——從中恢復的完整記錄由寫路徑在控制代碼的第一次新 append 之前持久重寫。恢復（agent-loop）透過其寫控制代碼讀取已儲存日誌，計算 `interruptedTurnClosers`——合成 `tool/result` 錯誤、任何未閉合的 `step/end`，以及 `turn/end {interrupted}`——並把它們作為普通批次透過同一控制代碼追加。只讀觀察方（session-query）僅在記憶體中用同樣的 closer 配平被中斷的冷日誌。

### 失敗與恢復

目前建置無法忠實解讀的儲存日誌會被拒絕，並返回指明拒絕方向的錯誤，絕不會被誤讀。`SessionHandle` 只暴露由 `SESSION_FORMAT_VERSION` 標識的目前邏輯記錄；提供者必須在返回控制代碼前轉換任何受支援的歷史儲存，隨產品交付的 JSONL 提供者會透過靜態 catalog 遷移受支援的歷史代際。更新的格式會要求操作者升級 harness。本建置不認識的事件型別會被拒絕，除非其信封標記為 `ignorable`；已提交字首中的損壞以 `SessionPersistenceCorruptionError` 拒絕。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節說明 seam 如何實作持久儲存以及後端如何接入；可觀察約定見[使用本包](#use-this-package)與生成的 [Cordis API](../../../docs/subsystems/persistence.zh.md#cordis-surface)。

### 設計理念

本包是 seam，而不是後端框架：它只匯出抽象 `SessionPersistence` 服務、`SessionHandle` 約定、消費方捕捉的穩定錯誤類、純函式的儲存記錄驗證輔助（`storage-contract`）以及帶品牌型別的修訂值——再無其他。每個提供者擁有自己完整的儲存執行時（控制代碼類、修改排序、單寫者記帳、即時事件路由、拆卸），`tests/` 下的兩套共享測試套件——`runPersistenceContract` 與 `runLiveWritePathContract`——固定所有提供者都必須一致的可觀察行為。有意為之的後果：各提供者在儲存恰好相似之處可以彼此相像，但沒有任何實作機制跨越包邊界。

### 每個後端必須遵守的不變數

- **僅追加，連續 `seq`。** 已提交事件絕不重寫；`append` 的第一個 `seq` 必須等於已儲存 next-seq，缺口會被拒絕。
- **撕裂的物理尾部絕不到達讀取方。** 它屬於一次從未完成的 append；寫路徑在第一次新 append 之前將其持久截斷。
- **無損 JSON 資料。** 批次與 header 經過共享的單遍驗證並快照邊界（`materializeAppendBatch`/`materializeCreateHeader`）；無法序列化的載荷在呼叫處被拒絕。
- **永續性。** `append` 盡力而為地持久化；`flush`——逐控制代碼或服務級——是承諾儲存並同時把空工作階段實體化的屏障。
- **遇到未知或無效格式時拒絕讀取。** `validateStoredEvents` 拒絕未知事件詞彙與已廢棄的預釋出形態；`assertVersion` 拒絕外來格式版本。
- **每個後端實例單寫者。** 提供者的程序內認領在 `create`/`open('write')` 時取得，在控制代碼關閉時釋放。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：抽象 `SessionPersistence` 服務與重新匯出的 seam 詞彙 |
| [`src/handle.ts`](src/handle.ts) | `SessionHandle` 約定：read/append/flush/close 語義與新鮮度規則 |
| [`src/storage-contract.ts`](src/storage-contract.ts) | 共享驗證：版本門禁、未知事件詞彙拒絕、批次實體化、連續性 |
| [`src/errors.ts`](src/errors.ts) | 穩定的控制代碼/所有權失敗與格式拒絕 |
| [`src/revision.ts`](src/revision.ts) | 帶品牌型別的不透明修訂值 token |
| — | 不釋出執行時不變式伴生入口；持久化正確性需要後端往返與崩潰尾部測試；本包不暴露可持續觀察的程序內關係。 |

### 寫入路徑概覽

寫入器工作階段的每個 `session/event` 都複製進該控制代碼的內部緩衝。第一個待處理事件開啟固定批處理視窗；後續事件加入但不重置截止時間。視窗到期後經由控制代碼的修改鏈排空待處理字首；排空期間接納的事件按順序合併進下一個鏈上的批次。`session/flush` 取消等待並排空至完全停穩，隨後執行 `handle.flush()`，因此 loop 在下一輪次前把它用作排序與錯誤觀察檢查點。失敗的後臺排空保留其事件並暫停自動計時器；顯式 flush、寫入器 close 或後端拆卸會立即重試，並在再次失敗時明確返回拒絕。建構 seed 事件絕不發出 `session/event`，因此釋出前透過控制代碼追加的 seed 絕不會被重新入隊。

### 儲存記錄驗證

seam 的共享輔助函式驗證由 `SESSION_FORMAT_VERSION` 標識的目前邏輯記錄，append 只寫目前格式（[理由](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)）。歷史解碼與不可變後繼釋出屬於各提供者內部，並在其返回控制代碼前完成。每個後端都在控制代碼讀取與寫 open 預熱時執行 `storage-contract` 驗證，把未知事件型別作為 `SessionFormatUnsupportedError` 拒絕，把格式錯誤的目前記錄作為 `SessionPersistenceCorruptionError` 拒絕，並在後端為每個工作階段保留一份產物時附上原始日誌的 `SessionLocation`。

</details>
-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享永續性模型逐步進入隨產品交付的後端與決策證據。

- [工作階段持久化子系統](../../../docs/subsystems/persistence.zh.md)——完整服務約定、控制代碼語義、flush 檢查點、崩潰恢復與生成的 Cordis API。
- [基於控制代碼的持久化 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.zh.md)——seam 設計及其所有權模型。
- [JSONL 持久化後端](../session-persistence-jsonl/README.zh.md)——隨產品交付、按工作階段儲存檔案的後端。
- [工作階段檢查點策略](../session-checkpoint-policy/README.zh.md)——在語義邊界上經由 `session/flush` 重新整理的外掛。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

### 恢復的對話歷史

#### 模型看到什麼

seam 不新增提示詞或 schema。恢復會將已儲存的表層事件還原為訊息歷史；已儲存請求 header 重建較早呼叫，新 loop 則為下一次請求組合目前系統提示詞、工具與工作階段字首。崩潰修復將沒有持久呼叫的 assistant 請求標記為 `TOOL_NOT_STARTED`；有持久呼叫但無結果時變為 `TOOL_OUTCOME_UNKNOWN`，其文字允許模型重試只讀或冪等工作，但要求驗證副作用或詢問使用者，而不是盲目重試。

#### Token 影響

普通持久化期間為零 token。恢復後會重新計入保留歷史的 token 用量，並照常計入目前請求 envelope 的 token 用量；每個已修復呼叫都會增加一段以引用形式保留的錯誤文字。

#### KV Cache 影響

持久化不修改目前請求字首。只有當重建歷史、目前 envelope 與模型路由匹配時，恢復 loop 才能重用提供者快取；崩潰修復結果僅追加，不重寫較早歷史。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制界定 seam 保證的終點。它們是目前包約束，不是待辦事項。

- **seam 只保證單個後端實例內的寫所有權**——跨程序排他由具體提供者負責。隨產品交付的 JSONL 提供者透過核心鎖在不同實例和程序之間提供租約；其他提供者必須記錄等效保證，或要求部署方阻止並行寫入。
- **在有活躍工作階段時過載後端外掛會使其寫入器明確報錯**——過載後的後端無法服務舊實例簽發的控制代碼；寫入會持續失敗直到工作階段重新啟動，沒有任何機制靜默重新接管日誌。
- **只有透過控制代碼取得的工作階段才會持久化**——僅靠 `ctx.sessions.create` + `session/flush` 不儲存任何內容；agent-loop 是生產環境的取得點，測試透過 `create`/`append`/`close` 寫入初始儲存資料。
- **無刪除或保留介面**——剪枝已儲存工作階段屬於帶外後端維護。
- **`list()` 無分頁且無過濾**——它返回每個已儲存工作階段的快照；適合本地儲存，大規模時無索引。
- **合成 closer 是唯一崩潰方案**——恢復透過寫控制代碼追加 `interruptedTurnClosers`；沒有繼續中斷輪次而不先關閉它的部分輪次恢復。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
