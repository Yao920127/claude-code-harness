---
description: "面向模型的後臺任務控制，供選擇、設定或排查 job_output、job_list、job_kill 與完成通知的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-jobs

[English](README.md) | 中文

## 概述

使用 `dsh-tool-jobs`，可透過 `job_output`、`job_list` 與 `job_kill` 檢查和控制後臺命令、PTY 工作與 subagent。讀取可在設定的超時內等待，列表結果標識各任務的 kind 與狀態，而取消只有在工作停止後才結算。歸屬明確的工作完成時，agent（智慧代理）會收到工作階段內通知：繁忙的 agent 在下一步收到通知，空閒的 agent 則由 follow-up 輪次喚醒。設定控制等待上限、完成投遞與可選的連續喚醒上限。流輸出僅供單一讀取方消費，待領通知無法在所有者釋放後存活。

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

在 agent 需要啟動、觀察和停止後臺任務的任何組合中載入本外掛：它註冊三個工具、附加生產方所需的控制器，並投遞完成通知。它需要組合中已提供的 `ctx.tools`、`ctx.jobs` 與 `ctx.systemPrompt` 服務；完成通知經 `ctx.agents` 解析投遞目標，凡有歸屬任務的組合都已提供它。

### 三個工具

- `job_output(job_id, wait?, timeout_ms?)`——讀取任務輸出。流任務只返回自上次讀取以來的輸出；最終輸出任務在結算後返回其結果。每個回應都以 `[status: ...]` 結尾。除非 `wait: true`，否則讀取是非阻塞的；`wait: true` 最多等待到設定上限，超時時仍讓執行中的任務保持存活。一次讀取先渲染 stdout，再把 stderr 放進一段 `[stderr]`，標註讀取前已離開記憶體的輸出，並在結算後的第一次讀取恰好攜帶一次任務的結果（subagent 的回答）。
- `job_list()`——列出你的後臺任務及其 id、kind 與狀態，每行一個：`<id> [<kind>] <status> — <label>`。
- `job_kill(job_id, reason?)`——立即請求取消執行中的任務；任務在其工作真正停止後以 `killed` 結算。終止任務返回其目前快照，可選的原因會被記錄並轉發給任務。

三個工具依次返回 `{ text, job }`、`PublicJobSnapshot[]` 與 `{ outcome: 'cancellation-requested' | 'already-finished', job }`。公共快照攜帶 id、kind、label、帶即時進度行或終態 detail 的狀態，以及開始／結束時間，並省略歸屬與環偏移。三個工具都透過通用 UI 卡片渲染：output 和 list 用 `read`，kill 用 `execute`。

### 完成通知

任務完成時，擁有它的 agent 會收到工作階段內訊息 `background job <id> (<kind>: <label>) finished [status: ...]. Read its output with job_output.`。繁忙的 agent 會在下一步收到注入的通知——inbox 尚有內容時輪次無法結束，因此同時結算的多個任務只花掉一步，而不是各佔一輪。空閒的 agent 則被一個 follow-up 輪次喚醒，因為無人領取的通知就是模型永遠不會知道的完成。模型已經收走的完成不再通知：註冊表把釋放了存活 `wait` 的結算報告為 `awaited`——無論是 `job_output` 的等待，還是 shell 工具在等待自己的前臺命令——外掛則記著模型經 `job_kill` 請求的殺停；所有者或服務 teardown 導致的結算會被跳過，因為沒有人能讀它。

喚醒預設不設上限：無人值守的 agent 連續串起後臺命令與一次性 subagent 時，每次完成都會喚醒它。`maxConsecutiveWakes` 可以封頂：每個所有者最多被喚醒這麼多次，此後的通知降級為注入；領取任何使用者撰寫的訊息都會恢復預算。上限用來約束自激鏈——被喚醒的一輪可能啟動某個後臺任務，而它的完成又會喚醒同一個所有者——但超出上限的通知會靜默等到使用者下一次輸入，依賴喚醒完成工作的工作階段會停在那裡。`completionDelivery: quiet` 讓空閒所有者也在注入通道上，確定性 transcript（文字記錄）需要的正是這一點。

### 最小設定

不帶設定載入外掛是常用路徑；`waitTimeoutMs` 高於 `maxWaitTimeoutMs` 時會在載入時失敗。

```yaml
- name: '@deepseek-ai/dsh-tool-jobs'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `waitTimeoutMs` | `30,000` | `wait: true` 省略 `timeout_ms` 時使用的等待時間 |
| `maxWaitTimeoutMs` | `600,000` | 模型所給等待時間的上限；更大的值向下收斂到它 |
| `completionDelivery` | `wakeup` | `wakeup` 為空閒所有者開啟一輪；`quiet` 讓通知繼續待領 |
| `maxConsecutiveWakes` | 未設定 | 一個所有者可由喚醒開啟的輪數，超出後通知降級為注入；未設定即不封頂 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-jobs)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 可能出什麼問題

組合中未載入 `tool-jobs` 的 agent 無法啟動後臺工作：本外掛的控制器正是生產方 `ctx.jobs.start()` 得以啟用所依賴的。模型給出的等待時間超過 `maxWaitTimeoutMs` 時會向下收斂到上限，超時的等待返回 `[status: running]` 並讓任務保持存活，而不是失敗。待領於空閒所有者的完成通知無法在該所有者釋放後存活。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **與 kind 無關的控制。** 同一套三個工具讀取、列出和取消每種生產方 kind 的任務——bash、subagent、PTY——因為它們都透過通用的 `ctx.jobs` 執行時註冊。
- **投遞迴本外掛，收件人歸註冊表。** 外掛決定未報告的完成如何到達所有者——注入繁忙的一步，或喚醒空閒所有者的一輪——而註冊表把每次結算路由給其所有者 scope 鏈所能抵達的監聽器，因此某個 preset 下的掛載永遠看不到另一個 preset 的 agent，無論掛載了多少 preset，一個 agent 每次完成都只讀到一條通知。
- **生產方自有的輸出上限。** 生產方提供 `outputLimitBytes` 時，完整的模型側結果——輸出讀取、終止 kill 快照或完成通知——會在新增狀態與通知中繼資料之後被施加上限；省略該欄位的生產方保持無界行為。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：工具註冊、結算訂閱與模型殺停集合、提示詞區段、輸出上限 |
| [`src/render.ts`](src/render.ts) | 面向模型的渲染：公共投影、狀態行與消耗式增量（stdout、`[stderr]` 段、丟失輸出提示） |
| — | 不釋出執行時不變式伴生入口；執行關係歸能力 seam 所有。 |

### 輸出上限

`job_output` 與 `job_kill` 會在策略執行前於前置的 pre-execute 監聽器中捕捉呼叫方可見任務，因此生產方上限適用於完整渲染結果。`job_output` 在策略保留預設渲染時保持其輸出／狀態拆分，對輸出尾部與 `[status: ...]` 字尾設界；其他單文字結果——拒絕、短路、規範化工具或流水線失敗、替換與阻止——按單個文字設界，而結構化多塊策略結果保持自身形狀。有界完成通知先為穩定的 `background job <id>` 字首與 `job_output` 收集指令預留空間，再把剩餘位元組用於可變的 kind、label、status、detail 與截斷標記，因此在 PTY 支援的 64 位元組下限下通知仍可操作；已有的生產方截斷標記會被複用，不會重複新增。

### 通知投遞通道

結算訂閱（`{ owners: 'scope' }`）跳過註冊表報告為 `awaited` 的結算、模型經 `job_kill` 殺停的任務、無所有者的任務與 teardown 結算，然後解析登記在擁有者工作階段下的 agent。`wakeup` 投遞為空閒所有者開啟一輪；設定了 `maxConsecutiveWakes` 時只在預算內開啟，按確切 `Agent` 記錄在 `WeakMap` 中，領取使用者撰寫的訊息（`agent/inbox/claimed`）會重置該所有者的預算。繁忙的所有者——或超出所配預算的任何通知，以及 `quiet` 投遞——改為注入 next-step inbox。註冊表只計入結算時仍被欠著投影的等待，因此超時或中止的等待會讓之後的結算照常通知；移除會把任務從模型殺停集合裡刪掉，該集合只保有模型殺停過的存活任務。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從任務型別逐步進入註冊表約定與生成 schema。

- [後臺任務執行時子系統](../../../docs/subsystems/jobs.zh.md)——任務型別、快照欄位與 `ctx.jobs` 的 Cordis 介面面。
- [jobs 組對映](../README.zh.md)——同級組頁面及其包表格。
- [註冊表約定](../jobs/README.zh.md)——工具背後的抽象 `ctx.jobs` 服務。
- [程序本地註冊表](../jobs-local/README.zh.md)——任務在本程序中的執行位置。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-jobs)——`job_output`、`job_list` 與 `job_kill` 的確切 schema。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-jobs)——每個受支援設定欄位及其源宣告。
- [任務註冊表 seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md)——按所有者隔離的註冊表約定及其理由。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

該外掛註冊 scope 中的每次請求都包含以下指引。按 agent scope 過濾工具時，可能會隱藏工具，卻不會移除獨立註冊的提示詞區段。

##### 後臺任務指引

```markdown
Track every background job id you start. You are notified in-session when a job finishes — do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job's work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering.
```

#### Token 影響

啟用期間，每次請求都會產生少量固定的輸入 token 開銷。

#### KV Cache 影響

只要外掛 scope 與指引文字不變，字首就保持穩定。啟用或釋放可能使從該提示詞區段起的複用失效。

### 工具 schema

#### 模型看到什麼

該工具集可見時，會看到生成的 [`job_output`、`job_list` 和 `job_kill` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-jobs)。

#### Token 影響

工具可見時，每次請求都會產生固定的 schema token 開銷。

#### KV Cache 影響

只要工具定義與可見性不變，字首就保持穩定。註冊生命週期或 scope 限制可能使從第一個發生變化的 schema token 起的複用失效。

### 結果與通知

#### 模型看到什麼

讀取會返回輸出或 `(no new output)`，隨後是 `[status: <status>]` 和可選 detail。空列表返回 `(no background jobs)`。kill 返回 `requested cancellation of job <id>` 或現有終止狀態。模型尚未收走且有所有者歸屬的完成使用上述通知。

#### Token 影響

結果與通知在壓縮（compaction）前保留於父級歷史。流讀取不會重複已消費的輸出；生產方提供的 `outputLimitBytes` 會限制每次完整讀取或通知。在 `wakeup` 下，抵達空閒所有者的通知還會額外買下一次使用者並未要求的模型請求，其數量僅在設定了 `maxConsecutiveWakes` 時按所有者封頂；抵達繁忙所有者的通知則只是給它已經在支付的那一輪加一步。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適。它們是目前包約束，不是任務積壓。

- **落在 driver 退休視窗內的結算仍會讓通知擱淺**——在輪次迴圈最後一次檢查 inbox 與 driver 提交 idle 相位之間，所有者讀起來仍是繁忙，因此通知走注入且無人喚醒。steering（中途引導）存在同樣的問題；修復它屬於 `agent-loop`。
- **已花掉的喚醒預算不會隨時間恢復**——設定了 `maxConsecutiveWakes` 時，只有使用者撰寫的輸入才能補充，因此預算耗盡的無人值守 agent 要等到其他原因開啟下一輪時才收走剩餘通知，且用戶端不會顯示有通知在等待。
- **待領於空閒所有者的通知無法在該所有者釋放後存活**——釋放時的取消會清空未領取的 inbox，日誌保留插入/取消這一對作為記錄。
- **模型讀取只有單一消費方**——獨立觀察者使用註冊表非消耗的 `readAt`（Web 用戶端的 `job.follow`），而不是這些工具。
- **無 owner 的任務沒有工作階段隔離**——外部呼叫方必須提供策略或避開這些任務。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
