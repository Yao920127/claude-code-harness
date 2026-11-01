# Agent Note: 工作階段 surface：事件日誌上的有序投影

Status: implemented

[English](2026-06-18-session-surface.md) | 中文

## 問題

事件日誌是權威資料來源，但歷史操縱此前沒有持久化的共享機制。如果沒有這樣的機制，上下文壓縮（context compaction）等外掛會透過順序敏感的監聽器改寫派生請求，卻不記錄每次替換使用了哪些事件。每次新增歷史操縱時，還必須修改 `deriveMessages()`。

## 決策

新增一個 **surface**：事件 seq 的派生並快取的有序投影（即產出 LLM（大語言模型）訊息的事件子集），透過事件日誌中的 `surfaceOp` 標記維護。

### `SessionEvent` 的頂層 surface 中繼資料

surface 中繼資料僅屬於四種 surface 事件型別（`system/message`、`user/message`、`assistant/message`、`tool/result`）：

- **`sourceEventSeqs?: SessionSeq[]`**：被引用為資料來源的早期事件 seq 編號，例如 result 引用的 `tool/call`，或被 compaction marker 遮蔽的 surface 節點。出現的列表必須非空、唯一、更早且已知。`assistant/message` 嵌入其 provider stream，不能攜帶該欄位。如果沒有這些引用的 seq，回放就無法驗證 replace-range 操作是否列出了它移除的每個事件。
- **`surfaceOp: SurfaceOp`**：每個 surface 事件必填的位置宣告。已知僅日誌事件禁止兩個中繼資料欄位；原生未知或已退役的可忽略信封保持不透明。

### SurfaceOp：兩種操作

[與原始碼同步的 `SurfaceOp` 參考](../../../../docs/subsystems/session.zh.md#surface-types)定義了精確聯合型別。替換物件僅包含 `op`、`startSeq` 和 `endSeq`；端點使用 `SessionSeq` 品牌。

1. **Append**：在尾部追加新事件的 seq。`system/message`、`user/message`、`assistant/message`、`tool/result` 使用此操作。agent loop（智慧代理迴圈）在所有此類追加上傳入 `surfaceOp: 'append'`，並在適用時記錄 `sourceEventSeqs`：`tool/result` 記錄其 `tool/call` 來源，`assistant/message` 則直接擁有其嵌入式 stream。

2. **Replace**：移除從 `startSeq` 到 `endSeq`（兩端包含）的條目，並在其位置插入新事件的 seq。`startSeq` 和 `endSeq` 都必須存在於目前 surface；`startSeq === endSeq` 表示替換單個條目。該事件的 `sourceEventSeqs` 必須包含所有被遮蔽的 surface seq。被遮蔽的事件仍留在日誌中，但不再出現在 surface 上。

### SurfaceManager：基於增量，而非全量重建

一個 `Session` 擁有一個 `SurfaceManager`，後者維護事件 seq 的有序 `SessionSeq[]`。管理器會在提交前驗證每個種子或追加候選項而不應用它，然後只處理上次同步之後已經提交的事件，而不重新掃描整個日誌。`Session.surface` 透過只讀的 `SessionSurface` 約定暴露同一個管理器，因此接納、派生歷史、壓縮與工作區上下文共享同一份增量狀態。Replace 按陣列位置定位兩個端點（均包含在範圍內），並把替換 seq splice 到該範圍；不會用第二個管理器、連結物件或 seq 到節點的 map 來重複表達順序。

無新事件時增量處理為 O(1)，有新事件到達時為 O(新事件數)。

`deriveMessages()` 以遍歷 surface 作為唯一派生路徑。缺少必填標記的 surface 事件無效，不會被視為隱式追加。

### 持久化

這些欄位作為頂層 JSON 屬性序列化。JSONL 無需單獨列對映即可保留位置與源事件引用。[V3 規範信封決策](2026-09-06-v3-canonical-session-envelopes.zh.md)負責精確替換鍵與嚴格准入依據；[V2 到 V3 規範](../../../../packages/session/session-format-v2-to-v3/README.zh.md#canonical-envelopes)負責歷史轉換。本文繼續負責有序投影的所有權與替換依據。

### 崩潰恢復

`repair.ts` 模組在崩潰後為孤立的工具呼叫合成 `tool/result` 閉合事件。這些閉合事件攜帶 `surfaceOp: 'append'` 和指向孤立 `tool/call` 事件的 `sourceEventSeqs`，確保重建的 surface 有效。

### 不變式

`Session` 在始終啟用的 seed/append 邊界驗證 `sourceEventSeqs` 與 `surfaceOp`：source list 必須非空、唯一、更早且已知；`assistant/message` 不攜帶 source list；replacement endpoint 必須存在於 surface 順序中；`sourceEventSeqs` 必須覆蓋每個被遮蔽的節點。這些是單記錄接納與儲存投影規則，不是由可選 invariant service 提供的規則。

每個可進入 surface 的事件都必須攜帶 `surfaceOp`，否則它將從派生歷史中消失。型別化的 `append` 過載對字面事件型別強制執行此規則；`append` 和種子建構函式中的執行時檢查覆蓋寬化聯合型別和目前已載入日誌。已釋出格式的驗證與轉換屬於各自版本化遷移邊，而不屬於通用 Session 程式碼；參見 [V2 到 V3 位置規則](../../../../packages/session/session-format-v2-to-v3/README.zh.md#canonical-envelopes)。

## 曾考慮的替代方案

- **逐外掛的 `agent/request` 包裝**（surface 之前的歷史操縱模式）：監聽器排序脆弱、無法持久記錄改動內容，且每種新操縱都迫使核心 `deriveMessages()` 再次修改。
- **半開區間 `[start, endExclusive)` 的 replace 範圍**：否決。端點由 surface 事件 seq 命名，單條目替換（`startSeq === endSeq`）在閉區間語義下讀起來更自然。
- **連結節點物件加 seq map**：否決。生產程式碼不讀取前驅連結，唯一的後繼用途就是陣列中的下一個位置，而替換本來就需要線性 `indexOf` 查詢。單個 seq 陣列在保留相同漸進複雜度的同時，只留下一個需要驗證的表示。
- **髒標記後全量重建**替代增量處理：在工作階段生命週期內為 O(N²)，每次單事件追加都要重新掃描所有先前事件。

## 後果

- **`packages/core/session`**：`surface.ts`（`SurfaceManager`）維護一個用於候選接納和即時投影的有序 seq 陣列；`SessionSurface` 是其只讀公共檢視。`SurfaceOp`/`SurfaceIntent` 與頂層工作階段事件欄位記錄條目如何加入它。`append()` 要求 surface 事件攜帶 `SurfaceIntent`，`deriveMessages()` 以遍歷 surface 作為唯一派生路徑，`repair.ts` 則發出 surface 感知的閉合事件。種子建構函式拒絕缺少 `surfaceOp` 標記的可進入 surface 的種子事件（見「不變式」一節）。
- **`packages/core/agent-loop`**：所有涉及 surface 事件的追加操作都傳入 surface 選項。每個 `assistant/message` 都嵌入精確提供者 stream，並禁止 `sourceEventSeqs`；每個 `tool/result` 都引用其 `tool/call` seq。
- **`packages/session/session-persistence-jsonl`**：持久化規範 surface 中繼資料，並透過經過驗證的格式準備恢復目前事件。
- **`packages/session/session-persistence`**：儲存所有權與記憶體 surface 投影保持分離。

surface 是歷史操縱賴以落實的基礎——dsh-compaction 的壓縮就搭載於其上。壓縮或 tool-result-pruner 外掛追加一個既有的訊息產出事件型別（例如一條攜帶摘要的 `user/message`），附帶 `surfaceOp: { op: 'replace', startSeq, endSeq }` 和覆蓋被遮蔽條目的 `sourceEventSeqs`——新事件在 surface 上取代該範圍的位置，而外掛自身的 trace 事件（如 `compaction/start`、`compaction/end`）不進入 surface。回放以確定性方式保留該決策。

一次 `tool/result` 替換隻能改寫目前的一個 `tool/result`，並且必須保留除 `content` 以外的每個資料欄位。Session 接納會與位置範圍和引用的源事件驗證一起強制這條規則，不依賴可選的診斷外掛。
