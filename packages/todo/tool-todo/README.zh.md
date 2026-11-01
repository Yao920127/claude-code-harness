---
description: "面向 DeepSeek Harness 工作階段日誌的模型側 todo_write 工具：整表替換、單一工作階段歸屬與 todos 投影，供選擇、設定或排查該工具的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-todo

[English](README.md) | 中文

## 概述

`dsh-tool-todo` 為 agent（智慧代理）提供一份可用於規劃的結構化任務列表：把多步工作拆成具體任務、標記正在進行的任務、完成後逐項勾掉。列表跨輪次、跨重新開啟的工作階段持續存在，agent 與 UI 始終看到最新計劃。一個設定開關決定是否允許多個任務同時處於進行中，適用於並行開展工作的 agent。凡是希望 agent 維護可見任務列表的情境都可以使用它；每次更新整體替換列表，只有擁有該列表的 agent 工作階段才能修改。

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

當你希望 agent 在工作時維護一份可見的任務列表時使用本包：規劃多步工作、展示目前進行中的任務、記錄完成情況。掛載它並設定並行開關是唯一的設定步驟；此後每次計劃變化，agent 都會透過它自己的規劃工具更新列表。

### 何時選擇

當某個 agent 工作階段應當擁有任務列表、且整表更新即可滿足需求時選擇它——這是規劃工具的常見形態。當多個 agent 必須共享同一份列表、或需要逐項編輯時，請避開：列表只屬於一個 agent，每次更新都會替換整個列表。它要求環境中確實存在 agent 工作階段；從不執行 agent 的純自動化入口無法使用它。

### 最小設定

`allowParallelInProgress` 是必填項、沒有預設值：省略它的組合會在載入時失敗，非布林值也會被拒絕。可能並行執行工作的 agent（subagent、後臺命令、工作流扇出）設為 `true`，需要單活躍項紀律的設為 `false`。

```yaml
- name: '@deepseek-ai/dsh-tool-todo'
  config:
    allowParallelInProgress: true
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `allowParallelInProgress` | 必填 | 是否允許多個 todo 同時處於 `in_progress`；同時選擇模型描述中的活躍狀態條款 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-todo)是每個受支援欄位的窮盡式真源。

### 每次呼叫做什麼

agent 每次更新都傳送完整列表；新列表替換舊列表，因此沒有部分更新或逐項編輯。每個條目是一句簡短的任務描述，外加 `pending`、`in_progress` 或 `completed` 狀態。成功的更新會返回新的計數——`Updated todo list: <pending> pending, <inProgress> in progress, <completed> completed.`——UI 隨即展示新計劃。任務描述為空或重複、條目帶有描述與狀態之外的欄位、或（停用並行時）多個任務被標記為進行中，這些情況下更新都會明確失敗。

### 單一所有者

任務列表屬於建立它的那一個 agent 工作階段——subagent 與其他 agent 各自維護自己的列表，不存在跨 agent 共享列表的方式。來自 agent 工作階段之外的呼叫會被拒絕，因此 agent 會得知更新失敗，而不是被靜默丟棄。如果你需要多個 agent 共享同一份列表，本包不提供該能力。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋工具背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本工具建立在四項承諾之上：

- **整表替換、日誌承載狀態。** 模型重新傳送整個列表；`todo/write` 快照存放在事件溯源的工作階段日誌上，永續性、回放與恢復重建都來自日誌而非服務。
- **單一所有者。** 列表屬於呼叫 agent 工作階段；不存在共享或 swarm 作用域，非 agent 呼叫方會被拒絕。
- **部署策略，而非編碼規則。** `allowParallelInProgress` 是必填組合選擇，因為工具無法觀測執行時並行；持久日誌不變式刻意不跟隨它，因此一種策略下寫入的日誌在切換到另一種策略後仍可回放。
- **驗證確保日誌快照如實反映輸入。** schema 層拒絕未知鍵、`execute` 層拒絕空或重複 content，使持久快照與模型自認為寫入的內容一致。

[todo_write 工具 Agent Note](../../../.agents/notes/archived/feature/2026-06-29-todo-write-tool.md) 記錄原始設計與備選方案；[並行 in-progress Agent Note](../../../.agents/notes/archived/feature/2026-07-26-todo-parallel-in-progress.md) 記錄該策略決策。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、工具註冊、`todos` 投影單元 |
| [`src/types.ts`](src/types.ts) | `todos` 投影鍵宣告及其載荷型別的唯一歸屬地 |
| [`src/client.ts`](src/client.ts) | 用戶端名稱空間對型別出口的再匯出 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：驗證持久整錶快照與開放輪次歸屬 |

### 匯出形狀

本外掛是函式／名稱空間外掛：匯出 `name`、`inject`、`apply`，沒有預設匯出。多餘的 `export default` 會讓 Loader 的 `unwrapExports` 摺疊模組並丟棄 `inject`（參見 [postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.zh.md)）。

### 工作階段投影

當組合掛載 `ctx.sessionProjections`（[`@deepseek-ai/dsh-session-projection`](../../session/session-projection/README.zh.md)）時，本包在注入的子外掛中註冊 `todos` 單元：投影即有效計劃——最新的整份 `todo/write` 列表，首次寫入前為 `null`，下一輪次開始時清空，而 `turn/end` 保留剛完成的清單。該鍵在此處合併進 `SessionProjectionMap`；載體透過歷史尾頁與 `session/projection` 推送幀提供該值。未掛載註冊表的組合不受影響；單元註冊見 [src/index.ts](src/index.ts)。

### 持久日誌不變式

不變式伴生外掛註冊到 `ctx.invariants`，先分別驗證既有工作階段與新公佈工作階段一次，再為即時追加推進按工作階段提交的輪次軌跡。它會拒絕畸形條目、空或重複 content、未知狀態，以及開放輪次之外的持久 `todo/write`；核心 session 通用處理宣告合併事件，而本生產包擁有 todo 專用規則。它刻意不約束有多少條目處於 `in_progress`，因為那是工具按部署制定的策略，而非持久資料規則。

### 呼叫機制

每次呼叫都會先驗證提交的列表是否符合 schema，拒絕不一致的輸入，成功後把完整快照作為 `todo/write` 工作階段事件追加並返回新的計數；目前列表始終是日誌中最近一次 `todo/write`（回放時後寫覆蓋先寫）。確切的驗證與追加步驟見 [src/index.ts](src/index.ts)。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從工作階段子系統逐步進入生成的目錄，以及工具背後的決策記錄。

- [Todo 子系統](../../../docs/subsystems/todo.zh.md)——`todo/write` 事件載荷、歸屬規則與 `TodoItem`。
- [todo 組對映](../README.zh.md)——同級組頁面及其包表格。
- [生成的工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-todo)——模型接收的 `todo_write` schema。
- [生成的設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-todo)——每個受支援設定欄位及其源宣告。
- [todo_write 工具 Agent Note](../../../.agents/notes/archived/feature/2026-06-29-todo-write-tool.md)——原始設計、備選方案與未採納的欄位。
- [並行 in-progress Agent Note](../../../.agents/notes/archived/feature/2026-07-26-todo-parallel-in-progress.md)——為何活躍計數上限成為部署策略。

-----

<a id="model-experience"></a>
## 模型體驗

### 工具 schema

#### 模型看到什麼

模型會看到生成的 [`todo_write` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-todo)：一個物件，含一個必填的 `todos` 陣列，元素為 `{ content, status }`，其中 `status` 為 `pending`、`in_progress` 或 `completed`。`todos` 描述說明每次呼叫都會替換整個列表；工具描述中的活躍狀態條款跟隨 `allowParallelInProgress`。

#### Token 影響

工具可見的每個請求都有固定 schema 開銷；在給定設定下描述與 schema 保持穩定。

#### KV Cache 影響

定義與可見性不變時字首保持穩定。外掛生命週期或作用域限制可能使從此 schema 起的複用失效。

### 工具呼叫歷史與結果

#### 模型看到什麼

每次 assistant 工具呼叫都會在參數中保留整個替換列表。成功時原樣返回 `Updated todo list: <pending> pending, <inProgress> in progress, <completed> completed.`。穩定失敗文字為 ``Error: invalid todo: `content` must be a non-empty string``、`Error: invalid todos: duplicate content "<content>"`、`Error: todo_write requires an owning agent session`，以及——僅在部署設定 `allowParallelInProgress: false` 時——`Error: invalid todos: at most one task may be in_progress (got <n>)`。完整的 `todo/write` 工作階段事件是 UI 與回放狀態，而非第二條模型訊息。

#### Token 影響

token 用量隨模型每次提交的完整列表增長，這些呼叫參數會保留到壓縮（compaction）。結果本身很小且形狀固定。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使既有 KV-cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工具何時不合適。它們是目前包約束，不是任務積壓。

- **僅單一所有者作用域**——列表屬於唯一呼叫 agent 工作階段；subagent、共享與 swarm 作用域是有意設定的限制，非 agent 呼叫方會被拒絕。
- **條目形狀刻意保持最小**——`content` 加三態 `status`；整表替換不需要穩定 id、優先順序或 active-form 欄位。
- **整表替換是唯一操作**——沒有部分更新、沒有回讀工具、沒有逐項編輯；模型每次呼叫都必須重新傳送完整列表。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：未決問題與尚未決定的方向。它明確不具權威性——已交付行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 未來：跨 agent 與共享列表

單一所有者作用域是有意設定的限制，跨 agent 或共享列表仍是獨立的未來設計：它們需要逐項日誌增量與顯式作用域選擇，並會改變模型可見約定。目前尚不存在設計。

</details>
