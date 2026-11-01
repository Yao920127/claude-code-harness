# Agent Note: 持久化 PTY 工作階段

Status: implemented

[English](2026-07-16-persistent-pty-sessions.md) | 中文

## 問題

harness 可以執行前臺與後臺命令、編輯檔案和委派工作，但無法跨工具呼叫延續一次互動式終端對話。每次 `bash` 前臺執行都會啟動一個新 shell，因此 shell 內的 cwd、匯出變數、虛擬環境啟用狀態、函式、job control 狀態和互動式子程序都會隨本次呼叫結束。

這個缺口排除了狀態駐留在終端而不是檔案中的工作流，例如單步除錯 `gdb`、在 Python 或 Node REPL 中探索、驅動 `ed` 這類行式編輯器，或者中斷前臺命令後回到原 shell。通用的 [`ctx.jobs`](../../../../packages/jobs/README.zh.md) 執行時可以保留後臺操作控制代碼和輸出，但不提供互動式 stdin 或終端語義。

現有 `bash`、`read`、`write` 和 `edit` 工具仍是有界、可審計操作的可靠預設選項。PTY 是對確實需要終端狀態的工作的補充能力，不說明這些工具有缺陷，更不意味著要移除它們。

## 決策

可選的 `packages/terminal/` 能力家族提供由 agent（智慧代理）擁有、持久化且面向行式互動的 PTY 工作階段。它遵循儲存庫的 [能力模式](../../implemented/architecture/2026-06-13-capability-seams.zh.md)，與現有命令和檔案系統工具並存，並且不修改 `agent-loop`。

目前實作在 Linux 和 macOS 上支援互動式 shell 與行式 REPL。全螢幕終端應用、按鍵序列、BEL 觸發的控制流、程序丟失後的工作階段恢復以及跨 agent 共享工作階段都明確推遲。

### 包拓撲

| 包 | 角色 | ctx key |
|---|---|---|
| `dsh-terminal` | `TerminalSessionService`、branded `TerminalSessionId`、後端註冊表、按 owner 隔離的工作階段約定和結果型別 | `ctx.terminals` |
| `dsh-terminal-bash` | 基於 `ctx.subprocess.spawnTerminal()` 的持久 shell 後端：就緒狀態、有界終端緩衝、沙箱解析和感知 owner 的工作階段生命週期 | 在 `ctx.terminals` 上註冊後端 |
| `dsh-tool-terminal` | 6 個面向模型的工具、後臺傳送的 task 執行時整合、使用指引和 UI 渲染意圖 | 註冊到 `ctx.tools` |

就緒判定仍屬於 PTY 後端行為，不是第二條公共約定。終端程序提供者只提供基底事實，例如前臺程序組，以及能否證明該組正在等待輸入；`dsh-terminal-bash` 將這些事實與提示符和靜默證據組合成統一的傳送結果。

### agent 所有權與身份

`TerminalSessionService` 在程序內儲存活工作階段，但每個工作階段都由工具執行上下文傳入的確切 `Agent` 擁有。服務鑄造不透明的 `TerminalSessionId`；模型可選填的 `name` 只是顯示中繼資料，僅在該 owner 內唯一。所有操作都以 `sessionId` 為目標，`list`/`read`/`signal`/`kill` 會拒絕 owner 之外的呼叫方。

實作不提供外掛載入期 auto-start 工作階段。`terminal_open` 只在 agent 工具呼叫期間建立工作階段，此時所有權和所屬的事件溯源工作階段都已確定。未來的宣告式啟動功能必須透過尚未釋出的 agent setup 組合，而不能建立全域共享終端。

agent scope dispose（資源釋放）時先撤銷註冊，再等待全部所屬 PTY 完全停穩。未釋出的後端 setup 同樣是受追蹤的生命週期操作：owner 或服務 dispose 會中止服務自有的 signal，等待後端結算與復原完成後才返回。即使後端 reject，或返回的工作階段在復原 close 時失敗，呼叫方取消仍會原樣保留其 `AbortSignal.reason`；該清理失敗不會替換呼叫方原因，而會繼續受追蹤，留待後續 owner 或服務 dispose 處理。由 lifecycle dispose 觸發的復原 close 失敗會使 spawn 與該 lifecycle dispose 都 reject，而 `TerminalBackendCleanupError` 讓後端在不替換呼叫方取消的前提下，為該 lifecycle dispose 保留自身的啟動清理失敗。若呼叫方取消在 dispose 開始前已經結算，該清理失敗會繼續作為受追蹤的 owner activity 保留，直到後續 owner 或服務 dispose 消費並報告它，因此沙箱模式策略不會把清理失敗誤判為完全停穩。後端或工具外掛 reload 不會遺留工作階段：所有權持續存放在 `TerminalSessionService` 中，直到 agent 結束，與 [`ctx.jobs`](../../../../packages/jobs/jobs/README.zh.md) 的服務持有記錄模式一致。服務會先同步把工作階段預留給一次活躍傳送，再返回該操作；後臺傳送同樣會在 job id 對外可見前完成預留。第二次傳送會以 `SEND_ACTIVE` 失敗，因此輸出與取消無法跨越操作所有權。

### 安全與程序邊界

註冊的 `shell` 後端只約束終端如何啟動，不約束啟動後輸入的命令。因此 `dsh-terminal-bash` 在 spawn 前應用兩層保護：

- 它只提供終端專用的環境覆蓋；掛載的子程序提供者先清除名稱形似憑證的環境變數，再合併這些覆蓋。
- 它要求共享的 `ctx.sandboxPolicy`。後端在 spawn 時，以部署預設值為底摺疊 owner 的有效工作階段模式；`danger-full-access` 會直接啟動 shell，受限模式則要求同一執行世界中存在 `ctx.sandbox` 提供者，並只包裝一次 shell argv。該模式與 workspace root 在 PTY 的整個生命週期中充當程序邊界。只要 owner 有任何已開啟的 PTY 或尚未釋出的 spawn，任何會改變生效 `sandbox/mode` 的寫入都會在提交前被拒絕，並提示先等待建立操作結算，再關閉這些工作階段；不會改變生效模式的寫入仍然有效。這項進行中的預留從後端 setup 持續到釋出完成，因此不存在降級後又出現權限更寬的終端這一競態。`danger-full-access` 是現有的顯式無約束選擇，不另設 PTY 私有 bypass。

沙箱限制本地程序副作用，但不會讓任意 shell 輸入自動安全：網路呼叫和其他外部副作用仍由部署策略治理。工具描述會說明 PTY 工作階段比一次性工具更難審計，只應在確實需要持久狀態或互動式 stdin 時使用。

本地子程序終端原語只使用 `node-pty` 的公開能力：子程序 PID、`data` 與 `exit` 通知、`write` 和 `kill`。它不假設能存取原生 master fd，也不從 TypeScript 呼叫 `waitpid`。在受支援的 Linux 主機上，[原生收容 owner](../architecture/2026-08-28-subprocess-native-containment.zh.md)會在 user-systemd scope 內啟動同一條 PTY 命令，同時保持 PID、session、控制終端、前臺程序組與就緒語義。該原語下的平臺程序檢查器仍在 Linux 上透過 `/proc`、在 macOS 上透過 `ps` 推導前臺程序組和 fallback 父子程序身份。[可移植執行環境決策](../architecture/2026-07-28-portable-execution-world-consumers.zh.md)負責定義這種程序／消費方拆分。

### 6 個面向模型的工具

| 工具 | 用途 | 結果 |
|---|---|---|
| `terminal_open` | 從已註冊的後端型別建立按 owner 隔離的工作階段 | `{ sessionId, name, type, motd }` |
| `terminal_send` | 傳送文字、可選提交 Enter，並等待就緒或註冊一個後臺任務 | 有界 viewport、等待狀態和工作階段狀態；後臺模式還返回 `jobId` |
| `terminal_read` | 從保留的 scrollback 讀取一個有界頁 | `{ text, totalLines, lineBegin, lineEnd, truncated }` |
| `terminal_signal` | 向目前前臺程序組傳送一種允許的訊號 | `{ delivered, targetPgid }` |
| `terminal_close` | 關閉一個工作階段並等待程序樹完全停穩 | `{ killed }` |
| `terminal_list` | 列出呼叫方的活工作階段 | 按 owner 隔離的工作階段摘要 |

UI 渲染約定精確且不攜帶位置資訊。`terminal_send` 只為前臺傳送使用 terminal 呼叫卡片和結果卡片；後臺形式使用通用 `execute` 卡片。`terminal_open`、`terminal_read`、`terminal_signal`、`terminal_close` 和 `terminal_list` 分別使用通用 `execute`、`read`、`execute`、`delete` 和 `read` 卡片。所有 PTY 工具都不發出 `locations`。

`terminal_send({ sessionId, text, submit?, run_in_background? })` 將 `text` 視為 UTF-8 位元組，並由工具實作在解析階段把 `submit` 預設成 `true`。`submit` 為 true 時先寫入文字，再寫入平臺 Enter 序列；為 false 時只寫文字，使控制字元和 REPL 片段無需隱藏的內容啟發式即可傳送。取消會在向真實前臺程序組傳送訊號前將排隊輸入標記為已取消，因此即使非同步的寫入前檢查隨後才結算，該輸入也無法執行。被取消的傳送會保留其預留，直至非同步前臺訊號傳送結算，因此後續傳送不會成為該訊號的目標。`enableRunInBackground` 預設為 true；設為 false 時，schema 中會移除 `run_in_background`，呼叫方即使強行把這個未宣告參數傳入執行流程，也會被拒絕。

前臺傳送返回有界的渲染增量和兩個獨立事實：`waitReason`（`stdin_read | inferred_idle | timeout | session_exit`）與 `sessionStatus`（`running`，或攜帶結束代碼或訊號的 `exited`）。`session_exit` 指 PTY 頂層 shell 程序退出，不指由 shell 消費狀態的任意前臺命令。timeout 從不意味著程序已經退出。`dsh-tool-terminal.maxResultBytes` 預設為 262144；低於 64 的值會被拒絕，以確保建立確認保留註冊表簽發的 id；每個單文字 UTF-8 結果在加入規範化的工具或流水線錯誤、等待、工作階段、分頁、截斷、通用 task 狀態包裝、策略拒絕或短路以及 post-execute 替換或阻斷後，仍受該值限制；終端定義自有的末端 `finalizeContent` callback 會原樣保留策略刻意返回的結構化多塊內容。渲染器會為字尾預留空間並保持程式碼點邊界，而不會把後端載荷上限當作面向模型結果的最終上限。

當 `run_in_background: true` 時，`dsh-tool-terminal` 在 `ctx.jobs` 上註冊進行中的傳送，並立即返回 `jobId`。生產方把 `maxResultBytes` 寫入 task 快照，使 `job_output`、kill 返回的終態狀態和完成通知在加上通用中繼資料後，仍對完整結果執行同一上限。`job_output(wait: true)` 負責等待、讀取增量輸出並記錄最終結果；`job_kill` 會解析目前前臺 PGID 併傳送真正的 `SIGINT`，即使應用已停用終端 `ISIG` 也同樣如此，且後續升級仍只透過 PTY 後端擁有的 teardown 路徑進行。若 task 對外介面不存在，後臺模式必須在寫入輸入前失敗。設計不新增 PTY 專用的 `sleep` 工具或通用喚醒 API。

`terminal_read` 從最新保留行向後分頁。後端同時對保留的 scrollback 和返回頁載荷執行行數與 UTF-8 位元組上限，因此單個超長行無法繞過後端上限；工具隨後再限制包含分頁與截斷中繼資料的完整渲染頁。`truncated` 用於區分保留資料丟失與普通 viewport 增量。

`terminal_signal` 接受閉合集 `SIGINT | SIGTERM | SIGKILL | SIGTSTP | SIGHUP`。後端在執行時解析終端前臺程序組。當目標組是頂層 shell 時拒絕 `SIGKILL`，並指引呼叫方使用 `terminal_close`；程序組解析失敗時操作直接失敗，而不是向猜測的 PID 傳送訊號。

### 本地就緒檢測

本地後端先識別受控 bash 啟動時發出的私有 OSC prompt marker，並且只有在最近一個 marker 後的可列印尾部與受控 `PS1` 完全相等時才宣告 prompt 就緒；除此之外，它還執行 3 個有界 fallback 層級。在 data callback 之間保留該尾部，可以適應 marker 與 prompt 被分開交付的情況；如果回顯的輸入或輸出跟在延遲到達的先前 prompt 之後，要求尾部完全相等會拒絕該 prompt，使其無法完成目前 send。marker 在輸出到達模型前被移除，使兩個平臺上的普通 shell 命令都無需固定等待靜默閾值。尚未釋出的 startup 不會把零輸出靜默視為就緒；timeout 會拒絕 spawn。若呼叫方取消在 startup 期間勝出，後端會關閉私有工作階段並原樣丟擲 `AbortSignal.reason`；尚不可觀察的前臺 PGID 不會再用查詢錯誤覆蓋取消原因。所有時間參數都是經驗證的設定欄位：`pollIntervalMs`、`exactProbeAfterMs`、`idleSilenceMs`、`handoffGraceMs` 和 `timeoutMs`。

在 Linux 上，檢查器從 `/proc/<shellPid>/stat` 讀取 shell 的終端前臺 PGID，列舉該程序組中的每個程序與執行緒，並檢查它們目前的 syscall。Tier 1 只有觀察到 stdin 等待才返回正結果：直接 `read(0)`、獲准讀取且含 fd 0 的 `select`/`pselect6` 或 `poll`/`ppoll` 參數，或者含 fd 0 的 epoll interest list。等待執行緒的 `/proc/<pid>/task/<tid>/fd/0` 還必須標識 shell 的控制終端裝置，因此執行緒本地 fd 表無法用 leader 的終端描述符冒充自身 fd，阻塞於管道的流水線讀取端仍屬於正在執行的命令。直接 PTY 描述符使用其裝置號；`/dev/tty` 則使用所屬程序的 `tty_nr`，因為 `stat` 報告的是別名裝置而非選定的 PTY。終端輸入前就已存在的等待並不代表寫入後就緒：必須先觀察到同一 PGID 脫離該等待，之後再次進入等待才能使該次 send 完成；前臺 PGID 發生變化則構成新的證據。無法讀取的程序記憶體和未識別的 syscall 都是 miss，絕不作為正向猜測。主機策略（包括加固的 ptrace 策略）若拒絕讀取 `/proc/<pid>/task/<tid>/syscall`，同樣會跳過 Tier 1 並保留有界的 Tier 2 idle 推斷；程序休眠狀態絕不會代替不可存取的 syscall 證據。架構表只包含對應 Linux UAPI 定義的 syscall number；檢查器先准入執行時架構，再檢查每個受支援的核心 ABI，因為在使用者態模擬下，`/proc` 可能報告不同的 ABI。不受支援的執行時架構會跳過 Tier 1。

macOS 沒有精確 syscall 層。任何前臺程序組輸出靜默都會返回 `inferred_idle`，包括 Python 和 `gdb`；從 `ps` 推導的終端 PGID 只用於傳送訊號，不作為「只有 shell 才能 idle」的證明。純程序檢查邏輯可注入，並在 Linux 上經過單元測試，同時由 macOS CI job 驅動真實 PTY 和程序表路徑。

Tier 2 在持續 `idleSilenceMs` 沒有輸出後返回 `inferred_idle`，因此 sleep 或網路阻塞的命令可能看似 ready。如果此前已經見過 prompt marker，Tier 2 會再等待 `handoffGraceMs`，使恰好落在靜默邊界上的 bash 前臺交接仍然以精確的 `stdin_read` 歸因結束，而不是退到較弱的推斷；該寬限是由部署方擁有的設定欄位，並被驗證為至少覆蓋一個 `pollIntervalMs`——短於輪詢週期的寬限裝不下一次就緒輪詢，因此不可能改變任何結果。它只約束見過 marker 的 send，代價是這一種情況的互動返回延遲，而不是每一次 send。Tier 3 在 `timeoutMs` 後返回 `timeout`，避免前臺工具呼叫無限佔住 agent。結果保留這些區別；呼叫方可以透過 `ctx.jobs` 等待、向前臺組發訊號，或從另一個工作階段排查。

一次 send 在任一層級 settle 之後，`TerminalSendOperation.append` 就不再接受輸出，此後子程序的輸出不會再進入那個已 settle 的 operation；它仍然會進入 scrollback，以及此時恰好處於活躍狀態的任何 send。因此，等待自己所啟動的 operation 上出現標記的測試，必須把 `idleSilenceMs` 與 `timeoutMs` 設得高於子程序自身的啟動耗時；否則在負載較高的 macOS runner 上，直譯器啟動會在標記列印之前就結束這次 send。

`node-pty` data 通知進入同一個終端 parser。parser 的 carry state 會處理跨 callback 的控制序列和位於 callback 末尾的回車；因此，即使 CRLF 被拆開，也只會生成一個換行，而不會產生改變分頁的空行。實作會規範化行式輸出，但不承諾正確操作全螢幕應用。

### 模型可見輸出與永續性

現有持久化 `tool/call` 與 `tool/result` 事件是模型傳送文字和返回給模型的渲染輸出的真源。`terminal_open` 透過已記錄的工具結果返回 MOTD；前臺 `send`/`read`/`list`/`signal`/`close` 結果走同一路徑記錄。PTY 包不會把原始位元組流重複寫入自定義工作階段事件。

後臺傳送複用現有後臺任務完成通知和 `job_output` 結果路徑，因此進入後續模型請求的任何輸出同樣持久化。原始終端位元組只作為有界的程序內狀態存在，既不持久化也不可恢復。未來的 opt-in transcript（文字記錄）sink 必須擁有獨立的保留、憑證和隱私約定。

### 程序樹 teardown

在受支援的 Linux 主機上，subprocess 終端控制代碼會把頂層 PTY 程序繫結到臨時 user-systemd scope。建立前，close 透過 direct PTY fallback 傳送 `SIGTERM`，阻止 bootstrap 繼續；建立後只向 scope 傳送訊號，並且僅在 scope signalling 失敗時使用 direct fallback。隨後它等待 manager 證明該 range 為空，並在設定的寬限期後升級到 `SIGKILL`。呼叫 `setsid` 或發生 reparent 的後代仍屬於 scope，而 PTY 的 direct exit 通知繼續作為終端結果。

fallback 主機保留觀察式程序 session 清理。控制代碼會按父 PID 以子程序優先順序捕捉傳遞後代、傳送 `SIGTERM` 並等待，然後重新掃描關停期間 fork 出的子程序，向二者並集傳送 `SIGKILL`，並在停止頂層程序前驗證每個非殭屍後代都已離開程序表。身份匹配的 Linux 殭屍程序已無可執行工作，因此視為完全停穩。每個捕捉的 PID 都包含程序啟動身份，避免 PID 複用把升級訊號發給無關程序。

teardown 獨立報告頂層程序退出與存活程序清理。PTY 工作階段不會只因 shell 退出就聲稱成功：它會呼叫 `SubprocessTerminalHandle.terminate()` 並等待整個工作階段完全停穩，若清理失敗則向外傳播並列出存活者。失敗的 close 不會永久快取：註冊表與本地工作階段各自僅在關閉圍欄仍指向該次失敗嘗試時才將其清除，因此後續的顯式 close 或生命週期 close 會重試，且不會干擾較新的並行嘗試。即使某個 close 失敗，服務 dispose 仍會清空其後端、預留與 owner detacher 註冊表。

### 組合與推行

範例組合保持 opt-in，並採用安全預設值：

```yaml
plugins:
  '@deepseek-ai/dsh-sandbox-local':
  '@deepseek-ai/dsh-sandbox-policy':
    config:
      mode: workspace-write
      workspaceRoot: .
  '@deepseek-ai/dsh-terminal':
  '@deepseek-ai/dsh-subprocess-local':
  '@deepseek-ai/dsh-terminal-bash':
    config:
      scrollbackLines: 10000
      scrollbackMaxBytes: 4194304
      maxReadBytes: 262144
      pollIntervalMs: 50
      exactProbeAfterMs: 150
      idleSilenceMs: 3000
      handoffGraceMs: 500
      timeoutMs: 30000
      disposeGraceMs: 3000
  '@deepseek-ai/dsh-tool-terminal':
    config:
      enableRunInBackground: true
      maxResultBytes: 262144
```

包提供簡潔的工具指引，說明持久狀態、owner 隔離、不確定的 idle 結果、清理，以及無需互動時優先使用現有一次性工具。已釋出的基礎範例不掛載 PTY：PTY 僅透過專用組合 opt-in，而 ACP（Agent Client Protocol）與 headless 快照 overlay 會對其進行驗證。`dsh-tool-terminal` 實例一旦啟用，6 個工具和 `run_in_background` 就會預設啟用；部署可透過設定僅停用後臺參數。

### 推遲的工作

- 全螢幕 TUI 支援、命名按鍵序列、BEL 中斷、終端 resize 工具和 alternate-screen 快照需要另行驗證面向模型的約定。
- 宣告式 per-agent 啟動需要 agent-setup 組合點；仍然禁止外掛載入期全域工作階段。
- harness 程序丟失後的工作階段恢復需要程序外 owner 和版本化協定。
- 網路出口策略與外部副作用復原超出 PTY 範圍，繼續作為獨立安全工作。
- Windows/ConPTY 工作階段經由 subprocess-local 的 Windows inspector（Toolhelp32 身份、偽前臺程序組、taskkill 拆卸）與 `pty-local` 的 pwsh 方言執行；見 [pwsh 持久工具 note](../../archived/architecture/2026-08-11-pwsh-persistent-pty.md)。

## 備選方案

**用 PTY 替換 `bash`、檔案系統工具或 task 工具。**拒絕。一次性工具擁有更強的驗證、審批、沙箱、輸出上限和回放約定。PTY 只服務互動式狀態。

**給 `bash` 增加持久模式。**拒絕。按就緒而不是程序退出返回、跨呼叫保留程序樹、暴露互動式 stdin 會形成不同的所有權和失敗約定。

**要求從 `node-pty` 取得原生 master fd。**拒絕。它的公共 API 不暴露 master fd。本地子程序終端介面卡改為從受支援的 OS 程序中繼資料推導前臺組與子孫程序，並把不可讀中繼資料視為 detector miss。

**向根 PID 所屬 POSIX 工作階段的全部成員傳送訊號。**拒絕。`node-pty` 可能暴露屬於啟動器工作階段的 helper PID，因此按 SID 清理可能向無關的 harness 或桌面程序傳送訊號。帶 PID 啟動身份驗證的子孫程序樹範圍更窄，其安全邊界由結構保證。

**釋出可替換註冊表 `TerminalIdleDetector`。**拒絕。基底專用的前臺事實來自掛載的終端程序原語，提示符／靜默就緒判定則仍是 `dsh-terminal-bash` 內部的一項私有策略。替換檔案系統／子程序執行環境就是所需擴充功能點。

**新增 PTY 專用 `sleep` 工具。**拒絕。`ctx.jobs` 已經擁有有界等待、取消、完成通知和麵向模型的收集。第二套通用喚醒機制會跨越 agent loop（智慧代理迴圈）邊界並重復該約定。

**包含 TUI sequence 與 BEL 處理。**拒絕。源 prototype 將這些路徑視為 timing-sensitive，且仍記錄未解決的 alternate-screen 和互動失敗。行式 PTY 已能證明核心價值，無需把未經驗證的行為放進基礎層。

**立即採用程序外 daemon。**初始的程序內能力不採用，因為目前長駐的執行入口已能維持 Cordis 上下文。跨程序恢復或多用戶端附加會讓 daemon 變得合理，但兩者都已推遲。

## 驗證

- 逐檔案覆蓋測試鎖定了 owner 隔離、並行預留、寫入前檢查期間的取消、未釋出 spawn 的取消與等待式 teardown、沙箱模式變更拒絕、可重試的生命週期清理、就緒層級、對寫入前 stdin 等待與延遲到達的先前 prompt 的拒絕、設定化交接寬限把 idle fallback 頂過一次輪詢以及低於 `pollIntervalMs` 時的拒絕、sanitizer carry state、完整 UTF-8 結果上限、task 整合、schema 和精確 render intent。
- 子程序 fixture（測試前置資料）覆蓋非 leader 與非主執行緒的 stdin 等待、執行緒本地 fd 表、`/dev/tty` 別名、使用者態模擬下受支援的核心 ABI、拒絕把指向管道的 fd 0 當作終端輸入、殭屍程序完全停穩、不可讀程序狀態、不支援的架構和其他誤報拒絕；同一單元測試套件透過注入覆蓋 macOS 檢查器邏輯。
- 真實 `node-pty` 與 PTY 消費方測試共同覆蓋 shell 狀態、透過 `/dev/tty` 讀取控制終端輸入、程序 syscall 可讀時的精確歸因、主機策略拒絕讀取時的有界 idle fallback、共享沙箱策略、環境清洗、raw mode 前臺 `SIGINT`、忽略 `SIGTERM` 的後代程序，以及 dispose 返回後立即完全停穩。Linux native 冒煙測試會在一個 reparent 的 `setsid` 後代仍由 scope 擁有時，保持 PTY PID、session leader、控制終端、前臺 `inputWaiting` 與 readiness；fallback 測試套件繼續覆蓋帶身份圍欄的觀察式清理。
- Loader 驅動的 `cordis.yml` 測試掛載真實三包組合，並驗證延遲到達的流水線輸出隨已完成命令返回，而不會被歸類為終端輸入就緒。SDK minimal 快照透過持久 Bash 工具固定該輸出；ACP 與 headless 快照透過 opt-in overlay 固定 6 個終端 schema、有界結果和錯誤；TUI 快照固定 terminal 與 generic 卡片展示。
- 包約定、架構圖、子系統頁面、生成目錄和 website API 描述同一個已釋出介面。

## 後果

**無需削弱一次性工具即可獲得持久終端狀態。**Shell 與 REPL 狀態可以跨工具呼叫保留，而 `bash`、`read`、`write` 和 `edit` 繼續擁有更窄的驗證、審批與回放約定。

**Linux Tier 1 之外的 idle 都是啟發式結果。**輸出靜默無法區分 prompt、sleep 和網路 I/O。型別化結果保留不確定性，有界 timeout、task 等待與訊號讓模型仍能掌握控制權。

**精確歸因與推斷歸因的邊界是延遲取捨，不是可消除的競態。**歸因取決於核心在靜默上限到達之前還是之後釋出前臺交接，因此任何固定寬限都是一次排程上的賭注。`handoffGraceMs` 把這個賭注交給部署設定：調大它可以在慢速或高負載主機上換到精確的 `stdin_read` 歸因，代價是見過 prompt marker 之後的互動返回延遲；調小則相反。不應依賴勝負結果的測試使用不會出現在輸入回顯中的 token，斷言下一次 send 中由子程序產生的輸出，而不是斷言歸因路徑。

**持久狀態可能偏離模型認知。**模型可能忘記 cwd 或活躍 REPL。工作階段摘要和保留輸出有助恢復，但任何提示詞都無法讓狀態持久化變成確定行為。

**Linux native ownership 消除了程序樹觀察缺口，fallback ownership 沒有。**受支援的 user-systemd scope 會持續保有 daemonized 或 reparent 後代，直到 scope 為空。在 macOS、Windows ConPTY，以及無法建立 scope 的 Linux 主機上，觀察式 teardown 開始前已經逃逸的程序仍可能避開捕捉樹；fallback 接受這個缺口，不冒險按 SID 向無關程序傳送訊號。

**Shell 可以造成外部副作用。**工作階段沙箱和環境清洗降低本地暴露，但無法撤銷 push、API 呼叫或訊息傳送。無法容忍這些副作用的部署必須省略 PTY 或增加網路策略。

**程序丟失會銷燬終端狀態。**程序內工作階段無法跨 harness crash 或 restart 存活，原始 scrollback 也不持久化。重要工作必須提交到檔案或其他持久系統。

**`node-pty` 是 `dsh-subprocess-local` 的原生依賴。**安裝、支援的 Node 版本、prebuild 可用性和平臺行為都需要在每個支援 OS 上執行建置產物冒煙測試。
