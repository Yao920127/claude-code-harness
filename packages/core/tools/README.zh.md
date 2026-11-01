---
description: "面向工具作者與維護者的工具註冊表與執行流水線說明，用於註冊、限制、呈現或除錯面向模型的工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tools

[English](README.md) | 中文

## 概述

使用 `dsh-tools` 可向模型公開型別化能力、驗證呼叫、執行允許／拒絕／詢問策略，並在普通工具失敗時返回最終結果而不中止目前輪次。透過 `mode` 選擇原生 Function Calling（函式呼叫）、[PTC mode](#ptc-mode) 或兩者；單個 agent（智慧代理）可用 `presentAs` 覆蓋預設值。工具作者使用 `defineTool` 宣告型別化參數與輸出、協作式超時、並行安全屬性和可選 UI 展示。模型會看到每個獲准工具宣告的名稱、描述與參數 schema；按 agent 設定的限制可縮小該可見集合。

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

在任何 agent 呼叫工具的地方掛載 `dsh-tools`：它提供 `ctx.tools`，即每個工具外掛註冊進去、迴圈分發所經過的註冊表。註冊一個工具就足以讓它可見——註冊表會自動把其 schema 送入系統提示片語裝。

### 註冊工具

`defineTool` 建置型別化工具定義：面向模型的名稱、描述與參數 schema、規範輸出宣告，以及只返回所宣告 JSON 值的 `execute` 主體。模型參數在執行前被驗證；無效輸入變成普通錯誤結果。

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

declare const ctx: Context

ctx.tools.register(defineTool({
  name: 'read_file',
  description: 'Read a file from disk.',
  parameters: {
    path: { type: 'string', required: true, description: 'Absolute file path' },
    offset: { type: 'number' },
    limit: { type: 'number' },
  },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args, exec) {
    // args is typed: { path: string; offset?: number; limit?: number }
    return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
  },
}))
```

統一 schema DSL 支援 `string`、`number`、`integer`、`boolean`、`null`、`array`、`object`、僅供作者使用的 `json` 與恰好匹配一個分支的 `oneOf`；`InferValue` 在 16 層容器內保留精確型別，之後加寬為 `JsonValue`。原始 JSON Schema（`JsonSchemaNode`）是與 subagent、工作流和 MCP 共享的協定級對應型別。

### 設定呈現模式

`mode` 設定決定模型看到什麼：`native`（每個可見 schema）、`ptc`（只有 `run_code` 加一份生成 SDK）或 `both`。

```yaml
- name: '@deepseek-ai/dsh-tools'
  config:
    mode: native
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `mode` | `native` | 可見工具向模型呈現的方式：`native`、`ptc` 或 `both` |
| `maxParallelSubCalls` | `10` | `run_code` 程式重疊子呼叫的並行上限；`1` 恢復嚴格序列分發 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tools)是每個受支援欄位的窮盡式真源。非原生模式要求已組合的 `ctx.ptcRuntime` 且其語言有已註冊的 SDK 渲染器；agent preset 透過 [`dsh-agent-tool-presentation`](../agent-tool-presentation/README.zh.md) 自行選擇呈現方式，單個 agent 可用 `presentAs(mode)` 遮蔽預設值。

### 按 agent 限制工具

`ctx.tools.restrict(filter)` 對單個 agent 繼承的全域工具應用允許或拒絕掩碼；掩碼取交集，作用域註冊保持可見，限制在 dispose（資源釋放）時解除。`ctx.tools.get(name, scope)` 按一個作用域的視角解析工具。使用 Host 本地展示轉換器的消費方如需匹配實際執行的定義，會傳入發起呼叫的 agent。`ctx.tools.schemas(scope)` 返回可見 schema（不含 `execute` 函式）。

### 對呼叫實施策略

`ctx.tools.guard(guard)` 在可擴充功能的 `tools/pre-execute` waterfall（瀑布式事件）之後註冊單調同步守衛：返回的理由會拒絕呼叫，後續監聽器無法把該拒絕重新變為允許。流水線事件給外掛更多控制——`tools/pre-execute` 決定允許／拒絕／詢問，`tools/execute` 為超時或重試包裝分發，`tools/post-execute` 檢查或替換結果，`tools/result` 觀測凍結的最終結果。

工具的 `projectContent` 在執行後策略之前安裝執行期間準備的圖文內容。策略仍可替換或阻止這些內容；`finalizeContent` 保留為策略之後的最終內容處理。

### Host 展示描述

工具可以為 Host 本地消費方保留純函式 `presentCall()` 與 `presentResult()` 方法。內建 Web Client 不消費這些值，而是透過 `tool.call.toolview` 選擇 renderer，並從原始呼叫參數、結果內容、失敗狀態與持久 metadata 派生 card props。[Client 派生展示決策](../../../.agents/notes/implemented/architecture/2026-08-23-client-derived-tool-presentation.zh.md)負責該 transport 拆分。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該包如何實作上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

註冊表在作用域層中持有型別化 `ToolDefinition`，並在請求時把它們投影為面向模型的 `ToolSchema` 集合——`output`、`execute`、`finalizeContent`、`timeoutMs` 與呈現回呼絕不會洩漏到協定上。每次呼叫都執行一條固定流水線：`tools/pre-execute`（可擴充功能的允許／拒絕／詢問）→ 已註冊單調守衛 → `tools/execute`（環繞分發包裝層）→ `tools/post-execute`（檢查／替換、附加上下文）→ 由定義持有的 `finalizeContent` → 僅觀測的 `tools/result` 事件。只有 `tools/execute` 檢視可以替換必填訊號，註冊表會在呼叫主體前重新融合呼叫方訊號。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`ToolRuntime` 服務、設定、註冊表、執行流水線 |
| [`src/types.ts`](src/types.ts) | `ToolDefinition`、`ToolExecution`、`ToolExecutionResult`、守衛與決策型別 |
| [`src/schema.ts`](src/schema.ts) | `defineTool` DSL：`ValueSchemaSpec`、`ParameterSchemaSpec`、`InferValue`、`InferArgs` |
| [`src/json-schema.ts`](src/json-schema.ts) | 強制執行的原始 JSON Schema 子集與驗證 |
| [`src/presentation.ts`](src/presentation.ts) | 帶 `card` 標籤的 UI 呈現意圖 |
| [`src/ptc.ts`](src/ptc.ts) | PTC mode：SDK 生成、`run_code` 分發橋接層、結算 |
| [`src/ts-types.ts`](src/ts-types.ts) | TypeScript SDK 型別渲染 |
| [`src/py-types.ts`](src/py-types.ts) | Python SDK 型別渲染 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套 |

### 執行與取消

每次型別化呼叫都會實體化並凍結解析後的參數、分配不透明關聯 token，再執行策略與分發。pre-execute 拒絕可以在模型可見原因旁附帶 `ToolErrorInfo`；原生與 PTC 持久投影會保留結構化名稱、程式碼與可選使用者可見原因，但不會把該詳情加入模型內容。取消採用協作式並等待完全停穩：每個工具主體都收到呼叫方擁有的 `exec.signal` 且必須觀測它；呼叫主體前的取消為 `ABORTED_BEFORE_DISPATCH`，呼叫主體後的取消只能把成功結果替換為 `ABORTED`。拒絕、包裝層失敗、工具失敗、後置策略失敗與超時產生的 `TOOL_TIMEOUT` 仍保留更具體的結果。未知工具與丟擲異常的工具都會變成結構化錯誤（`UNKNOWN_TOOL`），因此呼叫會失敗而不會結束輪次。

### PTC mode

在 `ptc` 或 `both` 下，註冊表公開保留的 `run_code` 傳輸以及按所載入執行時語言生成的確定性 SDK。每個 SDK 繫結捕捉凍結的 ToolSchema，經由排程器傳入該次執行上下文。已開始的呼叫在策略之前只記錄配對 id、名稱和規範化參數；其結算事件保留渲染結果與可選結構化錯誤。描述與參數 schema 僅臨時存活，不進入 Session 事件或 SDK 輸出。呼叫透過複用原生並行約定的每次執行獨有池排程。在純 `ptc` 下，模型直呼其他任何可見工具都會在策略之前解析為 `UNKNOWN_TOOL`——通告面與可呼叫面保持一致。中間繫結值只存在於執行區域性；只有外層 `run_code` 結果有硬大小上限。[執行器塌縮 note](../../../.agents/notes/implemented/bug-fix/2026-08-07-ptc-executor-collapse.zh.md) 擁有該收束約定。

新子呼叫使用 `<parent>:ptc:<n>` 標識。消費方將這些標識視為不透明值，並透過精確相等關聯事件；恢復的歷史標識保留原始位元組。[PTC mode 決策](../../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md) 負責持久化命名與恢復規則。

成功且包含圖片的子呼叫結果會成為延後的 user-message 上下文，其 `source.kind` 為 `ptc-mode`。其他 additional context 保留其生產工具的歸屬。

當已掛載執行時支援覆蓋時，`run_code` 接受 `timeoutMs`；其 schema 報告設定的預設值和上限、執行時使用說明及 Session 工作目錄。Node 預設值為 120,000 ms，上限為 600,000 ms，包含巢狀工具和審批等待。更寬的 `sandbox_permissions` 模式要求非空 `justification`，並在程式啟動前獲得審批。schema 提示模型使用目前使用者的語言撰寫理由。授權僅用於該次完整執行；常駐 Session 策略與巢狀工具保留各自權限。程式不會自動重放：顯式重試被拒程式前，應檢查先前已發生的效果。

<a id="extension-points"></a>
### 擴充功能點

工具外掛呼叫 `ctx.tools.register()`，其 schema 會自動流入提示片語裝。`tools/pre-execute` 是可重排的允許／拒絕／詢問門禁；`ctx.tools.guard()` 在其後新增單調的擁有方策略；`tools/execute` 為超時、重試或指標包裝規範化後的規範分發；`tools/post-execute` 可以替換內容或值、透過回饋阻止，或附加有序上下文；`tools/result` 觀測不可變的最終結果。MCP 伺服器發現工具後，用伺服器的 schema 呼叫 `ctx.tools.register()`。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域時再閱讀以下頁面。

- [工具子系統](../../../docs/subsystems/tools.zh.md)——完整流水線型別、schema DSL 與生成的服務 API。
- [生成工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tools)——模型收到的已交付工具 schema。
- [工具執行流水線](../../../docs/tool-execution-pipeline.zh.md)——視覺化流水線。
- [新增工具實操手冊](../../../docs/cookbook/adding-a-tool.zh.md)——分步驟的工具編寫指南。
- [協作式取消 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-19-cooperative-tool-cancellation.zh.md)——完整取消約定。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 普通工具 schema

#### 模型看到什麼

在普通模式下，模型會看到每個可見定義的確切名稱、描述與 JSON Schema；已交付定義記錄在生成的[工具目錄](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tools)中。agent 作用域的限制、遮蔽與擴充功能註冊會改變該 agent 的最終工具集合。

#### Token 影響

每次請求的固定成本與可見定義成正比。隱藏工具的限制會為該 agent 移除其全部 schema 成本。

#### KV Cache 影響

只要可見定義及其順序不變，字首就保持穩定。註冊、dispose 或作用域限制可能從第一個改變的 schema token 起使複用失效。

### PTC mode schema 與系統提示詞

#### 模型看到什麼

PTC mode 會公開生成的 [`run_code` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tools)、下方 SDK 說明，以及按所載入執行時語言生成的精確 SDK 塊。TypeScript 說明會把生成宣告明確標為只能在程式內使用的繫結。噹噹前 `bash` 參數 schema 接受範例參數時，說明還會給出以 `run_code` 包住 `tools.bash(...)` 的完整呼叫。`tools:sdk` 段使用 first-party 順序 5000，並關閉提示詞變數插值，使兩種執行時語言都原樣保留工具描述和 schema 中的 `{{…}}` 文字。`both` 會同時公開普通 schema 與此 PTC mode API；在 `ptc` 下，提示詞還會帶上處於更早 first-party 順序的 `tools:ptc-only` 規則，讓模型先讀到「可以呼叫哪些工具」再讀「每個工具做什麼」。

##### 帶 bash 的 TypeScript PTC mode SDK 說明

```markdown
## Writing code for run_code

`run_code` takes two required arguments: `code` — the body of an async TypeScript function (erasable syntax only — no `enum` or namespaces; type annotations are advisory, the code runs type-stripped) — and `description`, a short summary of what the program does. The declarations below are SDK bindings for this program. A declaration does not make its name a directly callable tool; only names supplied as separate tool schemas may be called directly. When no separate `bash` schema is supplied, invoke a declared `bash` binding inside `run_code`:

`run_code({ code: "return await tools.bash({ command: 'pwd', description: 'Show current directory' })", description: "Show current directory" })`

Inside the program:

- Call tools as `await tools.name(args)` — quoted access for exotic names: `tools["my-tool"](args)`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with `ToolCallError`, whose `toolName` identifies the failed tool and whose `message` is human-readable — `try/catch` it to handle and continue.
- Independent read-only calls MAY overlap under `Promise.all` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with `await`.
- Emit results with `return` and/or `console.log(...)`. Only what you print or return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

Program-only SDK bindings:
```

#### Token 影響

每次請求的固定成本與可見定義成正比。PTC mode 使用生成的 SDK 文字加一個傳輸 schema 取代最終工具 schema，但不承諾普遍減少成本。

#### KV Cache 影響

只要 PTC mode 選擇、生成的 SDK、傳輸 schema 與可見工具集合不變，字首就保持穩定。模式或篩選器變更可能從第一個改變的提示詞或 schema token 起使複用失效。

### 工具呼叫歷史與結果

#### 模型看到什麼

迴圈會保留模型發出的參數與註冊表的最終內容。任何丟擲異常或遭到拒絕的呼叫，都會轉換為確切的 `Error: <message>`；結構化的使用者可見失敗詳情不會加入該訊息。PTC mode 只返回外層程式列印的行與呈現後的回傳值；兩者都為空時返回 `(run_code completed with no output)`；失敗時返回 `Error: code run failed (<kind>): <message>`，並根據是否存在已捕捉內容，在其後附加 `Captured output:` 與捕捉的行。內部分發事件只保留在日誌中；成功且含圖片的子結果會在外層結果之後作為帶來源歸屬的上下文追加。

#### Token 影響

參數、結果與附加上下文取決於資料，並會重複傳送直至壓縮（compaction）。隱藏工具的限制還會在模型可以呼叫這些工具之前移除其 schema。

#### KV Cache 影響

僅追加；新的可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明註冊表何時需要特別留意。它們是目前包約束，不是任務積壓。

- **並行策略不是事件門禁**：`executionMode()` 直接讀取已解析的工具定義；外掛只能在自身擁有的定義上宣告分類器。
- **`tools/pre-execute` 有意不允許改寫 `exec.arguments`**：否則日誌記錄與呈現的參數會與實際執行內容失去同步；改寫設計記錄在[擬議的 Agent Note](../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.zh.md)中。
- **呼叫方定義的 subagent 與工作流結構化輸出仍要求物件根**：這是消費方層面的守衛；共享 schema 詞彙與工具輸出支援任意 JSON 根。
- **定義中的 `timeoutMs` 僅作宣告之用**：註冊表絕不會強制執行截止時間；要強制執行，必須使用 `@deepseek-ai/dsh-tool-call-timeout-policy` 包裝層。
- **PTC mode 的 SDK 語言由目前載入的執行時決定，且呈現方式按 agent 而非按工具**：`mode: ptc`/`both` 會拒絕組裝提示詞，除非 `ctx.ptcRuntime.language` 有已註冊的 SDK 渲染器；同一個 agent 內不能讓一個工具僅使用 Native，而另一個僅使用 PTC。
- **PTC mode 中間值只存在於執行區域性，且沒有位元組上限**：它們無法從工作階段回放重建，並可能耗盡程序或 worker 記憶體；只有外層 `run_code` 輸出受 worker 可設定的硬上限約束。
- **每次執行都會獲得全新的 `run_code` 狀態**：MVP 不採用持久 REPL 風格核心，因為跨呼叫狀態不會出現在日誌中。

`defineTool()`、註冊表模式投影和系統提示組裝會保留 `deferLoading: true`。該標記請求延遲載入工具定義，並不意味著存在 `tool-addition` 記錄；提供者執行語義的限制見 [LLM 包](../../../packages/llm/llm/README.zh.md#known-limitations-and-deferred-work)。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
