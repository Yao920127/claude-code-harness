---
description: "面向部署方與維護者的沙箱 Bash 執行器說明，用於選擇、設定或排查受限命令執行及其拒絕與升權事實。"
kind: "package-reference"
---

# @deepseek-ai/dsh-bash-sandbox

[English](README.md) | 中文

## 概述

使用 `dsh-bash-sandbox` 執行每條 Bash 命令，使其檔案存取受到限制，而不是使用 harness 程序的完整權限。結果會報告所選模式、被拒絕的檔案操作，以及 runner 是否完整實施該模式。如果沒有 runner 能實施受限模式，命令會以 `SANDBOX_UNAVAILABLE` 失敗，絕不會無隔離地執行。部署需要檔案隔離時選擇它；網路存取和程序可見性不在其保證範圍內。

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

當命令不得以 harness 程序的完整檔案權限執行時，用本執行器替代 `dsh-bash-local`。它註冊為 `ctx.shell`，並要求一個 `ctx.sandbox` 提供者加上 `ctx.sandboxPolicy`；面向模型的 `bash` 工具基於它不加改動地工作，並公佈 `sandbox_permissions` 與 `justification` 升權欄位。

### 何時選擇

當部署需要為 Bash 命令提供檔案級隔離時選擇它：已設定的策略決定預設模式與工作區根目錄，每個工作階段還可以透過工具的升權流程按呼叫使用不同模式。模式只約束檔案影響——網路仍不受限制，程序可見性因後端而異。需要非隔離執行，或平臺沒有可用沙箱後端時，請改為掛載 `dsh-bash-local`。

### 模式與檔案影響

| 模式 | 檔案影響 |
|---|---|
| `read-only`（預設） | 任何位置都不可寫；在 `/dev` 中只有 `/dev/null` 節點可寫，因此 `>/dev/null` 仍可正常工作 |
| `workspace-write` | 只能寫入策略的工作區根目錄加 `/tmp`（bwrap 下為臨時目錄，Landlock 下為主機 `/tmp`，Seatbelt 下為 `/private/tmp` 加每使用者臨時目錄） |
| `danger-full-access` | 不作限制；絕不諮詢提供者，結果攜帶 `sandbox: { mode, denied: false }` |

### 最小設定

本執行器自身不攜帶任何沙箱設定：預設模式與工作區根目錄來自 `ctx.sandboxPolicy`，runner 選擇屬於 `ctx.sandbox` 提供者。它自己的設定就是本地執行器的旋鈕，逐字繼承；生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-bash-sandbox)是窮盡式真源。

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: read-only
    workspaceRoot: !!js process.cwd() # fallback for calls without a session cwd
- id: bash
  name: '@deepseek-ai/dsh-bash-sandbox'
```

### 拒絕是結果事實

被拒絕的命令會被報告，而不是靜默重試：結果攜帶 `sandbox: { mode, denied: true }`，面向模型的工具會追加拒絕標記。當升權可用時，模型可以用最窄的充分寬模式與一句理由重試同一條命令一次；批准提示會詢問使用者，未經批准絕不執行任何東西。本執行器自身絕不協商權限——覆蓋值由工具層驅動。

### 失敗與恢復

如果沒有 runner 能強制執行受限模式，前臺呼叫以 `SANDBOX_UNAVAILABLE` 失敗，後臺程序則記錄 runner 失敗事實——絕不會靜默無隔離執行。只有當 provider rejection 的 `ENOENT`/`EACCES` 路徑或 syscall 獨立指向 `argv[0]` 時，才把它歸因於 confinement runner；其他 rejection 保持本地執行器不宣告階段的 provider-failure 語義。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋執行器的設計並指出實作該設計的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計概念

本執行器是 `ctx.shell` seam 的沙箱 Service Provider：它繼承 `dsh-bash-local` 的程序機制，透過 `ctx.sandbox.confine()` 等待每條命令的精確 `['bash', '-c', command]` argv 完成限制準備，再直接 spawn 返回的 argv。前臺準備使用本地執行器與命令共享的 deadline；在 spawn 前超時不會宣告 enforcement 事實。後臺準備只跟隨呼叫方訊號。兩條路徑都在 spawn 前重新檢查取消狀態。由哪種平臺 runner 限制命令、以及是否有 runner 可用，屬於提供者職責；本包只負責 bash 側：所選模式、強制執行完整度，以及結果上的拒絕分類。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`SandboxBashExecutor`、按程序保留事實、execute 包裝 |
| [`src/helpers.ts`](src/helpers.ts) | 拒絕、runner 失敗與 runner spawn 失敗分類 |
| — | 不釋出執行時不變式伴生入口；分類可在結果中觀察，且除歸屬 seam 所強制執行的約定外，本包不公開獨立事件序列或可變資料關係。 |
| `tests/` | 跨 bwrap、Landlock 與 Seatbelt runner 演練的行為 |

### 主要流程

對受限模式，`resolve()` 標記每次呼叫的策略（工作階段的模式覆蓋值，或部署退回）；`execute` 把 bash argv 經提供者包裝，再把受限 argv 交給繼承的 subprocess 路徑。結算時執行器對結果分類：runner 失敗優先於拒絕（命令從未執行），stderr 攜帶後端拒絕方言的失敗執行報告 `denied: true`，每次受限執行都攜帶模式與強制執行事實。`danger-full-access` 完全繞過提供者，並標記 `denied: false`。

### 不變式

- **失敗關閉**——受限模式沒有可用 runner 時以 `SANDBOX_UNAVAILABLE` 拒絕；受限策略絕不會出現無隔離直通。
- **seam 只報告拒絕**——本執行器從不授予權限；批准流程位於工具層。
- **按程序保留事實**——隔離事實在結算前按控制代碼保留，因為提供者可能在重疊呼叫之間改變強制執行方式。
- **只約束檔案影響**——模式詞彙只聲稱檔案影響。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當執行器約定不夠用時閱讀以下頁面。它們從 seam 進入本執行器所消費的沙箱能力。

- [shell seam](../shell/README.zh.md) —— 本提供者實作的執行器約定，包括請求/spec 拆分。
- [bash-local](../bash-local/README.zh.md) —— 本執行器繼承的程序機制。
- [sandbox seam](../../sandbox/sandbox/README.zh.md) —— 隔離能力、其模式與失敗關閉約定。
- [sandbox-policy](../../sandbox/sandbox-policy/README.zh.md) —— 本執行器遵守的每工作階段模式與工作區根目錄。
- [sandbox-local](../../sandbox/sandbox-local/README.zh.md) —— 隨附的 runner 後端：bwrap、Landlock 與 Seatbelt。
- [tool-bash](../tool-bash/README.zh.md) —— 面向模型的 `bash` 工具及其升權面。
- [沙箱 Agent Note](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md) —— 沙箱設計、升權與切換約定。

-----

<a id="model-experience"></a>
## 模型體驗

### 間接的 Bash 工具 schema

#### 模型看到的內容

基線是生成的 [`dsh-tool-bash` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-bash)。透過公佈表明啟用隔離的 `sandboxMode` 能力，此後端會為 `bash` 增加 `sandbox_permissions`（enum 為 `workspace-write` | `danger-full-access`）與 `justification`。策略歸屬方會另行貢獻目前且不區分具體能力的 `sandbox:policy` 上下文。

#### Token 影響

在 `bash` 可見的請求上，schema 固定增加少量內容，另有一條由 `dsh-sandbox-policy` 負責的目前策略子句。

#### KV Cache 影響

常駐策略變化會在保留的歷史之後追加一份由歸屬方渲染的完整上下文快照，並使既有 system/history 字首保持逐位元組不變。更改執行器能力會改變 `bash` schema。

### 間接的 Bash 工具結果

#### 模型看到的內容

在普通有界輸出之後，被拒絕的呼叫會精確追加 `[sandbox: file access denied under <mode> mode]`。當升權可用時，接下來精確追加 `[sandbox: escalation available — retry this exact command once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`。已結算的後臺 runner 失敗則追加 `[sandbox: the sandbox runner itself failed under <mode> mode — the command did not run; this is a sandbox problem, not a command failure]`。

#### Token 影響

除普通輸出外，正常允許的執行不會增加 token。拒絕或失敗會增加上述有條件標記，並保留到上下文壓縮（context compaction）。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 間接的 Bash 工具錯誤

#### 模型看到的內容

如果沒有 runner 能強制執行受限模式，前臺呼叫會傳播來自 sandbox seam 的 `SANDBOX_UNAVAILABLE` 錯誤。當提供者拒絕帶有 `ENOENT`／`EACCES` 路徑或 syscall 證據並指向 `argv[0]` 時，會把原始錯誤作為 runner 失敗詳情；其他拒絕仍是與階段無關的提供者錯誤。已結算的 runner 失敗以匹配到的致命 stderr 行作為詳情，並保留原始 stderr 收集結果；追加的 `Runner failure: <detail>` 是權威診斷，優先於通用的 `SANDBOX_UNAVAILABLE` 字首。

#### Token 影響

該次呼叫會在相應條件下顯示錯誤文字，該文字會保留在歷史記錄中直到上下文壓縮。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本執行器何時不是通用安全邊界。它們是目前包約束，不是路線圖。

- **限制只覆蓋檔案影響**——不提供網路限制和統一的程序可見性保證，因此這些模式不是通用安全沙箱。
- **拒絕從失敗命令的 stderr 推斷**——後端特徵使該推斷可跨平臺使用，但包含相同特徵的應用錯誤可能被分類為拒絕，也可能遺漏未出現在保留尾部中的拒絕。
- **非同步觀測到的後臺 runner 失敗沒有即時錯誤通道**——它記錄在已結算程序上，並在呼叫方用 `job_output` 讀取通用任務時呈現；同步的子程序拋錯被收容為同樣的已結算 killed 控制代碼，可歸因於 runner 的失敗由 `result()` 的 rejection 攜帶。
- **`danger-full-access` 有意繞過 `ctx.sandbox`**——它是顯式無約束模式，不是更寬的沙箱 profile。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
