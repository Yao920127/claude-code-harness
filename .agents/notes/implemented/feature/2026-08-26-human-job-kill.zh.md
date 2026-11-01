# Agent Note：人工任務終止——用「未認領的終態報告」而非第二條取消路徑

狀態：已實作

Update：本文引入的 `reported` 選項已隨 [jobs seam 收斂](../architecture/2026-09-03-jobs-seam-consolidation.zh.md) 消失。註冊表不再保留播報位；`dsh-tool-jobs` 只在臺帳裡認領自己的 `job_kill` 與等待，因此人類的 `job.kill` 天然讓通知保持待送達。原因合併、`job.kill` Remote 與兩擊式控制元件保持不變。

[English](2026-08-26-human-job-kill.md) | 中文

## 問題

[Web 任務展示 Note](2026-08-08-web-background-job-display.zh.md) 把任務列表交付為只讀並記下了原因：`JobRegistry.kill()` 會把任務標記為 `reported`，而 [`dsh-tool-jobs`](../../../../packages/jobs/tool-jobs/README.zh.md) 的完成播報員對已 reported 的任務抑制結算通知。這個耦合對當時唯一的呼叫方是正確的——模型的 `job_kill` 自己的 tool result 已經告訴模型它做了什麼——但按下停止按鈕的人沒有任何模型可見渠道。照那份契約寫一個人工 kill，模型會一直以為任務還在跑，正是 Claude Code 今天在售的過期世界模型失敗（其 `/tasks` kill 置 `notified: true`，模型什麼也學不到），也正是 Kimi 避開的（模型 `TaskStop` 抑制自己的通知；人工 stop 投遞一條）。

## 決策

送達認領的本義是「終態已有一條向模型送達的承諾路徑」，所以修法是不再把「取消」與「認領這次送達」混為一談。

- **人類的 kill 不認領送達。** `JobRegistry.kill(id, { reason? })` 只記錄原因；送達臺帳在 `dsh-tool-jobs` 裡，它只為模型自己的 `job_kill` 與等待認領任務，因此來自任務列表的 `job.kill` 讓結算照常走完成播報員（喚醒/注入、喚醒預算、截斷全部不變）。它絕不清除模型已持有的認領，終態記錄也保持結算時的原樣。
- **記錄下來的 kill reason 合入 `killed` 結算的 detail**——生產者事實在前（`signal: SIGTERM; cancelled by the user`）——完成通知與 Web 行因此都能說清是誰停的工作，無需新快照欄位或新通知範本。跑贏 kill 的任務（結算為 `completed`/`failed`）只保留生產者 detail。這正是 Codex 在 `<turn_aborted>` 指引裡寫明的對帳原則：使用者停掉了什麼，要告訴模型，而不是讓它去猜。
- **`job.kill` 是 Job Controller 的 Remote**（`@deepseek-ai/dsh-api-job-controller`，與 `job.follow` 並列；它最初是 Session Controller 上的 `session.killJob`，該包拆出時隨觀測流一起遷走），與 `session.cancel` 一樣只查活體 Agent（`ctx.agents.get`）：按註冊表的所有權契約，在跑任務的 owner 必然活著；從列表裡 kill 與列表本身一樣絕不復活 Session。未知與他人任務合併為一個只作用於查詢的 `job/not-found` 拒絕——生產者 cancel 拋錯按註冊表契約原樣傳播，絕不偽裝成查詢失敗；控制器載入就要求 `ctx.jobs`，沒有註冊表的組合根本沒有 kill Remote。註冊表的所有者圍欄是唯一的存取規則：不施加 Session Controller 的 subagent 所有權柵欄，子工作階段自己的 job 可以從它的列表裡被殺停（評審否決了從 Session Controller 包匯出該柵欄的實作函式，而這條規則對子工作階段自有的 job 也沒有額外意義），控制器既不依賴 agent 註冊表也不依賴 Session Controller。不加 approval 互動：這個單使用者本地 BFF 把它視為與停輪按鈕同級的操作。
- **任務列表的停止控制元件為兩擊式**（先武裝、3 秒內確認，對齊 Kimi 的 `s`+`y` 與 OpenCode 的雙 Esc），只渲染在執行中的 job 行——即帶 `jobId` 的行。獨立 activity 行（workflow 執行）沒有 kill 控制代碼也就沒有按鈕。請求進行中按鈕停用，且受理成功後保持 pending——unary 回應與 jobs 幀沒有跨載體順序保證，只有權威幀（行離開可殺集合）才釋放控制元件；被拒絕的 kill 短暫提示。由於 kill 按 id 定址 `ctx.jobs`，所有任務 kind 一次性獲得該控制元件——bash、pwsh、pty 與一次性後臺 subagent。

## 備選方案

- **`notify: boolean` 選項**——否決：註冊表承諾不了通知（quiet 投遞、無主任務、owner 拆除都會正當地丟棄一條）；臺帳的認領命名的是工具真正控制的事實：它自己的某個 tool result 是否已經送達了終態。
- **獨立的 `interrupt()`/`stopByUser()` 方法**——一條取消路徑帶顯式認領勝過兩個只差一個布林的方法；Kimi 的拆分（`stop` 與 `stopByUser`）上線時 TUI 就調錯了那個。
- **對模型保持沉默（Claude Code 的形狀）**——否決；他們自己的原始碼註解都在質疑它，而 DSH 的阻塞 Note 正是把過期認知失敗記為該控制元件此前不能上線的原因。

## 測試

`tool-jobs` 釘住臺帳（不是模型請求的 kill 讓通知保持待送達；它自己的 `job_kill` 與等待認領它）與逐字的帶原因投遞通知文字；`jobs-local` 釘住 `killed` 的 detail 合併與跑贏 kill 的情形。`kill.host.spec.ts` 釘住 Remote 命令：受理、無 agent 工作階段 kill 無主任務、未知/他人的 `job/not-found`。用戶端套件釘住 RPC 直接傳遞與兩擊控制元件（武裝、確認、解除計時、失敗提示、單一武裝行、過期相位清理）；無金鑰 web e2e 端到端驅動按鈕。

## 後果

- 人工 kill 的完成通知會喚醒空閒 owner（預設 `wakeup` 投遞）——這是刻意的代價：模型永遠學不到的未認領完成，正是本 Note 要修的失敗。
- `kill` 的位置參數 `reason` 已刪除（pre-release，無墊片）；options 物件是唯一形式。
- 被 kill 任務的 `detail` 可能攜帶以 `; ` 連線的兩個子句。任何把 `detail` 當單一生產者事實解析的程式碼都必須把它當不透明文字——`JobView.detail` 一直如此宣告。
