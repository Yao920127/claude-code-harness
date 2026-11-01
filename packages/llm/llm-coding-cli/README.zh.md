---
description: "面向希望在 harness 中以各 CLI 自己的登入、無需 API 金鑰與 Codex、Antigravity、Grok Build 或 OpenCode 對話的使用者，以及這些路由維護者的 coding CLI 模型路由。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-llm-coding-cli

[English](README.md) | 中文

## 概述

安裝這個 Profile Bundle，即可在 harness Session 中與已安裝的 coding CLI 對話，無需 API 金鑰。它為每個 CLI 註冊一條模型路由——`codex-cli`、`antigravity-cli`、`grok-cli` 與 `opencode-cli`——列出該 CLI 自己的模型選擇器顯示的模型，包括閘道加入的模型。每次模型呼叫都會在 Session 工作區中執行該 CLI 的一個完整 headless 回合，使用該 CLI 自己的登入並附上提示中的圖片；harness 顯示回答、思考過程，並把 CLI 執行的每個工具呼叫顯示為工具卡片。Claude Code 請選擇 [`dsh-llm-claude-code`](../llm-claude-code/README.zh.md)。

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

在執行 harness 的機器上安裝想使用的每個 CLI，並用它自己的登入方式登入一次：`codex login`、`agy`（Antigravity 首次啟動時登入）、`grok login` 或 `opencode auth login`。CCH Desktop 歡迎頁與「設定 → 模型」底部的「以登入使用」清單執行同樣的登入並顯示各 CLI 的狀態。這些路由與模型設定中的 API 金鑰供應商（例如 pi-ai 的 `openai-codex` 與 `opencode`）分開，後者需要各自的金鑰。這些路由從不讀取、複製或修改已儲存的憑證，harness 也會從繼承的環境中移除 `OPENAI_API_KEY` 等憑證類變數。沒有可用登入的回合會以 CLI 自己的錯誤訊息失敗。

### 安裝 Bundle

把本包安裝到目標 Profile，然後重新啟動該 Profile。CCH Profile（包括 Desktop 應用）預設已組合本包。

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-llm-coding-cli
dsh --profile <name>
```

Bundle patch 插入四條路由列 `llm-codex`、`llm-antigravity`、`llm-grok` 與 `llm-opencode`，以及渲染工具卡片的 [`ui-coding-cli-tools`](../../client/ui-coding-cli-tools/README.zh.md) 列。在 Web 應用中，於輸入框的模型選擇器裡的 Codex、Antigravity、Grok Build 或 OpenCode 下選擇模型。每條路由先列出 `<CLI> (CLI settings)`——它不傳送模型，因此由 CLI 自己的設定選擇——接著列出 CLI 回報的模型：

| 路由 | CLI | 模型列表 | Effort 列 |
|---|---|---|---|
| `codex-cli` | `codex` | `codex debug models` 中 Codex 在 `/model` 顯示的項目 | Codex 為每個模型回報的推理等級；提供 `defaultEffort` 時從它開始，否則從 Codex 的預設等級開始 |
| `antigravity-cli` | `agy` | `agy models` | 無；模型 id 已帶有 effort |
| `grok-cli` | `grok` | `grok models` | 無 |
| `opencode-cli` | `opencode` | `opencode models` | 無 |

路由在選擇器第一次詢問時，從一個短暫的 CLI 程序讀取列表，並在 `modelsFreshMs` 內重複使用。未安裝的 CLI 只列出其 CLI settings 項目，在其上執行的回合會以 `CODING_CLI_NOT_INSTALLED` 失敗。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `cli` | 必填 | `codex`、`antigravity`、`grok` 或 `opencode` |
| `provider` | `cli` 的值加上 `-cli` | 註冊到 `ctx.llm` 的路由名稱；每個掛載的實例都需要唯一值。後綴讓登入路由與同一廠商的 API 金鑰路由（例如 pi-ai 的 `opencode`）分開 |
| `displayName` | CLI 的名稱 | 模型選擇器顯示的路由標籤 |
| `models` | 自動發現 | 可選模型；缺省或空列表時列出 CLI 的模型。id `default` 不傳送模型；項目可選的 `efforts` 與 `defaultEffort` 設定其 Effort 列 |
| `executable` | 自動搜尋 | CLI 的絕對路徑；缺省時搜尋 PATH、`/opt/homebrew/bin`、`/usr/local/bin`、`~/.local/bin`、`~/.bun/bin`、`~/.npm-global/bin` 與 CLI 自己的安裝目錄。不存在的路徑在載入時失敗 |
| `defaultEffort` | `medium` | 模型提供該等級且 Session 未指定時的起始推理強度；否則套用 CLI 自己的預設 |
| `access` | `session` | `session` 跟隨每個 Session 的權限預設；`read-only`、`workspace-write` 或 `full-access` 固定每個回合 |
| `env` | `{}` | 疊加在已清除憑證的父環境之上的明確環境變數 |
| `disposeGraceMs` | `3000` | CLI 程序各終止階段之間的寬限時間 |
| `discoveryTimeoutMs` | `60000` | 模型列表命令可執行的毫秒數 |
| `discoveryMaxBytes` | `16777216` | 接受的模型列表輸出上限（位元組） |
| `modelsFreshMs` | `300000` | 一份模型列表在再次詢問 CLI 之前回應選擇器的毫秒數 |
| `retryPolicy` | `{ mode: normal, maxRetries: 0 }` | 模型請求重試策略；預設從不重試，因為失敗的回合可能已經修改了檔案 |

產生的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-coding-cli)是所有可接受欄位的完整來源。

### 權限

headless CLI 無法向 harness 請求批准，因此每個回合都在一個由 CLI 自己執行的存取等級下執行。在預設的 `session` 設定下，完全存取（`danger-full-access` 搭配 `never` 策略）執行 `full-access`；其他完全存取組合與 `workspace-write` 執行 `workspace-write`；`read-only`，以及沒有 sandbox 或批准服務的組合，執行 `read-only`。Session 標題等輔助呼叫一律執行 `read-only`。

| 等級 | Codex | Antigravity | Grok Build | OpenCode |
|---|---|---|---|---|
| `read-only` | `--sandbox read-only` | 預設審查模式 | `--permission-mode default` | 預設權限 |
| `workspace-write` | `--sandbox workspace-write` | `--mode accept-edits` | `--permission-mode acceptEdits` | 預設權限 |
| `full-access` | `--dangerously-bypass-approvals-and-sandbox` | `--dangerously-skip-permissions` | `--permission-mode bypassPermissions` | `--auto` |

各 CLI 自己的權限規則優先套用；需要互動式提示的操作會被 CLI 拒絕。

### 圖片

附在提示中的圖片會送到 CLI。路由把每張圖片從附件儲存區複製到一個回合結束時就刪除的暫存目錄，並以 CLI 接受圖片的方式附上：

| CLI | 附加方式 |
|---|---|
| Codex | `--image <file>` |
| OpenCode | `--file <file>` |
| Grok Build | `--prompt-json` 中的內嵌圖片區塊；超過 360 KiB 的圖片改送附件儲存區產生的較小版本 |
| Antigravity | 提示中的 `file://` 連結，由 Antigravity 用自己的檔案工具讀取；圖片目錄以 `--add-dir` 加入其工作區 |

CLI 記錄缺少的較早訊息中的圖片，會在引用歷史中顯示為 `[image]`。模型能否看見圖片取決於所選模型。

### 你會看到什麼

助手訊息把 CLI 的思考作為推理、回答作為文字。CLI 回報的每個工具呼叫都會在 Web 對話中顯示為工具卡片，並記錄為 `coding-cli/tool` Session 事件：路由把 CLI 的工具名稱對應到 harness 工具（`bash`、`read`、`write`、`edit`、`grep`、`glob`、`web_search`、`web_fetch`），因此 CLI 的命令會顯示為與 harness 命令相同、附輸出的終端機卡片。沒有 harness 對應工具的工具保留其原本的名稱與參數。回合完成卻沒有任何回答文字時，訊息會說明原因，例如 CLI 在 headless 模式下拒絕的權限。

### 失敗與恢復

| 失敗 | 程式碼 | 恢復方式 |
|---|---|---|
| 未安裝 CLI | `CODING_CLI_NOT_INSTALLED` | 安裝 CLI 並登入，然後再次傳送 |
| CLI 回報回合失敗，或未完成回合就結束 | `CODING_CLI_FAILED` | 閱讀錯誤中 CLI 的訊息，例如重新登入，然後再次傳送 |
| 請求沒有 Session 工作區 | `NO_WORKSPACE` | 從有工作目錄的 Session 傳送 |
| temperature 或停止序列 | `UNSUPPORTED_OPTION` | 移除該選項 |
| 沒有掛載附件儲存區時附上圖片 | `UNSUPPORTED_CONTENT` | 掛載附件儲存區，或只傳送文字 |

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內部細節——點選展開</summary>

### 設計概念

- **一次模型呼叫就是一個 CLI 回合。** 路由是普通的 `LlmAdapter`；CLI 執行自己的工具，因此路由不向它提供 preset 的任何工具，loop 看到一條不含工具呼叫的助手訊息並結束該步驟。
- **CLI 的記錄儲存其上下文。** harness 日誌儲存渲染後的對話；助手訊息的 replay 狀態儲存 CLI 與其對話 id。同一 CLI 的下一次請求延續該對話，使重試、fork 與恢復的 Session 都從持久的 harness 訊息繼續。
- **CLI 自己的設定保持權威。** 路由以使用者的設定執行已安裝的 CLI，因此其登入、供應商、閘道、hooks 與指示都不受影響。

### 原始碼地圖

| 檔案 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛進入點：設定 schema 與路由註冊 |
| [`src/clis.ts`](src/clis.ts) | 各 CLI 的模型列表與回合參數 |
| [`src/adapter.ts`](src/adapter.ts) | 模型發現、回合程序生命週期與輸出讀取 |
| [`src/request.ts`](src/request.ts) | 請求驗證、對話選擇與提示渲染 |
| [`src/events.ts`](src/events.ts) | 各 CLI 的 JSON 行解碼器與依欄位名稱的備援解碼器，輸出同一套事件詞彙 |
| [`src/images.ts`](src/images.ts) | 回合專屬的暫存圖片檔 |
| [`src/tools.ts`](src/tools.ts) | 以 harness 用語表示的 CLI 工具名稱與參數 |
| [`src/tool-events.ts`](src/tool-events.ts) | 為回報的工具呼叫寫入 `coding-cli/tool` Session 事件 |
| [`src/types.ts`](src/types.ts) | `coding-cli/tool` 事件的資料 |
| [`src/stream.ts`](src/stream.ts) | 事件到串流 chunk 的轉換、用量與終止對應 |
| [`src/models.ts`](src/models.ts) | 模型列表解析器與 effort 選項 |
| [`src/access.ts`](src/access.ts) | 由路由設定與 Session 權限決定回合存取等級 |
| [`src/locate.ts`](src/locate.ts) | CLI 執行檔搜尋與 CLI 程序的 PATH |
| [`src/replay.ts`](src/replay.ts) | 儲存 CLI 對話 id 的版本化 replay 狀態 |
| [`cordis.patch.yml`](cordis.patch.yml) | 插入四條路由與工具卡片外掛的 Profile patch 層 |

### 請求流程

`planTurn()` 拒絕 temperature 與停止序列，並收集提示訊息中的圖片。它找到最新一條 replay 狀態指向同一 CLI 的助手訊息，並把其後尾端使用者訊息中由人撰寫的文字作為提示傳送；執行期上下文快照等由外掛插入的使用者訊息會被丟棄，除非尾端訊息中沒有其他內容。從該處到尾端使用者訊息之間的訊息——沒有此類 replay 狀態時則是全部訊息——會在提示前以 `<conversation_history>` 區塊引用一次。輔助呼叫（設定了 `purpose`）從不延續對話，並把其系統提示放在開頭的 `<instructions>` 區塊中傳送。

adapter 從請求的 Session，或從發起的 Agent，解析工作區；兩者都沒有時，在啟動 CLI 前以 `NO_WORKSPACE` 失敗。CLI 程序在 `ctx.subprocess` 下執行，工作目錄與 `PWD` 都是 Session 工作區；Codex 從標準輸入接收提示，其他 CLI 則以單一 `--flag=value` 或 `--` 之後的參數接收，因此提示文字永遠不會被解析為選項。OpenCode 以 `--standalone` 執行，因為其共享背景服務保留自己的目錄。串流的 `finally` 終止程序樹並等待其結束。

### 串流轉換

每一行可解析為 JSON 的標準輸出都會經過該 CLI 的解碼器；其他行會保留（上限 64 KiB）作為純文字回答。CLI 解碼器不認識的記錄類型會交給依欄位名稱解碼的備援解碼器，它讀取 coding CLI 常用於文字、思考、工具呼叫、對話 id、錯誤與最終回答的欄位名稱，因此 CLI 版本重新命名或新增記錄類型時仍能持續串流。文字與思考的增量會延伸同類型的開啟區塊；工具呼叫會關閉開啟的區塊並記錄為 `coding-cli/tool` 事件，後續省略名稱與輸入的狀態會沿用第一次的值。沒有串流出回答文字時，依序以 CLI 的完整回答、正常結束時的純文字輸出、或回合未產生回答的原因作為回答。用量來自 CLI 的回合或最後一步計數器，輸入 token 包含快取讀取。CLI 回報完成，或以代碼 0 結束且沒有失敗時，回合以 `stop` 結束並把 CLI 對話 id 作為 replay 狀態；否則以 `error` 結束，附上 CLI 的失敗、CLI 警告或標準錯誤的最後幾行。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [LLM 串流子系統](../../../docs/subsystems/llm-streaming.zh.md)——這些路由實作的 adapter 合約、串流 chunk 與 replay 狀態。
- [Claude Code 模型路由](../llm-claude-code/README.zh.md)——透過 Agent SDK 執行 Claude Code 的同類路由。
- [新增 LLM adapter](../../../docs/cookbook/adding-an-llm-adapter.zh.md)——每個 adapter 都要遵守的協定義務。

<a id="model-experience"></a>
## 模型體驗

### CLI 提示

#### 模型看到的內容

CLI 的模型看到 CLI 自己的系統提示、所延續對話的 CLI 記錄、提示訊息中的圖片，以及一段提示：尾端由人撰寫的使用者訊息文字，以空行連接。當 CLI 記錄缺少較早的訊息時，提示以 `<conversation_history>` 區塊開頭，每條有文字的較早訊息對應一個 `<user>`、`<assistant>` 或 `<tool result>` 元素；助手工具呼叫渲染為 `[tool call <name>: <arguments>]`，推理被省略，外掛插入的使用者訊息被丟棄。較早的圖片渲染為 `[image]`。對 Antigravity，提示以 `Attached images (read them before answering):` 與每張圖片一個 `[image-N](file://…)` 連結開頭。輔助呼叫的提示以包含其系統提示的 `<instructions>` 區塊開頭。

#### Token 影響

每次請求加入尾端使用者文字與其圖片。引用歷史區塊只在 CLI 記錄缺少其歷史的請求中傳送，大小等於被引用訊息的文字。harness 工具 schema 與 harness 系統提示不增加任何內容。CLI 自己的工具使用、壓縮與系統提示所增加的 token 由 CLI 負責。

#### KV Cache 影響

延續的回合附加到 CLI 記錄之後，因此重用取決於 CLI 自己對其前綴的快取。引用歷史的請求會開始新的 CLI 對話，可能使較早前綴的重用失效。

### Harness 歷史

#### 模型看到的內容

之後在其他路由上的請求，會把這些助手訊息的文字與推理區塊作為一般的 agent-loop 歷史接收。`coding-cli/tool` 事件只記錄於日誌，從不進入模型請求。

#### Token 影響

保留的助手訊息包含 CLI 的文字與思考；工具呼叫不會增加其內容。

#### KV Cache 影響

只附加：每個回合在可重用前綴之後加入一條助手訊息，不改寫任何較早的歷史。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **沒有批准提示**——headless CLI 無法詢問 harness，因此回合在單一存取等級下執行，需要提示的操作會被 CLI 拒絕。
- **harness 工具不會被使用**——路由忽略 preset 的工具 schema；由各 CLI 自己的工具、MCP 伺服器與技能取代。
- **Antigravity 用自己的工具讀取圖片**——它不接受內嵌圖片，必須對連結的檔案呼叫檔案工具；略過該呼叫的模型會在沒看到圖片的情況下回答。
- **工具卡片排在該步驟回答之前**——回答在 CLI 回合結束時、工具事件之後才記錄，因此 CLI 在工具呼叫之間寫的文字會出現在卡片之後。
- **備援解碼器讀取常見欄位名稱**——CLI 版本若把記錄改用不常見的名稱，或回報的工具呼叫沒有名稱欄位，在 CLI 解碼器跟上之前仍會遺失該活動。
- **CLI 記錄位於 Session 之外**——刪除 harness Session 會把 CLI 自己的對話留在 CLI 的資料目錄中。
- **沒有方案用量**——側欄的方案用量只涵蓋 Claude Code。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作背景——點選展開</summary>

本開發備註是維護者的工作背景：尚未解決的問題與未定方向。它明確不具權威性——已交付的行為與限制以上方各節和包程式碼為準。

- **批准橋接**——Codex 的 app server、Grok 的 `agent stdio` 與 OpenCode 的伺服器都以協定公開批准請求；把它們橋接到 `ctx.approval` 可讓 `session` 存取改為詢問，而非固定一個等級。

</details>

**執行時不變數：** 不釋出配套模組。這些路由不擁有任何可被獨立觀察推翻的關係；replay 驗證與程序樹靜止由使用它們的操作內部強制執行。
