---
description: "面向部署方與維護者的本地 PowerShell 執行器說明，用於選擇、設定或排查基於 shell seam 的非隔離 PowerShell 命令執行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-pwsh-local

[English](README.md) | 中文

## 概述

`dsh-pwsh-local` 是 PowerShell 執行器：每條命令都以全新的非互動 `pwsh -Command` 程序執行，不載入 profile 檔案，因此呼叫之間不會殘留任何 shell 狀態。它逐呼叫映像 `dsh-bash-local` 的語義，並額外負責 PowerShell 層事項：可執行檔案解析、UTF-8 輸出固定與面向模型的終端環境。命令以 harness 程序自身的權限執行——本執行器不做任何隔離；需要沙箱能力時請組合 `dsh-pwsh-sandbox`。掛載後，面向模型的 `pwsh` 工具會與它對接。

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

當組合需要執行 PowerShell 命令——通常是在 Windows 上——且不需要隔離時，掛載此執行器。它註冊為 `ctx.shell`，面向模型的 `pwsh` 工具會立即基於它工作：agent（智慧代理）呼叫工具，命令即以全新 `pwsh -Command` 程序按下面的預算執行。

### 何時選擇

它是 `dsh-bash-local` 的 Windows 對應實作：當 `pwsh` 是平臺 shell 時選擇它，組合即可把 POSIX 行換成 pwsh 行並保持相同的語義。執行器從顯式 `pwshPath`、常見的 Windows 安裝位置、PATH 條目，或作為最後手段的 Windows PowerShell 5.1 解析 `pwsh` 可執行檔案。非隔離執行時它就是預設選擇；需要沙箱能力時組合 `dsh-pwsh-sandbox`。

### 最小設定

按你需要的預算載入執行器；每個欄位都有預設值，因此最小的組合就是單獨一個外掛條目。當組合了設定提供者時，使用者段會疊加在該條目之上，預算無需過載即可在執行時變更（見[執行時調整預算](#adjusting-budgets-at-runtime)）。

```yaml
- id: bash
  name: '@deepseek-ai/dsh-pwsh-local'
  config:
    cwd: C:\path\to\workspace
    timeoutMs: 120000
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `cwd` | `process.cwd()` | 命令的預設工作目錄 |
| `timeoutMs` | `120,000` | 預設前臺超時，單位為毫秒 |
| `maxTimeoutMs` | `600,000` | 每次呼叫超時覆蓋值的上限 |
| `maxOutputBytes` | `64,000` | 每流記憶體輸出上限；溢位後 spill 到臨時檔案 |
| `maxSpillBytes` | `67,108,864` | 每流完整輸出的 spill 上限 |
| `graceMs` | `3,000` | 終止升級與退出後管道排空的寬限時間 |
| `pwshPath` | 自動解析 | 顯式 pwsh 可執行檔案；否則依次探測常見位置，再查 PATH |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-pwsh-local)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 執行命令

透過等待執行控制代碼的 `result()` 投影來執行命令；非零退出、超時或取消都會返回描述性結果，只有基礎設施失敗才會導致呼叫被拒絕。命令字串作為單個參數傳給 `-Command`：由 PowerShell 自己解析文字，不存在中間 shell，因此沒有需要轉義的 shell 引號層，原生 Win32 路徑也原樣透過。每條命令都先固定 UTF-8 輸出，因此即使在 Windows PowerShell 5.1 後備上，非 ASCII 輸出也不會亂碼。環境預設面向模型：`NO_COLOR=1 PAGER=cat GIT_PAGER=cat`（沒有 `TERM=dumb`——那是 POSIX 概念），呼叫方顯式提供的條目仍然優先。

```text
const execution = await ctx.shell.execute(ctx.shell.resolve({ command: 'Get-ChildItem' }))
const result = await execution.result()
if (result.timedOut) console.log('timed out after', result.timeoutMs)
```

### 後臺程序

以 `onExpiry: 'none'` 解析並等待 `execute` 返回控制代碼即可在後臺執行命令；不佈置任何 deadline。取消或準備失敗會在釋出控制代碼前拒絕呼叫。`readOutput()` 把流增量合併為一次消費式讀取，並在 `[stderr]` 分段下標記 stderr；`kill()` 終止提供者管理的 range；`done` 在直接命令關閉時結算且絕不 reject。job id、所有權、輪詢與通知屬於通用 `ctx.jobs` 執行時，工具層會把控制代碼註冊進去。

<a id="adjusting-budgets-at-runtime"></a>
### 執行時調整預算

執行預算是解析每條命令時讀取的 volatile Config 欄位。外掛頁面編輯目前執行器的 profile 條目。完整 Config 驗證在表單寫入磁碟前拒絕無效數字和定時器上限。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋執行器的設計並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計概念

本執行器是基於 subprocess 能力的 `ctx.shell` seam 的 PowerShell Service Provider：它負責所有 pwsh 層職責——可執行檔案解析、命令預設化與上限、deadline 融合與原因分類、UTF-8 輸出固定、面向模型的終端環境，以及後臺讀取合併——而 managed-range 機制（有界 spill 輸出、憑證清除、終止升級、完全停穩與 dispose（資源釋放））屬於 subprocess 服務。每次呼叫都 spawn 全新的非互動 `pwsh -Command`，並帶 `-NoLogo -NoProfile -NonInteractive`，因此命令是確定性的，profile 狀態絕不會在呼叫之間洩漏。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`PwshLocalExecutor`、`Config`、設定接線、argv seam |
| [`src/resolve.ts`](src/resolve.ts) | 純函式 `resolvePwshPath`/`candidatePwshPaths` 可執行檔案解析 |
| — | 不釋出執行時不變式伴生入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變資料關係。 |
| `tests/` | 已演練的行為：預算、分類、解析、後臺控制代碼 |

### 主要流程

一次呼叫分三步：`resolve()` 從設定填充 `workdir`/`timeoutMs`/`stdoutMaxBytes`（並限制每次呼叫的 `timeoutMs` 覆蓋值）；執行器建置 pwsh argv——`pwsh -NoLogo -NoProfile -NonInteractive -Command <編碼 preamble + 命令>`——把按設定鉗位的超時與呼叫方的中止訊號融合為一個 deadline，再以顯式位元組上限與 `graceMs` 透過 `ctx.subprocess` spawn；結算的結果被分類並投影為 `ShellRunResult`。Windows 把強制終止報告為結束代碼 1 且無訊號，因此帶訊號標記的事實在那裡僅限 POSIX；超時/取消分類則與平臺無關。

前臺 deadline 從 argv 準備開始，並在準備與執行之間保持同一訊號和剩餘預算。準備階段超時返回空輸出、`timedOut: true`，且 `exitCode` 和 `signal` 均為 `null`；呼叫方在釋出程序前取消仍會拒絕呼叫。準備晚到的成功或失敗不會觸發 spawn。

### 不變式與歸屬

- `graceMs` 預算必須為正有限值且不大於 `MAX_TIMER_DELAY_MS`，這樣 Node 就能用一個定時器表示它；無效值在寫入處被拒絕。
- 環境分層固定：先是終端覆蓋值，然後是呼叫方的 `env`，最後才是受信任的 `dshEnv` 快照；subprocess 服務獨立清除環境中的憑證與繼承的 `DSH_*` 名稱。
- 可執行檔案解析是 `(configured, env, platform)` 的純函式，僅當儲存的 `pwshPath` 與目前可執行檔案所依據的值不同時才重新探測檔案系統。
- 後臺程序屬於 subprocess 服務：它能在僅過載執行器後存活，並在服務 dispose 時被終止並 join。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當執行器約定不夠用時閱讀以下頁面。它們從 seam 延伸到提供隔離的同類包與 PowerShell 工具。

- [shell seam](../shell/README.zh.md) —— 本提供者實作的執行器約定，包括請求/spec 拆分。
- [bash-local](../bash-local/README.zh.md) —— 本執行器逐呼叫映像的 POSIX 對應實作。
- [pwsh-sandbox](../pwsh-sandbox/README.zh.md) —— 需要沙箱能力時改為組合的隔離執行器。
- [tool-pwsh](../tool-pwsh/README.zh.md) —— 基於本執行器的面向模型 `pwsh` 工具。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md) —— 請求/spec 詞彙、結果與完整的服務約定。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-pwsh` 間接影響；該工具會渲染本執行器有界的 stdout/stderr 尾部、後臺程序增量（經通用任務執行時）、spill 檔案路徑與基礎設施失敗。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首的任何變更由具名消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本執行器何時不合適。它們是目前包約束，不是路線圖。

- **自身不提供隔離**——命令以 harness 程序的權限執行；需要隔離的部署組合沙箱執行器或策略。
- **沒有持久 shell 或 PTY**——每次呼叫都啟動全新的 `pwsh -Command`。
- **命令字串是 PowerShell 文字**——`-Command` 域沒有 shell 引號層，但面向模型的命令由 PowerShell 自己解析，因此 PowerShell 語法錯誤是命令失敗，而非啟動失敗。
- **後臺提供者失敗提示就是整條 stderr 流**——`SubprocessHandle.done` 可能在目標命令開始執行前或後被拒絕，而 subprocess 服務不會為從未上報結果的目標命令 緩衝任何輸出，因此執行器把不宣告失敗階段的 `subprocess failed before reporting an outcome: …` 作為觀測到的 stderr 流提供（偏移讀取方按各自偏移重讀），並只折入恰好一個 `readOutput()` 增量；丟棄了該增量的消耗式讀取方只能經 `observed.stderr` 恢復它。
- **Windows 終止不報告訊號**——被強制終止的程序以結束代碼 1、`signal: null` 結算，因此基於訊號的狀態分類在 Windows 上不適用；`kill()` 發起的停止仍會直接標記為 `killed`。
- **編碼 preamble 位於命令之前**——PowerShell 要求 `param(...)`、`#requires` 與 `using` 語句位於腳本最頂部，因此以其中一種開頭的命令無法在 UTF-8 輸出 preamble 下執行；`param(...)` 腳本請包進 `& { … }`，`using`/`#requires` 腳本請改從檔案執行。
- **Windows PowerShell 5.1 下的非 ASCII stdin 可能被錯誤解碼**——preamble 只固定輸出編碼；`[Console]::InputEncoding` 保持主機預設，因為在重定向 stdin 下設定它會丟擲異常；pwsh 7 預設 UTF-8，不受影響。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
