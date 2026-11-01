# Agent Note: Client 從原始 Session 工具事件派生展示

Status: implemented

[English](2026-08-23-client-derived-tool-presentation.md) | 中文

## Problem

Session 歷史是持久 journal 介面，工具卡片屬於 Client 展示。在 `page`／`follow` 中計算卡片 view 會讓歷史讀取依賴 Tools registry、Agent preset、恢復後的 scope、presenter 執行和臨時 UI 型別。

`tool/result` 不重複記錄工具名稱和參數。Host 端結果展示因此需要 call index 或按 `callId` 回掃；`maxMessages` 不直接限制事件數量，工具密集頁面上的重複掃描可能接近二次方成本。

Host 投影還會重複結構化資料。read、diff、search 與 web 結果已在 `tool/result.data.meta` 中持久化有界事實；另一份 view 只增加 Remote payload 與 Client 解碼成本，不增加持久語義。

Client 已經擁有完整的工具展示入口。`ui-chat` 將 `tool/call`、`tool/result` 與 PTC dispatch 事件組裝成穩定的 `ToolCallBlock`；`ui-tool` 擁有遞迴呼叫樹、按工具名稱分發的 `tool.call.toolview` keyed slot、Generic fallback、卡片模型和 details output；業務 Client 外掛可以為自己的工具名稱註冊 renderer。

Host presenter 與 Client keyed renderer 分擔展示會形成對同一事件的兩套解釋。keyed renderer 是 Web 擴充功能點，因此中間 Host view 不提供獨立 Web 能力。

`ToolDefinition.presentCall`／`presentResult` 仍是保留的 Host API；ACP 採用 automation-only 協定，儲存庫也沒有生產 TUI consumer。是否刪除這些定義與 Session 讀取是否獨立於展示是兩個決定。

所需結果是一條原始 Session journal 和一個 Client 展示 owner，且不發生可見退化或順帶增強。專用卡片、互動和 PTC dispatch 拓撲保持穩定，transport 不再攜帶臨時 view。

## Decision

下述展示對等要求不包含已獨立批准的[巢狀 terminal 卡片修復](../bug-fix/2026-09-05-nested-terminal-cards.zh.md)和[緊湊工具詳情](2026-09-10-compact-tool-details.zh.md)；其他展示與所有權約束全部保留。

Session Remote journal 只下發原始、已驗證、可持久化的 Session event。`session.page` 和 `session.follow` 不解析工具參數，不查詢 Tools registry，不恢復 presenter scope，不執行 `presentCall`／`presentResult`，也不建構或克隆任何 tool view。

Client Conversation 層繼續負責工具呼叫與結果的 identity、配對、生命週期、PTC dispatch 拓撲和穩定 Chat Node。它不解釋具體工具名稱，也不生成 terminal、diff、read、search 或 web 元件 props。

Client `ui-tool` 繼續負責 card model 和具體 renderer。每個 card model 改為直接讀取 `ToolCallBlock` 中的工具名稱、原始參數、結果內容、錯誤、持久 metadata、Session cwd 與 Host home，並生成與現有頁面相同的元件 props。

Client 不建立第二套 presenter registry。工具名稱分發只使用現有 `tool.call.toolview` keyed slot；Client 中的純 card-model helper 屬於 renderer 實作，不成為 Cordis service、公開 registry 或 wire DTO。

Host 的 `ToolDefinition.presentCall`、`ToolDefinition.presentResult`、`ToolCallView`、`ToolResultView` 及現有 presenter 實作全部保留。Session Controller 不呼叫它們，Client 不匯入或消費它們；未來非 Client consumer 是否使用它們不屬於本決定。

`ToolOutputDefinition.presentationMeta` 與持久 `tool/result.data.meta` 保留。它們攜帶模型可見結果文字無法無損表達、而現有專用卡片需要的執行結果事實。Client 直接驗證並消費 `meta`，不要求 Host 在歷史讀取時再把它轉換成 view。

### 目標與非目標

| 類別 | 決定 |
|---|---|
| 不存在 | `SessionEventEntry.view`、`SessionToolView`、`SessionToolCallView` |
| 不存在 | `history.ts` 的 `viewFor`、`backscanArgs`、`parseToolCall`、`jsonView` 與 presenter scope lookup |
| 不存在 | follow 中只服務 presentation 的 `openCalls` 與 fallback event scan |
| 不存在 | Client Session 的平行 `views` 陣列、Conversation input 的 `view`、Tool block 的 `callView`／`resultView` |
| 派生 | terminal、diff、read、search、web card model 讀取 raw block/meta |
| 派生 | Deliverables 讀取成功 mutation 的名稱與參數 |
| 保留 | Host `ToolDefinition.presentCall`／`presentResult` API、型別、實作與直接測試 |
| 保留 | `output.presentationMeta` 與持久 `tool/result.data.meta` |
| 保留 | Session 日誌格式、Remote journal 生命週期與 Conversation identity/topology |
| 保留 | 現有 keyed slot、Generic fallback、Chat、Details 與 Trajectory 結構 |
| 禁止 | 新 Client presenter service、平行 registry 或 wire renderer id |
| 禁止 | 新卡片、視覺改版、互動改版或 PTC dispatch rich-card 增強，[巢狀 terminal 卡片例外](../bug-fix/2026-09-05-nested-terminal-cards.zh.md)和[緊湊工具詳情](2026-09-10-compact-tool-details.zh.md)除外 |
| 禁止 | 為相容保留雙寫、版本協商或舊 `view` 欄位 |

## 術語

**原始 Session event**指持久日誌中的 `SessionEvent` 事實，包括 `tool/call` 的 `name` 與原始 `arguments` 字串，以及 `tool/result` 的 `content`、`isError`、結構化錯誤和可選 `meta`。

**持久 metadata**指 `ToolOutputDefinition.presentationMeta` 在工具成功執行時生成並寫入 `tool/result.data.meta` 的 JSON 值。它是結果事實的一部分，不是預先排版的 React 或 card DTO。

**Host tool view**指 `ToolDefinition.presentCall`／`presentResult` 返回的 `ToolCallView`／`ToolResultView`；Session Remote 不運輸它。

**Client card model**指 `ui-tool/src/client/tool/models/` 下直接供 `TerminalBlock`、`DiffBlock`、`ReadBlock`、`SearchBlock`、`WebBlock` 或 `ToolRow` 使用的純 props 資料。

**專用卡片**指 terminal、diff、read、search 與 web 的結構化正文；標題、摘要、生命週期樣式、業務圖形和普通 IN／OUT 文字仍屬於通用工具行。

**對等**指同一受支援輸入產生由現有元件、組裝與瀏覽器證據固定的使用者可見結果和互動，不要求相同的中間 TypeScript 型別或內部函式呼叫。

**無增強**指本決定不讓被固定為 Generic fallback 的輸入獲得新專用卡片，也不擴大已有卡片的資料或互動。

## 架構與所有權

### 工具執行與持久化

1. 工具註冊 `output.schema`、`output.render` 和可選 `output.presentationMeta`。
2. 成功執行產生 canonical JSON value。
3. Tools runtime 對 value 做快照、schema 總和檢查碼凍結。
4. `output.render(args, value)` 生成模型可見 `ContentBlock[]`。
5. 頂層呼叫若宣告 `output.presentationMeta`，runtime 同時生成 JSON-safe metadata。
6. Agent loop 把模型可見結果與 metadata 寫入 `tool/result` Session event。
7. Session log 不儲存 `ToolCallView` 或 `ToolResultView`。

### Host journal 讀取

1. `session.page` 取得 attached 或 persisted 事件。
2. `paginate()` 按 append-origin user／assistant message 邊界切頁。
3. tail page 透過已註冊 projection 的 snapshot/restore 路徑取得 baseline。
4. 每個 page entry 只包含 `{event}`。
5. `session.follow` 先建立 listener，再執行 catch-up read、傳送 opening cursor 並流式下發連續 `{event}` frame。
6. 兩條路徑都不為展示解析 preset／Tools scope、解析工具參數、呼叫 presenter 或建立 call index。

### Client 資料與展示

1. Client Session 儲存一個連續 raw event window。
2. `SessionEventSource` 釋出只含 event 的 `SessionEventEntry`。
3. `ui-conversation` 在沒有 presentation companion 的情況下 fold 每個事件。
4. Chat 與 Trajectory Tool Definition 按 callId 配對頂層 call/result，並組裝 PTC dispatch 子樹。
5. `RunningToolCall` 與 `ToolResultNode` 儲存 raw facts、metadata 與既有 parent identity。
6. `ToolCallTree` 按 wire tool name 分發 `tool.call.toolview`。
7. `ui-tool` 在 render site 從 block 派生 card component props。

### 生產消費者審計

| 物件 | 生產者 | 生產消費者 | 決定 |
|---|---|---|---|
| `presentCall`／`presentResult` | 各 Host 工具 | 可能存在的非 Client caller | 保留在 Session Remote 之外 |
| `SessionEventEntry.view` | 無 | 無 | wire 不存在 |
| `callView`／`resultView` | 無 | 無 | Client model 不存在 |
| `presentationMeta` | Tools runtime | `tool/result`、Client card model 與 Host presenter | 保留的持久輸入 |
| fixture presenter mirror | 無 | 無 | fixture 下發 raw metadata |

ACP 不消費 Session tool view，也不對映 Host render intent。儲存庫沒有生產 TUI consumer；Host presenter 保留，但 Session Remote 不作為其 transport。

## 資料流

```text
Tool execute
  -> canonical value
  -> output.render(args, value)
  -> model-visible result content
  -> output.presentationMeta(args, value), when declared
  -> durable tool/result event

Session page/follow
  -> raw Session event envelope
  -> no tool lookup
  -> no preset lookup for presentation
  -> no call backscan
  -> no render-intent serialization

Client SessionEventSource
  -> Conversation Tool Definition
  -> root call/result pairing + PTC dispatch topology
  -> ToolCallBlock(name, argsRaw, content, error, meta)
  -> tool.call.toolview keyed dispatch
  -> Client card model
  -> existing React component
```

這條鏈結保留一次持久 metadata 投影，因為它發生在 canonical result 尚在記憶體時；刪除的是讀取歷史時的第二次展示投影。

### 分層責任

| 層 | 負責 | 不負責 |
|---|---|---|
| Tools runtime | 執行、canonical value、模型文字、可重放 metadata | Web 卡片選擇和元件 props |
| Session log | 持久事實、順序、回放 | 臨時 card DTO |
| Session Controller | 地址、權限、冷讀、分頁、follow、projection baseline | tool lookup、presenter、展示 scope |
| Client Session | Remote journal 生命週期與連續視窗 | 工具含義、卡片型別 |
| Conversation Tool Definition | call/result 配對、lifecycle、root/subcall topology | 工具名到元件的解釋 |
| `ui-tool` | card model、通用 fallback、Chat/Details 展示 | Session 分頁與 Host registry |
| 業務 Client 外掛 | 自有 tool name 的 keyed renderer | root/subcall 編排與全域 registry |
| `ui-deliverables` | 目前第一方 mutation 的 produced path | UI card 或 Host render intent |

## Remote 與持久資料約定

### `SessionEventEntry`

`SessionEventEntry` 保留為 journal entry envelope，只含 `event: SessionWireEvent`。本次不順帶把 page entries 改成裸事件，也不重構 `RemoteJournalStream` 的通用 entry 約定。

`SessionPage.events` 仍是 `SessionEventEntry[]`。

`SessionFollowFrame` 仍是 opening frame 或帶 `event` 的 event frame。

刪除 `SessionToolCallView`、`SessionToolView` 和 `SessionEventEntry.view`。

Client connection 不再從 `dsh-tools/presentation` 轉出 `ToolCallView`／`ToolResultView` 供 Session 消費。

生成 catalog 與 graph 從各自 source owner 派生已收窄的 Remote 型別和 package dependency。

### 持久日誌

- `tool/call.data.name` 保持原樣。
- `tool/call.data.arguments` 保持模型產生的原始 JSON 字串。
- `tool/result.data.message.content` 保持模型可見結果。
- `tool/result.data.error` 保持結構化失敗身份。
- `tool/result.data.meta` 保持工具私有 JSON 值。
- Client card model 不寫入 Session log。
- renderer key 與 Host tool implementation id 不寫入 Session log。
- 現有持久 Session 無需遷移，`SESSION_FORMAT_VERSION` 不變。

### `presentationMeta`

`presentationMeta` 不是 Host tool view。它在工具執行完成時讀取 canonical value，而該 value 不會持久化；刪除它會使下列現有展示無法無損恢復：

- read 的 path、offset、lines、totalLines 與 lang；
- write/edit 的 applied contextual hunks；
- grep/glob 的分組結果、截斷標誌與總數；
- web_search 的來源欄位與 provider answer；
- web_fetch 的最終 URL、HTTP status 與有效截斷標誌。

Client 對 `meta` 做區域性執行時收窄。是否把 `presentationMeta` 改名為更中性的 result metadata 不屬於本決定。

## Host 端設計

`SessionHistoryController.page()` 在取得 source events 後只執行分頁與現有 projection baseline 計算。attached Session 使用 projection registry snapshot；detached Session 使用該 registry 對 inspected log 的 restore 路徑。history 不透過掛載 preset 改變已註冊的 projection 集合。

`SessionHistoryController.follow()` 保留 listener-first、opening cursor、gap-free replay、live buffering、取消和 teardown；它不為工具事件維護額外狀態。

Controller 不存在 `presenterScopeFor()`、`viewFor()`、`backscanArgs()`、`parseToolCall()` 或 `jsonView()` 路徑。page state 不含 presenter scope 或參數 resolver；follow state 不含 `openCalls`、`fallbackEvents` 或 presentation 參數 resolver。每個 page/follow event 只包裝成 `{event}`，地址、ownership、cursor、seq 與 projection 邏輯保持完整。

不可變 event 轉換 helper 可以保持窄實作或內聯；只要 history 不執行 presentation 工作，其名稱沒有語義。

Session Controller dependency 只在其他 package responsibility 需要時保留；manifest 與 project reference 不含 presentation-only dependency。

### 效能約束

- `page()` 的工具相關工作為零。
- 頁面增加 tool result 不增加對既有頁面事件的重複掃描。
- `follow()` 不維護展示索引。
- history 不觸發 Cordis `tools` service proxy。
- history 不等待 presenter standing scope。
- history 不執行工具參數 JSON parse。
- history 不執行 tool view JSON clone。
- Remote payload 不重複攜帶 `meta` 已表達的結構化資料。
- Client 不掃描完整 Session event window 生成單個卡片。
- Client 只在對應 immutable Tool block 變化時重新派生 card model。

## Client Session 與 Conversation

Client Session 不含與 raw event window 平行的私有 `views` 陣列。`installWindow()`、`prependWindow()` 和 `appendLive()` 只處理 event entries、cursor/hasMore、queue、projection 與通知。

`ConversationEventInput` 只攜帶 `event`。Conversation assembler 不認識 `SessionToolView`，其 replace/prepend/append、Context identity、Location 與 publication cadence 不變。

Chat 和 Trajectory 的 Tool Definition 都不讀取 view，而從事件生成以下資料：

- callId；
- tool name；
- raw arguments；
- turn、step、seq 與 time；
- result content；
- isError 與 structured error；
- result metadata；
- root/subcall parent-child topology；
- interruption synthetic result。

`RunningToolCall` 不含 `callView`。

`ToolResultNode` 不含 `callView` 與 `resultView`。

`ToolCallBlock` 不新增通用 `view`、`card`、`kind` 或 `locations` 欄位替代被刪除欄位。具體展示仍只屬於 `ui-tool` 與 keyed renderer。

### Root 與 PTC dispatch 子呼叫

Host presenter API 描述頂層 call/result。本決定覆蓋的 diff、read、search 和 web model 對 PTC dispatch 子呼叫保留 Generic/flattened 展示；受支援的 terminal 呼叫使用與根呼叫相同的適用規則。

PTC dispatch start 與 result event 已經攜帶 `parentCallId`。Conversation 在每個 child `ToolCallBlock` 上保留這項現有事實，root Session call 則不攜帶它。diff、read、search 和 web model 只接受沒有 `parentCallId` 的 block；terminal model 與原本有意支援巢狀呼叫的 renderer 接受 child block。

共享的 card model 在 block 渲染到哪裡都施加同樣的終端資格與非終端子呼叫限制，因此不需要第二個展示面帶 placement 欄位；曾經原樣委託選中 block 的詳情面板已隨右側詳情列一併刪除（[決策](../feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md)）。

keyed slot 仍按每個子呼叫的真實 tool name 分發；`parentCallId` 只限制本決定覆蓋的 diff/read/search/web 結構化模型。Skill、Cordis 等已經直接讀取 raw block 的專用 renderer 保持現狀。

### 缺失呼叫頭

結果節點在目前視窗沒有配對 call 時，`ToolResultNode.call` 保持 `null`。Client 不掃描視窗、不發額外 RPC，也不根據 result 文字猜測工具名稱。

需要名稱或參數的專用派生在 `call === null` 時走目前 Generic fallback。只依賴 result metadata 的模型也不借機增強，因為目前 Host `presentResult` 必須先取得配對呼叫。

older page 後續補入呼叫頭時，Conversation Context 按既有 replay 規則重建，屆時才允許生成目前已有的專用卡片。

### 參數與 metadata 收窄

Client 從 `argsRaw` 解析 JSON，解析失敗返回 Generic，不丟擲 React render 錯誤。

Chat 與 Details 透過純 helper 複用同一 block 的解析。未來快取必須使用 immutable block identity，不能按 callId 建立跨 Session 全域狀態。

每個專用模型只檢查它需要的欄位。Client 不複製完整 Host tool schema，也不呼叫 Host `defineTool` validator。

合法第一方事件必須與目前 presenter 輸出等價。畸形、舊版本或手工修改日誌只承諾不崩潰並使用 Generic fallback。

## Client card-model 設計

現有 `ui-tool/src/client/tool/models/` 繼續是 Chat 與 Details 共享派生的唯一位置。helper 直接返回元件 props，不返回 `ToolCallView`／`ToolResultView`，也不建立同構的 `ClientToolView` union。

工具名稱分支只存在於 `ui-tool` card model、現有 row 分類表，或擁有該工具 keyed renderer 的 Client 外掛；不得進入 Session Controller、Client Session、Conversation assembler 或通用 Slot renderer。

未知工具繼續由 `GenericToolCard` 顯示 name、原始 args、結果 content 與錯誤。

### 通用工具行

`toolRowModel()` 直接從 `toolName`、`argsRaw`、result content、error、cwd 與 home 派生通用行，並保持以下行為：

- `search`、`read`、`bash`、`write`、`edit`、`code` 與 `others` 分類；
- 現有標題與工具專用標題；
- summary 欄位優先順序和單行截斷；
- 多 query 的逗號拼接；
- cwd 相對化與 home 縮寫；
- file path 點選；
- args pretty JSON 與非 JSON 原文 fallback；
- result content flatten 與 structured error fallback；
- running、ok、error 與 stopped 狀態。

Generic Host `presentCall` 的 title、kind、rawInput、content 與 locations 目前並不驅動普通 Web 行；Generic `presentResult.content` 也不驅動 Web 輸出，因此無需把這些未消費值複製到 Client。

### Terminal 卡片

Client terminal model 從工具名稱、呼叫參數、結果 content、error 與 Session cwd 派生現有 `TerminalBlock` props，不依賴 `parentCallId`。

| 輸入 | 保持的結果 |
|---|---|
| 標準 `bash`／`pwsh` 前臺 running | terminal prompt、description、cwd、running 狀態 |
| 標準前臺 success | terminal output、exit code/signal 與結算狀態呈現 |
| `run_in_background:true` | Generic 行與原始結果 |
| 工具執行 error | Generic IN／OUT 與錯誤摘要 |
| persistent `bash`／`pwsh` running | terminal prompt |
| persistent `bash`／`pwsh` settled | Generic flattened result，不新增 exit card |
| `terminal_send` 前臺 | terminal prompt 與 output |
| `terminal_send` background/error | Generic 結果 |
| PTC dispatch child | 與根呼叫相同的 terminal 適用規則與 fallback 規則 |

標準 shell 結果解析末尾 `[exit code: N]` 與 `[killed by signal: X]`。末尾已識別的 spill 策略提示會改用 Generic 輸出：在 shell 行中可展開，在 Details 中顯示原文，因為退出標記可能被移位或省略。已解析的 marker 從 terminal 正文移除；timeout、sandbox denial 與沒有 pill 的 marker 留在正文。

呼叫 `description` 繼續顯示在 card 上方並覆蓋摺疊摘要。workdir 繼續按絕對、相對和缺失三種情況處理；相對路徑基於 Session cwd，且保留 `.`、`..`、磁碟機代號與 UNC root 的歸一化。

對於 `terminal_send`，非空 input 與 session id 保持為逐字工具資料；空 input fallback 與 session label 透過 render site 的 conversation locale 解析。

同名普通與 persistent provider 是特殊相容點。Client 使用目前有效參數與結果特徵保留已交付差異；不足以無歧義識別的輸入選擇 Generic settled 結果，不增加新表現。

TerminalBlock 的 ANSI、游標重放、寬字元、行數上限、展開、複製與輔助技術文字完全不變。

### Diff 卡片

| 輸入 | 保持的結果 |
|---|---|
| running `write` | 從 `file_path` 與 `content` 生成 intended added-only diff |
| running `edit` | 從 `file_path`、`old_string`、`new_string` 生成 intended replacement diff |
| running `str_replace_editor create` | 從 `path` 與 `file_text` 生成 intended added-only diff |
| running `str_replace_editor str_replace` | 從 `path`、`old_str` 與 `new_str` 生成 intended replacement diff |
| settled `write`／`edit` success | 從 `meta.diffs` 生成 applied contextual hunks |
| settled `str_replace_editor` | Generic，因為該工具沒有 result presenter |
| write create 或 applied metadata 缺失、畸形、為空 | 目前 args fallback |
| error、畸形 args、edit 的 metadata 畸形、PTC dispatch child | Generic |

路徑、`oldText:null`、`newText`、結果覆蓋呼叫時 diff、Chat 8 行上限、Details 全高顯示和檔案開啟行為不變。

### Read 卡片

running `read` 繼續只有摘要行。成功 settled `read` 從 result meta 讀取 path、offset、lines、totalLines 與 lang，並確認結果是單個文字塊且符合 read envelope。

meta 缺失、欄位畸形、result envelope 不匹配、error、缺失 call head 或 PTC dispatch child 都走 Generic。路徑 label 的 cwd 相對化、home 縮寫、語法語言、總行數、Chat 8 行上限與 Details 全高顯示不變。

Client 不需要建構 Host `ReadResultView.content`；Generic fallback 始終可直接讀取原始 result content。

### Search 卡片

running `grep`／`glob` 繼續只有參數摘要。成功結果分別從 `meta.shape:'matches'` 與 `meta.shape:'paths'` 生成 grouped matches 或 path list。

Client 驗證 path、lineNumber、line、truncated 與 total。空 matches/paths 是有效卡片；缺失/畸形 meta、未知 shape、error、缺失 call head 與 PTC dispatch child 走 Generic。

`truncated:true` 時繼續從原始 result content 顯示 recovery locator；未截斷時不顯示。Chat 8 行上限、Details 全高顯示和展開行為不變。

### Web 卡片

running `web_search`／`web_fetch` 繼續只有摘要行。成功 search 從 `meta.sources`、`meta.answer`、`meta.truncated` 生成卡片；成功 fetch 從 `meta.url`、`meta.statusCode`、`meta.truncated` 生成卡片。

Client 驗證每個 source 的 url、title、snippet 與 publishedAt，並繼續只把 http/https URL 渲染為連結。meta 缺失或畸形、error、缺失 call head 與 PTC dispatch child 走 Generic。

search 的 answer、來源順序、label fallback 與截斷提示不變；fetch 的最終 URL、狀態、截斷提示與 Details 下方原始正文不變。

### 已直接使用 raw block 的 renderer

- Todo row 繼續從 args 計算 completed/active 摘要。
- Question row 繼續從 result content 與 error 計算等待、回答、取消和中止狀態。
- Skill row 繼續從 args/result 計算名稱與狀態。
- Cordis define/run/action rows 繼續從 args/result 與各自 Client service 計算。
- 這些 renderer 的 props、slot key、註冊順序與可見結果不變。

## Deliverables

`ui-deliverables` 獨立於展示意圖派生 mutation 業務事實，因此 produced-file 行為不與卡片截圖耦合。

Deliverables Definition 按 callId 觀察 root `tool/call` 與成功 `tool/result`，儲存最小的 Client-owned mutation candidate，不掃描 Session window，也不依賴 UI renderer。

| 工具 | mutation 判定 | path 來源 |
|---|---|---|
| `write` | 任意成功呼叫 | `file_path` |
| `edit` | 任意成功呼叫 | `file_path` |
| `str_replace_editor` | `create`、`str_replace`、`insert` | `path` |
| `str_replace_editor` | `view` | 不產生 path |
| 其他 | 無目前第一方 mutation 語義 | 不產生 path |

失敗、interrupted、orphan result、缺失 path 與畸形 args 不產生 deliverable。同一路徑保持 first-seen 去重，closing Assistant seq 之後落定的結果繼續排除。

本次不新增通用“工具副作用”註冊表。Host-only 第三方 presenter 透過 `kind:'edit'`／`locations` 自動加入 Deliverables 的能力被有意移除；未來若有真實第三方 mutation 需求，應由 Client 業務貢獻表達，不能恢復 Session view。

## Fixture 與測試資料

組裝 RemoteMock 情境不包含手寫 `presentCall()`、`presentResult()`、`viewFor()` 或 tool-view 型別。它提供與真實日誌相同的 raw call、result content 和 result meta。

| Fixture | 必須保留的原始事實 |
|---|---|
| terminal | 參數與真實結果 status marker |
| diff | 參數與 result `meta.diffs` |
| read | result meta 的 path/offset/lines/totalLines/lang |
| grep/glob | result meta 的 shape/files 或 paths/truncated/total |
| web | result meta 的 sources/answer 或 url/statusCode/truncated |
| generic/custom | name、argsRaw、content、error |

該情境不匯入 Host 工具包來計算頁面展示，也不保留 presenter 映像。同一 raw 情境在 jsdom 下驅動 built Web snapshot；真實 Host 瀏覽器案例獨立覆蓋網路路徑。

## 展示等價矩陣

“目前展示”由已提交的元件測試、組裝測試與 Web browser expected 共同定義。transport 或 ownership 重構不能作為 refresh snapshot 的理由；獲批產品變化需要獨立證據。

| 情境 | 必須保持的展示 |
|---|---|
| 未知工具 running | Generic 行，工具名與 args 摘要 |
| 未知工具 settled | Generic 行與原始 output |
| malformed args | 安全 Generic fallback |
| orphan result | callId 標題與 Generic output |
| interrupted call | warning/stopped 狀態 |
| bash/pwsh 前臺 | 目前 terminal prompt、正文、cwd 與狀態 |
| bash/pwsh background/error | 目前 Generic IN／OUT |
| persistent shell | 目前 running terminal、settled Generic |
| terminal_send | 目前前臺 terminal、後臺/error Generic |
| write/edit | 目前 intended/applied diff 與 error fallback |
| read | 目前 running 摘要、settled ReadBlock 與 error fallback |
| grep/glob | 目前 grouped/path card、截斷與 recovery |
| web_search/web_fetch | 目前來源/摘要 card 與原始正文 |
| Todo/Question/Skill/Cordis | 目前專用行 |
| PTC dispatch subcall | 滿足條件時顯示 terminal 卡片；diff/read/search/web 保持 Generic/flattened |
| Chat 與 Details | 同一呼叫使用相同 card fields |
| Trajectory | 目前 identity、樹、選擇和 details |
| Deliverables | 目前成功 mutation chips 與連結 |

## Client 擴充功能約定

`tool.call.toolview` 繼續是唯一工具 UI 序號產生器制。一個工具若要在 Client 獲得專用表現，必須由 Client 外掛註冊自己的 wire tool name。

註冊方接收 raw `ToolCallBlock`、Session path 資訊和主機動作，自行驗證它認識的 args/meta 欄位。註冊方不呼叫 Host tool registry，不依賴 `presentCall`／`presentResult`，也不能要求 `SessionEventEntry.view`。

沒有 Client renderer 的工具穩定降級為 Generic。同一 tool name 只能有一個生效 keyed registration，重複 key 繼續 loud failure。

Session-scoped slot 可以表達 Client 側工作階段差異，但不從 preset 推斷 renderer 變體。Host-only presenter 不自動賦予 Web rich card，這是“Host 描述展示”與“Client 外掛擁有展示”的明確邊界。

## 失敗與 fallback

- Client 把 args 與 meta 當作 wire JSON，在消費點收窄。
- 參數 JSON 解析失敗走 Generic。
- 已知工具缺少必要欄位走 Generic。
- metadata 缺失或畸形走 Generic；成功 `write` 例外，它按目前 presenter 行為保留由參數派生的整檔案 diff。
- error result 不因 metadata 存在而顯示成功卡片。
- 缺失 call head 不猜測工具名稱或參數。
- 未知 metadata 欄位被忽略。
- 新 metadata variant 在舊 Client 中走 Generic。
- card-model helper 捕捉可預期解析失敗，不依賴 React error boundary 完成普通 fallback。
- keyed renderer 自身的意外異常仍由現有 Slot error isolation 處理。

## 同名 Host provider

Host registry 允許不同 scope 為同一 tool name 提供不同定義；Session view 透過 presenter scope 理論上可以按 preset 選擇不同 render intent。刪除 view 後，Client keyed slot 只觀察 wire name，不能觀察 Host definition identity。

目前第一方顯著實例是普通與 persistent `bash`／`pwsh`。Client 派生使用有效參數與結果特徵保持它們的已交付差異，不增加 provider-id wire 欄位；無法判別的畸形或自定義同名 provider 輸入採用 Generic。

本次不承諾保留第三方同名 provider 僅透過 Host presenter 表達的差異。若未來產品確需同名 provider 的不同 Client 展示，必須定義穩定、非展示性的 Client identity；不得恢復按頁 Host view 計算。

## 已交付範圍

### Session Controller

- `SessionEventEntry` 只包含 raw event。
- 兩個 Session tool-view 型別都不存在。
- history 不含 presentation import、helper 或 page/follow presentation state。
- 地址、分頁、follow 與 projection 邏輯仍由 Session owner 負責。
- Host 測試固定 raw journal 約定。

### Session Controller Client

- `Session.views` 不存在。
- EventSource replace/prepend/append delta 保持不變。
- transport、fixture 與 test-support 型別攜帶 raw entry。
- event identity 與引用穩定性保持不變。

### UI Conversation、Chat 與 Trajectory

- Conversation input 與 Tool block 不含 view 欄位。
- Chat/Trajectory Tool Definition 讀取 raw event。
- event pairing、Context replay、樹與 target snapshot 保持不變。
- child Tool block 保留現有 PTC dispatch `parentCallId`；row 與 Details slot owner props 都不增加獨立 placement 欄位。

### UI Tool 與 Deliverables

- card model 從 raw block/meta 派生。
- Chat 與 Details 複用相同 helper。
- Generic fallback 與 keyed dispatch 保持不變。
- Deliverables 識別第一方 mutation args。

### Fixture、文件與生成物

- fixture 只發 raw event/meta。
- Session Controller 與 Client README/JSDoc 描述 raw journal 和 Client presentation owner。
- 工具 cookbook 記錄 Web Client 接入路徑。
- 本文是該決定的 owner；保留的 Host presenter Note 繼續擁有各自決定。
- 手寫 Remote 型別、dependency、README、pairing record 與 generated reference 保持同步。

## 驗證矩陣

### Host

- page 返回連續 raw event entries。
- follow 返回 opening cursor 與連續 raw event entries。
- page/follow 在無 Tools service 時行為相同。
- cold page 不解析或掛載 preset。
- tail page 透過標準 projection registry 計算 baseline；provider 是否存在由 projection composition 決定，不引入 history 側 setup 路徑。
- 地址、ownership、message-aligned boundary 與 tail projection 不變。
- listener-before-read、reconnect catch-up 與 gap repair 不變。
- 大量 tool results 不觸發每結果回掃。
- wire 結果不含 view。

`session-history-journal.host.spec.ts` 負責分頁、連續性和 history error 行為，不含 presenter 斷言。

### Client Conversation

- replace、prepend 與 append 接受無 view entry。
- Chat 與 Trajectory root call/result 配對不變。
- PTC dispatch 樹不變。
- result-only fallback 不變。
- interruption synthetic result 不複製 view。
- registry rebuild、older prepend 與 live append 的 Node identity 不變。

### Client card model

- terminal 用 raw args/content 得到已固定的 props。
- diff 用 args/meta 得到已固定的 diffs。
- read 用 meta/content 得到已固定的 lines。
- search 用 meta/content 得到已固定的 grouped/path card 與 recovery。
- web 用 meta/content 得到已固定的 sources/fetch summary。
- unknown、malformed、error、missing-call 與 missing-meta 繼續 Generic。
- `parentCallId` 缺失與存在的案例證明 terminal 適用規則一致，並保留 diff、read、search 和 web descendant 的 Generic fallback。
- Chat 與 Details 對同一 block 得到相同 card fields。

### Deliverables

- write/edit 成功產生 `file_path`。
- str_replace_editor create/str_replace/insert 產生 `path`。
- str_replace_editor view 不產生 path。
- failure、interrupted、malformed 與 orphan 不產生 path。
- first-seen 去重與 closing seq cut 不變。

### 組裝與瀏覽器

- terminal、diff、read、search、web browser expected 不重新整理並全部透過。
- tool tree、details、trajectory 與 deliverables 的可見斷言不改預期。
- built Client 透過真實 Remote page/follow 取得 raw events 後仍顯示同樣卡片。
- fixture 與真實 Host 使用同一 Client derivation。
- minimal preset 單獨固定 persistent shell 行為。

### 靜態與文件

- 生產程式碼不存在 `SessionToolView`／`SessionToolCallView`。
- Session history 不引用 `dsh-tools/presentation`、`ctx.tools`、`presenterScopeFor` 或 `backscanArgs`。
- Client Conversation 不引用 `ToolCallView`／`ToolResultView`。
- Client model 不讀取 `callView`／`resultView`。
- fixture 不定義 presenter mirror。
- Host `presentCall`／`presentResult` 與 `presentationMeta` 仍存在。
- 沒有新增 Client registry 或 Host→Client presentation hint。
- 受影響的手寫型別、README、Agent Note、catalog 與 graph 保持同步。

## 驗證命令

修改本決定時使用 `dsh-pre-push-checks` 按最終 diff 選擇命令；所需證據包括：

- Session Controller history/transport 聚焦測試；
- ui-chat 與 ui-trajectory Tool Definition 測試；
- ui-tool terminal、diff、read、search、web、row、tree 與 details 測試；
- ui-deliverables produced-files 測試；
- 組裝 RemoteMock 與 Client runtime 測試；
- 受影響 Host/Client TypeScript face；
- lint 與 duplication；
- 受影響原始檔 per-file 100% coverage；
- `DSH_SNAPSHOT=replay pnpm run test:web`，不得 refresh 現有展示 golden；
- 手寫 Remote 型別與 TypeScript 檢查；
- `pnpm run doc-sync`；
- `git diff --check`。

## 已交付不變數

- Session page/follow 不讀取 Tools registry 或 presenter scope。
- Session history 不存在 callId backscan、presentation cache 或 view clone。
- Remote Session entry 不攜帶 view。
- Session 日誌與 `SESSION_FORMAT_VERSION` 不變。
- result meta 逐位元組透過日誌與 Remote 到達 Client。
- Conversation 只從 raw event 組裝 ToolCallBlock。
- ToolCallBlock 不含 Host render-intent 欄位。
- 五類結構化 card model 只讀 raw block 與 Session path facts；只有 diff、read、search 和 web 使用 `parentCallId` 拒絕子呼叫。
- Generic、Todo、Question、Skill 與 Cordis 行行為不變。
- Deliverables 不依賴 render intent 且保持目前 paths。
- 所有第一方頂層工具的文字、元件、展開內容、狀態、連結與排序不變。
- malformed、missing-meta、error、orphan 與 unknown-tool 繼續安全 fallback。
- PTC dispatch 的 diff、read、search 和 web 子呼叫保持 Generic/flattened；terminal 子呼叫遵循根呼叫適用規則。
- Chat、Details 與 Trajectory 行為不變。
- 現有 Web browser expected 無需重新整理即可透過。
- Host presenter API、實作與直接測試不變。
- ACP 輸出不變。
- 沒有新下行展示欄位或第二套 Client registry。
- 分頁成本不再隨 result 數量乘以頁面事件數增長。
- 下行 payload 不再重複 result meta 的 card DTO。

## Alternatives considered

### 只最佳化 `backscanArgs`，保留 view

page 前建立一次 `callId → {name,args}` Map 可以把回掃降為線性，live 已有 `openCalls` 快路徑；但 Host lookup、preset scope、presenter、JSON clone、重複 payload 和雙重所有權仍存在，因此拒絕。

### 在 Client 建 presenter registry

把 `presentCall`／`presentResult` 介面複製到瀏覽器會與 `tool.call.toolview` slot 重複註冊、生命週期、fallback 和覆蓋語義；renderer 仍需把 presenter DTO 轉成元件 props，因此拒絕。

### 讓 Conversation Tool Definition 生成統一 view

這會把工具名稱和 UI card 語義放進 target-neutral Conversation owner，並重建與 Host view 同構的中間 DTO，因此拒絕。

### 刪除 `presentationMeta`

read 行結構、applied diff、search 分組、web sources 和有效 truncation 無法從模型文字無損恢復；解析自由文字也會把 UI 綁到輸出措辭，因此拒絕。

### 持久化 canonical tool result

這會擴大 Session log、暴露內部結果結構、改變持久格式，並可能儲存遠超展示所需的大物件；已有 metadata 足夠，因此拒絕。

### 刪除 Host presenter API

一併刪除可以繼續收縮程式碼，但本決定保留 Host `presentCall`／`presentResult`；其 API、實作、測試與型別獨立於 Session Remote。

### Client 匯入 Host 工具實作

工具包包含 Node、filesystem、subprocess 或 provider 依賴，不能進入瀏覽器 bundle；Client 只消費 raw JSON，並在自己的 renderer 內維護窄解析，因此拒絕。

### 按結果向 Host 查詢 presentation

按需 RPC 會把一頁讀取變成 N 次網路呼叫，仍需 Host lookup、scope、callId 查詢與錯誤協調，因此拒絕。

### 允許展示增強

將更豐富的 PTC dispatch 卡片、缺失 call head 的推斷或其他歷史展示增強與所有權變更捆綁，會使快照無法證明對等。本決定拒絕這種捆綁；[巢狀 terminal 卡片例外](../bug-fix/2026-09-05-nested-terminal-cards.zh.md)不放寬非 terminal 子呼叫限制。

### 接受臨時 Generic 退化

先停發 view 再逐步補 Client card 會讓 terminal、diff、read、search、web 與 Deliverables 在中間版本退化。Client 對等實作與 Host 刪除必須在同一可釋出變更中完成。

## Consequences

本決定從 Session 讀取中刪除 presentation 工作、重複掃描和重複 view payload；代價是保留的 Host presenter 與 Client card derivation 可以獨立演進，因此兩側都需要 owner 專屬測試，Web 展示對等仍是明確產品約束。

### Client 與 Host 邏輯漂移

同一工具可以有一份 Host render intent 和一份 Client card derivation。兩者面向不同消費方，不共享執行路徑；不重新整理的 browser expected 固定第一方 Web 視覺對等，Host presenter 測試只約束 Host API。

### 同名 provider 無穩定 identity

raw event 只記錄 tool name，不記錄具體 ToolDefinition。Client 使用有效事件欄位保留普通與 persistent shell 的差異；無法判別的自定義或畸形輸入退回 Generic，wire 不為理論擴充功能性增加 hint。

### Metadata 是未知 JSON

舊 Session 可能缺欄位，手工修改日誌可能帶畸形值。每個 Client model 必須區域性收窄，不能把未知陣列或物件直接傳給 UI primitive。

### preset-owned projection 可用性

history 不為目前組合中缺失的 projection unit 補償。需要在冷讀中保持可見的 preset-owned unit，必須由共享的 Session preparation/projection 組合在 restore 前提供其定義；history 不得重新增加 preset mount 或 presenter setup 分支。

### 雙 target 同步

Chat 與 Trajectory 各有獨立 Tool Definition，兩者都攜帶 raw fields；card derivation 只能留在 `ui-tool`，不能複製進兩個 Definition。

### Deliverables 隱性依賴

Deliverables 不是視覺元件，因此 mutation parser 必須與受支援的第一方寫工具保持同步；專用測試獨立於卡片截圖固定 file chips 與 Markdown links。

### Fixture 假綠

fixture 下發 raw event/meta，不下發手寫 view。真實 Host 組裝覆蓋仍然必要，因為 fixture-only snapshot 不能證明 transport 路徑。

### 錯誤重新整理快照

本次承諾使用者可見輸出不變。出現 snapshot diff 時必須修 Client 派生；除非 owner 單獨批准具體視覺變化，否則不得 refresh expected。

### 文件漂移

raw journal 或 Client presentation owner 變化時，Agent Note、package README、cookbook、根規則與 generated reference 必須一起更新；Host API 文件保持獨立。

### Remote 協定收縮

optional `view` 的缺失是所有 consumer 共同遵守的預釋出 wire 型別決定；沒有相容 shim、雙寫或版本協商。

## 與現有決策的關係

[巢狀 terminal 卡片](../bug-fix/2026-09-05-nested-terminal-cards.zh.md)僅部分取代 terminal 子呼叫卡片禁令及其展示對等要求。本文繼續負責原始 journal 所有權、Client 派生以及 diff/read/search/web 子呼叫限制。

本文部分取代 [Client 工具展示所有權](../../archived/architecture/2026-08-08-client-tool-presentation-ownership.md) 中“card model 接收 Host view”的實作事實；`ui-tool` 擁有展示、業務外掛使用 keyed slot、Conversation 只擁有生命週期與拓撲的核心決定保持不變。

本文保留 [toolview 溶解](../../archived/architecture/2026-07-23-toolview-dissolution.md) 的決定：Client 仍只有 slot 註冊模型，不恢復 `ToolViewRegistry`。

本文收窄 [render-intent union](2026-07-02-tool-render-intent-union.zh.md) 的消費範圍：Host API 與型別保留，Session Remote 與 Web Client 不消費它。本文獨自規定 transport 拆分，不改寫該 presenter 決策。

本文更新 [Session 歷史與 Remote 事件傳輸](2026-08-18-session-history-and-event-transport.zh.md) 的 entry 約定：journal 只運輸原始 event 與獨立 projection baseline，不承載臨時 tool view。

本文遵循 [Conversation Node 組裝](2026-08-09-client-conversation-node-assembly.zh.md)：Tool Definition 負責事件配對與呼叫樹，具體 card model 留在 `ui-tool`。

本文保留 [規範工具輸出約定](2026-07-20-canonical-tool-output-contract.zh.md) 的 result metadata，因為它是無損、可重放 Client 派生的輸入。

## Deferred

- Host presenter 若長期沒有生產消費者，可由另一項明確決策評估刪除；本決定不預判。
- PTC dispatch 子呼叫的 diff、read、search 和 web 專用卡片仍需獨立設計並更新可見快照；terminal 呼叫由連結的部分取代決策負責。
- 第三方 mutation tool 若要加入 Deliverables，需新增 Client-owned 貢獻；本決定不為尚無消費者的擴充功能性建 registry。
- 同名 provider 若要不同 Client 展示，需先定義穩定、非展示性的 identity；不得恢復按頁 Host view。
- Client card model 若需量化效能，可以增加 immutable-block 微基準；已交付架構禁止掃描 Session window。
