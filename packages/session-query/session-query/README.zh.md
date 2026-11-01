---
description: "面向消費方與後端作者的統一工作階段歷史查詢服務：對即時與持久化工作階段日誌的精確讀取、關係追蹤與提供者無關過濾。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-query

[English](README.md) | 中文

## 概述

`dsh-session-query` 讓應用程式碼可以列出、過濾、讀取和搜尋工作階段歷史，檢查帶邊界的事件上下文，並追蹤工作階段或事件關係。讀取優先使用即時工作階段而非持久化副本，並返回來自同一次一致觀察的脫離儲存克隆。精確讀取、過濾與追蹤可用於任何受支援的儲存設定；帶排名的全文搜尋需要 `dsh-session-query-sqlite` 等後端。當應用程式碼需要以程式設計方式存取呈現給模型的歷史時，請使用本包。

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

當你需要讀取或搜尋工作階段歷史、而不直接觸碰工作階段服務或儲存後端時，從應用程式碼使用 `ctx.sessionQuery`。該服務由具體後端外掛提供——已釋出組合掛載 `@deepseek-ai/dsh-session-query-sqlite`（[README](../session-query-sqlite/README.zh.md)）——因此本包從不單獨掛載。一旦組合了後端，以下全部能力都可在 `ctx.sessionQuery` 上使用。

### 你可以做什麼

| 操作 | 你得到什麼 |
|---|---|
| `listSessions()` | 每個邏輯工作階段，最新的在前，帶 `live` 與 `persisted` 可用性標誌 |
| `readSession(id)` | 經過回放驗證的完整原始事件日誌，且不會讓該工作階段變為即時 |
| `filterSessions(filters)` | 匹配 AND 連線的中繼資料與可用性謂詞的工作階段 |
| `filterEvents(id, filters)` | 匹配中繼資料與字面文字謂詞的語義事件文件 |
| `readTitleSnapshots(ids)` | 每個工作階段的最新摺疊標題，繫結到其來源 header |
| `listEvents(id)` / `readSurface(id)` | 輕量逐事件記錄，或完整的目前模型表層 |
| `readEvent(request)` | 一個完整事件加其周圍有界的原始日誌視窗 |
| `traceSession(id)` | 已知祖先鏈與遞迴後代樹 |
| `traceEvent(request)` | 一個事件的位置替換與被引用源事件關係 |
| `searchSessions(request)` / `searchEvents(request)` | 全文搜尋分頁結果，由掛載的後端實作 |

不帶正文的記錄只公開 `SessionHeader.isSeeded`。返回事件正文的讀取（`readSession`、`readSurface`、`readEvent`）與保留的 `SessionObservation` 值還攜帶精確 `inheritedEventCount`，因此呼叫方無需從日誌推斷切點即可區分繼承事件與自有事件。

### 過濾器

`SessionResultFilter` 按 id、可空 cwd、建立時間範圍、可空父級或來源可用性縮小工作階段範圍；`SessionEventResultFilter` 按 seq/時間範圍、事件型別、表層或字面文字縮小事件範圍。過濾器陣列使用 AND 連線，同一子句內的列表值使用 OR；空列表值不匹配任何內容，範圍包含端點，格式錯誤的範圍或未知的封閉聯合值以 `SESSION_QUERY_INVALID_FILTER` 失敗。

文字子句是對所提取語義文字的字面、不區分大小寫、空白靈活的掃描——而非全文查詢。需要任意子字串召回時使用它；需要帶排名的全文結果時使用掛載後端的搜尋方法。

### 設定

繼承的旋鈕透過掛載後端的設定設定：

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `readWindowMax` | `50` | `readEvent` 接受的 `before`/`after` 原始事件數上限 |
| `persistedReadConcurrency` | `4` | 一次批次標題讀取中的並行持久化日誌讀取數 |
| `preparedSessionCacheSize` | `5` | 為跨 `observeSession` 讀取複用而保留的冷 prepared-Session 觀察數 |

### 失敗與恢復

失敗帶有穩定的 `SessionQueryError.code` 型別。你會遇到的包括：id 不存在時 `SESSION_QUERY_SESSION_NOT_FOUND`；同一工作階段的即時與持久化觀察在不可變 header 上不一致時 `SESSION_QUERY_SOURCE_CONFLICT`；已掛載持久化不可讀時 `SESSION_QUERY_PERSISTENCE_FAILED`；持久化記錄未透過 Session 驗證，或即時或 prepared 觀察的投影計算失敗時 `SESSION_QUERY_CORRUPT_SESSION`；載入的日誌破壞表層約定時 `SESSION_QUERY_INVALID_SURFACE`。投影失敗會將原始錯誤保留為 `cause`。針對已知即時工作階段的讀取從不查詢持久化，因此後端故障不會讓目前記憶體歷史變得不可讀。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本服務建立在一個分離與三項承諾之上：

- **即時優先的邏輯語料庫。** 每次讀取都解析一個一致的觀察：即時 `ctx.sessions` 優先，可選的 `ctx.sessionPersistence` 補充其餘部分，衝突的不可變 header 寧可失敗也不合並。
- **脫離儲存的結果。** 所有返回的 header、事件與記錄都是克隆；不暴露即時狀態，也不保留訂閱。
- **精確讀取具體，搜尋抽象。** 讀取、過濾與追蹤在此只實作一次；兩個全文方法是由後端擁有的唯一抽象表面。
- **一次規範的表層摺疊。** `listEvents`、`readSurface` 與 `traceEvent` 使用同一個 `dsh-session` 摺疊驗證整個日誌，因此搜尋與追蹤和模型歷史推導一致。

決策歷史記錄在[統一服務決策](../../../.agents/notes/archived/architecture/2026-07-23-unified-session-query-service.md)、[追蹤筆記](../../../.agents/notes/archived/feature/2026-07-13-session-query-tracing.md)與 [SQLite 提供者筆記](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)中。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務定義：抽象 `SessionQueryEngine`、具體讀取、設定驗證 |
| [`src/corpus.ts`](src/corpus.ts) | 即時優先的語料庫解析、可選持久化繫結、批次投影 |
| [`src/observation.ts`](src/observation.ts) | 即時優先的定點觀察，帶按修訂鍵控的有界 prepared-Session 快取 |
| [`src/cold-read.ts`](src/cold-read.ts) | 基於控制代碼的冷日誌讀取，附記憶體中的中斷輪次閉合事件 |
| [`src/types.ts`](src/types.ts) | 公共記錄、過濾器、請求與分頁型別 |
| [`src/config.ts`](src/config.ts) | 繼承設定與封閉的 `SessionQueryError` 分類體系 |
| [`src/filters.ts`](src/filters.ts) | 提供者無關謂詞與字面文字掃描 |
| [`src/extraction.ts`](src/extraction.ts) | 按事件型別的第一方語義文字提取 |
| [`src/documents.ts`](src/documents.ts) | 表層感知的語義文件投影 |
| [`src/tracing.ts`](src/tracing.ts) | 一次性工作階段血緣與事件關係追蹤 |
| [`src/sources.ts`](src/sources.ts) | 不可變 header 相容性檢查 |
| — | 不釋出執行時不變式伴生入口；查詢結果是每次呼叫產生的不可變投影，其血緣與事件關係會在建置時完成驗證；服務不保留可觀察的結果狀態。 |

### 語料庫解析

`SessionCorpus` 透過 fiber 繫結可選的 `ctx.sessionPersistence`，並即時優先解析每次讀取：已知即時目標直接快照，不查詢持久化；否則先列出工作階段，再透過短生命週期的讀取控制代碼完整讀出日誌，並在克隆前重新檢查是否出現即時掛載。寫入者在輪次中途崩潰的冷日誌用 `interruptedTurnClosers` 在記憶體中補齊——讀取從不修改持久化。列表與載入觀察之間會斷言 header 相容性。批次標題讀取執行一次中繼資料列表與有界並行讀取，把逐工作階段失敗隔離，而取消會拒絕整個批次。

### 觀察快取

`observeSession` 不經過列表預檢直接建置定點觀察。即時觀察以目前日誌長度固定 cut，並在首次讀取時才物化 `events`，因此只需要 header、cursor 或 projection 的消費者永遠不會複製日誌；日誌只會追加，所以延後的首次讀取得到的仍然正好是該字首。冷路徑先對儲存工作階段執行 `stat`，再查詢自有的有界快取，快取鍵為持久化實例加 `stat` 修訂：修訂未變則複用已恢復的未釋出 Session，不再重讀日誌；修訂變化或持久化實例被替換則經控制代碼 seam 重新載入並替換條目。快取保留 `preparedSessionCacheSize` 個條目並按最久未用淘汰，被活躍觀察租約釘住的條目從不被淘汰；讀取中途轉為即時的工作階段會重試即時路徑。

### 讀取與追蹤

`readSession` 透過 `Session.create` 回放日誌，複用恢復的驗證。`readSurface`、`listEvents` 與 `traceEvent` 共用一次 `foldSurface` 遍歷，把事件分類為 `current`、`shadowed` 或 `log-only`，並驗證從零開始且連續的 seq、表層標記的適用性以及替換或引用完整性；任何違規都以 `SESSION_QUERY_INVALID_SURFACE` 失敗。追蹤是一次性的：工作階段血緣只讀取一次語料庫並確定性遍歷父級與後代樹；事件追蹤沿位置替換者跟進到最終節點，同時保持被引用源事件連結不傳遞。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享查詢詞彙逐步進入具體後端與決策證據。

- [工作階段查詢子系統參考](../../../docs/subsystems/session-query.zh.md)——完整型別級約定：記錄、過濾器、搜尋頁、血緣、有界讀取與錯誤。
- [dsh-session-query-sqlite](../session-query-sqlite/README.zh.md)——已釋出的全文後端及其索引生命週期。
- [dsh-tool-session-query](../tool-session-query/README.zh.md)——建置在本服務之上的面向模型消費方。
- [工作階段查詢關係追蹤](../../../.agents/notes/archived/feature/2026-07-13-session-query-tracing.md)——追蹤語義與驗證邊界。
- [SQLite FTS5 工作階段搜尋](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)——搜尋表面如何實作與對帳。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該可信查詢服務只向呼叫方返回克隆記錄，且不註冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **無呼叫方授權**——這是上下文範圍內的可信基礎設施；模型工具或 UI 必須限制呼叫方可檢查的工作階段。
- **無提供者協調器或退回**——服務在搜尋上是抽象的，組合必須掛載具體後端；沒有搜尋提供者註冊表或退回實作。
- **精確讀取回放整個日誌**——`readSession`、`readSurface`、`filterEvents` 與事件追蹤會載入並驗證完整邏輯日誌，因此非常大的歷史每次呼叫都要付出完整檢查；`listSessions` 保持輕量。
- **字面文字掃描，而非全文搜尋**——`text` 過濾器用正規表示式掃描提取出的文件且不提供排名；帶排名的搜尋需要掛載後端。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 未來：提取器與搜尋提供者註冊表

對被引用源事件的遞迴遍歷、提取器與搜尋提供者註冊表以及更多面向模型表面均被推遲；[tool-session-query README](../tool-session-query/README.zh.md)說明了目前的消費方表面。

</details>
