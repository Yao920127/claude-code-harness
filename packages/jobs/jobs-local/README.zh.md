---
description: "程序本地後臺任務註冊表，供組合、容量評估或排查程序內任務的使用者與維護者閱讀：按所有者的准入、生命週期與銷燬。"
kind: "package-reference"
---

# @deepseek-ai/dsh-jobs-local

[English](README.md) | 中文

## 概述

`dsh-jobs-local` 在 agent（智慧代理）繼續推進時，於 harness 程序內執行後臺任務。擁有任務的 agent 可以讀取、等待、列出和取消任務；同時掛載 `dsh-tool-jobs` 時，還會收到工作階段內完成通知。可設定的並行與輸出保留上限約束資源使用。生產方可以提供供定期讀取的輸出，也可以直接追加；使用者可以觀察保留的輸出，而不消耗 agent 尚未讀取的內容。任務在擁有者或 harness 關閉時結束。

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

當組合需要程序內後臺任務時載入本外掛：長時間執行的工具註冊其工作，擁有它的 agent 在不阻塞自身輪次的情況下讀取、等待、列出和取消。它實作 [`dsh-jobs`](../jobs/README.zh.md) 約定；模型側的 `job_output`、`job_list` 與 `job_kill` 工具來自 [`dsh-tool-jobs`](../tool-jobs/README.zh.md)。

### 何時選擇

當任務應存活於 harness 程序內、並隨程序終止時選擇它。當工作必須跨重新啟動存活或跨程序存在時避免它：記錄儲存在記憶體中，持久或跨程序後端必須以不同方式實作同一約定。

### 最小設定

載入外掛即註冊 `ctx.jobs`；每個欄位都是可選的。

```yaml
- name: '@deepseek-ai/dsh-jobs-local'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxConcurrentJobsPerOwner` | `10` | 每個精確所有者，或共享的無主桶中，`running` 加 `stopping` 任務的最大數量 |
| `retainBytes` | `262144` | 每個任務輸出環的執行期保留量，UTF-8 位元組 |
| `settledRetainBytes` | `16384` | 任務結算後保留的環容量，UTF-8 位元組；模型尚未讀取的位元組保留到它的首次終態讀取 |
| `pumpPollMs` | `150` | 任務拉取源的輪詢間隔，毫秒 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-jobs-local)是每個受支援欄位的窮盡式真源。

### 每個所有者得到什麼

上限統計精確所有者的 `running` 與 `stopping` 記錄；所有無主任務共享另一個獨立的服務級桶。終止歷史不佔用容量，只有生產方的 `done` 結算才釋放一個停止中任務的名額。達到上限時，`start()` 會在生產方執行前失敗，錯誤會指出上限並告訴 agent 終止一個不需要的任務、等它結束後再重試——註冊表既不排隊也不搶佔。

### 生命週期

任務屬於其所有者和後端，而非生產方工具，因此過載生產方或控制器不會停止任務。擁有任務的 agent 被釋放時，其任務會被取消、生產方會被等待、快照會被移除；服務釋放對每個剩餘任務執行同樣的操作。銷燬期間丟擲的取消會強制失敗記錄並警告工作可能成為孤立工作，因此銷燬永遠不會死鎖。

### 可能出什麼問題

沒有服務於所有者的控制器時無法啟動工作——載入 `dsh-tool-jobs` 即附加一個，否則 `start()` 會以指出它的訊息拒絕。返回但始終未結算 `done` 的生產方取消與緩慢停止無法區分，可能使銷燬停滯並持續佔用一個容量名額。每條記錄都會在 harness 程序退出時消失。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋註冊表背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **記憶體記錄、全新投影。** `LocalJobRegistry` 為每個任務儲存一份 `TrackedJob`——生命週期狀態、輸出環與模型遊標——每次呼叫都投影新的只讀檢視或塊副本；呼叫方永遠拿不到即時狀態。
- **環的保留量有界。** 追加超出執行期上限時丟棄最老的保留塊（單個超限塊保留其 UTF-8 安全尾部）；低於保留視窗的讀取得到 lossy 結果而非錯誤。結算時裁剪到結算上限，但絕不低於模型遊標尚未消費的位元組數，因此在首次 `job_output` 之前結束的任務會交出執行期上限保留的全部輸出；那次終態讀取之後才裁剪到結算上限。
- **按所有者分層，一個程序級註冊表。** 控制器與 `{ owners: 'scope' }` 訂閱歸檔到註冊方所在的 scope（`ScopedLayers`），讀取把全域層與所有者的 scope 鏈求並集——因此某個 preset 的任務控制絕不會為自身組合未載入任何控制器的 agent 保持 `start()` 可用，一次帶 scope 的結算也只會抵達其所有者所屬組合註冊的監聽器。
- **啟動前先預檢。** `start()` 在呼叫生產方之前檢查控制器服務、spec 有效性、仍存活的所有權與容量，因此拒絕不會留下 job id 或執行資源；註冊一旦提交，後續不再有可失敗步驟。
- **結算首次優先，事件最後。** 最早的終止結果只記錄一次，等待泵的最後一次排幹，裁剪環，釋放等待方，然後投遞一次帶逐監聽器隔離的 `settled` 事件，再跟上環的最終 `output` 訊號。
- **銷燬永不死鎖。** 丟擲的取消會強制失敗記錄並報告可能的孤立工作，而不是讓釋放停滯。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、`LocalJobRegistry`、准入、生命週期、銷燬 |
| [`src/events.ts`](src/events.ts) | 按 scope 分層的事件路由：`{ owner }`、`{ owners: 'all' }` 與 `{ owners: 'scope' }` 訂閱 |
| [`src/ring.ts`](src/ring.ts) | 每個任務的有界輸出環：追加、保留裁剪、按偏移讀取 |
| [`src/pump.ts`](src/pump.ts) | 註冊表擁有的拉取泵：每個任務一個定時器，結算前最後一次排幹 |
| — | 不釋出執行時不變式伴生入口；事件協定與事件對讀取的檢查位於 `@deepseek-ai/dsh-jobs/invariant`。此提供者的准入決策使用私有設定，並且必須在後端啟動器執行前失敗；目前生產方由 `LocalJobRegistry.start()` 同步執行該決策。釋出後再重複聚合只會向 companion 暴露私有設定，也無法驗證失敗發生在啟動前。 |

### scope 分層

`attachController` 與 `{ owners: 'scope' }` 訂閱註冊到呼叫上下文所在的 scope 層；`{ owner }` 與 `{ owners: 'all' }` 訂閱不帶 scope。控制器問題（`servesOwner`）與帶 scope 的投遞走同一條鏈：先是全域層，再沿所有者的鏈逐層。註冊是無名 token，因此重複標籤仍可獨立釋放。

### 准入與結算

`activeJobCount` 按精確所有者或共享無主桶統計權威記錄。`settle` 只記錄一次終止結果（把記錄下來的 kill 原因合併進 `killed` 的 detail），清除進度行，把環裁剪到結算保留量（保留模型遊標尚未消費的全部位元組），解析每個等待方，然後發出帶原因的 `settled` 與環的最終 `output` 訊號。原因在 `JobRegistry.kill` 之後為 `kill`，在所有者或服務取消之後為 `teardown`，否則為 `producer`；`dsh-tool-jobs` 據此跳過沒人能讀的通知。

### 銷燬

所有者釋放（`disposeOwned`）會取消該所有者的任務、等待其結算、移除其記錄，並逐條宣佈移除——這是任何逐任務記錄都無法表達的可見集變更。服務釋放（`disposeAll`）會取消所有存活任務、等待結算、移除每條記錄（逐條宣佈移除，讓掛載在服務之外的訂閱者丟掉它的行），然後分離跨 fiber 的所有者清理 effect。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從註冊表約定逐步進入模型側控制與設計記錄。

- [後臺任務執行時子系統](../../../docs/subsystems/jobs.zh.md)——任務型別、投影欄位與 `ctx.jobs` 的 Cordis 介面面。
- [jobs 組對映](../README.zh.md)——同級組頁面及其包表格。
- [註冊表約定](../jobs/README.zh.md)——本包實作的抽象 `ctx.jobs` 服務。
- [模型側任務控制](../tool-jobs/README.zh.md)——`job_output`、`job_list` 與 `job_kill` 工具及完成通知。
- [通用長時間執行工具執行時 Agent Note](../../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.zh.md)——後臺任務執行時背後的設計。
- [任務註冊表 seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md)——按所有者隔離的註冊表約定及其理由。

-----

<a id="model-experience"></a>
## 模型體驗

透過生產方外掛與 `dsh-tool-jobs` 間接影響模型，註冊表後端把全部模型渲染委託給它們。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明註冊表何時不合適。它們是目前包約束，不是任務積壓。

- **任務只存在於程序本地**——記錄會隨 harness 程序終止而消失；持久或跨重新啟動執行需要一個單獨實作該 seam 的後端。
- **靜默無效的取消可能使銷燬停滯並持續佔用容量**——如果 `cancel` 返回後始終未結算 `done`，註冊表就無法將其與緩慢停止區分開；該任務會在服務剩餘生命週期內持續佔用一個桶名額，只有顯式丟擲異常才能安全地強制標為失敗。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
