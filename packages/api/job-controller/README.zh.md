---
description: "Host 與 Client 的 job 控制：把一個工作階段看得到的名冊與一個 job 的保留輸出映像到瀏覽器，不觸碰模型的消耗型遊標，並代人類停止一個 job。"
kind: "package-reference"
---
# Job Controller

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-api-job-controller` 擁有 Host 的 `ctx.jobController` 服務與生成的 Client `ctx.remote.job` namespace。它的兩條 Remote 流都是 `ctx.jobs` 的投影：`job.list` 以整集幀映像一個工作階段看得到的 job；`job.follow` 從絕對位元組偏移傳送一個 job 的保留輸出；它唯一的命令 `job.kill` 代人類停止一個 job。Client 半側安裝 `ctx.jobs`——按引用計數的服務，工作階段頭部任務列表渲染其名冊與累積檢視，其停止控制元件呼叫它的 `kill`。兩條流都不觸碰模型的消耗型遊標與完成通知，人類 kill 也不是模型自己的殺停。

## 目錄

- [使用本包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Host 控制器要求活體 Agent 註冊表與 job 註冊表（已釋出組合裡是 `dsh-jobs-local`），缺少任一則不載入。`job.list({ sessionId })` 產出該工作階段可見的集合——自己的 job 加上所有無主 job——開啟時一次，之後每一輪聚合過的生命週期提交（註冊、進度、停止中、結算、移除）後再一次；輸出追加從不重新整理名冊，因為結算後的投影已經帶著最終位元組數。`job.follow({ sessionId?, jobId, from? })` 把 `sessionId` 傳給註冊表的 `get` 與 `readAt`——無主 job 不需要 session——先產出一個攜帶 job 投影的 `opened` 錨幀，再是聚合的 `output` 幀，job 結算且環排幹後產出一個終態 `status`，隨後流正常關閉；流中若通告了移除（擁有者 teardown），則以被移除 job 的終態投影收尾。兩種讀取都是非消耗的：模型側 `job_output` 遊標與完成播報狀態永遠觀察不到它們。

`job.kill({ sessionId, jobId })` 以 `cancelled by the user` 為原因取消一個該工作階段看得到的 job，註冊表把該原因合併進被殺 job 的 detail。它不是模型請求的殺停——`dsh-tool-jobs` 只對模型自己的 `job_kill` 與存活等待收走的結算不發通知——因此擁有者 agent 的完成通知照常送達，並帶上原因；仍在等待該 job 的 shell 工具則在自己的結果裡以 `[stopped: cancelled by the user]` 讀到原因。它回答 `{ outcome: 'requested' }` 或 `{ outcome: 'already-finished' }`，對該工作階段看不到的 id 以 `job/not-found` 拒絕；註冊表的所有者圍欄是唯一的存取規則，因此子工作階段自己的 job 也能像其他 job 一樣從它的列表裡被殺停。

Client 入口安裝 `ctx.jobs`（`IJobs`），由包內部的 `ClientJobsModel` 支撐。`kill(sessionId, jobId)` 轉發到 `job.kill` 並把 Remote 結果交給呼叫方判定準入。`watchRows(sessionId)` 不論多少檢視器持有都只為每個被關注的工作階段開一條名冊流，最後一個釋放後丟棄行；重連後的首幀已經是完整事實。`observe(sessionId, jobId)` 不論多少檢視器展開同一 job 都只開一條 Gateway 流，按 job 保留有界的渲染尾部並用 `gapBefore` 標記淘汰或續讀缺口，在終態幀上關閉檢視或把流失敗記到檢視上，最後一個檢視器釋放後丟棄檢視。外掛在自己的上下文仍是目前上下文時解析 Gateway 流工廠與 `job` namespace，因為流的（重）開啟跑在未宣告 `remote.job` 的呼叫堆疊上。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---:|---|
| `observeFlushMs` | `100` | 註冊表提交到下一次名冊或輸出讀取之間的聚合視窗，毫秒 |
| `observeMaxFrameBytes` | `65,536` | 每個觀測輸出幀的軟位元組預算；更大的單塊整塊傳送 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-job-controller)是所有受支援欄位及其 JSDoc 的完整來源。

-----

<a id="model-experience"></a>
## 模型體驗

無。job 觀測是瀏覽器與 Host 的控制狀態；它不註冊任何提示詞、工具或工作階段事件。模型對同一工作的檢視仍在 [`dsh-tool-jobs`](../../jobs/tool-jobs/README.zh.md)。

#### KV 快取影響

無直接影響；觀測讀取從不觸碰模型請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- 環是盡力而為的即時預覽，不是終端轉錄：生產者的拉取源按輪詢輪次複製，同一輪詢視窗內兩條流的寫入先 stdout 落實，用戶端拼接 chunk 時也不區分 `channel`。
- 兩條流都是程序本地的：Host 重新啟動丟失全部環與名冊，續讀的觀測隨後錨定在空註冊表上，重開的名冊從空開始。
- 按 session 的存取限制由註冊表每次讀取時的呼叫方參數強制；Remote 層本身服務任何已連線瀏覽器。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。控制器是 `ctx.jobs` 讀取的無狀態投影；這些流轉發的事件協定與事件對讀取的關係由註冊表自己的 `@deepseek-ai/dsh-jobs/invariant` 擁有。
