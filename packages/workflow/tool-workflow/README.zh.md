---
description: "面向模型的工作流工具：執行扇出 subagent 的 JavaScript 編排腳本，供選擇或設定模型驅動編排的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-workflow

[English](README.md) | 中文

## 概述

`dsh-tool-workflow` 讓模型執行 JavaScript 編排，將工作委派給多個 subagent，並返回最終 JSON 值。僅當使用者明確要求工作流或大型多 agent（智慧代理）編排時使用；一兩項委派應優先使用普通 subagent 呼叫。前臺執行等待所有工作結束；取消或異常完成返回錯誤，而不是部分成功。`run_in_background: true` 立即返回自有任務 id，並提供即時輸出。部署方可以用 `toolName` 重新命名工具，用 `maxResultChars` 限制渲染結果。

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

`workflow` 工具執行由模型編寫的編排腳本，把工作扇出到多個 subagent，並返回腳本的最終 JSON 值。僅當使用者明確要求工作流或大型多 agent 編排時使用——例如跨多個檔案的審計、一次遷移、多角度研究；一兩項委派時優先使用普通 subagent 呼叫。

### 呼叫工具

模型提交三個參數外加一個開關：`meta`（必需的身份資料：`name`、`description`，以及可選的 `whenToUse` 與 `phases`）、`script`（必需的純 JavaScript 腳本體——不含 `export const meta` 語句；其參數描述攜帶腳本體規則，工具描述攜帶掛鉤約定）、`args`（可選 JSON 物件，作為全域變數 `args` 向腳本公開；裸列表應包裝到欄位中，使協定 schema 如實表達形態），以及 `run_in_background`（可選；僅在 `enableRunInBackground` 生效時存在）。

前臺成功返回包絡 `{ kind: 'foreground', runId, agentsStarted, result }`，向模型渲染為 `workflow "<name>" completed (<count> agent<optional-s>).`，後接 `Return value:` 與美化列印的 JSON。無法啟動的工作流——腳本解析或 meta 驗證失敗——返回模型可以修正的錯誤。取消與執行失敗返回 `Error: workflow run was cancelled` 或 `Error: workflow run failed: <error>`；部分輸出絕不會被報告為成功。

### 執行期間的預期

腳本執行期間，父級輪次會等待：工具啟動執行、等待其結果，並始終對該執行執行 dispose（資源釋放），因此腳本及其子 agent 在每條路徑上完全停穩——包括從父級步驟中止訊號橋接而來的取消。模型只看到最終結果，永遠不會看到中間子 agent 訊息；子 agent 自己的工作不會進入父級對話。

### 後臺執行

`run_in_background: true` 會立刻返回 `{ kind: 'background', jobId, runId }`：執行以自有 `workflow` 任務身份註冊到 `ctx.jobs`，工作階段頭部任務列表因此從該任務的輸出環即時流式顯示它的 `phase()`、`log()` 與成員生命週期行，行的進度行跟隨目前階段。沒有任何工具步驟訊號到達該執行——`job_kill`、列表裡的停止控制元件與 owner 拆除才是取消它的途徑。結算即任務的結算：完成的執行把同一份渲染後的回傳值作為任務的 result 交出（完成通知宣佈它，模型結算後的第一次 `job_output` 攜帶它一次），被取消的執行以 kill 原因結算為 `killed`，失敗的執行以腳本的失敗資訊結算為 `failed`。沒有活體任務註冊表與服務於呼叫方的控制器時呼叫失敗，並點名缺失的組合部件。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `toolName` | `workflow` | 要註冊的面向模型工具名稱。 |
| `maxResultChars` | `50000` | 渲染結果上限；更長的 JSON 會被截斷並附上提示。 |
| `enableRunInBackground` | `true` | 公開 `run_in_background`；關閉後呼叫同樣會被拒絕。 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-workflow)是每個受支援欄位的窮盡式真源。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋消費方如何與引擎拆分、執行生命週期與記錄如何工作；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

消費方擁有模型側 schema、`tool:<toolName>` 系統提示詞指導與結果包絡；腳本解析、執行、上限與取消位於 `ctx.workflowEngine` 之後，PTC 引擎與 `run_code` 共享 Node 程序約束。使用指導以提示詞段的形式隨工具外掛交付，絕不放入部署 persona。

### 執行生命週期

`execute` 啟動執行，並在 `try/finally` 內等待 `run.result`；該結構總會對執行執行 dispose。`exec.signal` 會橋接到 `run.cancel()`，包括啟動前已經中止的情況。非 `completed` 結束原因會對映為報告原因的 `isError` 結果；完成時渲染 `{ kind, runId, agentsStarted, result }`，Native 渲染器只會在 `maxResultChars` 處截斷該投影。

### 後臺生命週期

後臺呼叫在任務 starter 內經 `jobs.start` 註冊執行，因此引擎的同步拒絕什麼都不會註冊，准入預檢也先於引擎生成執行。任務的 `done` 連結自 `run.result`：先 dispose（釋放失敗只告警，絕不 reject 進註冊表），再停止映像，然後把停止原因對映到任務結果。環映像（`src/record.ts`）按外掛訂閱一次 `workflow/phase`、`workflow/log` 與成員事件，並把它們路由進被跟蹤執行的 `JobHandle` 面（`append` 寫行，`updateProgress` 寫階段）；結算後的零星事件找不到被跟蹤的執行，對已結算任務的 append 則在註冊表內丟棄。

### 持久工作階段記錄

對於根 transport 執行（`exec.parent` 預設），工具會用四個 log-only 事件把執行投影到呼叫方 agent 的工作階段：`start()` 返回後寫 run-start，只記錄 `run.id` 匹配的成員開始與結束，並且只在結果可用且 dispose 完全停穩後寫 run-end。巢狀 transport 呼叫照常執行，但不寫任何記錄。工作階段追加操作首次失敗後，本執行會停止後續記錄並只告警一次，留下空記錄或合法連續字首，同時不改變工具結果和清理。包 invariant 會在冷載入與即時追加時拒絕重複 start、未配對成員、仍有開放成員的終點與 run-end 後更新，同時允許缺失終態字尾的連續字首。

引擎的 `workflow/phase` 與 `workflow/log` 事件在本工具沒有逐行的持久面：工作階段日誌刻意只記錄 run 與成員生命週期，Web transcript 由這些記錄派生。後臺執行的這些行改經任務觀察 record 抵達人類，而 record 的瞬態是設計使然。

### 渲染意圖

按[渲染意圖 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.zh.md)預先確定：使用 `generic` 卡片，標題為 `workflow: <meta.name>`，直接從 `args.meta.name` 讀取——呈現是參數的純函式——腳本文字作為 `rawInput` 攜帶。結果繼續使用 generic 卡片。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：工具註冊、執行生命週期、後臺任務註冊、記錄器接線 |
| [`src/record.ts`](src/record.ts) | 後臺執行進任務輸出環的即時進度映像 |
| [`src/types.ts`](src/types.ts) | 四個 log-only 記錄事件 payload 及其 `SessionEventMap` 宣告 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套入口：持久工作流記錄協定驗證 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當工具級約定不夠用時閱讀以下頁面。這些頁面依次介紹共享工作流模型、引擎，以及可供比較的委派工具。

- [工作流子系統](../../../docs/subsystems/workflow.zh.md)——seam 約定、啟動請求與事件載荷。
- [工作流 seam](../workflow/README.zh.md)——工具背後的執行與結果詞彙。
- [PTC 工作流引擎](../workflow-ptc/README.zh.md)——執行腳本的引擎。
- [subagent 工具](../../subagent/tool-subagent/README.zh.md)——一兩項委派時的普通委派替代方案。
- [組地圖](../README.zh.md)——工作流能力家族及其包。
- [動態工作流 Agent Note](../../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.zh.md)——seam 設計及其決策。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

在該外掛的註冊作用域內，每個父級請求都會收到下方的工作流指導。作用域工具限制可以隱藏 schema，而不移除這段獨立註冊的指導。

##### 工作流指導

```markdown
Use the <toolName> tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls.
```

#### Token 影響

外掛啟用期間，每個請求都會產生少量固定的指導 token 開銷。

#### KV Cache 影響

只要外掛作用域與指導文字不變，字首就保持穩定。啟用或 dispose 可能會使從該提示詞段起的快取複用失效。

### 工具 schema

#### 模型看到什麼

工具可見時，已生成的預設 [`workflow` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-workflow) 包含完整的 JavaScript 掛鉤與中繼資料約定；`toolName` 可以重新命名該定義，模型會提交腳本、中繼資料與可選 args。

#### Token 影響

工具可見時，每個請求都會產生較大的固定 schema token 開銷。

#### KV Cache 影響

只要 `toolName`、定義與可見性不變，字首就保持穩定。重新命名、外掛生命週期或作用域限制可能會使從該 schema 起的快取複用失效。

### 工具呼叫歷史與結果

#### 模型看到什麼

由模型編寫的完整腳本、中繼資料與 args 會保留在 assistant 工具呼叫中。前臺成功結果精確為 `workflow "<name>" completed (<count> agent<optional-s>).`、換行、`Return value:`、換行，以及美化列印且依賴資料的 JSON；達到上限時，會在新行新增 `… [truncated: <omitted> more characters]`。後臺受理結果精確為 `workflow "<name>" started in the background as job <jobId>. Its return value arrives with the completion notice; check on it with job_output, stop it with job_kill.`，同樣渲染的值稍後經任務完成播報與 `job_output` 抵達模型。失敗結果精確為 `Error: workflow run was cancelled`（可以追加字尾 ` (<error>)`）、`Error: workflow run failed: <error-or-unknown error>` 或防禦性的 `Error: workflow run ended abnormally (<reason>)`；沒有所屬 agent 的呼叫變為 `Error: workflow tool requires a calling agent (exec.agent was undefined)`。中間子 agent 訊息會被省略。

#### Token 影響

呼叫 token 可能很多，並會保留到壓縮（compaction）為止。結果渲染受 `maxResultChars` 限制；子模型 token 與父級保留的上下文相互獨立。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該工具尚未支援什麼。它們是目前約束，不是任務積壓。

- **後臺執行不向模型報告中間值**——結算前的 `job_output` 只返回狀態；回傳值在完成時整體送達，取消仍會丟棄區域性輸出。
- **`args` 必須是物件，Native 結果文字有界**——呼叫方把頂層陣列／標量包裝到欄位中；規範工作流結果保持完整，超過 `maxResultChars` 的 JSON 會在面向模型的投影中截斷，而不是儲存在檢索控制代碼背後。
- **每次工具註冊的工作流策略固定**——提供者選擇、上限與工具名稱屬於部署設定，不是模型呼叫參數。
- **持久記錄只覆蓋頂層且只供觀察**——巢狀 PTC mode dispatch 不記錄；記錄故障會刻意退化為不完整字首，而不改變執行。
- **尚無回放後臺執行的 recorded-session 情境**——單元與真實引擎組合套件覆蓋該路徑；快照樹只釘住 schema 與提示詞文字。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：尚未決定的開放方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼與相關 Agent Note 為準。

開放方向：把截斷的 JSON 儲存在檢索控制代碼背後，而不是剪裁投影；記錄超出頂層的巢狀 dispatch；為後臺路徑補一個 recorded-session 情境。

</details>
