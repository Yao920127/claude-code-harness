---
description: "面向模型的 pwsh 工具，供選擇、設定或排查 Windows 上一次性 PowerShell 執行、後臺任務與沙箱升權的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-pwsh

[English](README.md) | 中文

## 概述

`dsh-tool-pwsh` 讓 agent（智慧代理）透過已掛載的 shell 執行器執行 PowerShell 命令。每次呼叫使用全新程序；組合中有 job 註冊表時，每條命令從啟動那一刻起就是一個任務，因此 `run_in_background` 立即返回 id，超過超時仍在執行的前臺命令返回同一個 id，輸出可觀測。命令使用原生 Windows 路徑和 `$env:NAME` 變數，不做方言翻譯。呼叫獲得受管 `DSH_*` 環境，沙箱執行會落實 Windows 語言模式與命名管道要求。請與 `dsh-pwsh-local` 等 PowerShell 執行器及 `dsh-shell-env` 外掛一起掛載。

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

在 agent 需要執行 PowerShell 命令的任何組合中載入本外掛——通常是 `ctx.shell` 由 PowerShell 執行器支撐的 Windows 組合。一旦掛載執行器提供者與 `dsh-shell-env` 註冊表，它就註冊 `pwsh` 工具。

### 何時選擇

當命令必須用 PowerShell 編寫——原生路徑與 `$env:` 變數——或部署是 Windows 原生時，選擇 pwsh 工具。當命令集是 bash 方言時選擇 `dsh-tool-bash`；兩者之間沒有翻譯。當工作依賴跨呼叫狀態（cwd、變數）時，持久對應物 [`dsh-tool-pwsh-persistent`](../tool-pwsh-persistent/README.zh.md) 會保持一個按所有者隔離的 shell 存活。

### 最小設定

常用路徑是 PowerShell 執行器提供者、環境註冊表與本工具。

```yaml
- name: '@deepseek-ai/dsh-pwsh-local'
- name: '@deepseek-ai/dsh-shell-env'
- name: '@deepseek-ai/dsh-tool-pwsh'
```

設定欄位決定後臺能力面。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `enableRunInBackground` | `true` | 組合中有 job 註冊表時暴露 `run_in_background`；為 `false` 時拒絕強制後臺呼叫 |
| `promoteOnTimeout` | `true` | 到達超時的前臺命令繼續作為它的後臺任務執行，而不是殺掉它 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-pwsh)是每個受支援欄位及其 JSDoc 的窮盡式真源；生成的[工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-pwsh)攜帶完整參數 schema。

### 執行命令

工具執行 `pwsh -Command <command>` 並返回合併後的輸出。命令每次呼叫都執行在全新 pwsh 程序中，因此狀態從不保留——請傳 `workdir` 而不是 `cd`。路徑使用原生 Windows 形式，環境變數用 `$env:NAME` 讀取。非零退出以 `[exit code: N]` 報告；在 Windows 上，強制終止的命令以 `[exit code: 1]` 結算且沒有訊號標記，因此 agent 把中斷後的裸 exit 1 當作終止而非命令失敗。後臺執行、輸出截斷以及 `description`／`timeoutMs`／`workdir` 參數的行為與 [`dsh-tool-bash`](../tool-bash/README.zh.md#running-long-commands-in-the-background) 完全一致，包括非同步 shell 準備過程中由任務負責的取消。

### 前臺命令即任務

組合中有 job 註冊表時，前臺命令一啟動就登記到 `ctx.jobs`，呼叫等待該任務：命令在執行期間始終被列出、經 `job.list` 與 `job.follow` 流式觀看，並可從 Web 任務列表停止。在超時內完成的命令返回普通前臺結果，其任務記錄隨結果一起離開註冊表，模型從不看到 id。超過超時仍在執行的命令繼續作為它本來就是的那個任務執行，呼叫返回 `[still running after <timeoutMs>ms; moved to background job <id>]` 加任務交接指引，並以一次消費式讀取帶上目前為止的輸出——`job_output` 恰好從此處接續。來自呼叫之外的殺停（人在介面上停止任務）會讓前臺結果在退出標記之前帶上 `[stopped: <reason>]`，模型讀到的是原因而不是命令失敗；取消呼叫本身則殺掉任務。登記是盡力而為的：`promoteOnTimeout: false`、缺少 job 註冊表，或註冊表在啟動時拒絕該任務（持有者的任務上限、沒有控制器）都會改為在執行器的 deadline 殺下執行命令，`timeoutMs` 參數描述也只在交接語義成立時才宣傳它。

### Windows 特有的沙箱行為

在沙箱執行器下，被拒絕的命令會報告 `[sandbox: file access denied under <mode> mode]`，並適用相同的單次升權路徑：用 `sandbox_permissions` 加一句 `justification`，經使用者審批後重試完全相同的命令一次。理由欄位提示模型使用使用者目前提問的語言。工具還會在其描述中教授兩條 Windows 受限權杖約定：只讀 pwsh 執行在 ConstrainedLanguage 中（`.NET` 靜態呼叫、`Add-Type`、COM 與反射會以 "only core types" 錯誤失敗）；兩種受限模式下程式都無法開啟命名管道，因此透過管道 stdio 捕捉另一程式輸出的命令會以 EPERM 失敗——請升權該確切命令一次，或重構命令以避免捕捉輸出。

### 可能出什麼問題

沒有 PowerShell 執行器的組合永遠不會啟用該工具，且注入的服務（`tools`、`shell`、`systemPrompt`、`shellEnv`）必須全部存在。沒有任務執行時的後臺呼叫會以 `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs` 失敗；沒有沙箱執行器時的 `sandbox_permissions` 會以 `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)` 失敗。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **`dsh-tool-bash` 的刻意孿生。** 前臺與後臺執行、受管環境、沙箱升權面以及標記／截斷渲染都逐呼叫映像 bash 工具，因此其中之一的消費方也能接受另一個的協定形狀（[pwsh 工具與 bash 對齊 Agent Note](../../../.agents/notes/implemented/feature/2026-08-02-pwsh-tool-bash-parity.zh.md)）。
- **PowerShell 方言約定。** 工具約定是 PowerShell：原生路徑與 `$env:` 變數，經由 `pwsh -Command` 執行，沒有中間 shell。
- **Windows 沙箱事實寫進描述。** ConstrainedLanguage 與命名管道約定是 Windows 受限權杖行為；教授它們的條件是「已掛載任意約束執行器」，之所以安全，是因為每個已釋出的配對都是 win32-only。
- **非零退出只報告、不失敗。** 只有基礎設施故障（spawn 錯誤、中止）才會作為工具錯誤暴露，與 bash 的故事一致。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：工具註冊、提示詞區段、參數驗證、升權、請求組裝 |
| [`src/background.ts`](src/background.ts) | 把已結算的程序對映為通用任務結果詞彙，並把輸出環讀取渲染為程序讀取 |
| [`src/render.ts`](src/render.ts) | 模型側結果文字：流、標記、截斷通知（bash 孿生） |
| — | 不釋出執行時不變式伴生入口；除所屬 seam 強制執行的約定外，本包不公開獨立的事件序列或可變資料關係。 |

### 渲染與退出標記

渲染器共享 bash 工具的結構與來自 `dsh-shell` 的 `parseExitStatus` 標記約定：乾淨退出（0、無訊號）不產生標記；UI 卡片把退出標記消費為退出狀態 pill。Windows 強制終止以 exit 1 結算且沒有訊號，因此 `[killed by signal: …]` 僅適用於 POSIX。`tool:pwsh` 提示詞區段（first-party 順序 1010）教授退出標記約定與「中斷後 exit 1」的 Windows 解讀。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 shell 家族逐步進入執行器 seam，以及 Windows 行為背後的設計筆記。

- [shell 包對映](../README.zh.md)——bash 能力家族及其角色。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md)——請求／spec 詞彙、結果與後臺程序。
- [shell-env](../shell-env/README.zh.md)——每次呼叫都會收到的受管 `DSH_*` 環境。
- [tool-jobs](../../jobs/tool-jobs/README.zh.md)——後臺執行的 `job_output`、`job_list` 與 `job_kill` 控制。
- [pwsh 工具與 bash 對齊 Agent Note](../../../.agents/notes/implemented/feature/2026-08-02-pwsh-tool-bash-parity.zh.md)——為什麼工具映像 bash 工具。
- [Windows ACL 受限權杖沙箱 Agent Note](../../../.agents/notes/implemented/feature/2026-08-08-windows-acl-restricted-token-sandbox.zh.md)——語言模式與命名管道約定。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-pwsh)——`pwsh` 參數 schema 的確切內容。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-pwsh)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

該外掛註冊作用域內的每次請求都在 first-party 順序 1010 處包含以下 pwsh 指引。按作用域實施的工具限制可以隱藏 schema，卻不會移除這個獨立註冊的區段。

##### Pwsh 指引

```markdown
Non-zero exits are reported as `[exit code: N]` markers; investigate failures before moving on. On Windows a killed process settles as `[exit code: 1]` without a signal marker; treat a bare exit 1 after an interruption as a termination, not a command failure.
```

#### Token 影響

外掛啟用期間，每次請求都會產生少量固定的輸入 token 開銷。

#### KV Cache 影響

只要註冊作用域與提示詞文字不變，字首就保持穩定。外掛啟用或釋放可能使從該提示詞區段起的複用失效。

### 工具 schema

#### 模型看到什麼

模型會看到生成的 [`pwsh` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-pwsh)。其理由欄位提示模型使用使用者目前提問的語言。按 agent 作用域實施的工具限制可以移除該 agent 的定義。

#### Token 影響

工具可見的每個請求都會產生固定 schema 開銷。

#### KV Cache 影響

只要可見性與工具定義不變，字首就保持穩定。限制或設定變化可能從首個變化的 token 開始使複用失效。

### 前臺結果

#### 模型看到什麼

渲染器輸出依資料而定的 stdout 尾部，再輸出可選的 `[stderr]` 和 stderr 尾部。條件行精確為 `[output truncated; full output: <path-or-(unavailable)>]`、`[sandbox: file access denied under <mode> mode]` 加升權提示 `[sandbox: escalation available — …]`（僅在組合宣告升權時）、`[timed out after <timeoutMs>ms]`、`[stopped: <reason>]`、`[killed by signal: <signal>]` 與 `[exit code: <exitCode>]`（僅非零退出）；空正文渲染為 `(no output)`。

#### Token 影響

呼叫前的結果 token 為零。輸出按流設界，而每行已發出的內容在壓縮（compaction）前保留於歷史。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV-cache 條目失效。

### 後臺結果

#### 模型看到什麼

後臺啟動精確渲染為 `started background job <id>`；隨後的讀取與狀態經由通用 `job_output`／`job_kill` 工具流轉，包括記憶體截斷丟棄未讀位元組時的有損讀取 spill 通知。

#### Token 影響

確認是一行固定的短文字；任務輸出按每次讀取設界。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV-cache 條目失效。

### 工具錯誤

#### 模型看到什麼

驗證與基礎設施失敗統一為 `Error: <message>`。本包的穩定訊息包括 `invalid command: expected a non-empty string`、`invalid description: expected a non-empty string`、`invalid timeoutMs: expected a positive number, got <value>`、升權配對失敗、`sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`、共享升權失敗（未嚴格加寬／無審批服務／無 agent 可路由／無審批通道／使用者拒絕／已取消）、`run_in_background is disabled for this deployment (enableRunInBackground: false)`、`background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs`，以及 `tool call aborted`。

#### Token 影響

只有失敗呼叫會增加這些保留 token；被中止的呼叫不會新增命令輸出。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV-cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適或需要特別小心。它們是目前包約束，不是任務積壓。

- **Windows 沙箱下的語言模式與命名管道捕捉**——在 [Windows ACL 沙箱](../../sandbox/sandbox-windows-acl/README.zh.md)下，只讀 pwsh 以 ConstrainedLanguage 啟動，因為其臨時目錄寫入被拒絕，導致 PowerShell 的 AppLocker 探測失敗並按拒絕處理：`Add-Type`、非核心 .NET 靜態呼叫（`[System.IO.*]::`、`[math]::`）、COM 物件與反射會以 "only core types" 錯誤失敗，且該模式無法從內部解除。workspace-write 的私有臨時目錄讓探測完成，因此除非主機策略另有規定，它保持 FullLanguage。兩種受限模式都拒絕命名管道開啟，因此受限命令內部的管道 stdio spawn 會以 EPERM 失敗。工具描述把兩條約定都教給模型；完整限制以後端 README 為準。
- **沒有持久 shell**——每次呼叫都啟動全新的 `pwsh -Command`；持久 shell 對應物是 [`@deepseek-ai/dsh-tool-pwsh-persistent`](../tool-pwsh-persistent/README.zh.md)，它跨呼叫保持一個按所有者隔離的 pwsh 存活。
- **PowerShell 方言約定**——模型必須編寫 PowerShell（原生路徑、`$env:` 變數），而不是 bash；沒有方言翻譯。
- **工作階段 cwd 身份未規範化**——workdir 基準就是工作階段頭部 cwd 原樣，不像 bash 工具那樣以沙箱根規範化身份為準。在約束執行器下，策略的 workspace root 確實被規範化（由共享策略服務完成），因此當原始工作階段 cwd 與其規範形式不同時，workdir 與約束根可能分叉——這是推遲到共享 shell 工具基座抽取的對齊差距。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
