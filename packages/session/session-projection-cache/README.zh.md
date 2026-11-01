---
description: "面向部署方與維護者的持久工作階段投影快取說明，用於選擇、設定或排查持久檢查點、零 I/O 列表讀取與加速的冷投影摺疊。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-projection-cache

[English](README.md) | 中文

## 概述

本包儲存持久的逐工作階段投影檢查點，讓歷史列表、統計資訊與 goal 快照無需載入每個工作階段日誌即可讀取快取值。冷投影摺疊可從已檢查點化的字首之後繼續，從而減少重新啟動後的工作量。工作階段日誌始終是權威：崩潰可能使檢查點陳舊，但不會使其領先於已提交事件；不相容記錄會被忽略或備份。當重新啟動的工作階段需要頻繁讀取投影時選擇本包；當投影只服務活工作階段，或額外儲存寫入與無限增長的檢查點保留成本超過節省的工作量時跳過本包。

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

當用戶端應在不載入日誌的情況下列出冷工作階段投影值時，把本包與投影註冊表及儲存棧一起掛載。沒有它時，消費方必須先取得日誌，才能重建冷投影值。

### 何時選擇

當部署會重新啟動工作階段，並需要為歷史列表、統計資訊或 goal 快照提供持久投影值時，選擇本包。當投影只服務活工作階段，或額外儲存寫入的成本高於所節省的投影工作時，跳過本包。

### 最小設定

兩個節流欄位均必填——寫入節奏是部署選擇，沒有普適正確值：

快取透過儲存棧開啟自己的域，因此 base 先掛 `storage`、`storage-json`（根 `dshHomePath('storages')`）與 `storage-domain`（`backend: json`）：

```yaml
- id: session-projection-cache
  name: '@deepseek-ai/dsh-session-projection-cache'
  config:
    writeEveryEvents: 200
    writeIntervalMs: 5000
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `writeEveryEvents` | 必填 | 在各必寫點之間強制一次持久檢查點寫入的每工作階段已提交事件數 |
| `writeIntervalMs` | 必填 | 各必寫點之間髒檢查點最長可保持未寫入的時間 |

本外掛注入 `storageDomain`、`sessionProjections` 與 `sessions`。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-projection-cache)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 檢查點如何寫入

三個必寫點總是寫入：工作階段建立儲存由種子派生的切面，`turn/end` 儲存列表讀取所需的輪次終值，工作階段釋放儲存活工作階段的最終切面。其間，設定的條數與間隔節流隨事件累積寫入。每次寫入透過領域寫入鏈以原子方式替換該工作階段的完整記錄；失敗會記錄警告並讓快取保持陳舊，後續寫入會自行修復。

### 讀取快取值

`cachedSnapshot(meta, keys?)` 是隻讀面：以零 I/O 從儲存域的記憶體表同步提供用戶端值。它接受生命週期身份（`formatVersion`、`createdAt`、`cwd`、`isSeeded`）與 header 匹配的記錄，把其中版本和 schema 均匹配的 key 作為一個 block 提供，其 `asOfSeq` 是所服務各行中最低的水位。這個水位是儲存記錄自己的：header 作證不了 inherited cut，也作證不了行序號與消費者稍後開啟的日誌可比，因此 Session list 把該 block 標為 `cached`，用戶端讓建連後的 Session 產出的任何值覆蓋它。在同一格式代內，cut 在 fork 時寫死，不能區分其他欄位區分不了的生命週期，而只讀檢視也從不播種 fold，所以 seeded（fork 出來的）工作階段與 unseeded 工作階段被同樣地提供。`cachedPredecessorTitle(meta)` 是跨 Session 格式 edge 的更窄列表專案例外：生命週期匹配且已透過結構准入的 predecessor record 只能公開與目前版本相容的 `title` row，因為 title 文字在相鄰 edge 之間保持不變。其他 predecessor row 仍不可用。`coldSnapshot(meta, inheritedEventCount, events)` 是 fold 面：接受精確切點與完整有序日誌，在摺疊時跳過已檢查點化的字首，並在自身不讀取持久化層的情況下重新整理記錄。

### 快取保證什麼

日誌領先，快取跟隨：活工作階段檢查點先把工作階段的緩衝事件持久化，然後才儲存快取記錄。因此崩潰可能讓快取落後於日誌，但絕不會讓快取領先。讀取和寫入共享儲存域內一致的記憶體狀態；逐單元寫入鏈只在持久化成功後修改記憶體。每個帶版本戳的記錄必須匹配目前執行單元的 schema 與生命週期身份（`formatVersion`、`createdAt`、`cwd`、`isSeeded`）；fold 面（`hydratePrepared`、`coldSnapshot` 與檢查點寫入）還要求精確的 `inheritedEventCount`，因此從另一工作階段格式代或 fork 切點摺疊出的行不能播種呼叫方。JSON 後端把每條記錄存於僅所有者可存取的 `<root>/session_projcache/sessions/<id>.json` 目錄樹中。Domain 讀取驗證保留檢查點值中的所有自有 JSON 鍵，包括不透明中繼資料中的 `__proto__` 與 `constructor`。它拒絕無法無損完成 JSON 往返的值，並與檢查點寫入使用相同規則。隨後，每個 projection 用自己的 `stateSchema` 驗證 hydration 狀態；承載不透明 JSON 的欄位需要使用保留其鍵的驗證器。

升級絕不拖垮啟動，也不會暴露未經證明的摺疊結果。版本戳落在 spec `compatibleVersions` 集合內的記錄仍可被結構化讀取並等待目前檢查點重寫，但缺失或更舊的 `formatVersion` 絕不匹配目前 Session，因此不能作為 hydrate seed。生命週期匹配的 predecessor title 只能透過上述列表 hint 讀取，因為 title 文字在相鄰 Session format edge 之間保持不變，並且該 row 仍須透過目前 projection `stateVersion` 與 schema。格式匹配後，缺失的 lineage 欄位解碼為 unseeded lineage——對非 fork 工作階段精確無誤，seeded 呼叫方則通不過身份比對、回落冷摺疊。仍然通不過 schema 驗證的存量記錄會按域的 `invalidRecords: 'backup-and-skip'` 策略移出為 `<id>.json.bak.<時間戳>`、連同原因寫入日誌，並由下一次檢查點重建。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節說明快取的永續性與儲存所有權；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

快取是投影註冊表檢查點介面上的摺疊捷徑，存於 `per-record` 領域資料表中。它帶來六項後果：讀取絕不繞過領域寫入鏈；每次後臺寫入都 fail-soft；`ver` 不匹配時丟棄而不遷移記錄；記錄必須透過目前執行單元的 `stateSchema`；寫入透過無損 JSON 邊界替換一份完整工作階段記錄；日誌領先，快取跟隨。

### 讀寫所有權

快取在 `session_projcache` 領域中為每個工作階段儲存一份帶版本戳的文件。它不依賴工作階段持久化後端，不呼叫 `locate`，也不檢查逐工作階段目錄。畸形或陳舊的記錄讀作不存在；需要冷值的消費方負責提供日誌以重新摺疊。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`SessionProjectionCache` 服務、後臺寫入監聽器、快取讀取 |
| [`src/spec.ts`](src/spec.ts) | `session_projcache` 域 spec 與記錄身份型別 |
| — | 不釋出執行時不變式伴生入口；完整正確性關係只能透過對持久化日誌重新執行摺疊來檢查；持久化邊界透過 schema 驗證，讀路徑的版本與水位防護由包規範證明，相關區域性約束在寫入與讀取路徑強制執行。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從快取逐步進入它檢查點化的註冊表與儲存其記錄的儲存域。

- [工作階段投影子系統](../../../docs/subsystems/session-projection.zh.md)——本快取檢查點化的投影單元約定與驅動語義。
- [工作階段投影註冊表](../session-projection/README.zh.md)——本快取持久化其檢查點的 `ctx.sessionProjections` 服務。
- [儲存子系統](../../../docs/subsystems/storage.zh.md)——儲存快取記錄的領域路由與後端行為。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、標題與遙測包。
- [工作階段投影 RFC](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.zh.md)——持久投影快取的設計理由。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為持久快取只加速主機側的投影狀態讀取，不註冊任何模型可見內容。

#### KV Cache 影響

無；快取從不組裝或傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明快取何時需要運維注意。它們是目前包約束，不是任務積壓。

- **無淘汰或保留介面**——記錄按工作階段持續累積，直到 `forget(id)` 刪除已刪除工作階段的記錄；清理其他已儲存檢查點屬於帶外維護。
- **間隔節流採用按工作階段的粗粒度控制**——一次無髒資料的寫入完成後，計時器在首個髒事件到達時啟動；持續但低於條數閾值的事件流每間隔寫入一次，而非滑動視窗。
- **快取側不做冷重摺疊**——快取只服務並重新整理自己的記錄，從不讀取工作階段日誌，因為它不依賴持久化層；需要保證冷快照的消費方自行從日誌重新摺疊。
- **每次 schema 或域版本變更都必須論證升級路徑**——改動儲存記錄 schema 或域版本時，同一 PR 必須在 `tests/fixtures/` 下歸檔此前已釋出磁碟格式的 fixture（測試前置資料），並在 `tests/fixtures.spec.ts` 中用測試論證所選的處置方式：讀相容恢復（`compatibleVersions`）、目前版本重寫，或 backup-and-skip 搶救。即便選擇直接丟棄舊記錄的 bump，也要證明丟棄既不會導致啟動失敗，也不會汙染快取樹。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
