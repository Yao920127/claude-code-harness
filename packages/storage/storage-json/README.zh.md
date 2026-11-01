---
description: "JSON 儲存後端：面向在設定根目錄下選擇、設定或排查整單元檔案與逐記錄檔案的主機與維護者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-storage-json

[English](README.md) | 中文

## 概述

`dsh-storage-json` 在設定的根目錄下把領域資料存為可讀 JSON，並註冊為後端 `json`。預設的 `single` 佈局為每個單元儲存一份完整的 `<unit>.json` 檔案；`per-record` 佈局為每條記錄儲存一份帶版本戳的文件。兩種佈局都以原子方式釋出每個變更檔案，領域層負責安排呼叫順序。當運維方需要可檢查檔案且所選佈局適合寫入量時選擇它；對於更大或高並行的資料則選擇 SQLite。本後端只面向主機側，不貢獻提示詞、工具或 schema。

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

當組合需要可讀、可編輯的 JSON 儲存時使用本包。把相關領域路由到 `json` 後端；每個領域規範選擇 `single` 或 `per-record` 佈局。

### 何時選擇

小型單元需要一份完整、美化列印的檔案時，選擇預設的 `single` 佈局。定點寫入只應替換一份記錄文件時，選擇 `per-record`。當資料量大、寫入頻繁或多條記錄需要事務更新時，選擇 SQLite 後端。

### 設定

唯一的外掛欄位是 `root`，用於儲存單元檔案與目錄。它是必填項，因為本後端不退回到 `process.cwd()`。後端按需以 `0o700` 模式建立根目錄。領域規範選擇其佈局；本外掛不提供佈局覆蓋項。

```yaml
- name: '@deepseek-ai/dsh-storage'
- name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/data
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `root` | 必填 | 儲存 `<unit>.json` 檔案與 `<unit>/` 目錄樹的目錄；按需以 `0o700` 建立 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-storage-json)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 可觀察行為

缺失的 `single` 檔案或 `per-record` 目錄會作為空單元開啟，並在第一次寫入時物化。在 `single` 中，畸形內容以 `malformed-medium` 拒絕，不同的已存版本以 `version-mismatch` 拒絕。在 `per-record` 中，每份畸形或不可讀的文件，以及版本不在描述符的目前版本和相容版本內的文件，都讀作記錄不存在，因此單個壞文件不會使單元被拒絕。記錄鍵必須匹配 `[a-zA-Z0-9_-]+`；不安全的鍵在任何檔案操作前被拒絕。每次已完成的寫入都已持久化，關閉後的操作以 `closed` 拒絕。

只有當源單元名稱匹配，且源版本為目前版本或已宣告的相容版本時，空的 `per-record` 目錄樹才可以從有效的 `<root>/<unit>.json` 整單元文件初始化其已宣告表。後端保持該原始檔不變，併為遷移的記錄寫入目前版本戳。接受集合之外的源版本會使新目錄樹保持為空。已宣告表中只要存在任意文件路徑，或存在已宣告的 `global.json`，就會對整個單元禁止該初始化，即使該文件不可讀或版本陳舊。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

兩種佈局共享原子釋出機制，但以不同方式確定狀態所有權。`single` 擁有一份記憶體單元投影；`per-record` 把目錄樹視為權威狀態。

### 設計理念

- **`single` 以記憶體為權威狀態。** 每次寫入都會更改記憶體單元、序列化其完整狀態，並以原子方式替換 `<unit>.json`。釋出失敗會恢復先前的記憶體值。
- **`per-record` 以目錄為權威狀態。** 每次 put 或 delete 都會更改一個 `<unit>/<table>/<key>.json` 文件，`loadAll()` 則重新讀取目錄樹。每份文件都帶有單元版本戳與一條記錄值。
- **每次呼叫都持久釋出。** 寫入過程使用臨時檔案、fsync、原子 `rename()` 替換，並在 POSIX 上 fsync 父目錄。領域層寫入鏈負責安排跨呼叫的順序。

### 檔案格式

`single` 文件攜帶單元標識、全域單例與所有表：

```json
{
  "unit": { "name": "workspace", "version": 1 },
  "global": null,
  "tables": { "workspaces": { "<key>": { "path": "/work/demo" } } }
}
```

`per-record` 表文件位於 `<root>/<unit>/<table>/<key>.json`，形式為 `{ "version": 1, "record": <value> }`；可選的全域值使用 `<root>/<unit>/global.json`。格式版本來自領域規範。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：後端註冊、`root` 設定、單元開啟／關閉表 |
| [`src/single-unit.ts`](src/single-unit.ts) | 一個 `single` 單元：權威記憶體、寫入原語與釋出復原 |
| [`src/per-record-unit.ts`](src/per-record-unit.ts) | 一個 `per-record` 單元：目錄樹讀取、路徑安全記錄與單文件寫入 |
| [`src/format.ts`](src/format.ts) | 帶版本驗證的整單元與記錄序列化 |
| [`src/atomic.ts`](src/atomic.ts) | 原子檔案替換：臨時檔案寫入、fsync、rename、目錄 fsync |
| — | 不釋出執行時不變式伴生入口；此處要求保證寫入永續性及釋出後重新解析的等價性，這兩點需要透過介質往返測試（共享後端符合性測試套件）驗證；本後端不公開任何可持續觀察的程序內關係。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當本後端視角不夠用時閱讀以下頁面：子系統參考是權威約定，兄弟後端展示了另一種介質。

- [儲存子系統](../../../docs/subsystems/storage.zh.md)——後端約定、領域語義與生成的 API。
- [儲存包對映](../README.zh.md)——家族的各包及其在儲存庫中的位置。
- [SQLite 儲存後端](../storage-sqlite/README.zh.md)——面向高頻資料的定點更新介質。
- [領域 KV 儲存 Agent Note](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——後端家族背後的設計及其延期工作。

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

- **`single` 會重寫整個單元**——每次寫入都重新發布完整單元檔案；當此成本過高時，使用 `per-record` 或把領域路由到 SQLite。
- **沒有跨程序寫鎖**——兩個程序寫入同一單元時可能交錯執行替換；對同一檔案的寫入以最後完成者為準。
- **Windows rename 沒有顯式 write-through**——永續性依賴 libuv 的 `rename()`（`MoveFileExW` 並啟用替換）；`log` 分面落實時，計劃把工作階段日誌後端更嚴格的 Win32 write-through 釋出輔助函式下移到此處。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

Agent Note 把整單元重寫的規模前提標記為風險：如果在被路由到 SQLite 之前，第二個消費方以千條記錄規模落到本後端，重寫成本會比預期更早顯現。緩解辦法是設定——把 `routes` 指向 SQLite 後端——而不是修改本包。

</details>
