# Agent Note：唯一的 shell execute()——前臺是投影，超時是對 job 的有界等待

狀態：已實作

Update：[jobs seam 收斂](../architecture/2026-09-03-jobs-seam-consolidation.zh.md)擁有每條已登記命令現在填充的輸出環、遊標與拉取源。

[English](2026-08-26-shell-execute-projection-and-jobs-at-start.md) | 中文

## 問題

跑過前臺超時的 bash 命令會被殺掉、工作作廢——這是長建置或安裝在 agent 手裡失敗的頭號方式。在舊 seam 裡修它結構上很彆扭：`ctx.shell` 有兩個執行方法，`run()`（deadline 內建、只給 promise、沒有可保留的控制代碼）與 `start()`（有控制代碼、無 deadline），於是「保住這個已在執行的前臺命令」無從表達——deadline 的所有者只會殺，呼叫方也拿不到可向 `ctx.jobs` 重新註冊的東西。兩個方法還各自漂移：stdout 預算不同、文件裡掛著「start 忽略 timeoutMs」的疣、同步與非同步 spawn 失敗的行為按路徑分叉。

同行證據指向同一個方向。Kimi 預設讓超時的命令繼續執行（`bashAutoBackgroundOnTimeout`），什麼都不重綁——程序任務脫離、呼叫方訊號解鉤、部分輸出隨控制代碼返回。Claude Code 的超時處理對同一個 `ShellCommand` 呼叫 `background()` 而不是殺掉，並明確註解重新 spawn 會洩漏清理並重復事件。Codex 根本沒有移交，因為它從未有過「前臺 spawn」：每次 `exec_command` 都是對一個 session 的有界觀察窗，「仍在執行」是攜帶控制代碼的正常返回。三家在底層形狀上一致：執行只有一種方式，前臺是等待的屬性，不是 spawn 的屬性。

本變更最初交付的版本把移交放在了 seam 上：`onExpiry: 'offer'` 策略、`ShellExecution.promotion`，以及工具必須在 deadline 處同步應答的 `ShellPromotionOffer`。評審否決了它：這套協定存在的唯一原因是工具把 job 登記推遲到了超時點而不是啟動點，於是每個執行器都要背一條中繼/計時/解綁分支，每個消費方都要背一條任何執行都不需要的時序義務。

## 決策

**seam 收斂為 `resolve()` + `execute()`。** `execute(spec)` 返回 `Promise<ShellExecution>`——活的 `ShellProcess` 本體加前臺投影 `result()`（分流收集、首因 `timedOut`/`aborted` 歸類、只為基礎設施失敗 reject）。`run()` 與 `start()` 刪除（pre-release，無墊片）；它們編碼的歷史差異變成顯式輸入：`ShellExecSpec.onExpiry` 取 `'kill'`（預設）或 `'none'`，stdout 預算統一為 `spec.stdoutMaxBytes`。沒有任何移交協定：只想等一段時間的呼叫方以 `'none'` 執行命令並自己限定等待時長，呼叫方停止等待後控制代碼依然有效。

**準備與執行共用 deadline。** 非同步沙箱準備完成後才釋出控制代碼。準備期間的取消或失敗會拒絕 `execute`；到期則返回已結算的超時控制代碼，輸出為空。遲到的準備結果不會啟動任務。提供者事實在 subprocess 結算前同步安裝，立即失敗的啟動也能獲得對應的沙箱歸類。

**spawn 失敗統一收容**：同步拋錯與非同步 rejection 都把控制代碼結算為 `killed`、說明進入讀路徑，而 `result()` 以原始錯誤 reject（保留同一性——沙箱執行器在其 `result()` 裝飾裡把可歸因於 runner 的失敗對映為 `SANDBOX_UNAVAILABLE`，並在 `onProcessDone` 裡蓋章控制代碼事實，兩者都以同一個控制代碼實例為鍵）。

**組合中有 job 註冊表時，`tool-bash`/`tool-pwsh` 在每條命令啟動時就把它登記到 `ctx.jobs`。** `run_in_background` 立即返回 id。前臺呼叫啟動同樣的 job，並用註冊表的 `wait(id, timeoutMs, owner, signal)` 等待它，等待上限就是現有的 `timeoutMs`——沒有第二個旋鈕。在等待內結算的命令用控制代碼的 `result()` 返回普通前臺結果，工具隨即移除該 job 記錄（`JobRegistry.remove`），模型從不看到 id，列表也不會堆滿每一條 `ls`。超過等待仍在執行的命令繼續作為它本來就是的那個 job 執行，呼叫返回 `{ kind: 'promoted', jobId, timeoutMs, output }`——渲染為 `[still running after <ms>; moved to background job <id>]` 加交接指引——並以一次消費式註冊表讀取打底，因此 `job_output` 恰好從此處接續。超時那一刻沒有任何東西易手：程序沒有、中止訊號沒有、輸出也沒有。工具從不把自己的訊號交給程序；取消呼叫會殺掉 job，而來自呼叫之外的殺停（人的停止控制元件、並行的 `job_kill`）經 job 的 `cancel` 掛鉤到達程序，工具把其原因渲染為前臺結果裡的 `[stopped: <reason>]`（值上的 `stopped`），模型讀到的是原因而不是命令失敗。

**後臺能力面跟隨註冊表，註冊表保持可選。** 工具的 `inject` 不寫 `jobs`。沒有註冊表時它註冊純前臺定義；`ctx.jobs` 出現後，`ctx.inject(['jobs'], …)` fork 用帶 job 的定義替換它，註冊表存在多久就保持多久；註冊表在外掛仍在時解除安裝，則恢復純前臺定義。因此沒有註冊表的組合保留一個 schema 既不宣傳 `run_in_background` 也不宣傳移交的普通 `bash`，模型也看不到任何 `job_*` 工具。登記是盡力而為的：`promoteOnTimeout: false`，或註冊表在啟動時拒絕該 job（持有者的准入上限、沒有已附加的控制器），都改為在執行器的 `'kill'` deadline 下執行命令，並記錄日誌。

**註冊表報告等待方已經收走了什麼。** `settled` 事件帶 `awaited`：本次結算是否釋放了一個存活的 `wait`，工具等待自己的前臺命令時為真，`job_output` 的等待亦然。`dsh-tool-jobs` 對已 awaited 的結算和模型經 `job_kill` 請求的殺停不發完成通知，其私有的認領檯帳已刪除；超時或中止的等待早已離開註冊表的等待方集合，之後的結算照常通知。來自 web 控制器的人類殺停兩者都不是，因此擁有者 agent 照常收到帶原因的通知。

## 備選方案

- **在 `run`/`start` 旁加第三個方法（`begin()`）**——最初的設計。評審中否決：三個「方法」其實是披著方法名的兩根正交輸入（deadline 策略；呼叫方等待哪個投影），同行產品全都建模為一次執行加投影檢視。收斂順帶刪掉了預算/疣的漂移，而不是再添一層表面。
- **Codex 的 session 模型**（每次呼叫都是觀察窗、經 `write_stdin` 輪詢）——否決：那是重複 `ctx.jobs` 已有能力的模型側詞彙變更；其早退結果契約保留在 promoted arm 裡。
- **獨立的移交閾值設定**——否決；「超時意味著別再阻塞回合，而不是殺掉工作」不需要第二個計時器，模型顯式傳的 `timeoutMs` 同樣限定等待（兩家同行皆如此；schema 文案已說明）。
- **seam 上的轉移 offer**（`onExpiry: 'offer'`、`ShellExecution.promotion`、需同步 `accept()`/`decline()` 應答的 `ShellPromotionOffer`）——本 PR 最初交付的版本。評審否決，因為推遲登記是這套協定存在的唯一原因：執行器的 offer 分支中繼呼叫方訊號、自設計時器、accept 時解綁訊號，這些持有控制代碼的消費方都能自己做，而 job 一開始就存在後一樣都不需要。
- **不在啟動時登記、只由工具在 `onExpiry: 'none'` 之上自設 deadline**——去掉了 seam 協定，但命令在超時前依然不可見、不可殺；否決，因為從第一秒起就被列出、可停止的命令正是人類殺停的意義所在。
- **shell 工具硬依賴 `jobs`**——否決：想要 shell 卻不想讓模型看到三個 `job_*` 工具的組合必須仍然可能，所以工具改為隨註冊表的存在切換定義。
- **讓被等待的命令不佔准入名額，以及 `JobView` 上的 `attached` 標記**——延期：啟動時被拒回落到 deadline 殺，Web 任務列表對執行中前臺命令的分組留作後續。

## 測試

執行器層（真實程序）：`'kill'` 與 `'none'` 兩個分支按首因歸類；deadline 前的呼叫方 abort 在程序活過 deadline 時仍是首因；預先 abort 的訊號歸類 `aborted`；準備到期返回已結算的超時控制代碼且不 spawn（沙箱套件）；同步拋錯收容且錯誤同一性穿過 `result()`。工具層：真實的 `printf …; sleep 30` 配 `timeoutMs: 250` 在呼叫等待期間就以 `bash-1` 列出，返回帶早期輸出的仍在執行文字，其下一次 `job_output` 讀取不重複任何內容；在等待內完成的命令返回前臺結果，註冊表依次播報 `registered`、`settled`（`awaited: true`）、`removed`，之後列表為空；等待期間的註冊表殺停在訊號標記前渲染 `[stopped: cancelled by the user]`；取消呼叫以 `tool call aborted` 為原因殺掉其 job；啟動失敗是工具的錯誤結果且不留 job；准入飽和回落到 deadline 殺並告警；`promoteOnTimeout: false` 保持殺、不發任何 job 事件、撤掉描述句；註冊表稍後載入時 schema 切到帶 job 的版本、解除安裝時切回純前臺，而在註冊表存在時釋放工具外掛會移除工具且不記錄任何錯誤；pwsh 以腳本化執行器映像每個案例。註冊表層：存活等待為 `awaited`，無人等待、超時或中止的等待為 `false`，另一個等待超時時仍為 `true`；`remove` 以 `removed` 事件丟棄已結算記錄，並拒絕存活 job、未知 id 與外部呼叫方。渲染文字逐字釘死。

## 後果

- 每個 `ShellExecutor` 消費方都已遷移：工具、hook runner、tmux-context 與 webworker 沙箱棧現在都說 `execute()`；執行器測試套件用本地 `run`/`start` 墊片保住情境語義。
- `bash`/`pwsh` 的工具描述與 `timeoutMs` schema 文案取決於註冊表是否存在（模型可見）；輸出 union 保留 `promoted` arm，前臺 arm 新增可選的 `stopped` 原因——PTC 系統提示詞快照隨之重錄。
- 已登記的命令完全沒有 deadline：前臺呼叫的超時只限定等待，之後停下命令靠 `job_kill` 或 Web 停止控制元件。
- Web 任務列表顯示每條執行中的前臺命令並經 `job.list`/`job.follow` 流式觀看；完成的命令隨結果離開。
- `JobRegistry` 新增 `remove` 與 `settled` 事件的 `awaited` 標誌；`dsh-tool-jobs` 只保留模型殺停過的 job 集合。
- `start()` 時代同步 spawn 拋錯逃逸給呼叫方的行為不復存在：呼叫方從 `result()`/讀路徑讀失敗。沙箱「同步 EACCES 指名 runner」的分類現在以 `result()` rejection 或控制代碼的 `runnerFailed` 事實呈現。
