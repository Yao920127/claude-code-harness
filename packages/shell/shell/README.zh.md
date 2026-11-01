---
description: "面向開發者與維護者的 shell 執行器 seam 說明，用於選擇、組合或實作基於 ctx.shell 的命令執行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-shell

[English](README.md) | 中文

## 概述

使用 `ctx.shell` 執行輸出有界的 shell 命令，或讓命令作為後臺工作繼續執行。同一個執行控制代碼支援前臺結果與後臺讀取。設定檔可以選擇本地或沙箱化的 Bash 或 PowerShell 執行方式，而無需更改呼叫方。執行前解析請求，以顯式確定工作目錄、超時與輸出上限。命令退出、超時和呼叫方中止都會作為結果返回；只有基礎設施故障才會 reject，模型可見的渲染與沙箱指引由 `bash` 和 `pwsh` 工具負責。

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

當 agent（智慧代理）或程序內外掛需要執行 shell 命令並讀取輸出、保持程序執行並輪詢它，或讓前臺命令有辦法活過自己的 deadline 時，使用 `ctx.shell`。執行方法只有一個——`execute(spec)` 在準備完成後返回控制代碼——「前臺」是呼叫方等待什麼的屬性，而不是 spawn 的屬性。它是每個 shell 執行器與面向模型的 `bash`/`pwsh` 工具共同依賴的約定，因此基於它編寫的程式碼可以執行在任意執行器實作之上。

### 前臺命令

等待控制代碼的 `result()` 投影即可在前臺執行命令。promise 在命令結束時 resolve：非零退出、執行器超時終止或呼叫方中止終止都是結果，絕不是 rejection。`result()` 只在基礎設施失敗時 reject，例如工作目錄不可用或缺少 shell。結果攜帶結束代碼或訊號、是超時還是中止截斷了執行（首因歸類），以及收集到的 stdout/stderr；流超出預算時還附帶 spill 檔案路徑。

```text
const execution = await ctx.shell.execute(ctx.shell.resolve({ command: 'ls -la' }))
const result = await execution.result()
console.log(result.exitCode, result.stdout.text)
```

### 後臺程序

以 `onExpiry: 'none'` 解析請求並保留控制代碼：不佈置任何 deadline，程序一直跑到被 kill 或自行結束。用 `readOutput()` 增量讀取輸出——連續讀取絕不會重複交付，有損讀取會指向完整流的 spill 檔案。用 `kill()` 終止由提供者管理的程序範圍（直接命令結束後返回 `false`），並等待 `done` 完成直接命令結算。job id、所有權、輪詢與通知屬於通用 `ctx.jobs` 執行時，工具層會把控制代碼註冊進去。`ShellProcess.observed` 在同一份捕捉流上暴露非消費的偏移讀取器——供獨立於消費遊標的觀察者使用，例如任務註冊表的拉取源——包括被拒絕的 spawn 留在 stderr 上的 `spawn failed: …` 提示。

### deadline 與有界等待

deadline 包含非同步準備耗時。程序啟動前到期會返回已結算的控制代碼，其結果為 `timedOut: true`，輸出為空。取消或準備失敗會在釋出控制代碼前拒絕 `execute`；遲到的準備結果不會啟動程序。

seam 只有兩種到期策略，沒有任何移交協定。`'kill'` 在 deadline 停下命令並把結果歸類為 `timedOut`；`'none'` 不設 deadline，只有呼叫方的訊號和 `kill()` 能停下命令。只想等一段時間的呼叫方以 `'none'` 執行命令並自己限定等待時長：呼叫方停止等待後控制代碼依然有效，那一刻沒有任何東西易手。`bash`/`pwsh` 工具正是這樣做的——組合中有 job registry 時，每條命令一啟動就登記到 `ctx.jobs` 並等待該 job，所以超時後仍在執行的前臺命令只是繼續作為它本來就是的那個 job 執行。

### 請求與已解析 spec

每次執行都從帶可選欄位的 `ShellExecRequest` 開始；執行器的 `resolve()` 在任何東西執行之前，把它變成預設值與上限都已顯式填好的 `ShellExecSpec`。這一請求/spec 拆分正是儲存庫在包邊界顯式解析的範本：呼叫方絕不依賴 `execute` 內部隱藏的預設值。`resolve()` 從執行器設定與請求填充工作目錄、超時與到期策略（預設 `'kill'`）、對每次呼叫的覆蓋值設上限，並按原樣攜帶可選輸入——`stdin`、普通 `env` 與受信任的 `DSH_*` 快照。

### 選擇並組合一個執行器

seam 本身不是執行器：每個組合只掛載一個提供者，工具即可不加改動地工作。在 POSIX 上，`dsh-bash-local` 以全新的 `bash -c` 程序執行命令，`dsh-bash-sandbox` 則透過沙箱能力限制每條命令；在 Windows 上，對應實作是 `dsh-pwsh-local` 與 `dsh-pwsh-sandbox`。`bash` 與 `pwsh` 工具只在掛載沙箱執行器時公佈升權欄位。最小的組合只需執行器本身：

```yaml
- id: bash
  name: '@deepseek-ai/dsh-bash-local'
  config:
    cwd: /path/to/workspace
```

### 共享的退出狀態約定

工具結果以機器可讀的退出標記結尾——`[exit code: N]` 或 `[killed by signal: X]`——模型因此總能知道命令如何結束。seam 擁有該標記格式，以及把渲染結果拆回輸出正文與結構化退出狀態的 `parseExitStatus` 輔助函式，使 `bash` 與 `pwsh` 兩個工具永遠不會在此漂移。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋 seam 的設計並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包是標準能力 seam 中的一個角色：命名執行器約定的 Service Definition，Service Provider 與 Consumer 各自拆分，使每個角色都能獨立演進（見[能力 seam 筆記](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)）。兩項決策錨定了該約定：

- **邊界處的顯式解析。** `resolve(request)` 是應用預設值與上限的唯一位置；`execute` 只接受已解析的 spec，絕不再次預設化，因此實作內部不會藏有隱藏的後備值。
- **一次執行，多個投影。** `execute` 在準備完成後返回控制代碼；前臺結果與後臺遊標讀取都是同一個已 spawn 程序上的投影，前臺/後臺是呼叫方的選擇，絕不是第二條 spawn 路徑。控制代碼不帶 id 或所有者；job 身份、所有權與生命週期屬於通用 `ctx.jobs` 執行時，使執行器與工作階段保持獨立。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：抽象 `ShellExecutor` 服務與共享設定名稱空間 |
| [`src/types.ts`](src/types.ts) | 請求/spec 詞彙、`ShellExecution`、`ShellRunResult` 與沙箱事實 |
| [`src/render.ts`](src/render.ts) | `parseExitStatus`：shell 工具共享的退出狀態標記約定 |
| — | 不釋出執行時不變式伴生入口；該無狀態 Service Definition 負責請求／結果型別，執行器與策略負責觀察。 |

### 設定名稱空間

`SHELL_SETTINGS_NAMESPACE` 由此處匯出而非由某個提供者匯出，因為它命名的是能力而不是實作：一個主機只組裝一個 `ctx.shell` 提供者，因此各提供者共享同一個名稱空間而永不衝突，在平臺間攜帶的設定文件也能在兩邊繼續解析。

### 後臺生命週期與歸屬

已 spawn 的程序屬於 subprocess 服務而非執行器：它能在僅過載執行器後存活，並在組合拆解時被終止並 join。實作必須遵守 seam 的語義——`result()` 只在基礎設施失敗時 reject；控制代碼在準備完成後釋出且其 `done` 絕不 reject（無論同步還是非同步的 provider rejection 都把控制代碼結算為 `killed`、把不宣告階段的提示寫入 stderr，同時 `result()` 以同一失敗 reject；活控制代碼在本次執行自己的 `kill()` 或 abort 之後才到來的 rejection 則結算為其終態）；`readOutput` 是消費式的，有損讀取會報告 spill 檔案。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 seam 約定不夠用時閱讀以下頁面。它們從共享子系統參考逐步進入具體執行器與面向模型的工具。

- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md) —— 請求/spec 詞彙、結果與完整的服務約定。
- [bash-local](../bash-local/README.zh.md) —— 預設 POSIX 執行器：全新的 `bash -c` 程序、預算與 deadline。
- [bash-sandbox](../bash-sandbox/README.zh.md) —— 沙箱執行器：沙箱模式、拒絕與升權。
- [tool-bash](../tool-bash/README.zh.md) —— 基於該 seam 的面向模型 `bash` 工具。
- [能力 seam 筆記](../../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md) —— 本 seam 遵循的 Service Definition / Provider / Consumer 拆分。

-----

<a id="model-experience"></a>
## 模型體驗

透過 `dsh-tool-bash` 間接影響；該工具會將執行器輸出與沙箱事實轉為指引和保留的工具結果 token。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首的任何變更由具名消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 不提供什麼。它們是目前包約束，不是路線圖。

- **沒有互動式輸入詞彙**——`stdin` 只在 spawn 時寫入一次並關閉；seam 沒有向執行中任務繼續輸入的通道，也沒有 PTY 工作階段概念。
- **前臺超時始終由執行器負責**——seam 上由呼叫方負責 deadline 的模式已由[工具呼叫超時策略筆記](../../../.agents/notes/implemented/architecture/2026-07-07-tool-call-timeout-policy.zh.md)明確延期。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

None.

</details>
