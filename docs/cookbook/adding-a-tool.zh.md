# 工具編寫參考

[English](adding-a-tool.md) | 中文

面向模型的工具必須滿足哪些約定，均以本文為準。如需按步驟建置第一個工具，請閱讀[建置工具](../user/develop/basic/tool.zh.md)。`packages/shell/tool-bash` 是生產級的三包範例。

## 最小形態

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',          // what the model sees
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' },                     // optional by default
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // args is TYPED from the schema: { path: string; limit?: number }
      // exec carries immutable identity + token; signal is the operational field
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

註冊基於副作用：dispose（資源釋放）外掛 fiber 即登出該工具。schema 會自動流入系統提示詞的組裝過程。

## execute() 約定的規則

- **參數已為你驗證。** `defineTool` 在 `execute` 執行前，會根據統一的 `ParameterSchemaSpec` 驗證模型生成的 `arguments`（型別、必填鍵、字面量約束、恰好匹配一個分支的聯合以及巢狀值），因此 `execute` 內的 args 會匹配 `InferArgs`。顯式物件節點必須宣告 `additionalProperties: true | false`；隱式參數根物件保持開放。你仍需手動檢查 schema DSL 無法表達的約束，例如非空字串、正數或跨欄位規則。直接註冊的原始 JSON Schema 工具自行負責輸入驗證。
- **註冊借用你的只讀定義。** 型別化的同程序貢獻不是序列化邊界；註冊後不要修改其 schema 或替換回呼。`schemas()` 只物化顯式的模型可見投影。如需熱替換工具，請 dispose 其所屬副作用並註冊替代品；回呼閉包內的可變狀態仍是普通的外掛狀態。
- **執行身份受保護。** 註冊表在一次遞迴遍歷中將 `arguments` 物化為分離的無損 JSON，在策略開始前凍結該值，並分配一個不透明的 `exec.token`；`callId`、`name`、`arguments`、`agent`、`token`、必填且由呼叫方持有的 `signal`，以及可選的外層傳輸 `parent` token 在整個分發過程中保持不可變。`parent` 僅用於身份標識，不暴露活躍的外層執行。請將 `args` 視為只讀輸入。只有 around-dispatch 包裝器會收到可變檢視；它可以替換並恢復必填的 `exec.signal` 以施加截止時間，但不能移除該訊號。
- **宣告並返回一個規範 JSON 值。** `output.schema` 使用 `ValueSchemaSpec`，根可以是物件、陣列、標量或 null。`execute` 只返回推匯出的值；註冊表將其快照為無損 JSON，完成總和檢查碼凍結後，再傳給 `output.render(args, value)`。工具主體不要返回內容塊，也不要迫使呼叫方從自然語言中解析 id 和欄位。
- **丟擲異常或返回無效值意味著 `isError`。** 註冊表會捕捉異常，並在觀察者執行前收斂 schema、渲染器、中繼資料投影器和無損 JSON 失敗。基礎設施故障請拋異常。成功的領域結果即使表示不理想的狀態，也應寫入規範值；其 Native 渲染器可以解釋該狀態，例如程序以非零狀態退出。
- **遵守 `exec.signal`。** 訊號觸發時取消進行中的工作。
- **使用 `presentationMeta` 投影持久化的卡片資料（可選）。** `output.presentationMeta(args, value)` 從同一個規範值派生可回放的 JSON。核心將其持久化在 `tool/result` 上並傳給 `presentResult`，因此需要結果期事實的卡片——例如 `write`／`edit` 的已應用 hunk——無需持久化規範值也能在回放中重現。巢狀 Code 分發沒有卡片，因此會跳過該投影器。
- **使用 `exec.agent` 傳送非同步通知。** `agent.inject({ content, source: { kind: 'plugin', plugin: '<name>' } })` 追加持久化上下文，下一次模型請求會看到它——這不是喚醒（空閒的 agent（智慧代理）保持空閒）。請防範已 dispose 的 agent（try/catch）。

## 長時間執行的工作

透過 producer 設定控制 `run_in_background`，然後使用 `ctx.jobs.start({ kind, label, owner: exec.agent, run })` 註冊任務。註冊表會在進入 producer 主體前將已預先中止的呼叫判為失敗；執行時會在 `run()` 啟動工作前驗證 owner 和任務控制器是否可用，隨後提供 id、工作階段圍欄、通用控制工具、通知和 owner cleanup。成功的後臺分支會返回型別化的規範控制代碼，如 `{ kind: 'background', jobId }`；其 Native 渲染器可以保留 `started background job bash-1` 這類供人閱讀的自然語言，但 PTC mode 絕不能透過解析該文字取得 id。

spec 提供同步的 `cancel`、在資源清理後 settle 且不 reject 的 `done`，以及由註冊表泵入 job 輸出環的拉取式 `output` 源或經 starter 收到的 `JobHandle` 推送的追加；模型的消費式讀取由 `dsh-tool-jobs` 從該環渲染。預先中止的呼叫屬於失敗，因為此時沒有任務，其 id 無法滿足成功輸出 schema。`ctx.jobs.start()` 釋出 id 後，應使用任務自有的取消訊號，而不是 `exec.signal`：之後取消外層呼叫只會停止等待本次呼叫，不會終止已經發布的工作；該生命週期歸 `job_kill`、owner dispose 和服務 teardown 所有。前臺工作仍與 `exec.signal` 耦合。流式 producer 的範例和完整約定見[後臺任務執行時 Agent Note](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.zh.md)與 `dsh-tool-bash`。

<a id="execution-policy-and-observation"></a>

## 執行策略與觀測

儘量不要把部署策略內建到工具中。使用 `tools/pre-execute` 實作可擴充功能的允許／拒絕／詢問策略（見[權限門禁範例](extension-cookbook.zh.md#a-hook-plugin-permission-gate-example)）；使用 `ctx.tools.guard()` 設定最終的單調拒絕，後續監聽器無法撤銷；使用 `tools/execute` 為分發新增截止時間、重試或指標收集；使用 `tools/post-execute` 替換展示內容或回傳值、阻止結果，或附加模型可見上下文；使用 `tools/result` 觀測不可變的歸一化結果而不改變它。替換內容不會阻止程式化存取 `value`；保密策略會遮蔽或替換該值。沙箱實作也可以在工具的執行器實作中執行；[`dsh-tools` README](../../packages/core/tools/README.zh.md#extension-points) 定義每個擴充功能點的輸入、順序、回傳值和失敗行為。

## PTC mode 自動觸達你的工具

在 [PTC mode](../../packages/core/tools/README.zh.md) 中，每個可見的已註冊工具都可透過 `await tools.<name>(args)` 呼叫，無需額外整合。生成的 `ToolArgsMap` 和 `ToolOutputMap` 會根據同一組 schema 分別派生精確的參數型別與規範返回型別，呼叫則重新進入正常的執行流水線。成功呼叫會解析為策略處理後的最終規範 JSON 值，而不是渲染後的 Native 內容。失敗呼叫會以真正的 `ToolCallError` reject；程式只能檢查其 `name`、`toolName` 和可供人閱讀的 `message`，無法取得內部錯誤程式碼或失敗聯合。

請把 `output.schema` 設計為實用的程式化 API：直接返回控制代碼與欄位；當標量、陣列或 null 確實就是結果時，允許採用相應的根型別；將面向人類的解釋放入 `output.render`。中間值只存在於執行期間，不會被持久化或按提示詞上限截斷，也不設位元組上限，因此生產方如實宣告的採集邊界和程序記憶體仍然重要。只有外層 `run_code` 日誌／結果會受到可設定輸出上限和麵向模型的 spill 流水線約束。

## 工具在 UI 中的渲染方式

工具的 `output.render` 返回模型可見的內容；其 **UI 卡片** 是另一項獨立關注點，透過純展示投影以及可選的 `presentCall`／`presentResult` 方法宣告。請將這些內容與規範值一併設計。沒有 UI 展示方法的工具會退回到通用卡片（標題 = 工具名，原始 args 作為輸入）。

兩個方法都返回一個 **`card` 標籤的渲染意圖**——選擇與你的工具行為匹配的卡片型別：

- `presentCall(args)` → 一個 `ToolCallView`（PENDING 卡片）：
  - `{ card: 'generic', title, kind?, rawInput?, content?, locations? }`——預設。設定 `kind` 取得圖示（`read`／`search`／…）；設定 `locations: [{ path, line? }]` 標註工具涉及的檔案，使有能力的編輯器跟隨／跳轉。
  - `{ card: 'terminal', title, description?, cwd? }`——你的呼叫本身就是 shell 命令。`title` 是命令，`description` 渲染在終端卡片上方。（tool-bash。）
  - `{ card: 'diff', title, diffs, locations? }`——你的呼叫建立或修改檔案。`diffs: [{ path, oldText, newText }]`（新檔案時 `oldText: null`）渲染為內聯 diff 卡片。（tool-fs `write`／`edit`。）
- `presentResult(args, { content, isError, meta? })` 返回完成後的卡片：
  - `generic` 提供可選的標題和內容。
  - `terminal` 提供原始輸出和可選的退出中繼資料；各 UI 根據自身能力渲染對應檢視或退回檢視。
  - `diff` 提供已應用的 hunk，通常由 `output.presentationMeta` 派生並透過持久化的 `result.meta` 攜帶，使回放能重現它們。變更類工具保留 diff 結果，因為完成後的檢視會替換 pending 卡片。
  - `read` 提供從持久化 `result.meta` 重建的已完成檔案視窗：檔案 `path`、從 1 開始的 `offset`、返回的 `lines`（每行保留其檔案行號）、`totalLines`，以及可選的 `lang` 高亮提示；不具備 `read` 能力的 UI 退回到原始結果內容。沒有 `read` 呼叫檢視——讀取呼叫的 pending 狀態保持為 generic 卡片，因為內容只在 `execute` 之後才存在。（tool-fs `read`。）
  - `search` 提供從持久化 `result.meta` 重建的發現型結果：按檔案分組的匹配（`shape: 'matches'`，grep）或扁平路徑列表（`shape: 'paths'`，glob），外加 `truncated`／`total` 使 UI 永不把被截斷的結果當作完整結果呈現。該檢視不攜帶結果文字（無 search 卡片的 UI 退回到原始結果內容），也沒有 `search` 呼叫檢視——發現型呼叫的 pending 狀態保持為 generic 卡片，因為匹配只在 `execute` 之後才存在。（tool-fs-search 的 `grep`／`glob`。）
  - `web` 提供已完成的 web 檢索，以 `kind: 'search' | 'fetch'` 區分（結構化的搜尋來源或抓取摘要），由 `result.meta` 派生；它不攜帶正文副本，因此不具備 `web` 能力的 UI 退回到原始結果內容。（tool-web `web_search`／`web_fetch`。）

硬性規則（違反會出問題）：

- **純函式。** 這些方法在即時流式輸出和工作階段日誌回放時都會執行，因此必須是 `args`（加 result）的純函式——不做 I/O、不讀工作階段狀態、不用時鐘／隨機數。diff 從 args 派生（`write` 使用 `oldText: null`，因為呼叫時的展示器沒有檔案先前內容）；工作階段上下文由 UI 介面卡而非工具提供。如果你發現自己想在 `presentCall` 內取得檔案舊內容或工作目錄，請停下：那屬於持久結果中繼資料或介面卡，不屬於展示器。
- **UI 格式不進入模型結果。** 圍欄 ` ```console ` 塊、diff、相對化路徑均不應僅為服務 UI 而進入規範值或 Native 內容。`output.render` 負責模型可見的自然語言；`presentationMeta` 和卡片展示器負責可回放的 UI 狀態。`terminal` 結果檢視攜帶原始輸出，由介面卡按需新增退回格式。
- **`defineTool` 對展示路徑做軟驗證。** 格式錯誤或舊版日誌中的參數會使包裝器返回 `undefined`（通用退回）而非拋異常——展示絕不能導致回放崩潰。

中性詞彙定義在 `dsh-tools` 中；工具絕不匯入 UI 或傳輸型別。使用該 API 的消費方把每個 `card` 對映到自己的檢視。設計與原因見[渲染意圖聯合體 Agent Note](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.zh.md)；`dsh-tool-fs`（generic/diff）和 `dsh-tool-bash`（terminal）是參考實作。

## Web Client 展示

內建 Web Client 不消費 `presentCall` 或 `presentResult`。Session `page` 與 `follow` 運輸原始 `tool/call` 和 `tool/result` 事件，包括持久化的 `result.meta`。Client 外掛在 keyed slot `tool.call.toolview` 中註冊自己的 wire 工具名稱，並從 `ToolCallBlock` 的參數、內容、錯誤、metadata、現有 PTC dispatch `parentCallId` 與 Session 路徑事實派生元件 props。外掛在本地驗證這些 wire 值，並讓格式錯誤或不受支援的輸入退回到 generic 行。

現有 Web 卡片需要模型可見內容無法無損儲存的有界結構化結果事即時，使用 `output.presentationMeta(args, value)`。不要在 metadata 中儲存 React props 或預選卡片，不要把 Host 工具實作匯入瀏覽器 bundle，也不要建立另一套 Client presenter registry。只定義 Host 展示方法不會增加專用 Web 卡片。[Client 派生展示 Agent Note](../../.agents/notes/implemented/architecture/2026-08-23-client-derived-tool-presentation.zh.md)規定 owner、fallback 與對等要求。

## 驗證

遵循[儲存庫測試策略](../testing.zh.md)和所屬包的測試文件。已交付且面向模型或 UI 的變更必須提供其中規定的組裝覆蓋。
