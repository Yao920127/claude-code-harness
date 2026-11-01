---
description: "SQLite 儲存後端：面向在單個資料庫檔案中選擇、設定或排查按行儲存文件的 KV 儲存的主機與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-storage-sqlite

[English](README.md) | 中文

## 概述

`dsh-storage-sqlite` 是一個儲存後端：把每個已路由單元託管在同一個 SQLite 資料庫檔案中，每條記錄按行儲存一份 JSON 文件，註冊為後端 `sqlite`。單條記錄更新恰好觸碰一行，這正是它適合高頻定點寫入的原因。當領域資料變動頻繁、或部署偏好單一可查詢資料庫時選擇它；當資料需要以純文字檔案形式可讀時選擇 JSON 後端。本後端只面向主機側：它不貢獻提示詞、工具或 schema，因此模型與 agent loop（智慧代理迴圈）永遠不會看到它。

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

當組合把頻繁更新的領域資料儲存在一個資料庫中時使用本包：把相關領域路由到此後端，每個單元即作為表物化在設定的資料庫檔案中。

### 何時選擇

當寫入頻繁且為定點更新時選擇它——每個鍵恰好對映到一行，因此更新一條記錄只觸碰一行，而不是重寫整個檔案。當人類需要以純文字檔案檢視或編輯已存資料時選擇 JSON 後端。同步的 `node:sqlite` 驅動會在每條單語句呼叫期間阻塞 JavaScript 執行緒，這在領域資料規模下可以接受，但高寫入率時值得納入考量。

### 設定

兩個欄位：資料庫路徑與 journal mode。`:memory:` 開啟一個程序內資料庫，其內容隨程序消失。

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-sqlite'
  config:
    path: /var/lib/dsh/data.db
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: sqlite
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `path` | 必填 | SQLite 資料庫檔案路徑，或 `:memory:` |
| `journalMode` | `wal` | Journal mode：`wal`、`delete`、`truncate` 或 `persist` |

`wal` 適合本地磁碟；復原日誌模式（`delete`／`truncate`／`persist`）適合 WAL 共享記憶體檔案不可用的檔案系統，例如網路掛載。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-storage-sqlite)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 可觀察行為

缺失的目錄與資料庫檔案會以僅所有者可存取的權限建立（`0o700`／`0o600`）；已有資料庫保持其既有模式。已存格式版本與描述符不同的單元拒絕 `version-mismatch`，蓋有非目前物理佈局版本的資料庫會直接拒絕——不做遷移，預釋出立場。失敗攜帶穩定的 `StorageError` 程式碼，寫入操作完成後即已持久化。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本後端是在單個 `node:sqlite` 連線之上的文件按行佈局，設計目標是讓每次按鍵更新都是一條預處理語句。

### 設計理念

- **每行一份文件。** 每個單元表都變成一張物理 STRICT 表 `u_<unit>_<table> (key TEXT PRIMARY KEY, value TEXT)`，其 `value` 列儲存記錄的 JSON 文字；全域單例存放在共享的 `unit_globals` 表中。一個鍵的更新恰好觸碰一行——這就是把高頻變更領域路由到這裡的原因。
- **單語句原子性。** 每個寫入原語都是一條預處理語句，因此 SQLite 的逐語句原子性無需顯式事務即可滿足 KV 約定；寫入順序仍由呼叫方負責（領域層的寫入鏈）。
- **名稱在 DDL 之前驗證。** 單元名與表名在進入 DDL 之前必須匹配 `UNIT_NAME_RE`，因此任何外部輸入都不會被插值進 SQL 識別符號。
- **版本明確報錯。** 物理佈局版本存放在 `PRAGMA user_version`（全新資料庫最後蓋戳）；單元格式版本存放在 `units` 表中。任何其他已標記值都會被拒絕——不做遷移。

### 開啟順序

開啟資料庫時會以 `0o700` 建立父目錄、以 `0o600` 獨佔建立缺失檔案、應用 `PRAGMA foreign_keys = ON` 與 journal mode、檢查 `user_version`、建立 `units` 與 `unit_globals` 中繼資料表，並在最後給全新資料庫蓋戳，讓失敗留下未蓋戳的介質。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：後端註冊、`path`／`journalMode` 設定、單元表 |
| [`src/schema.ts`](src/schema.ts) | 開啟順序、物理佈局版本、中繼資料表、記錄表命名 |
| [`src/unit.ts`](src/unit.ts) | 一個已開啟單元：預處理語句、JSON 值解析、關閉 |
| — | 不釋出執行時不變式伴生入口；schema 版本與單元版本的一致性在開啟時檢查，不一致時會在單元建立前拒絕開啟；永續性需要由共享 KV 符合性測試套件中的後端往返測試驗證；本包不暴露可持續觀察的程序內關係。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當本後端視角不夠用時閱讀以下頁面：子系統參考是權威約定，兄弟後端展示了另一種介質。

- [儲存子系統](../../../docs/subsystems/storage.zh.md)——後端約定、領域語義與生成的 API。
- [儲存包對映](../README.zh.md)——家族的各包及其在儲存庫中的位置。
- [JSON 儲存後端](../storage-json/README.zh.md)——面向小而可檢查資料的人類可讀介質。
- [領域 KV 儲存 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——後端家族背後的設計與被推遲的工作階段後端遷移。

-----

<a id="model-experience"></a>
## 模型體驗

### 已存領域記錄

#### 模型看到什麼

無。本後端不貢獻提示詞、工具或 schema；它在 `ctx.storage` 後面持久化非工作階段領域資料，只供主機側消費方使用。

#### Token 影響

即時請求 token 為零。

#### KV Cache 影響

無：本後端從不觸碰即時請求字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本後端何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是任務積壓。

- **同步驅動阻塞事件迴圈**——每次寫入都是一次同步 `DatabaseSync` 呼叫；阻塞只持續一條語句，在領域資料規模下可以接受。
- **沒有忙等待或重試策略**——持有寫鎖的競爭連線會立即拒絕操作，而不是等待；領域層的寫入鏈在單程序內序列化寫入，跨程序協調不在範圍內。
- **只開啟目前的物理佈局版本**——任何其他已標記的 `user_version` 都會被拒絕而不是遷移（預釋出立場）。
- **開啟順序與查詢提供者重複**——`openDatabase` 與 `session-query-sqlite` 都強制執行 SQLite 檔案所有權約束，但兩個包各自擁有不同的應用標識與 schema；沒有共享介質輔助模組將二者耦合。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
