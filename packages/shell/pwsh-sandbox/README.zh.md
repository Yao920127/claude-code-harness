---
description: "面向部署方與維護者的沙箱 PowerShell 執行器說明，用於選擇、設定或排查受限 PowerShell 命令執行及其拒絕事實。"
kind: "package-reference"
---

# @deepseek-ai/dsh-pwsh-sandbox

[English](README.md) | 中文

## 概述

`dsh-pwsh-sandbox` 是沙箱消費型 PowerShell 執行器：每條命令都以全新的 `pwsh -Command` 程序執行，經 `ctx.sandbox` 能力隔離，並在每個已結算的結果上標記所選模式、強制執行完整度與拒絕事實。在 Windows 上，沙箱 seam 解析到 ACL 受限權杖 runner 鏈；在 Linux 與 macOS 上則使用 bwrap、Landlock 或 Seatbelt。當沒有 runner 能強制執行受限模式時，呼叫按失敗關閉原則拋結構化 `SANDBOX_UNAVAILABLE` 錯誤，絕不無隔離地執行。它是 `dsh-bash-sandbox` 的 pwsh 孿生，逐呼叫映像。

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

當 PowerShell 命令不得以 harness 程序的完整檔案權限執行時，用本執行器替代 `dsh-pwsh-local`。它註冊為 `ctx.shell`，繼承 `dsh-pwsh-local` 的程序機制，並要求一個 `ctx.sandbox` 提供者加上 `ctx.sandboxPolicy`。

### 何時選擇

當部署需要為 PowerShell 命令提供檔案級隔離時選擇它，通常是在 Windows 上。隔離實體本身是平臺無關的：沙箱 seam 選擇平臺的 runner——Windows 上是 ACL 受限權杖鏈，其他平臺是 bwrap/Landlock/Seatbelt——而本執行器只負責 pwsh 側。沙箱策略（模式加工作區根目錄）不是本包的設定：它隨每次呼叫從 `ctx.sandboxPolicy` 而來，工具呼叫傳呼叫工作階段解析後的策略，直接呼叫退回到部署策略。

### 模式與檔案影響

| 模式 | 檔案影響 |
|---|---|
| `read-only`（預設） | 寫入被拒絕；邊界仍受共享的硬連結、讀取不受限與 AppContainer ACL 限制 |
| `workspace-write` | 只能寫入策略的工作區根目錄加一個私有臨時目錄；spawn 前 `TMP`/`TEMP` 會被重寫到該目錄 |
| `danger-full-access` | 不作限制；絕不諮詢提供者，結果攜帶 `sandbox: { mode, denied: false }` |

### 最小設定

在 Windows 上掛載 ACL 受限權杖提供者；在 Linux 與 macOS 上則改掛本地 runner 提供者。執行器自身的設定與本地 pwsh 執行器的設定項完全相同；生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-pwsh-sandbox)是完整真源。

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-windows-acl'
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: read-only
    workspaceRoot: !!js process.cwd() # fallback for calls without a session cwd
- id: bash
  name: '@deepseek-ai/dsh-pwsh-sandbox'
```

### 拒絕與升權

被拒絕的命令作為事實被報告：結果攜帶 `sandbox: { mode, denied: true }`，工具層把它轉成標準的權限拒絕面——與 bash 工具使用同一個。當升權可用時，模型可以使用範圍最小的更寬鬆模式並附上一句理由，對同一條命令重試一次；批准提示會詢問使用者，獲得批准前不會執行任何命令。本執行器自身絕不協商權限。

### 失敗與恢復

如果沒有 runner 能強制執行受限模式，前臺呼叫以 `SANDBOX_UNAVAILABLE` 失敗，後臺程序則記錄 runner 失敗事實——絕不會靜默無隔離執行。只有當提供者拒絕中的 `ENOENT`/`EACCES` 路徑或 syscall 獨立指向 `argv[0]` 時，才將其歸因於隔離 runner；否則仍沿用本地執行器不區分階段的提供者失敗語義。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋執行器的設計並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計概念

本執行器是 `dsh-bash-sandbox` 的 pwsh 孿生：它繼承 `dsh-pwsh-local` 的程序機制，消費其 argv 級 seam（`argv()`/`executeArgv()`/`onProcessDone()`），並在 spawn 前把精確的 pwsh 呼叫經 `ctx.sandbox.confine()` 包裝。隔離實體本身是平臺無關的——沙箱 seam 解析到平臺的 runner——而本包只負責 pwsh 側：所選模式、強制執行完整度，以及結果上的拒絕分類。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`SandboxPwshExecutor`、按程序保留事實、執行準備 |
| [`src/helpers.ts`](src/helpers.ts) | 拒絕、runner 失敗與 runner spawn 失敗分類 |
| — | 不釋出執行時不變式伴生入口；除所屬 seam 所執行的約定外，本包不暴露獨立事件序列或可變資料關係；分類可在結果中觀察。 |
| `tests/` | 跨 ACL 與平臺 runner 演練的行為 |

### 主要流程

對受限模式，`resolve()` 標記每次呼叫的策略；`execute` 把 pwsh argv 經提供者包裝，再把受限 argv 交給繼承的子程序路徑。結算時執行器對結果分類：runner 失敗優先於拒絕（命令從未執行），stderr 攜帶 runner 拒絕方言的失敗執行報告 `denied: true`，每次受限執行都攜帶模式與強制執行事實。`danger-full-access` 完全繞過提供者，並標記 `denied: false`。

### 不變式

- **失敗關閉**——受限模式沒有可用 runner 時以 `SANDBOX_UNAVAILABLE` 拒絕；受限策略絕不會出現無隔離直通。
- **seam 只報告拒絕**——本執行器從不授予權限；批准流程位於工具層。
- **按程序保留事實**——隔離事實在結算前按控制代碼保留，因為提供者在不同的重疊呼叫中可能採用不同的強制執行方式。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當執行器約定不夠用時閱讀以下頁面。它們從 seam 進入隔離後端與 pwsh 工具。

- [shell seam](../shell/README.zh.md) —— 本提供者實作的執行器約定，包括請求/spec 拆分。
- [bash-sandbox](../bash-sandbox/README.zh.md) —— 本執行器的 bash 孿生，共享拒絕與升權面。
- [pwsh-local](../pwsh-local/README.zh.md) —— 本執行器繼承的程序機制。
- [sandbox-windows-acl](../../sandbox/sandbox-windows-acl/README.zh.md) —— Windows 受限權杖 runner 鏈。
- [Bash 執行器子系統](../../../docs/subsystems/shell.zh.md) —— 請求/spec 詞彙、結果與完整的服務約定。
- [pwsh 執行器與工具筆記](../../../.agents/notes/archived/feature/2026-08-01-pwsh-tool-and-executor.md) —— pwsh 執行器與工具這一對背後的決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 隔離生效，拒絕以命令失敗呈現

#### 模型看到的內容

受限命令自身的 stderr——例如 Windows ACL runner 下的 `Access to the path '...' is denied.`；工具層把分類後的拒絕轉成標準權限拒絕面，與 bash 工具完全一致。

#### Token 影響

除命令 stderr 與工具層標準拒絕面外，無額外模型可見文字。

#### KV Cache 影響

無直接影響；拒絕呈現面屬於工具層。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本執行器在 Windows 上只是不完整的邊界。它們是目前包約束，不是路線圖。

- **Windows 上讀不受限**——ACL runner 只限寫；讀邊界文件在 `@deepseek-ai/dsh-sandbox-windows-acl`。
- **Windows workspace-write 的臨時權限按每個活躍的工作階段/工作區對私有**——無 agent（智慧代理）的呼叫每次都獲得一個新的私有目錄；環境臨時根目錄絕不會被授權，runner 會在 spawn 前將 `TMP`/`TEMP` 重寫為該私有目錄。
- **Windows read-only 不授予任何顯式可寫根目錄，但仍為部分強制執行**——NTFS 硬連結會把同一檔案物件別名為多個路徑、讀取仍不受限，且被其他 AppContainer 工具以包 SID 標記過的目錄樹對 Low 完整性子程序不可讀。NUL 在兩種模式下仍可寫，因為裝置 DACL 向 Everyone 授予寫權限且不帶更高的標籤；PowerShell 的 `> $null` 重定向仍然工作，且不會開啟 NUL。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
