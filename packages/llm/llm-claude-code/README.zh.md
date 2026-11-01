---
description: "面向希望在 harness 中直接使用已登入的 Claude Code、無需 API 金鑰與 Claude Code 對話的使用者，以及該路由維護者的 Claude Code 模型路由。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-llm-claude-code

[English](README.md) | 中文

## 概述

安裝這個 Profile Bundle，即可在 harness Session 中與 Claude Code 對話，無需 API 金鑰。它註冊 `claude-code` 模型路由，其模型列表取自你的 Claude 帳號。每次模型呼叫都會透過官方 Agent SDK 在 Session 工作區中執行一個完整的 Claude Code 回合，並使用主機本身的 Claude Code 登入；harness 顯示回答、思考過程，以及 Claude Code 每執行一個工具就顯示一行。想讓 Claude Code 成為對話物件時選擇本包；若要把一個任務委派給 Claude Code，則選擇 [`dsh-subagent-claude-code`](../../subagent/subagent-claude-code/README.zh.md)。

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

### 開始之前

在執行 harness 的機器上登入一次 Claude Code（執行 `claude`，然後執行 `/login`）。該路由透過 Agent SDK 鎖定的平臺 CLI 複用此登入；它從不讀取、複製或修改已儲存的憑證，並會從繼承的環境中移除 `ANTHROPIC_API_KEY` 等憑證類變數。沒有可用登入的回合會以 `INVALID_CREDENTIAL` 程式碼失敗，訊息中會說明如何登入。

### 安裝 Bundle

把本包安裝進目標 Profile，然後重新啟動該 Profile。Bundle 會帶入鎖定版本的 Agent SDK、其平臺 CLI 載荷，以及 [`dsh-subagent-claude-code`](../../subagent/subagent-claude-code/README.zh.md)——本路由複用其受管程序介面卡。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-llm-claude-code
dsh --profile <name>
```

Bundle 補丁插入一行 `llm-claude-code`。在 Web 應用中，於任何 agent preset 下在輸入框的模型選擇器裡選擇 Claude 模型；把它設為預設模型選擇後，每個新 Session 都會以 Claude Code 開始。選擇器列出 Claude Code 為你的帳號報告的模型——例如 `Claude (Claude Code settings)`（不傳送模型，由你的 Claude Code 設定決定，例如 `"model": "opus"`）、`Claude Sonnet 5` 以及 `Claude Fable 5.1`——並在選擇器首次請求時從一個短暫的 Claude Code 程序讀取該列表。設定項的說明寫出帳號的推薦模型，它只在沒有設定選擇模型時生效。對於接受推理強度設定的模型，選擇器的 Effort 行提供 Claude Code 為它報告的等級——Low、Medium、High、Extra high（`xhigh`）與 Max——並從 High 開始；所選等級作為 `effort` 選項傳給 Claude Code。沒有報告等級的模型不顯示 Effort 行。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `provider` | `claude-code` | 註冊到 `ctx.llm` 的路由名；每個掛載實例需要唯一值 |
| `displayName` | `Claude Code` | 模型選擇器顯示的路由名稱 |
| `models` | 自動發現 | 可選模型；預設或為空時列出帳號的模型。id `default` 不傳送模型，由你的 Claude 設定決定，其他 id 原樣傳給 Claude Code。條目可選的 `efforts` 列出它提供的推理強度等級 |
| `executable` | SDK 內建版本 | 要執行的 Claude Code 可執行檔案的絕對路徑，例如 `/opt/homebrew/bin/claude`；預設時執行鎖定的 Agent SDK 所分發的版本。設定它即可列出並執行你已安裝的 Claude Code 所提供的模型；路徑不存在時在載入時失敗 |
| `permissionMode` | `session` | `session` 跟隨每個 Session 的權限預設；原生模式（`default`、`acceptEdits`、`auto`、`plan` 或 `bypassPermissions`）固定每個回合 |
| `env` | `{}` | 疊加在已清除憑證的父環境之上的顯式環境 |
| `disposeGraceMs` | `3000` | 受管程序各終止層級之間的寬限時間 |
| `retryPolicy` | `{ mode: normal, maxRetries: 0 }` | 模型請求重試策略；預設從不重試，因為失敗的回合可能已經修改了檔案 |
| `usageFreshMs` | `60000` | 一次方案用量讀取在再次詢問 Claude Code 前供應用視窗使用的毫秒數 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-claude-code)是每個可接受欄位的完整來源。

### 權限

在預設的 `session` 設定下，每個回合的原生權限模式跟隨 Session 的沙箱模式與審批策略。完全權限（`danger-full-access` 搭配 `never` 策略）以 `bypassPermissions` 執行 Claude Code，因為 `never` 策略會拒絕每一個提示；`workspace-write` 使用 `acceptEdits`，檔案編輯無需詢問即可進行；其他所有組合，以及沒有沙箱或審批服務的組合，使用 `default`。Claude Code 先應用你的使用者、專案和本地 Claude 權限規則。對於這些規則未決定的操作，路由會代表發起該回合模型呼叫的 Agent 向 `ctx.approval` 詢問：Web 審批卡片顯示原生提示標題，或工具名稱及其命令、檔案或 URL。`allowed-once` 允許這一次操作；其他所有結果都會拒絕，拒絕原因會傳給 Claude Code。`bypassPermissions` 跳過所有檢查，從不詢問。

<a id="plan-usage"></a>
### 方案用量

`claudeCodeUsage` Remote 報告已登入帳號的方案視窗（五小時、每週與按模型的每週視窗）及其用量與重置時間。一次讀取在 `usageFreshMs` 內回答所有應用視窗；重新整理會再次詢問 Claude Code。API key 與第三方登入不報告方案視窗。該 Remote 讀取 Claude Code 的實驗性用量請求，其欄位可能隨 Claude Code 版本變化。

### 你會看到什麼

助手訊息包含作為推理內容的 Claude Code 思考過程、作為文字的回答，以及每個頂層工具呼叫一行形如 `Claude Code ran <tool>: <subject>` 的推理內容。Claude Code 一開始呼叫工具，該行就帶著工具名稱出現，因此整份檔案寫入這類較長的工具輸入也能顯示正在進行的工具；輸入完整後再補上物件。失敗的工具結果（包括權限拒絕）會增加一行形如 `Claude Code's <tool> failed: <錯誤的第一行>` 的內容。巢狀的 Claude Code subagent 通訊、成功的工具結果、hooks 和狀態訊息都留在 Claude Code 內部。

當組合掛載了應用 Browser（`ctx.sidebarBrowser`）時，每個對話回合都會給 Claude Code 一個 `open_browser_tab` 工具。Claude Code 用它展示網頁（例如本地開發伺服器），頁面會在該 Session 右側 Sidebar 的新 Browser tab 中開啟，而不是外部瀏覽器。該工具無需權限提示，只接受 http 和 https URL，沒有應用視窗開啟時回報失敗。

### 失敗與恢復

| 失敗 | 程式碼 | 恢復方式 |
|---|---|---|
| 沒有可用的 Claude Code 登入（HTTP 401 或 403） | `INVALID_CREDENTIAL` | 用 `claude` 和 `/login` 登入，然後重新傳送 |
| Claude Code 速率限制 | `RATE_LIMIT` | 等待後重新傳送 |
| 回合因 Claude Code 限制而停止 | `CLAUDE_CODE_LIMIT` | 傳送範圍更小的請求 |
| Claude Code 執行錯誤或其他 API 錯誤 | `CLAUDE_CODE_EXECUTION`、`CLAUDE_CODE_ERROR` | 閱讀訊息後重新傳送 |
| 程序失敗或缺少平臺載荷 | `CLAUDE_CODE_PROCESS` | 連同可選依賴重新安裝 Bundle |
| 請求中帶有采樣選項或圖片 | `UNSUPPORTED_OPTION`、`UNSUPPORTED_CONTENT` | 傳送不含取樣覆蓋的文字 |

取消 harness 回合會中止 Claude Code 回合，並等待其程序樹退出。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部細節——點選展開</summary>

### 設計概念

- **一次模型呼叫就是一個 Claude Code 回合。** 該路由是普通的 `LlmAdapter`，因此 agent loop、Session 日誌、模型選擇和 preset 都無需改動；Claude Code 執行自己的工具，因此路由不向它提供 preset 的任何工具，loop 看到一條不含工具呼叫的助手訊息並結束該步驟。
- **Claude Code 的記錄儲存其上下文。** harness 日誌儲存渲染後的對話；助手訊息的 replay 狀態儲存原生對話 id 與最後一個鏈條目。下一次請求用 `resume` 和 `resumeSessionAt` 從該處精確續接，使重試、fork 和恢復的 Session 都從持久的 harness 訊息繼續，而不是從最新的原生條目繼續。
- **原生設定保持權威。** 路由省略 `settingSources`，因此 Claude Code 會載入主機的使用者、專案和本地設定、hooks 以及 `CLAUDE.md`，對話回合保留 Claude Code 自己的 `claude_code` 系統提示：harness 系統提示描述的是路由從不提供的 harness 工具。

### 原始碼地圖

| 檔案 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：設定 schema 與路由註冊 |
| [`src/adapter.ts`](src/adapter.ts) | SDK 查詢選項、回合生命週期與程序釋放 |
| [`src/request.ts`](src/request.ts) | 請求驗證、續接遊標選擇與提示渲染 |
| [`src/stream.ts`](src/stream.ts) | SDK 訊息到流塊的轉換、用量與終止對映 |
| [`src/approval.ts`](src/approval.ts) | 基於 `ctx.approval` 的原生權限回呼 |
| [`src/permissions.ts`](src/permissions.ts) | 由路由設定與 Session 權限旋鈕得出的原生權限模式 |
| [`src/browser-tool.ts`](src/browser-tool.ts) | 在應用 Browser 中開啟頁面的程序內 MCP 工具 |
| [`src/usage.ts`](src/usage.ts) | 基於 Claude Code 用量請求的 `claudeCodeUsage` Remote |
| [`src/types.ts`](src/types.ts) | 用量 Remote 的線路型別 |
| [`src/replay.ts`](src/replay.ts) | 儲存原生續接遊標的帶版本 replay 狀態 |
| [`cordis.patch.yml`](cordis.patch.yml) | 插入路由的 Profile 補丁層 |

### 請求流程

`planTurn()` 把請求的推理強度對映為 Claude Code 等級，並拒絕 temperature、停止序列、`low`、`medium`、`high`、`xhigh` 與 `max` 以外的推理強度、圖片，以及對話請求中的 `maxTokens`，並忽略 harness 工具 schema。它找到本建置可讀取 replay 狀態的最新助手訊息，並把其後結尾使用者訊息中由人撰寫的文字作為提示傳送；外掛插入的使用者訊息（例如 runtime-context 快照）會被捨棄，除非結尾訊息中沒有其他內容。從該位置到結尾使用者訊息之間的訊息——沒有 replay 狀態時則為全部訊息——會在提示前的 `<conversation_history>` 塊中引用一次。輔助呼叫（設定了 `purpose`，例如 Session 標題）傳送所有訊息、附加其系統提示、從不續接，並以無工具、單回合且不持久化原生記錄的方式執行。[`src/models.ts`](src/models.ts) 為發現的模型命名，並保留每個模型報告的推理強度等級：原生預設項以決定它的 Claude Code 設定命名，所有別名都保留在列表中。

adapter 從請求的 Session 解析工作區；請求未指定 Session 時則從發起呼叫的 Agent 解析，兩者都沒有工作區時，會在啟動 Claude Code 之前以 `NO_WORKSPACE` 失敗。SDK 的自定義 spawn 掛鉤把平臺 CLI 置於 `ctx.subprocess` 之下；流的 `finally` 會關閉查詢、終止受管範圍，並等待整個程序樹退出。

### 流轉換

部分訊息事件流式傳輸頂層文字和思考增量。頂層工具呼叫在 `content_block_start` 時以其名稱開啟一個推理塊，累積其輸入 JSON 增量，並在 `content_block_stop` 時補上物件；組裝完成的助手訊息只渲染未經流式傳輸的工具呼叫。頂層使用者訊息中帶 `is_error` 的工具結果成為一個推理塊，內容為結果的第一行文字，上限 200 個字元。最後一個頂層助手或使用者鏈條目成為續接遊標。用量取自回合中最後一次原生模型呼叫：輸入 token 包含快取讀寫，用以衡量 Claude Code 目前攜帶的上下文。SDK 結果成為唯一的終止 `finish` 塊；沒有可續接條目的成功結果視為失敗。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [LLM 流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——本路由實作的 adapter 契約、流塊與 replay 狀態。
- [審批子系統](../../../docs/subsystems/approval.zh.md)——權限回呼使用的請求、結果與審計語義。
- [Claude Code subagent 提供者](../../subagent/subagent-claude-code/README.zh.md)——一次性委派的同類包，本路由複用其受管程序介面卡。
- [新增 LLM adapter](../../../docs/cookbook/adding-an-llm-adapter.zh.md)——每個 adapter 都要滿足的協定義務。

<a id="model-experience"></a>
## 模型體驗

### Claude Code 提示

#### 模型看到的內容

Claude Code 的模型看到 Claude Code 自己的 `claude_code` 系統提示、由 `resume` 恢復的原生記錄，以及一個提示：結尾由人撰寫的使用者訊息文字，以空行連線。原生記錄缺少更早的訊息時，提示以 `<conversation_history>` 塊開頭，每條含文字的早先訊息對應一個 `<user>`、`<assistant>` 或 `<tool result>` 元素；助手工具呼叫渲染為 `[tool call <name>: <arguments>]`，推理內容被省略，外掛插入的使用者訊息被捨棄。

#### Token 影響

每次請求加入結尾使用者文字。引用歷史塊只在原生記錄缺少該歷史的請求中傳送，其大小等於被引用訊息的文字。harness 工具 schema 與 harness 系統提示不增加任何內容。Claude Code 自己的工具使用、壓縮和系統提示所增加的 token 由 Claude Code 負責。

#### KV Cache 影響

續接的回合追加到原生記錄，因此複用取決於 Claude Code 自身對其字首的快取。引用歷史的請求會開始新的原生對話，並可能使早先原生字首的複用失效。

### 應用瀏覽器工具

#### 模型看到的內容

當組合掛載了應用 Browser 時，對話回合會增加一個 MCP 伺服器 `app_browser`，其中有一個始終載入的工具 `open_browser_tab(url)`，描述為 "Open an http or https URL in a new tab of the browser the user sees in the app."，並附帶伺服器說明："The user works in an app that has its own browser. To show the user a web page, including a local development server, call open_browser_tab with its http or https URL. Do not open an external browser, for example with the open, xdg-open, or start commands." 輔助呼叫兩者都不會收到。

#### Token 影響

每個對話回合增加工具 schema 與說明，大小固定，與對話無關；每次呼叫增加其 URL 和一行結果。

#### KV Cache 影響

工具定義與說明在每個回合都相同，因此留在 Claude Code 可複用的字首內；加入或移除應用 Browser 會讓該字首改變一次。

### Harness 歷史

#### 模型看到的內容

之後在其他路由上的請求會把這些助手訊息的文字與推理塊——包括 `Claude Code ran <tool>: <subject>` 行——作為普通的 agent loop 歷史接收。

#### Token 影響

保留的助手訊息會因每個頂層工具呼叫增加一行短文字，並加上 Claude Code 的文字與思考內容。

#### KV Cache 影響

僅追加：每個回合在可複用字首之後增加一條助手訊息，不會改寫任何早先歷史。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **harness 工具不會被使用**——路由忽略 preset 的工具 schema；由 Claude Code 自己的工具、MCP 伺服器和其設定中的技能取代。
- **僅支援文字輸入**——圖片附件會以 `UNSUPPORTED_CONTENT` 失敗；路由向模型選擇器宣告僅接受文字輸入。
- **應用瀏覽器工具只引導、不阻止**——其說明要求 Claude Code 不要啟動外部瀏覽器，但只要 Session 權限允許，shell 的 `open` 命令仍可執行。
- **工具活動是一行文字**——頂層工具呼叫與失敗結果渲染為推理行而非工具卡片，成功的工具結果留在 Claude Code 內部。
- **沒有提問通道**——由於不存在 harness 提問橋接，`AskUserQuestion` 被停用；Claude Code 改為在回答文字中提問。
- **輔助呼叫的輸出上限僅供參考**——Session 標題或壓縮呼叫的 `maxTokens` 會被接受，但由 Claude Code 執行自己的輸出上限。
- **harness 壓縮衡量的是另一份上下文**——preset 的壓縮會透過單回合 Claude Code 呼叫總結 harness 歷史；下一回合隨後從該摘要開始新的原生對話，而 Claude Code 也會自行壓縮其記錄。
- **原生記錄位於 Session 之外**——刪除 harness Session 會把 Claude Code 的記錄留在主機的 Claude 設定目錄中，而原生記錄被移除的請求會失敗。
- **分發條款**——本路由使用主機使用者自己的 Claude Code 登入；在託管部署中把該登入提供給其他使用者，需要取得 Anthropic 的批准。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作背景——點選展開</summary>

本開發備註是維護者的工作背景：尚未解決的問題與未定方向。它明確不具權威性——已交付的行為與限制以上方各節和包程式碼為準。

- **共享程序介面卡**——本路由從 `dsh-subagent-claude-code` 匯入 `ManagedClaudeCodeProcess` 與 `claudeSpawnSpec`；獨立的 Claude Code 程序庫可讓本路由去掉該 peer 依賴。
- **更豐富的活動顯示**——外掛自有的內容塊加上 Web Chat 節點渲染器，可以把 Claude Code 的工具呼叫與結果顯示為卡片。

</details>

**執行時不變數：** 不釋出配套模組。本路由不擁有任何可被獨立觀察推翻的關係；replay 驗證與程序樹靜止由使用它們的操作內部強制執行。
