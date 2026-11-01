---
description: "子程序服務的本地主機提供者：在主機器上執行由 OS 所有的受管範圍與真實終端工作階段，並明確披露較弱的 fallback。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subprocess-local

[English](README.md) | 中文

## 概述

在任何於主機上執行子程序的組合中掛載 `dsh-subprocess-local`。它解析本地可執行檔案，為普通 Linux 與 Windows 命令以及受支援的 Linux 終端工作階段提供由 OS 所有的受管範圍，並透過 `node-pty` 提供真實終端工作階段；不受支援的主機使用明確披露的較弱 fallback。它沒有任何設定，因此每項處置方式、限制、終端尺寸與寬限期都隨 spawn 請求來自呼叫方能力 seam。輸出收集在記憶體中保留一段有界尾部，並可選地用 spill 檔案恢復完整流；子程序從清理後的環境起步；dispose（資源釋放）會終止並等待每個選定範圍或工作階段完全停穩。

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

把提供者與它的消費方掛載在同一組閤中，並完全按子程序服務的規定啟動程序；本包只決定這些程序在主機上如何執行。在 Windows 上，非終端子程序與 `taskkill` 輔助程序會隱藏視窗，因此後臺操作不會搶佔焦點。遵循程序啟動可見性設定的 GUI 視窗也會被隱藏。

### 掛載提供者

在與消費方相同的組合中載入本提供者。它沒有任何設定欄位：每項選擇都隨 spawn 請求到達，因此隨部署變化的決策留在呼叫方的設定裡。 `terminalEnvironment()` 在 POSIX 讀取非空的 `SHELL`，缺失時使用帳戶登入 shell；在 Windows 讀取非空的 `ComSpec`。空值會被省略，由消費者選擇平臺退回。

```yaml
- name: '@deepseek-ai/dsh-subprocess-local'
- name: '@deepseek-ai/dsh-bash-local'
```

### 解析可執行檔案

絕對可執行檔案路徑會被驗證；裸名稱根據清理後的 PATH 並以平臺感知的可執行副檔名（Windows 上為 `.COM`/`.EXE`/`.BAT`/`.CMD`）解析。含分隔符的相對路徑會被拒絕——請提供絕對路徑或裸 PATH 名稱——相對 PATH 條目從主機程序 cwd 解析。

Windows 普通子程序透過 `windowsHide` 啟動私有 Job runner，併為原生目標請求隱藏初始視窗。標準流和 Job 歸屬不依賴視窗可見性；顯式建立自身視窗的命令不在此保證範圍內。

### 收集輸出

收集模式在記憶體中保留一條流的最後 `maxBytes`——錯誤與最終結果通常聚集在末尾——並在設定了 `spill` 上限時把完整流追加到 OS 臨時目錄下每程序目錄中的私有檔案（`0700` 目錄、`0600` 隨機命名檔案）。某條流大於 spill 上限時，會丟棄不完整的 spill，只返回帶截斷標記的尾部。spill 是盡力而為：當 spill 檔案無法開啟或追加（每程序目錄被臨時檔案清理工具刪除、`EACCES`、`EMFILE`、`ENOSPC`）時，收集器丟棄該 spill，透過外掛 logger 記錄一條 `error`，並繼續收集記憶體尾部，因此結果帶截斷標記且沒有 spill 路徑。讀取基於偏移量且從不消費，因此後臺讀取與批次讀取在退出前後都可以共存。

`./output` 匯出向程序介面卡共享該收集器與保留 spill 的儲存。`snapshot()` 返回保留的原始位元組及總位元組數，使遠端介面卡能夠保留偏移量，而無需轉發完整的流。

### 控制傳輸

普通 spawn 可以請求 [subprocess 控制管道](../subprocess/README.zh.md#using-a-control-pipe)。Node 目標在所有受支援的主機上均收到 fd 7；Windows 描述符編號依賴 CRT 初始化。POSIX runner 在 `execve` 時保留該描述符；Windows Job 和 ACL runner 在 Node 初始化前透過子程序的 CRT 啟動表建立它，並在 spawn 後關閉自身的承載副本。標準流與 runner 的私有管理通道保持獨立。

<a id="running-terminal-sessions"></a>
### 執行終端工作階段

`spawnTerminal` 分配真實 PTY 並橋接 UTF-8 文字；你可以檢查目前前臺程序組並向其傳送訊號，還可以等待一次 `terminate()` 操作。在受支援的 Linux 主機上，原始終端 argv 直接在 user-systemd scope 內執行；node-pty PID、工作階段 leader、控制終端、前臺 `inputWaiting` 與就緒狀態保持不變，而 scope 會擁有已重新設定父程序或呼叫 `setsid` 的後代。在 fallback 主機上，清理會保留根程序樹和可觀察工作階段中的精確身份，但無法重新發現每個已經逃逸的後代。Linux 的精確輸入等待要求前臺執行緒的 fd 0 標識 shell 的控制終端，且執行緒目前的 syscall 正在等待該 fd；如果核心拒絕 syscall 探測，上層 PTY 後端會改用空閒推斷。在 Windows 上，SIGINT 以 Ctrl-C 輸入寫入投遞，SIGTSTP 與 SIGHUP 不受支援，拆卸會透過程序表驗證 shell 已終止，因為被外部終止的 shell 可能永遠不會觸發 PTY 退出通知。

使用 `shellActivity: true` 時，普通非登入的 `bash -i` 與 `zsh -i` 會安裝私有生命週期記錄，同時保留使用者啟動檔案和提示符設定。Bash 需要 4.4 或更高版本，並允許寫入提示符 hook；Zsh 觀察空的頂層 ZLE 提示符，排除 `vared`、選擇和續行提示符。輸入、shell 狀態遷移和程序觀察變化都會推進活動 revision。前臺、後臺及停止的後代任務阻止空閒判斷；原生 Linux 還要求 systemd scope 中恰好只有一個 task，覆蓋程序樹以外仍歸其所有的工作；程序表掃描不完整、自定義 trap 和 Zsh 非同步檔案描述符 handler 會返回 unknown。程序表列舉失敗會拒絕本次觀察；活動保持 unknown，清理保留所有權，直到程序表可讀並能完成驗證。程序清理成功後刪除私有檔案。其他 shell、Windows、自定義參數以及經 sandbox 包裝的可執行檔案仍可使用，但活動為 unknown。

啟用後，根程序退出不會終止仍在執行的後代。明確為空的 Linux 受管範圍或完整且為空的 Linux 工作階段可允許回收保留的記錄；macOS 無法在根程序退出後確認未觀察到的程序範圍，會將該記錄保持為 unknown。原有 fallback 可見性限制仍然適用：shell 生命週期記錄不能讓已逃逸且未觀察到的後代變得可發現。這些記錄協調普通 shell 行為，不用於防禦同一使用者的惡意程序。

### 關閉行為

正常 dispose 會終止每個仍在執行的受管範圍與終端工作階段並等待其完全停穩。在 JavaScript 可觀察的主機退出期間——直接 `process.exit()`、預設未捕捉異常、預設未處理 rejection——同步最終清理會請求 Linux scope 終止其成員，同步終止每個 Windows runner 以關閉其唯一 Job handle，併為 fallback 使用既有 PGID、`taskkill` 或已捕捉身份操作。它不建立 Promise 或定時器，也不聲稱已經完全停穩。同一退出階段會刪除未持有任何已完成 spill 檔案的每程序私有 spill 目錄；已完成的 spill 檔案作為完整輸出恢復產物保留，直到外部機制清理。未處理的 `SIGTERM`/`SIGINT`/`SIGHUP`、`SIGKILL`、fatal OOM、native crash 與斷電需要外部 supervisor。

Linux 普通程序和終端程序即使在 bootstrap 消費啟動請求前被取消，也會保留實際觀察到的終止訊號。如果沒有請求對應的終止訊號，未消費的請求仍會報啟動失敗；已記錄的 pre-exec 錯誤始終優先。`waitForExit()` 獨立證明 scope 已為空，其中也包括 payload 在進入該 scope 的 cgroup 前就被殺死、manager 因此讓它保持 active 卻沒有任何程序的 scope。狀態查詢期間若發出終止訊號，會重新查詢後再判定清理是否成功。請求終止後，啟動請求已消費且 scope 程序數為零即可證明完全停穩，無需等待直接程序的退出通知。如果最終 scope 訊號傳送失敗，直接程序接受 `SIGKILL` 或被獨立確認已不存在，owner 才可以等待一次尚未送達的直接程序停穩通知，再重新查詢尚未證明為空的 active 範圍。此等待獨立於輸出排空和整個範圍的停穩。新取得的 scope 狀態必須證明範圍已為空；仍有程序存活或程序數未知時，仍報告訊號失敗。

### 可能出錯的地方

無法解析的可執行檔案會明確報出穩定錯誤。當 spawn 或提供者故障使 direct outcome 無法產生時，`done` 會 reject；該 rejection 不能證明 target 是否已經開始執行。若所選 owner 無法再證明其範圍為空，`waitForExit()` 會 reject，清理仍會嘗試終止。越過保留尾部的讀取是 `lossy` 的，並在 spill 檔案存在時指向它。fallback 程序組或已觀察終端 session 可能遺漏在觀察前逃逸的後代——見下文限制。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋提供者背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

每次 spawn 都為訊號傳送與完全停穩選擇同一個 owner。受支援的 Linux 普通命令與終端啟動使用臨時 user-systemd scope，受支援的 Windows 普通命令使用由 helper 持有、關閉時終止成員的 Job。macOS、舊版或不可用的 user-systemd，以及不可用的 Windows 原生支援使用既有 detached 程序組、`taskkill` 或終端工作階段觀察，並只告警一次。native 路徑可能已經啟動命令後，本提供者絕不會透過 fallback 重放該命令。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務接線：存活控制代碼集合、dispose、主機退出最終清理、可執行檔案查詢 |
| [`src/spawn.ts`](src/spawn.ts) | 共享程序管道：直接結果、保尾收集、spill 檔案與 fallback spawn |
| [`src/managed-owner.ts`](src/managed-owner.ts) | 每個普通控制代碼使用的私有訊號與等待 owner |
| [`src/linux-scope.ts`](src/linux-scope.ts) | Linux user-systemd 能力檢查、scope 啟動、訊號傳送與完全停穩 |
| [`src/linux-execve.ts`](src/linux-execve.ts) | Linux libc 程序映像替換與繼承標準檔案描述符保留 |
| [`src/windows-job.ts`](src/windows-job.ts) | Windows Job 能力檢查與 helper 啟動 |
| [`src/runner-launch.ts`](src/runner-launch.ts) | source、built 與 packaged 私有 runner 選擇 |
| [`src/spawn-runner.ts`](src/spawn-runner.ts) | Linux 一次性 exec bootstrap 與 Windows Job runner |
| [`src/runner-protocol.ts`](src/runner-protocol.ts) | 嚴格定義的 Linux launch／startup 檔案與 Windows IPC 訊息 |
| [`src/terminal.ts`](src/terminal.ts) | `node-pty` 終端控制代碼：Linux scope 繫結、前臺檢查與 fallback 清理 |
| [`src/process-inspector.ts`](src/process-inspector.ts) | POSIX 程序樹與工作階段檢查 |
| [`src/windows-inspector.ts`](src/windows-inspector.ts) | 經 koffi 的 Windows Toolhelp32 程序表檢查 |
| — | 不釋出執行時不變式伴生入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變資料關係。 |

### 主流程

一次 spawn 會同步驗證最終 argv、cwd 與環境，在使用者命令可能執行前選擇 containment，並在目標身份保持私有的情況下返回控制代碼。Linux 普通命令與終端啟動使用私有的一次性請求；scope 內的 bootstrap 會恢復目標 cwd 與環境、解析可執行檔案、清除 fd 0 至 fd 2 及可選控制 fd 7 的 close-on-exec 標記，再以原始 argv 進入 libc `execve()`。Windows 普通命令會隔離 runner 的 fd 0 至 fd 2、把 fd 3 留給 IPC，並用 fd 4 至 fd 6 承載 target stdio，在請求控制時還使用 fd 7；runner 把這些 CRT 描述符解析成 OS handle，以 suspended 狀態建立 target，將其加入 Job、恢復執行，再關閉自身的標準流載體及可選 fd-7 載體。`done` 會在 direct command 及其 stdio 屏障結算後完成，`waitForExit()` 則分別等待所選 scope、Job、程序組或已觀察工作階段變空。

### 安全不變式

spill 檔案以 `0600` 權限、`O_EXCL` 與隨機名稱在 `0700` 每程序目錄下建立，可抵禦共享臨時目錄中的符號連結植入；開啟、追加或最終關閉失敗時不公佈 spill 路徑，且絕不中斷收集，因為收集執行在流的 `'data'` 監聽器內，丟擲的錯誤會殺死主機程序。fallback 程序身份攜帶啟動時間，因此清理絕不會跟隨 PID 複用。選定的 native 路徑失敗時會報告錯誤，而不會透過 fallback 重放 argv；受管範圍只有在清理完成後才從存活集合移除，否則失敗仍保持可觀察。主機退出最終清理不建立 Promise 或定時器，保留主機結束代碼與診斷，分別包含每個目標的失敗，也不會聲稱已經完全停穩。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當提供者級約定不夠用時閱讀以下頁面。它們從窮盡式型別參考逐步進入抽象約定，以及主機制背後的決策。

- [子程序子系統](../../../docs/subsystems/subprocess.zh.md)——spawn spec、輸出讀取器、結果與完整的 `DSH_*` 環境。
- [dsh-subprocess](../subprocess/README.zh.md)——本提供者實作的抽象約定。
- [dsh-bash-local](../../shell/bash-local/README.zh.md)——最大的消費方及其請求的具體 stdio 形態。
- [subprocess seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-subprocess-seam.md)——程序部分為何成為獨立的 seam。
- [同步子程序退出清理](../../../.agents/notes/archived/bug-fix/2026-08-11-synchronous-subprocess-exit-cleanup.md)——主機退出最終清理決策及其失敗模式。

-----

終端分配透過 TERM 和 node-pty 使用呼叫者指定的 `terminalType`。動態 resize 更新已有 PTY。輸出背壓會暫停原生讀取，待消費者排空後恢復；顯式終止會恢復暫停的讀取，以接收退出通知。

<a id="model-experience"></a>
## 模型體驗

透過消費方 seam（例如 bash 執行器家族）間接影響，它們負責所 spawn 程序的輸出與生命週期的全部面向模型渲染。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供者何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用平臺對比或任務積壓。

- **Linux 直接程序退出沒有獨立截止時間**——直接 `SIGKILL` 獲得確認後，不可中斷的核心 I/O 可能讓 dispose 無限期等待；`graceMs` 和 scope 查詢的輪詢預算不限制此等待。
- **native ownership 有明確主機要求**——Linux 需要可讀的 user manager 與 `systemd-run --expand-environment=no`；舊版 systemd 使用帶告警的 PGID fallback。macOS 因沒有受支援的公開 persistent owner，始終使用該 fallback。
- **native 選擇具有有界的每次 spawn 成本**——Linux 會重複檢查 bootstrap 入口、libc `execve`/`fcntl` bindings、存活的 user manager 與 literal-argv scope 支援，直到這套完整探測首次成功；後續符合條件的普通命令或終端 spawn 只重新檢查存活的 user manager。Windows 會在每次普通 spawn 前重新檢查 runner 入口、bindings 與目前 Job 支援。Linux 深度探測的成功狀態與 fallback 告警去重會在提供者生命週期內持續保留。所有探測都會在使用者命令可能執行前完成，子程序探測的超時為 5 秒。每次 Linux 啟動都會建立私有請求目錄，以 50 毫秒間隔檢查尚未確定的 scope 建立狀態；scope 已建立且仍 active 後，查詢間隔按指數增長，最多為 5 秒。Windows 普通命令會保留一個 runner 與一條 IPC 通道，直到 Job 報告活動程序數為零。目標會直接繼承標準控制代碼，不使用 named-pipe stdio 或結果檔案。
- **Windows Job inheritance 有明確排除項**——普通後代預設繼承 Job，但 breakaway 程序不在保證範圍。目標只在 Job 分配後啟動；runner 若在 create-to-assignment 極窄區間遭外力終止，可能留下 suspended target。
- **Windows 終端訊號是控制檯級的**——SIGINT 以 `\x03` Ctrl-C 輸入寫入投遞，由 conhost 轉為控制檯級 CTRL_C 事件；SIGTSTP 與 SIGHUP 被拒絕（不可用）；不帶 `/F` 的 `taskkill` 無法終止控制檯程序，因此拆卸的 TERM 檔是 `/F` 升級前的寬限等待。Windows 就緒沒有精確的 stdin-wait 檔：prompt-marker 快路徑把 shell pid 作為偽前臺程序組比較，其餘由靜默與計時檔覆蓋。
- **fallback 終端 ownership 仍依賴觀察**——在 macOS 或缺少可用 user-systemd 的 Linux 上，子程序如果在任何前臺檢查快照之前重新設定父程序，或離開自有終端工作階段，就可能逃出程序表掃描。本地提供者不會新增持續程序表監視器；受支援的 Linux native 模式改由 scope membership 持有這些後代。
- **程序內清理要求退出階段仍能執行 JavaScript**——直接 `process.exit()`、預設未捕捉異常和預設未處理 rejection 會發出 Node 同步 `exit` 事件。未安裝 handler 時，`SIGTERM`、`SIGINT` 或 `SIGHUP` 的預設 OS 處置不會發出該事件；應用只有安裝執行正常 dispose 或呼叫 `process.exit()` 的 handler 才能覆蓋這些訊號。`SIGKILL`、fatal OOM、`process.abort()`、native crash、斷電，以及任何無法執行 JavaScript 的故障，都需要外部 supervisor、容器 init 或等價的 OS owner 負責。
- **憑證清除依賴名稱啟發式規則**——只匹配 `*KEY*`／`*PASSWORD*`／`*SECRET*`／`*TOKEN*`；名稱不同的 secret（例如 `*PASSPHRASE*`）會繼續傳遞，對誤刪變數引入白名單屬於已記錄的後續工作。
- **不會刪除已完成的 spill 檔案**——有界的完整輸出恢復檔案會在 OS tmpdir 下累積，直到外部機制進行清理；每程序私有 spill 目錄僅在未持有任何已完成 spill 檔案時於 JavaScript 可觀察的退出階段刪除。
- **被刪除的 spill 目錄不會重建**——每程序私有目錄只建立一次；被外部清理工具刪除後，該程序內之後的每次 spill 都降級為記憶體尾部並記錄一條 `error`，直到主機重新啟動。在 `ENOENT` 時重新建立一個新的隨機目錄是待辦工作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
