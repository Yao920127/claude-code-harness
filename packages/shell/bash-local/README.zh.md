---
description: "面向部署方與維護者的預設 POSIX Bash 執行器說明，用於選擇、設定或排查基於 shell seam 的非隔離命令執行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-bash-local

[English](README.md) | 中文

## 概述

`dsh-bash-local` 是 POSIX 上的預設 Bash 執行器：每條命令都以全新的非登入 `bash -c` 程序執行，不讀取 rc 檔案，因此呼叫之間不會殘留任何 shell 狀態。它會為每條命令應用已設定的預算——工作目錄、超時、輸出上限——對超時與取消進行分類，並在流溢位時返回有界輸出與 spill 檔案恢復。命令以 harness 程序自身的權限執行：本執行器不做任何隔離，需要沙箱能力時請組合 `dsh-bash-sandbox`。掛載後，面向模型的 `bash` 工具會與它對接。

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

當組合需要在 POSIX 上執行 Bash 命令且不需要隔離時，掛載此執行器。它註冊為 `ctx.shell`，面向模型的 `bash` 工具會立即基於它工作：agent（智慧代理）呼叫工具，命令即以全新 `bash -c` 程序按下面的預算執行。

### 最小設定

按你需要的預算載入執行器；每個欄位都有預設值，因此最小的組合就是單獨一個外掛條目。當組合了設定提供者時，使用者段會疊加在該條目之上，預算無需過載即可在執行時變更（見[執行時調整預算](#adjusting-budgets-at-runtime)）。

```yaml
- id: bash
  name: '@deepseek-ai/dsh-bash-local'
  config:
    cwd: /path/to/workspace
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

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-bash-local)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 執行命令

透過等待 execution 的 `result()` 投影來執行命令。非零退出、超時或取消都會 resolve 為描述性結果——只有基礎設施失敗才 reject。每次呼叫的 `timeoutMs` 覆蓋值受設定上限約束，`workdir` 未設定時則退回到設定的預設值；受信任的呼叫方還可以為單次呼叫提高 stdout 捕捉預算，而 stderr 仍使用 `maxOutputBytes`。環境預設面向模型：`NO_COLOR=1 TERM=dumb PAGER=cat GIT_PAGER=cat` 可防止分頁器與 ANSI 顏色破壞輸出，呼叫方顯式提供的條目仍然優先。

```text
const execution = await ctx.shell.execute(ctx.shell.resolve({ command: 'ls -la' }))
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

本執行器是基於 subprocess 能力的 `ctx.shell` seam 的 Service Provider：它負責所有 bash 層職責——命令預設化與上限、deadline 融合與原因分類、面向模型的終端環境，以及後臺讀取合併——而 managed-range 機制（有界 spill 輸出、憑證清除、終止升級、完全停穩與 dispose（資源釋放））屬於 subprocess 服務。每次呼叫都 spawn 全新的非登入 `bash -c`，不讀取 rc 檔案，因此命令是確定性的，shell 狀態絕不會在呼叫之間洩漏。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`LocalBashExecutor`、`Config`、設定段接線 |
| — | 不釋出執行時不變式伴生入口；除由所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變資料關係。 |
| `tests/executor.spec.ts` | 已演練的行為：預算、分類、後臺控制代碼、歸屬 |
| `tests/settings.spec.ts` | 設定段疊加在組合條目之上 |

### 主要流程

一次呼叫分三步：`resolve()` 從設定與請求填充 `workdir`/`timeoutMs`/`onExpiry`/`stdoutMaxBytes`（並限制每次呼叫的覆蓋值）；`execute` 按到期策略佈置 deadline——`'kill'` 把鉗位後的超時與呼叫方的中止訊號融合為一個 deadline，`'none'` 不佈置任何 deadline——再以顯式位元組上限與 `graceMs` 透過 `ctx.subprocess` spawn `['bash', '-c', command]`；結算的 subprocess 結果被分類——只有執行器自身的超時報告 `timedOut`，上游取消報告 `aborted`，自身因訊號終止的命令兩者皆不報告——並投影為帶收集輸出的 `ShellRunResult`。

前臺 deadline 從 argv 準備開始，並在準備與執行之間保持同一訊號和剩餘預算。準備階段超時返回空輸出、`timedOut: true`，且 `exitCode` 和 `signal` 均為 `null`；呼叫方在釋出程序前取消仍會拒絕呼叫。準備晚到的成功或失敗不會觸發 spawn。

### 不變式與歸屬

- `graceMs` 預算必須為正有限值且不大於 `MAX_TIMER_DELAY_MS`，這樣 Node 就能用一個定時器表示它；無效值在寫入處被拒絕。
- 環境分層固定：先是終端覆蓋值，然後是呼叫方的 `env`，最後才是受信任的 `dshEnv` 快照；subprocess 服務獨立清除環境中的憑證與繼承的 `DSH_*` 名稱。
- 後臺程序屬於 subprocess 服務：它能在僅過載執行器後存活，並在服務 dispose 時被終止且等待退出。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當執行器約定不夠用時閱讀以下頁面。這些頁面從 seam 講到提供隔離的同級包及其底層機制。

- [shell seam](../shell/README.zh.md) —— 本提供者實作的執行器約定，包括請求/spec 拆分。
- [bash-sandbox](../bash-sandbox/README.zh.md) —— 需要沙箱能力時，應改為組合此隔離執行器。
- [tool-bash](../tool-bash/README.zh.md) —— 基於本執行器的面向模型 `bash` 工具。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md) —— 請求/spec 詞彙、結果與完整的服務約定。
- [subprocess-local](../../subprocess/subprocess-local/README.zh.md) —— 本執行器背後的 managed-range 機制。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-bash` 間接影響；該工具會渲染本執行器有界的 stdout/stderr 尾部、後臺程序增量、spill 檔案路徑與基礎設施失敗。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首的任何變更由具名消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本執行器何時不合適。它們是目前包約束，不是路線圖。

- **自身不提供隔離**——命令以 harness 程序的權限執行；需要隔離的部署組合 `dsh-bash-sandbox`，每次呼叫的 allow/deny/ask 策略則屬於工具的 `pre-execute` waterfall（瀑布式事件）。
- **沒有持久 shell 或 PTY**——每次呼叫都啟動全新的非登入 `bash -c`；僅持久化 cwd 與互動式終端工作階段均繼續延期，直到真實工作流需要它們。
- **僅支援 POSIX**——`bash` 二進位制已硬編碼，底層服務的程序組語義也是 POSIX 的；不支援 Windows。
- **後臺提供者失敗提示就是整條 stderr 流**——`SubprocessHandle.done` 可能在目標命令開始執行前或後被拒絕，而 subprocess 服務不會為從未上報結果的目標命令 緩衝任何輸出，因此執行器把不宣告失敗階段的 `subprocess failed before reporting an outcome: …` 作為觀測到的 stderr 流提供（偏移讀取方按各自偏移重讀），並只折入恰好一個 `readOutput()` 增量；丟棄了該增量的消耗式讀取方只能經 `observed.stderr` 恢復它。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
