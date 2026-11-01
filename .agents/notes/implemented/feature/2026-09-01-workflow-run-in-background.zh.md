# Agent Note：workflow 執行經任務註冊表獲得 `run_in_background`

狀態：已實作

Update：隨 [jobs seam 收斂](../architecture/2026-09-03-jobs-seam-consolidation.zh.md)，該執行註冊的是 `JobSpec`（沒有 `record` 標誌），透過 `JobHandle.append` 與 `updateProgress` 敘述進度，並把渲染後的值作為 `JobOutcome.result` 返回，模型在結算後的第一次讀取攜帶它一次。

[English](2026-09-01-workflow-run-in-background.md) | 中文

## 問題

`workflow` 呼叫會阻塞父級輪次直到整個腳本結算：一次長編排（扇出到數百個檔案的審計）把模型按在原地耗完全部牆鍾時間，模型無法繼續工作，人類看不到即時進度，取消是唯一出口。其他每個長時執行面——bash、pwsh、一次性 subagent——都早已有通往 `ctx.jobs` 的 `run_in_background` 路徑。[record 合併](../architecture/2026-09-01-jobs-absorb-activity-record.zh.md)刪掉前臺 workflow 的 activity 映像時，也明確承諾即時 workflow 敘述會以後臺 record 任務的形式迴歸。

## 決策

`workflow` 工具獲得 `run_in_background: true`（在 `enableRunInBackground` 設定生效時公開並受理，預設開啟）：呼叫把執行註冊為自有的 `kind: 'workflow'` 任務並宣告觀察 record，立刻返回 `{ kind: 'background', jobId, runId }`。

- **執行屬於任務，不屬於工具步驟。** 引擎執行在任務 starter 內啟動且不帶 `exec.signal`；取消路徑是 `job_kill`、任務列表的停止控制元件與 owner 釋放，各自把原因轉發進 `run.cancel`。引擎的同步拒絕（meta／解析失敗）從 starter 傳播出去，因此什麼都不註冊，模型看到的是普通的可修正錯誤。
- **結算即任務結算。** `done` 從 `run.result` 鏈起：先 dispose（釋放失敗只告警，絕不 reject 進註冊表），再停掉映像，最後對映結束原因——`completed` 在 `JobOutcome.output` 裡攜帶與前臺路徑相同的渲染回傳值（完成播報與 `job_output` 由此送達它），`cancelled` 結算為 `killed` 並把 detail 留給註冊表的 kill 原因合併（轉發的取消原因就是同一字串），`error` 以腳本失敗訊息結算為 `failed`。
- **record 映像頂替被刪的 activity 映像。** `src/record.ts` 按外掛訂閱一次 `workflow/phase`、`workflow/log` 與成員生命週期事件，並把它們以 activity 映像當年寫下的同樣文字行以 `log` 通道路由進被跟蹤執行的 `JobHandle` 面（模型的 `job_output` 從不渲染它們）；`updateProgress` 跟隨目前 phase。這裡沒有收容錯誤的包裝層：`append`／`updateProgress` 是不丟擲的表面（結算後的 append 在註冊表內丟棄），遲到的事件找不到被跟蹤的執行。
- **輸出 schema 變為 `kind` 判別聯合**（`background` | `foreground`），與 bash 的形態一致；前臺包絡為對稱獲得 `kind: 'foreground'`。持久的 run-start／成員／run-end 工作階段記錄在兩條路徑上都保留 `exec.parent === undefined` 門檻，後臺的 run-end 從任務的 `done` 鏈寫出。
- **`workflow` 進入 `JobKindMap`**，由工具包宣告合併，與 `pwsh`、`pty` 相同。

## 曾考慮的替代方案

- **工具自帶 start／poll 介面**（一個 `workflow_status` 伴生工具）：為單一生產者複製 `job_output`／`job_kill`，還把執行留在 owner 釋放與工作階段頭部列表之外；任務註冊表本身就是 start／poll 表面。
- **向模型流式中間值**（經 `readOutput` 給部分結果）：workflow 的值就是腳本的單一 return；每個 agent 的中間結果是腳本內部事務（`log()` 經 record 向人類敘述它們）。給天然只有終值的生產者一個消費型模型遊標，只會招來輪詢迴圈。
- **把 `exec.signal` 橋接進後臺執行：** 已返回的工具步驟的中止（輪次取消）會殺掉模型剛剛有意脫管的工作；bash 的後臺路徑已立下先例——只有註冊表取消它。

## 後果

模型可以點燃長編排後繼續工作；人類在工作階段頭部任務列表裡看著 phase、log 與成員生命週期流入，並能就地停止執行。後臺執行的值只在結算時抵達（此前的 `job_output` 只返回狀態）。快照樹釘住 schema、提示詞與 PTC 樁的變化；回放完整後臺執行的 recorded-session 情境延期，記錄在包 README 的限制一節。
