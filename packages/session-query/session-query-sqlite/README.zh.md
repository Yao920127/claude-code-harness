---
description: "面向部署方與維護者的 SQLite FTS5 工作階段歷史全文搜尋後端，用於選擇、設定或排查查詢服務之上的全文搜尋。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-query-sqlite

[English](README.md) | 中文

## 概述

使用本包可為工作階段歷史增加帶排序的 SQLite FTS5 搜尋，既能跨工作階段搜尋，也能在單個工作階段內搜尋，並支援遊標分頁。它把即時與持久化歷史索引到獨立的派生資料庫，因此搜尋反映目前狀態，同時不會修改工作階段持久化儲存。精確讀取、過濾與追蹤仍透過同一查詢 API 提供。已釋出組合中的搜尋是可選能力；設定 `openAt` 可讓索引在啟動時、首次搜尋時開啟，或永不開啟。結果匹配 token 與短語，而非任意子字串；每個索引路徑只能由一個程序持有。

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

當組合需要對工作階段歷史進行排序後的全文搜尋時——例如 Web 內容搜尋或 `/resume` 既往工作檢索——掛載本包。常用路徑是顯式的：掛載外掛、給它一個專用資料庫路徑，然後從程式碼呼叫 `ctx.sessionQuery.searchSessions` 或 `searchEvents`。

### 何時選擇

當你想對既往工作階段進行帶排序與分頁的全文召回時選擇它。它與 `dsh-session-query` 和工作階段服務一起使用；持久化後端可選但建議掛載，這樣重新啟動後持久化歷史仍可搜尋。不要把 `path` 指向 session-persistence 資料庫——本包擁有獨立的派生索引。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-query-sqlite'
  config:
    path: /absolute/path/to/session-search.db
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `path` | 必填 | 專用派生索引 SQLite 路徑，或 `:memory:`；POSIX 上缺失的路徑會以僅所有者可存取的方式建立 |
| `openAt` | `startup` | `startup` 在啟用時開啟；`first-search` 把 SQLite 模組推遲到首次搜尋；`never` 關閉全文搜尋，繼承的讀取保持可用 |
| `journalMode` | `wal` | `wal`、`delete`、`truncate` 或 `persist` |
| `defaultLimit` | `20` | 請求省略 `limit` 時的分頁大小 |
| `maxLimit` | `100` | 接受的最大請求分頁大小 |
| `snippetChars` | `240` | 按 Unicode 碼點計算的最大 snippet 長度 |
| `readWindowMax` | `50` | 繼承的 `readEvent()` 的 `before`/`after` 原始事件數上限 |
| `persistedReadConcurrency` | `4` | 繼承批次讀取的並行持久化日誌讀取數 |
| `preparedSessionCacheSize` | `5` | 繼承的 `observeSession` 讀取器為複用保留的冷 prepared-Session 觀察數 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-query-sqlite)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 搜尋行為

`searchSessions` 搜尋整個語料庫，並按每個工作階段匹配最強的事件分組結果；`searchEvents` 搜尋一個邏輯工作階段。查詢是字面短語：首尾空白會被移除、內部空白會被規範化，引號、`OR`、`NEAR` 和 `*` 等 FTS5 語法被視為資料，絕不作為可執行查詢語法。中繼資料過濾器（工作階段 id、cwd、建立時間、父級、可用性、事件 seq/時間/型別/表層）在排序前縮小結果。預設搜尋全部 `current`、`shadowed` 與 `log-only` 事件；傳入表層過濾器可縮小範圍。

排序是確定性的：實際 FTS5 高亮匹配 span 更多的在前，然後文件更短的在前，事件時間、工作階段 id 與 seq 打破平局。結果攜帶按 `snippetChars` 個 Unicode 碼點截斷的純文字摘錄，沒有提供者專用數值分數。分頁透過不透明 `SessionSearchCursor` 延續，遊標繫結到規範化後的確切請求；相關語料庫變化時遊標變為陳舊（`SESSION_QUERY_STALE_CURSOR`），工作階段內遊標可在不相關工作階段變化後延續，跨工作階段遊標則不能。

`unicode61` tokenizer 匹配 token 與短語，而非任意子字串：`AI` 不匹配 token `BRAID`。需要執行字面、空白靈活的字串子串掃描時，使用帶 `text` 子句的 `ctx.sessionQuery.filterEvents()`。

### 何時推遲或關閉搜尋

使用 `openAt: first-search` 時，服務在不匯入 `node:sqlite`、不開啟索引的情況下啟用，把 SQLite 的實驗性警告推遲到首次實際搜尋；無效資料庫讓首次搜尋失敗，而不是服務啟用失敗。使用 `openAt: never` 時，全文搜尋對該部署關閉：`searchSessions` 與 `searchEvents` 在任何請求規範化之前就以 `SESSION_QUERY_SEARCH_DISABLED` 失敗，而繼承的全部精確讀取、過濾與追蹤保持可用。請求超過編譯謂詞預算（跨工作階段 14 個組合謂詞、工作階段內 13 個）或 SQLite 可移植的 32,766 繫結上限時，會在準備語句前以 `SESSION_QUERY_INVALID_FILTER` 失敗。

### 失敗與恢復

帶型別的 `SessionQueryError` 失敗攜帶穩定程式碼：搜尋設定為關閉時 `SESSION_QUERY_SEARCH_DISABLED`；索引無法開啟或對帳時 `SESSION_QUERY_INDEX_FAILED`；搜尋目標不存在時 `SESSION_QUERY_SESSION_NOT_FOUND`；語料庫在分頁之間變化時 `SESSION_QUERY_STALE_CURSOR`——請重試完整的搜尋呼叫；遊標不屬於該請求時 `SESSION_QUERY_INVALID_CURSOR`。取消在同步 SQLite 呼叫之間被尊重；已在 JavaScript 執行緒上執行的語句無法被中斷。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋後端背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本後端建立在一個分離與三項承諾之上：

- **派生索引，絕不動源儲存。** FTS 行存放在專用可丟棄資料庫中；這裡的程式碼從不開啟 session-persistence 資料庫。
- **即時優先的觀察。** 一個序列化狀態機比較持久化快照修訂，只透過短生命週期讀取控制代碼讀取新增或已更改日誌，並在一個事務中對帳，因此搜尋反映最新的穩定狀態。
- **世代繫結的遊標。** 每次語料庫變化都會遞增世代；遊標攜帶其建立時的世代，寧可陳舊失敗也不返回偏移後的頁面。
- **字面短語即資料。** 呼叫方查詢文字被引成一個 FTS5 短語，查詢語法保持惰性；保留高亮標記在索引前從文件中剝離。

設計歷史記錄在 [SQLite FTS5 工作階段搜尋筆記](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)與[統一服務決策](../../../.agents/notes/archived/architecture/2026-07-23-unified-session-query-service.md)中。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務：設定、openAt 生命週期、序列化對帳、查詢執行、遊標 |
| [`src/query.ts`](src/query.ts) | 請求規範化、參數化謂詞、摘錄、謂詞與繫結預算 |
| [`src/schema.ts`](src/schema.ts) | 資料庫 schema、application id 歸屬、原地重置、僅所有者檔案建立 |
| — | 不釋出執行時不變式伴生入口；系統會在每次序列化查詢邊界驗證對帳、遊標世代與派生索引歸屬。 |

### 索引生命週期

持久化 FTS 行存放在專用派生資料庫中並跨重新啟動保留；即時工作階段使用連線本地 TEMP 表，遮蔽同一工作階段的持久化基庫，並在即時所有者脫離後再次顯示基庫。兩類表都在數字 `seed_length` 中保留精確繼承切點；重建的 header 只公開 `isSeeded`，而切點參與即時指紋與持久來源修訂。每次搜尋執行一次序列化觀察：列出持久化快照、把逐工作階段修訂與已索引行比較、只透過讀取控制代碼讀取新增或已更改日誌（在記憶體中補齊被中斷的末尾輪次，從不寫回）、提取語義文件，並在執行查詢前於一個事務中提交對帳。重複查詢與不變的重新開啟不讀取任何內容；切換儲存或觀察到新增、已更改、已刪除或經外部修復的來源時，會在下次穩定觀察時對帳。來源或事務失敗不提交任何內容，下一次搜尋重試。

### Schema 歸屬

資料庫攜帶 application id 與 schema 版本 8。開啟時拒絕其他應用程式擁有的檔案或規範資料庫，拒絕未知使用者表；只有已識別的不相容派生 schema 才會原地重置——因此不相關或 session-persistence 資料庫絕不會被觸碰。在 POSIX 檔案系統上，缺失的目錄與資料庫檔案以僅所有者可存取的方式建立（程序 umask 前為 `0700` 與 `0600`）。每個派生索引路徑在一個程序中只能由一個服務擁有；世代與 TEMP 遮蔽狀態由連線持有。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享查詢服務逐步進入型別級約定與設計證據。

- [工作階段查詢子系統參考](../../../docs/subsystems/session-query.zh.md)——本後端實作的完整型別級約定。
- [dsh-session-query](../session-query/README.zh.md)——服務定義：本後端繼承的精確讀取、過濾與追蹤。
- [dsh-tool-session-query](../tool-session-query/README.zh.md)——呼叫這些搜尋方法的面向模型消費方。
- [SQLite FTS5 工作階段搜尋](../../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)——搜尋語義、對帳與 tokenizer 決策。
- [JSONL 工作階段持久化](../../session/session-persistence-jsonl/README.zh.md)——本可丟棄索引觀察的權威 Session store；其 root 必須與本包的資料庫路徑分開。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該搜尋後端只向呼叫方返回命中，且不註冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用 SQLite 對比或任務積壓。

- **無呼叫方授權**——這是上下文範圍內的可信服務；模型工具或 UI 必須強制執行自己的存取策略。
- **同步查詢執行**——`DatabaseSync` 在 MATCH 執行期間會阻塞 JavaScript 執行緒，且無法中斷已執行的語句。
- **Token 召回，而非任意子字串**——`unicode61` tokenizer 不會匹配更大 token 中的子字串；對字面掃描使用 `filterEvents()`。
- **單一所有者的派生索引**——每個索引路徑必須僅歸一個程序中的一個服務所有；不支援外部寫入者與多程序共享。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 未來：其他 tokenizer 與搜尋提供者

`unicode61` tokenizer 的選擇犧牲子字串召回，以換取較小的索引體積與雙字元 token 支援；trigram 備選方案經實測後被否決。切換 tokenizer 或增加另一個搜尋後端會改變索引召回，並需要各自的對帳與世代方案。

</details>
