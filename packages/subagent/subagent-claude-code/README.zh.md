---
description: "面向使用者與維護者的一次性 Claude Code subagent 提供者，用於選擇產品後端、安裝 Profile bundle 或設定無人值守的 Claude Code 委派。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-subagent-claude-code

[English](README.md) | 中文

## 概述

當委派任務應在父工作區中以全新、無人值守的 Claude Code 工作階段執行時，安裝這個 Profile Bundle。每次執行接受一個自包含文字任務，並返回最終答案或安全的失敗診斷；推理、工具通訊、stderr、用量資訊和工作區差異不會進入父 Session。Claude 原生設定與身份驗證繼續是權威來源，而 Profile 設定選擇模型、環境和 `permissionMode`。針對平臺鎖定的執行時僅在需要時啟動，並且絕不會退回到主機 `claude` 可執行檔案。當隔離和真實 Claude Code 行為比續接或提示更重要時，選擇本包。

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

當委派應以父級工作區中的真實 Claude Code 工作階段執行時，掛載本提供者。常用路徑是顯式的：把 Bundle 安裝進 Profile，可選地設定提供者行，並透過委派工具行把它暴露給模型。

### 安裝 Bundle

把包安裝進目標 Profile，然後重新啟動該 Profile。安裝會把鎖定的 Agent SDK 與一個相容的平臺 CLI 載荷帶入 Profile；宣告的 patch 層只註冊休眠的提供者，不啟動任何 Claude 程序。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-claude-code
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-claude-code
dsh --profile <name>
```

移除包後，下一次 Profile 啟動會撤回提供者及其私有執行時閉包。安裝決定 Host 可用性，而不是模型權限：模型只能透過你組合的委派工具行觸達提供者。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `providerName` | `claude-code` | `ctx.subagents` 上的非空註冊名稱；每個已掛載實例都需要唯一值 |
| `model` | Claude 原生設定 | 為本提供者實例的每次執行固定的可選非空模型名稱；省略時不傳送 SDK 覆蓋 |
| `env` | `{}` | 疊加在已清理憑證的父環境之上的顯式 SDK/CLI 環境 |
| `permissionMode` | `dontAsk` | 為本提供者實例的每次執行固定的原生非互動權限策略 |
| `disposeGraceMs` | `3000` | 共享 managed-range owner 各終止層級之間的寬限 |

| `permissionMode` 值 | 原生行為 |
|---|---|
| `dontAsk` | 不彈出提示，直接拒絕尚未獲授權的操作 |
| `acceptEdits` | 接受檔案編輯；其餘權限提示由無人值守回呼拒絕 |
| `auto` | 由 Claude Code 原生分類器允許或拒絕權限請求 |
| `plan` | 使用原生規劃模式，拒絕執行審批，並把完整計劃作為最終答案返回 |
| `bypassPermissions` | 顯式設定 SDK 的危險確認並跳過權限檢查 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-claude-code)是每個受支援欄位及其 JSDoc 的窮盡式真源。已設定的 `model` 會原樣傳給該提供者實例的每次 query；省略時保留原生模型選擇。具有憑證特徵的環境變數會在顯式 `env` 覆蓋生效前被移除，因此供子程序使用的 API 金鑰必須在該設定中顯式提供。提供者省略 SDK 的 `settingSources` 選項，因此 Claude Code 會相對於父工作階段 cwd 讀取主機常規的使用者、專案與本地設定。它不會複製或過濾這些檔案、建立或修改登入狀態、檢查 `PATH`，也不會退回到主機 `claude` 可執行檔案。

### 暴露工具

每個委派工具行指名一個提供者，並需要獨立的 `toolName`，因此模型看到的是靜態工具，而不是動態提供者選擇器。完整 Agent Preset 攜帶對應的預設工具行並設定 `disabled: true`；複製一個 preset 後刪除該欄位，即可只向由該副本組裝的 agent（智慧代理）暴露 `subagent_claude_code`。

```yaml
- id: jobs
  name: '@deepseek-ai/dsh-jobs-local'
- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'
- id: tool-subagent-claude
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: claude-code
    toolName: subagent_claude_code
    backgroundMode: one-shot
    maxDepth: provider-managed
```

`one-shot` 策略會讓省略 `run_in_background` 或傳入 `false` 的呼叫繼續在前臺等待，而顯式傳入 `true` 會返回由父 agent 擁有的 job id，供 `job_output` 或 `job_kill` 使用；base host（基礎主機）與完整 preset 已提供通用作業註冊表和控制工具。

### 你會得到什麼

前臺呼叫會把嚴格的最終 Claude Code 答案交給模型；執行失敗時則返回帶停止原因與可選安全診斷的錯誤。後臺呼叫先返回 job id；隨後通用作業控制面會送達完成通知，並透過 `job_output` 公開同一最終答案或失敗狀態。Claude Code 的推理、工具活動、中間訊息、stderr 與工作區差異絕不會進入父級工作階段。

### 失敗與恢復

省略 optional dependencies、目前平臺不受支援或所選載荷缺失的安裝會讓提供者保持休眠，並在第一次委派時於 SDK 啟動邊界報告安全的 `query-start` / `unknown` 失敗事實；不存在主機 CLI 退回。原始產品錯誤只保留在內部 cause 鏈與提供者 Host 日誌中。被取消的執行以 `aborted` 結算。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋提供者如何驅動真實 Claude Code CLI，以及可觀察行為從何而來；完整約定見[使用本包](#use-this-package)。

### 設計理念

- **每次執行一個全新 query。** 每次執行都擁有獨立的 SDK query、取消控制器、CLI 程序與不持久化的產品工作階段；沒有續接、恢復或池化。
- **原生設定是權威。** 提供者故意省略 SDK 的 `settingSources` 選項，因此 Claude Code 讀取主機常規的使用者、專案與本地設定；可選 `model` 與必需的 `permissionMode` 是僅有的 query 級覆蓋。
- **刻意無人值守。** `AskUserQuestion` 被停用，除 bypass 模式外權限提示都會被拒絕，因此 query 絕不會等待使用者介面。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：設定 schema、提供者註冊 |
| [`src/run.ts`](src/run.ts) | SDK query 生命週期、結果接受與權限處理 |
| [`src/process.ts`](src/process.ts) | dispose（資源釋放）時的 managed-range 逐級終止 |
| [`cordis.patch.yml`](cordis.patch.yml) | 註冊休眠提供者的 Profile patch 層 |

### 執行流程

一次啟動只接受非空的文字塊序列，並根據父工作階段確定子級 cwd。它建立私有 `AbortController`，用精確拼接的任務呼叫官方 SDK `query()`，並僅在 SDK 的 custom-spawn 掛鉤已經提供由子程序 seam 管理的活動 CLI 控制代碼後釋出執行。提供者完整迭代訊息流，只接受滿足 `subtype: "success"`、`is_error: false` 且 `result` 非空白、隨後迭代器正常結束的 `result` 訊息。其餘一切結果都對映為帶固定類別的 `error` 診斷，命名生命週期階段與已觀測程序結果——類別集合見 [`src/run.ts`](src/run.ts)。本地取消會在結果競態中勝出並對映為 `aborted`，且不附帶失敗診斷。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從本提供者逐步進入它接入的 seam 與兄弟產品提供者。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——服務約定、提供者約定與終態結果語義。
- [dsh-subagent seam](../subagent/README.zh.md)——本提供者註冊於其上的註冊表與啟動 API。
- [Codex subagent 提供者](../subagent-codex/README.zh.md)——經官方 app-server 協定的兄弟產品後端。
- [Claude Code 與 Codex 後端](../../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.zh.md)——產品提供者的設計記錄。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-claude-code)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 子級請求

#### 模型看到什麼

Claude Code 子級會在一個全新的 SDK query 中接收獨立文字任務。它的工作區是父工作階段 cwd；所選提供者實例會固定已設定的模型、環境與非互動權限模式，而省略的模型及其餘產品設定來自 Claude 原生設定。可執行版本來自 Bundle 鎖定的 SDK 平臺載荷。

#### Token 影響

子級需為獨立的 Claude Code 上下文和 query 承擔 token 成本。子級 token 不會進入父級上下文。

#### KV Cache 影響

與父級請求快取相互獨立。能否複用只取決於 Claude Code 自身的模型、指令、工具、原生設定和全新 query。

### 父級排程與結果（間接）

#### 模型看到什麼

透過 `dsh-tool-subagent`，前臺呼叫會讓父級模型看到符合嚴格成功條件的 Claude Code 最終答案；若結果未完成，錯誤中會包含終止原因和可選的安全診斷。該診斷可以區分粗粒度行動類別、生命週期階段和已觀測的程序結果，而不複製原始產品文字或版本專屬 subtype 名稱。後臺呼叫會先返回 job id；隨後通用作業控制面會送達完成通知，透過 `job_output` 公開同一最終答案或失敗狀態詳情，並允許 `job_kill` 請求取消。Claude Code 的推理、工具活動、中間訊息、stderr、工作區差異、用量資訊、產品識別符號、工具輸入和原始協定載荷均不會複製到父工作階段。

#### Token 影響

前臺輸入會增加工具結果中保留的最終答案或錯誤內容。後臺輸入還會包含啟動確認、完成通知，以及 `job_output`、`job_kill` 或後續狀態結果；子任務 token 仍不會進入父級上下文。本提供者自身不新增父級工具 schema。

#### KV Cache 影響

僅追加：前臺會在可複用的父請求字首後增加一個結果，後臺則會繼續追加 Job 啟動確認、通知以及後續控制或收集結果。後臺排程可能增加一個由通知喚醒的輪次，但這些訊息都不會改寫更早的字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供者何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用 Claude Code 對比或任務積壓。

- **每次執行均新建一個 query 和一個程序**——不支援續接、恢復、池化、進度流或產品工作階段持久化。
- **靜態選擇實例**——Profile 設定項固定提供者名稱、可選模型與工具繫結；呼叫無法動態選擇或修改提供者與模型，而且每個公開工具都需要唯一的 `toolName`。
- **主機設定有意保持權威**——省略 `model` 時由專案與使用者設定選擇模型；原生設定始終保留其餘工具和行為，本提供者不提供經過篩選或與主機環境隔離的生產模式。
- **身份驗證與帳戶狀態仍由原生機制管理**——Bundle 會提供 CLI，但不會建立帳戶、登入或改寫 Claude 設定；設定與身份驗證失敗會公開其生命週期階段與安全的 `unknown` 退回，而不會增加單獨的公開分類。
- **委派時必須存在 SDK 平臺載荷**——省略 optional dependencies 的安裝、不受支援的平臺以及缺失或損壞的載荷都會在第一次 query 時失敗；不會退回到主機 CLI。
- **沒有人工互動路徑**——`AskUserQuestion` 被停用，權限提示會被拒絕，MCP elicitation 會被拒絕，阻塞對話會以拒絕方式失敗而不會掛起。
- **assistant 載荷僅包含最終文字**——失敗執行可以額外公開獨立的安全診斷；推理、中間訊息、工具通訊、用量資訊、stderr 和工作區差異仍只保留在產品內部，通用 Job id、通知與狀態來自共享作業執行時。
- **沒有可選的共享能力**——對於本提供者，共享服務會拒絕 `agentOptions`、輸出 schema、子任務角色設定、工具篩選和 harness 深度強制約束。
- **沒有按實際經過時間觸發的超時或副作用復原**——長時間執行的工作由呼叫方取消，且取消前已更改的檔案或外部系統不會恢復原狀。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包程式碼為準。

- **載荷體積披露**——目前 darwin-arm64 平臺載荷壓縮後約 92 MB、解包後約 325 MB；這些是披露數字，不是安裝閾值。
- **版本鎖定的協定**——執行時依賴鎖定為 Agent SDK 0.3.291；升級會鎖定新的 SDK 版本，並需要重新執行無金鑰真實產品與 loader 組合證據。

</details>

**執行時不變式：** 不釋出伴生入口。生命週期配對屬於共享 subagent 服務，受管範圍的所有權屬於 subprocess 服務。
