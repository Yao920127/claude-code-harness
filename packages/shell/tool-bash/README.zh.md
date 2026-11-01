---
description: "面向模型的 bash 工具，供選擇、設定或排查一次性命令執行、後臺任務與沙箱升權的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-bash

[English](README.md) | 中文

## 概述

`dsh-tool-bash` 執行 Bash 命令並返回 stdout、stderr 與退出標記。每次呼叫使用全新 shell；cwd、變數和函式不會保留。組合中有 job 註冊表時，每條命令從啟動起就是一個 job：`run_in_background` 立即返回 id，超過超時仍在執行的前臺命令返回同一個 id，`job_output`/`job_kill` 收集並停止它。命令獲得受管 `DSH_*` 環境；沙箱拒絕可攜帶更寬的 `sandbox_permissions`、一句 `justification` 與使用者批准重試一次。非零退出是供 agent（智慧代理）解讀的結果。請將 `dsh-bash-local` 或 `dsh-bash-sandbox` 等執行器與 `dsh-shell-env` 一起掛載。

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

在 agent 需要執行 bash 命令的任何組合中載入本外掛：一旦掛載執行器提供者與 `dsh-shell-env` 註冊表，它就註冊 `bash` 工具，並在 `tools`、`shell`、`systemPrompt` 與 `shellEnv` 服務就緒之前保持等待。

### 最小設定

常用路徑是執行器提供者、環境註冊表與本工具；當 agent 需要後臺執行命令時，再新增任務執行時。

```yaml
- name: '@deepseek-ai/dsh-bash-local'
- name: '@deepseek-ai/dsh-shell-env'
- name: '@deepseek-ai/dsh-tool-bash'

# Optional: background jobs
- name: '@deepseek-ai/dsh-jobs-local'
- name: '@deepseek-ai/dsh-tool-jobs'
```

設定欄位決定後臺能力面。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `enableRunInBackground` | `true` | 組合中有 job 註冊表時暴露 `run_in_background`；為 `false` 時拒絕強制後臺呼叫 |
| `promoteOnTimeout` | `true` | 到達超時的前臺命令繼續作為它的後臺任務執行，而不是殺掉它 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-bash)是每個受支援欄位及其 JSDoc 的窮盡式真源；生成的[工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash)攜帶完整參數 schema。

### 執行命令

工具執行 `bash -c <command>` 並返回合併後的輸出。命令每次呼叫都執行在全新 shell 中，因此狀態從不保留——請傳 `workdir` 而不是 `cd`。非零退出以 `[exit code: N]` 報告給 agent 解讀，而不是作為工具錯誤丟擲。主動語態的 `description`（5–10 個詞）在 UI 中標註該呼叫；`timeoutMs` 覆蓋執行器的預設值與上限。超出執行器流上限的輸出會被截斷為尾部，完整輸出儲存到 spill 檔案並報告其路徑。

<a id="running-long-commands-in-the-background"></a>
### 後臺執行長時間命令

傳入 `run_in_background: true` 會准入任務並立即返回 job id；限制準備可能仍在進行，且不設後臺執行超時。程序可用前輸出為空。任務取消會中止準備並停止隨後返回的程序；啟動失敗使已准入任務以失敗狀態結算。agent 用 `job_output` 讀取輸出（除非 `wait: true`，否則非阻塞）、用 `job_list` 列出任務、用 `job_kill` 停止任務；完成的任務會在工作階段內通知擁有它的 agent。後臺支援需要掛載通用任務執行時（`dsh-jobs-local`）及其控制工具（`dsh-tool-jobs`）。後臺 job 把執行的非消費 `observed` 讀取器交給 job 註冊表作為拉式源；註冊表按自己的節奏（`dsh-jobs-local` 的 `pumpPollMs`）把它們泵入 job 的輸出環，Web 用戶端由此流式看到即時輸出，模型的 `job_output` 讀取則經另一個遊標消費同一份位元組。讀取器拋錯只記錄一次，該流就此停止，job 繼續跑到自己的結算。輸出環是盡力而為的即時預覽：stdout 與 stderr 按輪詢輪次複製，同一個輪詢視窗內兩條流的寫入會先 stdout 後 stderr 出現，而不是按寫入順序。

### 前臺命令即任務

組合中有 job 註冊表時，前臺命令一啟動就登記到 `ctx.jobs`，呼叫等待該任務：命令在執行期間始終被列出、經 `job.list` 與 `job.follow` 流式觀看，並可從 Web 任務列表停止。在超時內完成的命令返回普通前臺結果，其任務記錄隨結果一起離開註冊表，模型從不看到 id。超過超時仍在執行的命令繼續作為它本來就是的那個任務執行，呼叫返回 `[still running after <timeoutMs>ms; moved to background job <id>]` 加任務交接指引，並以一次消費式讀取帶上目前為止的輸出——`job_output` 恰好從此處接續。來自呼叫之外的殺停（人在介面上停止任務）會讓前臺結果在訊號標記之前帶上 `[stopped: <reason>]`，模型讀到的是原因而不是命令失敗；取消呼叫本身則殺掉任務。登記是盡力而為的：`promoteOnTimeout: false`、缺少 job 註冊表，或註冊表在啟動時拒絕該任務（持有者的任務上限、沒有控制器）都會改為在執行器的 deadline 殺下執行命令，`timeoutMs` 參數描述也只在交接語義成立時才宣傳它。

### 沙箱執行與升權

當已掛載的執行器約束命令（例如 `dsh-bash-sandbox`）時，被阻止的檔案操作會報告為 `[sandbox: file access denied under <mode> mode]`——這是策略拒絕，不是命令失敗。模型隨後可以在同一輪次中用 `sandbox_permissions`（滿足需要的最窄更寬模式）與一句 `justification` 重試完全相同的命令一次；該重試引發的審批提示就是使用者同意的方式。只有發生真實拒絕後才請求更寬權限；被拒絕的升權對該命令即為最終結果。重複目前模式無需審批即可執行，更窄目標則在執行前失敗。未提供 `sandbox_permissions` 時，`justification` 可以省略、為空字串或僅含空白；未指定模式卻提供非空理由會被拒絕。重複目前生效模式時也可省略理由或提供空白理由。請求不同模式時必須提供非空理由；升權仍需審批。

### 可能出什麼問題

沒有執行器提供者的組合永遠不會啟用該工具。沒有任務執行時的後臺呼叫會以 `background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs` 失敗；沒有沙箱執行器時的 `sandbox_permissions` 會以 `sandbox_permissions is not available in this composition (no sandboxing executor to escalate)` 失敗。`enableRunInBackground: false` 會移除該參數，並在執行時拒絕強制後臺呼叫。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **shell seam 的模型側消費方。** 本工具是 bash 能力的消費方角色：它註冊 `bash` schema、渲染結果並解析每次呼叫的策略，程序機制歸執行器 seam 所有。
- **請求只來自命名參數。** 工具從不暴露 `stdin`、`env` 或 `stdoutMaxBytes`；它只用命令／workdir／超時／訊號欄位加上註冊表收集的 `dshEnv` 建置每個請求，因此模型提供的鍵無法替換受管值。
- **非零退出只報告、不失敗。** 只有基礎設施故障（spawn 錯誤、中止）才會作為工具錯誤暴露；模型解讀結束代碼與標記。
- **組合了任務執行時，每條命令都歸它。** 呼叫一啟動就把程序控制代碼註冊到 `ctx.jobs`，無論是模型要求後臺還是工具在等待它；job id、所有權、完成通知與釋放都是執行時的職責，本工具只把 bash 退出與沙箱事實對映為任務輸出。沒有註冊表時工具只做前臺，並隨註冊表的出現與消失在兩種註冊之間切換。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：工具註冊、提示詞區段、參數驗證、升權、請求組裝 |
| [`src/background.ts`](src/background.ts) | 管理非同步 shell 準備、將程序結算對映為任務結果，並把輸出環讀取渲染為程序讀取 |
| [`src/render.ts`](src/render.ts) | 模型側結果文字：流、標記、截斷通知 |
| — | 不釋出執行時不變式伴生入口；環境註冊表在每次變更和讀取時驗證所有權及收集值，且不釋出可供伴生入口交叉核對的獨立快照；執行關係由能力 seam 負責。 |

### 請求解析

工具在 `ctx.shell.resolve()` 執行前解析 workdir：顯式的相對 `workdir` 相對工作階段 cwd 解析，沙箱策略的規範化 workspace root 優先，使約束與啟動使用同一身份。沙箱策略透過 `ctx.sandboxPolicy` 按呼叫解析；升權請求在任何執行前經由 `ctx.approval`，若執行器會約束命令卻沒有掛載策略服務，工具在載入時失敗。

### 渲染故事

結果文字為 stdout，然後是帶標記的 `[stderr]` 區段，再是條件標記：截斷通知、沙箱拒絕（組合宣告升權時附帶同輪次升權提示）、超時、訊號與結束代碼——每個佔一行。退出標記同時充當 UI 卡片的退出狀態 pill：`dsh-shell` 共享的 `parseExitStatus` 會從輸出體中消費它，因此回放顯示 pill 而不重複標記。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從 shell 家族逐步進入執行器 seam、任務執行時，以及行為背後的決策筆記。

- [shell 包對映](../README.zh.md)——bash 能力家族及其角色。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md)——請求／spec 詞彙、結果與後臺程序。
- [shell-env](../shell-env/README.zh.md)——每次呼叫都會收到的受管 `DSH_*` 環境。
- [tool-jobs](../../jobs/tool-jobs/README.zh.md)——後臺執行的 `job_output`、`job_list` 與 `job_kill` 控制。
- [沙箱 Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——升權與模式切換的理由。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash)——`bash` 參數 schema 的確切內容。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-bash)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

以下 bash 指引會以第一方順序值 1000 出現在該外掛註冊作用域內的每次請求中。策略歸屬方透過其快取安全的執行時上下文貢獻目前沙箱狀態，而不修改本區段。按作用域實施的工具限制可以隱藏 schema，卻不會移除這個獨立註冊的區段。

##### Bash 指引

```markdown
Check the [exit code: N] marker on every bash result; investigate failures before moving on.
```

#### Token 影響

外掛啟用期間，每次請求都會產生少量固定的輸入 token 開銷，不隨沙箱模式或模式切換而變。

#### KV Cache 影響

只要註冊作用域與提示詞文字不變，字首就保持穩定。外掛啟用或釋放可能使從該提示詞區段起的複用失效；沙箱模式切換不會。

### 工具 schema

#### 模型看到什麼

模型會看到生成的 [`bash` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash)。僅當本生產方啟用 `run_in_background` 且組合中有 job 註冊表時，該欄位才會出現；僅當已掛載執行器宣告支援沙箱時，`sandbox_permissions` 和 `justification` 才會出現；理由欄位提示模型使用使用者目前提問的語言。按 agent 作用域限制工具可以移除該 agent 的定義。

#### Token 影響

工具可見的每個請求都會產生固定 schema 開銷；沙箱支援會增加升權欄位及其條件說明段落。

#### KV Cache 影響

只要可見性、後臺支援與執行器沙箱能力不變，字首就保持穩定。限制、設定或執行器發生變化時，可能從首個變化的工具定義開始使複用失效。

### 前臺結果

#### 模型看到什麼

renderer 輸出依資料而定的 stdout 尾部，再輸出可選的 `[stderr]` 和 stderr 尾部。沒有輸出時，它精確輸出 `(no output)`。條件行精確為 `[output truncated; full output: <path-or-(unavailable)>]`、`[sandbox: file access denied under <mode> mode]`、`[timed out after <timeoutMs>ms]`、`[stopped: <reason>]`、`[killed by signal: <signal>]` 與 `[exit code: <exitCode>]`；沙箱升權與 runner 故障行原文列於 [`dsh-bash-sandbox`](../bash-sandbox/README.zh.md)。

#### Token 影響

呼叫前的結果 token 為零。每條流的輸出有界，每個已輸出行則會保留在歷史中，直至壓縮（compaction）。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV-cache 條目失效。

### 後臺任務上下文與結果

#### 模型看到什麼

啟動會精確返回 `started background job <jobId>`。本生產方會向通用任務執行時提供增量程序輸出、可選的 `[some output was dropped from memory; full output: <paths-or-(unavailable)>]`、沙箱事實，以及 `exit code: <exitCode>` 或 `signal: <signal>` 等終止詳情。[`dsh-tool-jobs`](../../jobs/tool-jobs/README.zh.md) 負責模型可見的狀態行、完成通知、列表和取消回應。

#### Token 影響

啟動確認很短且會保留；收集到的輸出依資料而定，並受執行器流緩衝區限制。消費式讀取不會重複先前輸出。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV-cache 條目失效。

### 工具錯誤

#### 模型看到什麼

驗證與策略失敗統一為 `Error: <message>`。本包的穩定訊息包括 `invalid command: expected a non-empty string`、`invalid description: expected a non-empty string`、`invalid timeoutMs: expected a positive number, got <value>`、升權配對失敗、`run_in_background is disabled for this deployment (enableRunInBackground: false)`、`background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs`、`sandbox_permissions is not available in this composition (no sandboxing executor to escalate)`、審批不可用／拒絕／取消變體，以及 `tool call aborted`。

#### Token 影響

只有失敗呼叫會增加這些保留 token；升權被拒時命令不會執行，因此不會新增命令輸出。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV-cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適或需要特別小心。它們是目前包約束，不是任務積壓。

- **回放的退出 pill 從結果文字解析**——輸出最後一行恰好是 `[exit code: N]` / `[killed by signal: …]` 時，工作階段回放會顯示錯誤的 pill 並從卡片正文丟失該行，因為解析把它當作要消費的標記；這是僅影響顯示的已知殘留。
- **`bash` 工具不參與 `timeout-policy` 預算**——它保留執行器自有的 `BASH_TIMEOUT` 路徑，見[工具呼叫超時策略 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-07-tool-call-timeout-policy.zh.md)。
- **後臺程序沒有執行器超時**——工作不再需要時，呼叫方必須使用 `job_kill`，或依賴持有者／服務的釋放；登記為任務的前臺命令同樣沒有，它的超時只限定等待時長。
- **任務列表會顯示每條執行中的前臺命令**——完成的命令隨結果離開，但 Web 任務列表尚未標出哪些執行中的行仍有工具呼叫在等待。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
