---
description: "面向使用者與維護者的一次性 Codex subagent 提供者，用於選擇產品後端、安裝 Profile bundle 或設定無人值守的 Codex 委派。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-subagent-codex

[English](README.md) | 中文

## 概述

當委派工作需要在父工作階段工作區中的真實無人值守 Codex 工作階段內執行時，把 `@deepseek-ai/dsh-subagent-codex` 安裝進 Profile。每次委派都會為一個自包含文字任務使用全新且隔離的 Codex 執行緒，並且只返回其最終答案或安全失敗診斷。原生 Codex 設定和身份驗證繼續作為權威來源，而 `permissionMode` 選擇非互動式審批和沙箱行為。Bundle 會提供相容的原生 Codex 載荷，但只有設定委派工具後才會向模型公開相應能力。

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

當委派應以父級工作區中的真實 Codex 工作階段執行時，掛載本提供者。常用路徑是顯式的：把 Bundle 安裝進 Profile，可選地設定提供者行，並透過委派工具行把它暴露給模型。

### 安裝 Bundle

把包安裝進目標 Profile，然後重新啟動該 Profile。安裝會把官方 wrapper 與一個相容的原生平臺載荷帶入 Profile；宣告的 patch 層只註冊休眠的提供者，不啟動任何 Codex 程序。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile <name> remove @deepseek-ai/dsh-subagent-codex
dsh --profile <name>
```

移除包後，下一次 Profile 啟動會撤回提供者及其私有執行時閉包。安裝決定 Host 可用性，而不是模型權限：模型只能透過你組合的委派工具行觸達提供者。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `providerName` | `codex` | `ctx.subagents` 上的非空註冊名稱；每個已掛載實例都需要唯一值 |
| `model` | Codex 原生設定 | 為本提供者實例的每個執行緒固定的可選非空模型名稱；省略時不傳送 app-server 覆蓋 |
| `env` | `{}` | 疊加在已清理憑證的父環境之上的顯式子程序環境 |
| `permissionMode` | `never` | 為本提供者實例的每個執行緒固定的原生非互動審批與沙箱模式 |
| `disposeGraceMs` | `3000` | 共享 managed-range owner 各終止層級之間的寬限 |

| `permissionMode` 值 | `thread/start` 欄位 | 原生行為 |
|---|---|---|
| `never` | `approvalPolicy: never`；省略 sandbox | 永不請求審批；在原生 sandbox 下發生的執行失敗會返回給模型 |
| `approve-for-me` | `approvalPolicy: on-request`、`approvalsReviewer: auto_review`、`sandbox: workspace-write` | 由 Codex 自動評審權限請求，不等待人工 |
| `dangerously-bypass-approvals-and-sandbox` | `approvalPolicy: never`、`sandbox: danger-full-access` | 跳過審批與 sandbox；必須顯式選擇該值 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-codex)是每個受支援欄位及其 JSDoc 的窮盡式真源。已設定的 `model` 會原樣傳給每個臨時 `thread/start`；省略時保留原生模型選擇。提供者不會發現模型、改寫別名、選擇 `modelProvider` 或 `serviceTier`，也不會設定 fallback。具有憑證特徵的環境變數會在顯式 `env` 覆蓋生效前被移除，因此供子程序使用的 API 金鑰必須在該設定中顯式提供。

### 暴露工具

每個委派工具行指名一個提供者，並需要獨立的 `toolName`，因此模型看到的是靜態工具，而不是動態提供者選擇器。完整 Agent Preset 攜帶對應的預設工具行並設定 `disabled: true`；複製一個 preset 後刪除該欄位，即可只向由該副本組裝的 agent 暴露 `subagent_codex`。

```yaml
- id: jobs
  name: '@deepseek-ai/dsh-jobs-local'
- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'
- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: codex
    toolName: subagent_codex
    backgroundMode: one-shot
    maxDepth: provider-managed
```

`one-shot` 策略會讓省略 `run_in_background` 或傳入 `false` 的呼叫繼續在前臺等待，而顯式傳入 `true` 會返回由父 agent 擁有的 Job id，供 `job_output` 或 `job_kill` 使用；base host（基礎主機）與完整 preset 已提供通用作業註冊表和控制工具。

### 你會得到什麼

前臺呼叫會把選定的最終 Codex 答案交給模型；執行失敗時則返回帶停止原因與可選安全診斷的錯誤。後臺呼叫先返回 Job id；隨後通用作業控制面會送達完成通知，並透過 `job_output` 公開同一最終答案或失敗狀態。Codex 的過程說明、推理、工具活動、原始 stderr 與工作區差異絕不會進入父級工作階段。

### 失敗與恢復

省略 optional dependencies、目前平臺不受支援或所選載荷缺失的安裝會讓提供者保持休眠，並在第一次委派時於 `initialize` 階段以安全 `unknown` 類別和任何已觀測程序結果失敗；不存在主機 CLI 退回。原始 wrapper 文字只保留在 Host stderr。被取消的執行以 `aborted` 結算。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋提供者如何驅動真實 Codex app-server，以及可觀察行為從何而來；完整約定見[使用本包](#use-this-package)。

### 設計理念

- **每次執行一個全新程序、執行緒與輪次。** 每次執行都會 spawn 全新 app-server、建立一個臨時執行緒並恰好執行一個輪次；沒有續接、恢復或池化。
- **原生設定是權威。** Codex 設定與身份驗證經父級 cwd、`HOME` 與 `CODEX_HOME` 保持原生；提供者只覆蓋可選模型以及執行緒的 approval、reviewer 與 sandbox 欄位。
- **刻意無人值守。** 審批、使用者輸入與 MCP 請求都會在無人參與的情況下被應答或拒絕；未知伺服器請求會使執行失敗。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：config schema、提供者註冊 |
| [`src/run.ts`](src/run.ts) | 執行生命週期、輪次執行、結果選擇與診斷 |
| [`src/wire.ts`](src/wire.ts) | 最小的 app-server JSON-RPC 協定實作 |
| [`cordis.patch.yml`](cordis.patch.yml) | 註冊休眠提供者的 Profile patch 層 |

### 執行流程

一次啟動只接受非空的文字塊序列，並根據父工作階段確定子級 cwd。它經子程序 seam spawn 固定命令，完成 `initialize` → `initialized` 握手，把 Profile 選擇的模式與可選模型對映為官方 `thread/start` 欄位並與 `{ cwd, ephemeral: true }` 一起傳送，且僅在 Codex 返回有效的臨時執行緒後釋出執行。已釋出的結果恰好啟動一個輪次，只接受與此次執行的執行緒和輪次匹配的通知，並等待權威的 `turn/completed` 終態。以最後一條 `phase: "final_answer"` 的 `agentMessage` 為準；若 Codex 沒有發出明確的最終階段，則以最後一條 `phase: null` 的訊息作為相容性退回。成功完成的輪次若沒有非空白答案，結果也會判為錯誤。失敗輪次使用粗粒度類別 `limit`、`access-policy`、`service`、`transport`、`product-error`、`invalid-result` 或 `unknown`；app-server 提前退出使用 `process`，適用的連線與 stream 失敗保留數值 `httpStatusCode`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從本提供者逐步進入它接入的 seam 與兄弟產品提供者。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——服務約定、提供者約定與終態結果語義。
- [dsh-subagent seam](../subagent/README.zh.md)——本提供者註冊於其上的註冊表與啟動 API。
- [Claude Code subagent 提供者](../subagent-claude-code/README.zh.md)——經官方 Agent SDK 的兄弟產品後端。
- [Claude Code 與 Codex 後端](../../../.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.zh.md)——產品提供者的設計記錄。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-codex)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 子級請求

#### 模型看到什麼

Codex 子級會在一個全新的臨時執行緒中，以單個輪次接收這些獨立文字塊。它的工作區是父工作階段 cwd；所選提供者實例會固定已設定的模型、環境、非互動審批策略與沙箱模式，而省略的模型及其餘產品設定來自 Codex 原生設定。可執行版本來自 Bundle 鎖定的平臺載荷。

#### Token 影響

子級需為獨立的 Codex 上下文和輪次承擔 token 成本。子級 token 不會進入父級上下文。

#### KV Cache 影響

與父級請求快取相互獨立。能否複用只取決於 Codex 自身的提供者、模型、指令、工具和臨時執行緒請求。

### 父級排程與結果（間接）

#### 模型看到什麼

透過 `dsh-tool-subagent`，前臺呼叫會讓父級模型看到選定的 Codex 最終答案；若結果未完成，錯誤中會包含終止原因和可選的安全診斷。該診斷可以區分粗粒度行動類別、協定階段、適用的數值 HTTP status 和已觀測的程序結果，而不複製產品正文或 stderr。後臺呼叫會先返回 Job id；隨後通用作業控制面會送達完成通知，透過 `job_output` 公開同一最終答案或失敗狀態詳情，並允許 `job_kill` 請求取消。Codex 的過程說明、推理（reasoning）、工具活動、原始 stderr、工作區差異、用量資訊、產品識別符號、命令、路徑和協定載荷均不會複製到父工作階段。

#### Token 影響

前臺輸入會增加工具結果中保留的最終答案或錯誤內容。後臺輸入還會包含啟動確認、完成通知，以及 `job_output`、`job_kill` 或後續狀態結果；子任務 token 仍不會進入父級上下文。本提供者自身不新增父級工具 schema。

#### KV Cache 影響

僅追加：前臺會在可複用的父請求字首後增加一個結果，後臺則會繼續追加 Job 啟動確認、通知以及後續控制或收集結果。後臺排程可能增加一個由通知喚醒的輪次，但這些訊息都不會改寫更早的字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本提供者何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用 Codex 對比或任務積壓。

- **每次執行均新建一個程序、一個執行緒和一個輪次**——不支援續接、恢復、池化、進度流或產品工作階段持久化。
- **靜態選擇實例**——Profile 設定項固定提供者名稱、可選模型與工具繫結；呼叫無法動態選擇或修改提供者與模型，而且每個公開工具都需要唯一的 `toolName`。
- **身份驗證與帳戶狀態仍由原生機制管理**——Bundle 會提供 CLI，但不會建立帳戶、登入、信任專案或改寫 Codex 設定；設定與身份驗證失敗會公開其生命週期階段與安全的 `unknown` 退回，而不會增加單獨的公開分類體系。
- **委派時必須存在原生平臺載荷**——省略 optional dependencies 的安裝、不受支援的平臺以及缺失或損壞的載荷都會在第一次執行時失敗；不會退回到主機 CLI。
- **相容性由開發證據鎖定**——若要從已驗證的 0.153.4 協定基線升級，必須重新生成上游 schema 證據，並重新執行握手、答案選擇、審批、取消、無金鑰真實產品以及帶金鑰的 DeepSeek 隨機數測試。
- **沒有人工審批路徑**——已知的無人值守審批請求會被拒絕，未知伺服器請求會以預設拒絕方式使執行失敗；三種 Profile 模式都不會建立 DSH 互動通道或逐次呼叫 allow 策略。
- **assistant 載荷僅包含最終文字**——失敗執行可以額外公開獨立的安全診斷；推理、過程說明、中間訊息、工具通訊、用量資訊、原始 stderr 和工作區差異不會進入父工作階段，通用 Job id、通知與狀態來自共享作業執行時。
- **沒有可選的共享能力**——對於本提供者，共享服務會拒絕 `agentOptions`、輸出 schema、子任務角色設定、工具篩選和 harness 深度強制約束。
- **沒有按實際經過時間觸發的超時或副作用復原**——長時間執行的工作由呼叫方取消，且取消前已更改的檔案或外部系統不會恢復原狀。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包程式碼為準。

- **載荷體積披露**——目前 darwin-arm64 平臺載荷壓縮後約 114 MB、解包後約 282 MB；這些是披露數字，不是安裝閾值。
- **版本鎖定的協定**——執行時依賴鎖定為 `@openai/codex@0.153.4`；升級需要重新生成上游 schema 證據並重新執行帶憑證的隨機數測試。

</details>

**執行時不變式：** 不釋出伴生入口。生命週期配對屬於共享 subagent service，受管範圍的所有權屬於 subprocess service。
