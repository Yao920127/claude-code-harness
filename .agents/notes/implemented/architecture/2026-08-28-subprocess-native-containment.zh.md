# Agent Note: 原生 owner 收容逃逸的 subprocess 後代

Status: implemented

[English](2026-08-28-subprocess-native-containment.md) | 中文

## Problem

detached POSIX 程序組、Windows direct-parent 遍歷與 PTY 後代掃描只能描述仍可透過某種程序關係觀察到的成員。子程序可以呼叫 `setsid`、發生 reparent，或比 direct parent 存活更久並離開這些 range，因此終止表面程序樹後，工作、埠或檔案仍可能保持活躍。direct target result 也不能證明全部後代已經停止。

普通 subprocess 控制代碼無法透過釋出 PID 解決這個缺口。Linux scope setup 與 Windows Job runner 會非同步建立 target identity，PID 不表示完整 managed range，消費方也會被迫推斷 startup 是否已經提交。因此，公共結果、range ownership、私有啟動協定與打包入口需要各自明確的 owner。

## Decision

`LocalSubprocessRuntime` 會在 target 執行前選擇一個 provider 私有的 managed-range owner。符合條件的 Linux 普通命令與 PTY 進入臨時 user-systemd scope；符合條件的 Windows 普通命令進入由私有 runner 擁有的 unnamed kill-on-close Job。不支援的主機使用既有較弱 fallback，並在 provider 生命週期內只警告一次。選定的 native 路徑一旦可能已經執行 target，provider 絕不重放 target。

普通 `SubprocessHandle` 沒有 PID 或公共 startup 狀態。`.done` 報告 direct target result 或 startup／provider failure，`terminate()` 向所選 range 傳送訊號，`waitForExit()` 只有在同一 range 被證明為空後才成功。`SubprocessTerminalHandle.pid` 繼續屬於終端約定，因為 PTY identity 與前臺檢查需要它。

### Linux scope 與 one-shot bootstrap

同一 runtime 第一次符合條件的 Linux 普通或 PTY 呼叫會深入檢查準確 runner 入口、libc `execve` 與 `fcntl` bindings、可讀的 user manager 與保留 literal argv 的 transient-scope 支援。失敗的深度 probe 會重試，第一次成功則會快取。之後每次符合條件的呼叫仍會在 target 執行前輕量檢查 user manager 是否可達。native 路徑一旦選定，scope、協定、狀態查詢或 pre-exec failure 都由本次啟動報告，絕不切換到 fallback。

parent 建立一個 0700 目錄，其中的完整 0600 `launch-request.json` 儲存最終 target cwd 與環境。私有 `DSH_SUBPROCESS_RUNNER` 值負責定位該 request，runner 則從 provider cwd 與 bootstrap-safe 環境啟動。`systemd-run --user --scope --quiet --collect --expand-environment=no` 先把自身程序註冊到 scope，再由 one-shot bootstrap 刪除並驗證 request、切換到 target cwd、恢復完整 target 環境、按 target PATH 規則解析裸可執行檔案、清除 fd 0 至 fd 2 的 `FD_CLOEXEC`，並使用原始 argv 呼叫 libc `execve()`。bootstrap 會原地成為 target 並保留繼承的 stdio，不作為常駐 supervisor。

request 被消費或 manager 已觀察到 loaded unit 都能建立 scope ownership。在這兩項事實出現前，只要 direct launcher 仍在執行，unit absence 就保持未決。如果 launcher 退出時 request 仍未消費，direct result 會以 startup failure reject，除非實際觀察到的訊號匹配 launcher 仍在執行時請求的終止訊號。普通程序與 PTY 程序遇到匹配訊號時都會保留實際退出結果；已記錄的 startup error 始終優先。launcher 已退出且 unit 不存在時，range observation 會獨立結算 empty-range wait。parent 每 50 毫秒檢查一次這段未決區間；建立後，狀態查詢按指數增長間隔退避，最多達到既有的 5 秒 systemctl 上限。每次查詢讀取 `LoadState`、`ActiveState` 與 `TasksCurrent`：loaded `inactive` 或 `failed`，以及已經建立的 unit 變為 `not-found`/`inactive` 或被 collect 解除安裝，都能證明 range 為空。`active`、`activating`、`reloading` 與 `deactivating` 仍是非終態；例外是：一旦請求過終止，且 launcher 已經退出或 bootstrap 已消費其 request，報告沒有任何程序卻仍 active 的 unit 就是空 range。request 消費證明 payload 已進入 scope，因此即使 Node 尚未收到直接程序的退出通知，零成員也能證明完全停穩。request 未消費時仍須等待 launcher 退出——manager 只在觀測到 populated→empty 轉變時才結束 scope，因此進入 cgroup 前就被殺死的 payload 永遠不會觸發該轉變。該判定會 stop 掉這個遺留 unit，使 transient unit 不會累積；未上報或為 `[not set]` 的程序數仍視為未知並繼續等待。未知或 malformed 組合以及不可讀的 manager 結果會使 `waitForExit()` reject，而不是宣稱完全停穩。`terminate()` 會喚醒正在休眠的 observer 立即複查，結算時會取消未勝出的退避 sleep。嚴格的同目錄 `startup-error.json` 只承載 request／bootstrap 或 target pre-exec failure，parent 會在可觀察生命週期完成時移除本次 spawn 的私有路徑。

普通 target result 仍來自同一個 child process。PTY 路徑複用同一 request 與 bootstrap，但不增加常駐 runner，因此 `node-pty` PID、程序組、session leader、控制終端、前臺 `inputWaiting`、`/dev/tty`、readiness 與 direct terminal outcome 保留既有含義，同時 scope membership 覆蓋 `setsid` 與 reparent 後代。

### Windows runner 與 Job

Windows parent 從 bootstrap cwd 與環境啟動 provider runner，把原始 target argv 放在私有 `--` 分隔符之後，並等待 Node 的 runner `spawn` 事件後才傳送恰好一條 start request。runner 在 spawn 前報錯時，direct launch failure 會原樣保留，同時證明 Job range 從未存在，因此 empty-range wait 成功；spawn 後的 infrastructure failure 仍是不確定狀態，會使 range settlement reject。除此之外，Node IPC 還承載冪等 terminate control 與恰好一個 result。runner 的 fd 0 至 fd 2 相互隔離，fd 3 承載 IPC，fd 4 至 fd 6 承載 target stdin、stdout 與 stderr。忽略 stdin 時，fd 4 繼承平臺 null-device descriptor；其他模式使用 pipe。共享 Win32 層透過 Node 匯出的 `uv_get_osfhandle()` 把 fd 4 至 fd 6 對映為 OS handle，拒絕 null 以及 Koffi 暴露的 unsigned `UV_INVALID_OS_FILE_HANDLE` 與 `UV_INVALID_FILE_DESCRIPTOR` sentinel，臨時啟用有效 handle 的繼承，並透過 `STARTF_USESTDHANDLES` 傳入。`spawnCurrentTokenJobProcess` 要求單獨解析的 `applicationName` 與完整 target 環境，並使用 `CREATE_UNICODE_ENVIRONMENT` 傳入排序、雙 NUL 結尾的 UTF-16LE 塊，其中包括 `=X:` 驅動器條目，而不修改 runner 環境。suspended target 進入 Job 並恢復後，runner 只關閉 fd 4 至 fd 6；它絕不改寫或銷燬 Node 標準流。parent 把 pipe carrier stream 作為普通控制代碼的 stdio 返回，使用者位元組絕不經過 IPC。

runner 是 target process handle 與 unnamed Job handle 的唯一 owner。`spawnCurrentTokenJobProcess` 以 suspended 狀態建立 target，把它分配給不允許 active breakaway 的 kill-on-close Job，並只在分配後恢復。runner 輪詢 direct process 取得 target exit code，並輪詢 Job 取得 active-process count。只有 direct result 已透過 IPC send callback 交付且 Job 已報告零 active process 後，runner 才成功退出；parent 只把這次 clean exit 對映成成功的 `waitForExit()`。

parent 會在收到經過驗證、只含數字的 `target-exit` 時立即永久鎖存它，此時既有 stdout／stderr close 或有界 drain barrier 可能尚未完成。`.done` 只繼續等待該 stdio barrier，隨後返回已鎖存的結果。後續 Job query、range settlement failure、IPC loss 或 runner 異常退出只會使 `waitForExit()` reject，不能替換 direct result。在有效 target result 到達前發生 infrastructure failure 才會使 `.done` reject，但該 rejection 不會說明 target 是否已經開始執行。disconnect 或 result-send failure 會讓 runner 停止協定工作、終止並關閉自己唯一的 Job handle，然後以非零狀態退出。最後一個 Job handle 關閉會終止剩餘成員，但不會把 disconnected 路徑改寫成成功的完全停穩證明。

### 私有分派與協定

source 啟動透過 TypeScript source launcher 執行包內 runner 入口，built 啟動解析 `@deepseek-ai/dsh-subprocess-local/runner` export，Python SDK 單檔案可執行程式則從 [`python/sdk-runtime/runtime-bootstrap.mjs`](../../../../python/sdk-runtime/runtime-bootstrap.mjs) 進入。該 bootstrap 由 Python runtime 擁有；私有 selector 不存在時，它呼叫公共 CLI export；否則會刪除 selector，並分派到同一 subprocess runner core。公共 `dsh` 參數解析器沒有隱藏 runner mode，`apps/cli` 只建置公共入口，打包也不提供第二個 Node 可執行程式。

selector 是 per-spawn locator 或 sentinel，不是憑證或持久格式。Linux 使用一個嚴格 request 與一個可選嚴格 startup-error 檔案。Windows 使用一條 IPC channel，承載閉集的 `start` 與 `terminate` request，以及恰好兩個 result 分支：只含數字 `exitCode` 的 `target-exit`，以及必含 `name`、`message` 且只允許可選 `code`、`syscall`、`path` 的 `error`；parent 會派生 `signal: null`。提交前取消使用同一種普通 `error` record。取消 reason 不跨 wire 傳遞，因此 parent cancellation latch 會原樣恢復第一個本地 reason，包括 `null` 或 `undefined`。缺失、額外、型別錯誤或未知欄位都會 fail closed。target 環境可以包含 selector 名稱及其 Windows 大小寫變體，因為 provider 會單獨傳遞 target 狀態，並且只在私有選擇值消費後才恢復該狀態。

### Fallback 與 cleanup

準確 bootstrap、現代且可讀的 user-systemd manager，或保留 literal argv 的 scope 不可用時，Linux 會在 target 執行前進入 fallback。runner 入口、Win32 bindings 或 current-token Job probe 不可用時，Windows 普通啟動會進入 fallback。macOS 普通啟動、Windows ConPTY 與其他不受支援的主機保留既有 PGID、`taskkill /T` 或帶身份圍欄的 PTY 觀察機制。warning 會明確說明：逃離這些可觀察關係的後代不保證被終止，也不保證延遲 `waitForExit()`。

正常 Cordis dispose 會獨立啟動 direct-result 與 range observation、請求終止，並等待每個自有 range。消費方 teardown 不檢查普通 PID；它會保留原始 operation 或 startup error，同時嘗試 terminate 與 final wait，並按消費方既有錯誤順序保留 cleanup failure。range 一旦被確認為空，就會永久禁止後續向陳舊 identity 傳送訊號。

原生 Windows fixture 在成功和失敗時都透過同一個 Job owner 請求終止並完成最終等待。後代 PID 僅用於觀察：程序退出後再執行 `taskkill`，可能終止已複用該編號的無關程序，包括並行執行的其他測試 worker。

在 JavaScript 可觀察的 host exit 期間，`LocalSubprocessRuntime` 會同步強制終止每個仍存活的控制代碼，不使用 Promise 或 timer。Linux 會傳送既有 direct fallback kill 與準確 scope kill；Windows 會終止 runner，使其唯一 Job handle 關閉；PTY fallback 掃描仍是 best effort。每個控制代碼的失敗相互隔離，也不改變主機退出結果。JavaScript 無法執行的終止形態不屬於該 listener 的保證。

## Existing decisions and supersession

本 Note 擁有目前 native containment 機制。它區域性更新了[subprocess seam](../../archived/architecture/2026-07-26-subprocess-seam.md)中的 provider 與 no-PID 事實、[持久化 PTY 工作階段](../feature/2026-07-16-persistent-pty-sessions.zh.md)中的 Linux teardown 事實、[主機退出同步清理](../../archived/bug-fix/2026-08-11-synchronous-subprocess-exit-cleanup.md)使用的 native target、[共享 Win32 process primitives](../../archived/architecture/2026-08-19-shared-win32-process-primitives.md)的 ordinary 消費方，以及[Python SDK profile 執行時](../../archived/architecture/2026-08-23-python-sdk-dsh-profile-runtime.md)選擇的私有入口。每份 Note 都保留其餘決策並繼續處於 active 狀態。

## Verification

主機退出清理 fixture 對比 provider 在 disposal 前後的監聽器身份，並驗證獨立註冊的退出監聽器仍然存在。程序監聽器總數無法證明 provider 清理完成，因為其他程序生命週期處理器可能在 provider 建構之後註冊。

- provider 與 Linux 協定測試套件固定同步 NUL 拒絕發生在啟動副作用之前、嚴格 request／error 解碼、target cwd 與完整環境恢復、私有變數碰撞、保留 argv 且對 symlink 敏感的 PATH 遍歷、為繼承 stdio 清除 close-on-exec、pre-exec error ownership、失敗深度 probe 重試與成功深度 probe 快取及逐呼叫 manager 檢查、三種 scope 建立狀態（包括 request 未消費時的請求終止與意外退出）、`LoadState`／`ActiveState`／`TasksCurrent` 解析、釋放被留在 active 且沒有任何程序的遺留 scope（連同 client 仍存活、未請求終止與程序數未上報三種情形）、`reloading`、帶未勝出 delay 取消的 terminate wake-up、建立後有上限的退避，以及 PTY managed-owner 恰好一次 cleanup。
- Windows 協定與 Win32 測試套件固定恰好兩個 result 分支、只含數字的 target exit、使用普通 error 的 start cancellation 與 parent 原樣保留的本地 reason、縮減到 `name`／`message`／`code`／`syscall`／`path` 的 error record、固定的 `2`／`3`／`267` 到 `ENOENT`、`740` 到 `EACCES`、`5` 到 `EPERM`、`193` 到 `EFTYPE` 及其餘 code 到 `UNKNOWN` 的對映、runner spawn 後才傳送 start、spawn 前 failure 的 empty-range settlement、按序數顯式排序的 target 環境塊及 `=C:` 保留和雙 NUL 結尾、`uv_get_osfhandle()` carrier 對映與 unsigned invalid sentinel 拒絕、null-device ignored-stdin carrier 與非 ignore stdin pipe、result-send 與 IPC-disconnect failure、stdio settlement 前的 direct-result 鎖存、active-process 完全停穩，以及唯一 handle cleanup。
- 無需金鑰的 [`bash-startup-timeout`](../../../../snapshots/session/bash-startup-timeout/snapshot.yml) Session 快照固定模型可見的超時結果。Linux user-systemd fixture 透過輸入屏障保持啟動請求未消費，並驗證取消與 range settlement。
- 真實 Linux user-systemd 測試會分別透過生產入口執行一條普通命令與一條 `node-pty` `setsid`／reparent 情境。它們證明 scope signalling 與 collection、裸可執行檔案查詢、逃逸後代終止、range settlement，以及不變的 PTY PID、session、控制終端、前臺輸入、`/dev/tty`、readiness 與 startup-failure 語義。
- native Windows 測試證明 suspended creation、resume 前 Job assignment、繼承 stdio、預設後代繼承、direct result、termination、active-process zero、異常／disconnected runner cleanup、kill-on-close 與同步 host-exit termination。source、built 與 Python packaged 冒煙測試進入同一 runner core。
- 公共 seam 型別、local provider、LSP 與 subagent 消費方、shell fixture、README、Cordis catalog 與 keyless subprocess API snapshot 都不包含普通 PID；terminal PID 保留。

## Alternatives considered

**保留 PID、把它改成可選值，或增加公共 `started` Promise。**不予採用，因為這些表示都會暴露不表示 managed range 的非同步 provider identity，並誘導消費方從錯誤事實推斷 startup 或完全停穩。

**擴充功能程序組、session、parent tree 或 PID 掃描。**不予採用，因為程序可以離開每一種觀察關係；當 PTY helper 與 launcher 共用 session 時，更寬的 SID signalling 還可能命中無關程序。native OS membership 會持續存在，並且可以獨立查詢。

**讓 parent 擁有或重新開啟 Windows Job。**不予採用，因為複製 handle、named Job、`OpenJobObject`、process-handle handoff 與 completion port 會製造多個 lifecycle owner，卻不能改善 direct-result 約定。一個 runner 可以統一擁有 target creation、Job membership、result production 與最終 handle closure。

**在 Windows 上透過 target stdio 或檔案傳遞 control／result。**不予採用，因為使用者位元組與 EOF 必須繼續以既有 Node stream 為權威，而 result file 或 polling 會製造第二個 result owner。一條 IPC channel 可以把 control 與 target stdio 分開。

**在公共 CLI 中解析隱藏 runner 參數，或釋出另一個 Node 可執行程式。**不予採用，因為前者擴張公共應用語法，後者擴張分發面。packaging-only bootstrap 保留一個物理可執行程式與兩個私有邏輯入口。

**快取完整的 Linux native 選擇結果且不再檢查可達性。**不予採用，因為 user-manager availability 可以在兩次 spawn 之間變化。runtime 只快取第一次成功的 bootstrap／scope 深度 probe，並在之後每次符合條件的呼叫中輕量複查 manager reachability。

**在 native launch 失敗後重放命令。**不予採用，因為含糊 failure 可能發生在 target 已經執行之後，重放因此可能把命令執行兩次。

**僅從未消費的 request 推斷啟動失敗。** 拒絕，因為 abort、timeout 或 dispose 可能在 request 消費前終止 launcher。將實際觀察到的訊號與 owner 請求的終止訊號匹配，既能保留取消結果，也不會隱藏無關的 bootstrap 退出或已記錄的 pre-exec failure。

## Consequences

受支援的 Linux 普通與 PTY 啟動、Windows 普通啟動會在後代逃離程序組或 direct parent 退出後繼續擁有它們，同時 direct target result 與 range 完全停穩保持獨立。代價是每次 spawn 都需要一次 Linux manager 檢查與 scope／request，或一套 Windows runner／IPC／Job 生命週期，而且所選 owner 無法證明 settlement 時會顯式失敗。

fallback 主機繼續執行命令，但攜帶可見的較弱保證。Windows ConPTY、macOS native containment、active breakaway 後代、舊版或缺失的 user-systemd 環境、target replay、持久 runner recovery，以及 JavaScript 無法執行的終止路徑均不屬於本決策。
