# Agent Note: Headless 的機器可讀執行介面

Status: implemented

[English](2026-09-09-headless-machine-readable-run-surface.md) | 中文

## 問題

`dsh --profile headless` 面向的是人類終端：任務只能透過 argv 傳入，stdout 只輸出最終一條助手訊息，provider 的推理過程流式寫到 stderr，而且每次執行都新建一個隨機工作階段。[Headless is a direct core entry point](../../archived/architecture/2026-08-09-headless-direct-core-entry-point.md) 擁有那套傳輸與完成契約；[headless reasoning progress](../../archived/feature/2026-08-21-headless-reasoning-progress.md) 擁有 stderr 投影。

一個"每次喚醒起一個 headless 程序"的監督程序（例如外部 agent 執行時）需要三樣該契約沒有提供的東西。它需要透過私有管道而不是 argv 傳入任務，因為長提示詞會超出參數上限，而 argv 對其他程序可見。它需要一條機器可讀的流，把助手文字、推理、工具呼叫與結果、輪次邊界和用量區分開，因為抓取 stderr 只能拿到推理，而 stdout 最後一行拿不到任何工具活動。它需要一個精確的工作階段身份，以便在下一次喚醒時傳回去，因為每次程序都新建隨機工作階段意味著無法連續。

## 決策

`dsh-headless` bundle 擁有一個可選的機器可讀執行介面。預設呼叫保持原有契約不變：stdout 輸出一條最終助手訊息，推理走 stderr，當且僅當終端 `turn/end` 原因為 `completed` 時結束代碼為 0。

三項新增擴充功能 [Apps own their command lines](../../archived/architecture/2026-08-06-app-owned-command-line.md) 確立的 app 自有命令列：

- `--json` 把 stdout 負載換成逐行 JSON 執行事件。推理變成一條事件而不再寫 stderr，因此該模式下 stderr 只承載 `dsh:` 診斷。
- `--session-id <id>` 選定精確的工作階段身份：採用具有該 id 的持久化工作階段，不存在時就失敗。不帶該 flag 時，執行仍像以前一樣生成 `session-<uuid>`。
- 沒有位置參數、或者位置參數為 `-` 時，任務文字改從 stdin 讀取。

每次執行的 `--model` 覆蓋被明確排除在範圍之外；組合預設模型仍然權威。

產品改動限於 `packages/bundle/headless`：`src/startup.ts`、`src/index.ts`、新增的 `src/json-stream.ts`、包清單與 `tsconfig.json`，以及測試。圍繞它，產品 profile 的期望測試位於 `apps/cli/tests/profiles/headless/tests/headless.expected.e2e.ts`，端到端覆蓋兩種輸出模式，並給 `packages/test-support/loader-smoke` harness 增加了一個可選的呼叫方自有 `cwd`，讓兩次喚醒共享同一個世界；`scripts/check-workspace-constraints.ts` 與包清單負責釋出兩個入口共同引用的共享 chunk `lib/json-stream-*.js`，`pnpm-lock.yaml` 則記錄新增的 `@deepseek-ai/dsh-session-query` workspace 連結。不修改任何 core session、持久化、session-controller、base 組合或 launcher 檔案。

### 命令列契約

```text
dsh --profile headless [--json] [--session-id <id>] [<task>... | -]
```

任務解析順序：拼接後的位置參數，其次是 `-`，其次是管道 stdin。只有空白的位置參數本身就屬於用法錯誤，即使 stdin 不是終端也一樣，因此誤傳的空白參數絕不會消費管道內容；完全缺失任務時，僅在 stdin 是終端時屬於用法錯誤。單獨的 `-` 是唯一的 stdin 標記：把它與其他任務詞混用屬於用法錯誤，而不是以連字元開頭的任務。管道任務會原樣傳送，包括結尾換行。在 `--json` 模式下，所有用法錯誤——包括 commander 自身的語法拒絕，例如未知選項或選項缺少取值——都會在程序退出前寫出 `error` 事件，因為 runner 從未掛載來寫它；事件 message 省略 commander 的 `error: ` 字首，使同一事件型別只承載一種訊息形態。

`--json` 只改變 stdout 負載和推理投影的去向。結束代碼、關閉順序、工作階段 flush 和持久化工作階段日誌都不變，因此監督程序對一次執行的分類方式與現在完全一致。

### 事件流

`--json` 向 stdout 每行寫一個 JSON 物件，不寫其他內容。詞彙表是工作階段事件日誌的投影，而不是日誌本身。

| `type` | 欄位 | 發出時機 |
|---|---|---|
| `session` | `sessionId`、`cwd` | 第一行，先於任何模型輸出 |
| `status` | `phase`（`turn_start`、`step_start`、`step_end`、`turn_end`）、`turn`、`step`、`usage`、`reason` | 每個邊界一條 |
| `text` | `text` | 一個已提交的助手文字塊 |
| `thinking` | `text` | 一個已提交的推理塊 |
| `tool_call` | `callId`、`tool`、`input` | 每次呼叫一條 |
| `tool_result` | `callId`、`status`、`result` | 每次追加的結果一條 |
| `error` | `message` | runner 在輪次之外丟擲的失敗 |
| `final` | `text` | 最後一行 |

投影規則：

- 文字與推理只從已提交的 `assistant/message` 投影，絕不來自即時的 attempt 增量。被重試或丟棄的 attempt 會追加 `assistant/attempt`，投影直接忽略，因此事件流永遠不會承載持久化日誌中不存在的內容（[只在提交點發布狀態](../../../../packages/AGENTS.md)）。
- 每個已提交的內容塊按內容順序變成恰好一條 `text` 或 `thinking` 事件；`tool-call` 塊不投影，因為 `tool/call` 事件已經擁有它。`user/message` 回顯和內部工作階段事件（標題、模型選擇、投影、檢查點、目標、子 agent）都不投影。
- `tool/result` 僅在其 `surfaceOp` 為 `append` 時投影。壓縮對舊結果的替換屬於歷史，投影它會產生沒有對應 `tool_call` 的 call id。
- 每個被投影的字串與物件鍵都限制在 8 KiB；被截斷的事件帶 `truncated: true`，單條序列化事件行（含換行）限制在 32 KiB——超長事件保留標量欄位、丟棄結構化欄位，極端情況下只剩 `type` 與 `truncated`，巢狀達到 64 層及以上的負載會在該深度被截斷，因此任何合法輸入都不會讓限界遞迴溢位。程序級 `error` 事件同樣受限；字面量 `__proto__` 參數鍵會作為資料複製，而不經過繼承的 setter；空工具參數字串會投影為 `{}`，與執行器保持一致；JSON 無法往返的參數（例如溢位為 `Infinity` 的 `1e400`）保留原始文字，而不是 `JSON.stringify` 會報告的 `null`。終止 `final` 事件刻意不做限長：它承載與預設模式相同的無損答案。
- 文字與推理在步驟提交時到達，而不是逐 token 到達；預設模式的 stderr 推理仍是唯一的即時文字通道。輪次內失敗的執行仍以 `final` 結束且沒有 `error` 事件，因此即使事件流格式良好，監督程序也要用結束代碼與 `turn_end` 原因來分類該次執行。
- `usage` 僅在該步每一次 attempt 都上報了樣本時出現在 `step_end` 上，並累計這些樣本——包括僅在被丟棄的 `assistant/attempt` 流中留下用量樣本的重試——因此部分彙總不會被當作精確總量釋出。
- 原始工作階段事件不在範圍內。除錯用的逃生口可以以後再加，不必改動這套詞彙表。

### 工作階段身份

身份由執行時擁有。不帶 `--session-id` 的執行生成 `session-<uuid>`，並在第一條事件裡報告它。監督程序儲存該值，並在下一次喚醒時傳回。

`--session-id <id>` 是隻採用：先觀察持久化工作階段並 resume，日誌不存在時失敗。首輪不傳該 flag，由執行時生成身份並在 `session` 事件裡報告；後續每一輪都用該值指名並續接歷史。請求的 id 沒有持久化日誌時報錯，而不是開一段新工作階段，因此寫錯或過期的 id 不會靜默開出一段呼叫方自以為在續接的空歷史，JSONL 儲存拒絕已存在日誌 id 的問題（見 [session persistence](../../implemented/architecture/2026-06-14-session-persistence.zh.md)）也不會出現在這條路徑上。標識是不透明的，因此 runner 只在 trim 後的值上驗證非空，並把呼叫方的原始字串（含空白字元）原樣傳下去。

採用時會比較持久化工作階段記錄的 cwd 與程序 cwd，因為工作階段按專案目錄組織（見 [project session directories](../../implemented/architecture/2026-07-24-project-session-directories.zh.md)）。不一致時以 `dsh:` 診斷退出 1，而不是靜默續接一個根目錄在別處的工作階段；未記錄 cwd 的工作階段出於同樣理由被拒絕。執行在 agent preset 下的工作階段被拒絕，因為本 bundle 不組合任何 preset roster：在這裡 resume 它，會用 headless 的工具與提示詞執行它，而不是它日誌目前記錄的組合。該檢查讀取日誌目前記錄的 preset——建立 header 再疊加任何 `agent-preset/selected` 事件——因為空白工作階段可能在建立後切換 preset，而 header 始終只是建立事實；畸形的選擇記錄會失敗關閉，而不會讀成「無 preset」。帶父工作階段或子 agent 關聯的工作階段——包括使用者 fork 出的工作階段——被拒絕。本程序已存在持有請求 id 的存活 Agent 時直接拒絕：它的 owner 可能仍在驅動它，而 `whenIdle` 不是單條訊息的完成訊號，runner 無法對它取得獨佔區間。resume 後的日誌會在 runner 等待 idle 後再次檢查，因此該視窗內選中的 preset 仍會被拒絕。純空白的 `sessionId` 在 CLI 與直接設定兩條路徑上都會被拒絕。兩個存活程序不能寫同一個 id；儲存的寫租約已經會拒絕第二個寫入者。runner 透過已組合的 `sessionQuery` 服務讀取觀察結果，並在請求 `--session-id` 卻沒有該服務時顯式失敗——觀察結果正是它找到待 resume id 的途徑；若所請求的身份缺少讓它持久化的 `sessionPersistence` 服務，同樣顯式失敗。

## 後果

實際落實：`src/startup.ts` 解析 `--json` 與 `--session-id <id>`，把缺失或為 `-` 的任務視為"從 stdin 讀取"，並且只在 stdin 是終端時丟擲用法錯誤。`src/index.ts` 解析任務、採用指名的工作階段——未傳 flag 時生成新身份——並接上 stderr 推理投影或新的 `src/json-stream.ts` 投影。`cordis.patch.yml` 轉發這兩個新設定。`package.json` 釋出兩個入口共同引用的共享 chunk `lib/json-stream-*.js`，因此安裝後的 tarball 可以載入。

- 預設模式不變：純文字執行向 stdout 寫一行最終助手訊息、stderr 無輸出，結束代碼仍跟隨終端原因。
- `--json` 的 stdout 逐行可解析為 JSON，以 `session` 開頭、以 `final` 結尾，不含純文字。該模式下 stderr 不承載推理。
- 發生重試的步驟只為最終提交的 attempt 釋出 `text` 與 `thinking`，因此被丟棄的 attempt 不會在事件流中留下任何痕跡。
- 兩次連續的相同 `--session-id` 執行共享歷史，而請求一個沒有持久化日誌的 id 會在任務執行前退出 1。cwd 不一致、未記錄 cwd、屬於子 agent 或 fork 工作階段、執行在 agent preset 下、preset 記錄畸形，或本程序已存在同 id 存活 Agent 的執行都以診斷退出 1。
- 無位置參數但 stdin 有管道輸入時任務被採納，只有空白的位置參數會被拒絕而不會消費管道，互動式無任務呼叫仍以用法錯誤失敗。
- 單元覆蓋落在 `packages/bundle/headless/tests/startup.spec.ts`、`tests/headless.spec.ts` 與 `tests/json-stream.spec.ts`。`apps/cli/tests/profiles/headless/tests/headless.expected.e2e.ts` 的產品 headless profile 期望測試端到端覆蓋兩種輸出模式。

延期與未決：

- 每次執行的 `--model` 覆蓋尚未實作。後續改動必須尊重 Session Controller 擁有的工作階段區域性選擇優先順序，而不是覆蓋已儲存的選擇。
- 冷啟動加上日誌重放會隨工作階段變長而增長，因此長工作階段每次喚醒的代價高於新工作階段。
- `--json` 把推理從 stderr 移到 stdout，因此只監聽 stderr 的日誌收集器在該模式的有推理執行上什麼都看不到。
- 有界的 `tool_result` 負載會讓監督程序看不到完整輸出；8 KiB 字串/鍵上限與 32 KiB 行上限由 `src/json-stream.ts` 擁有，應保持為常數，終止 `final` 事件是唯一的例外。

## 備選方案

**`--verbose` 人類可讀文字寫到 stderr。** 監督程序解析的是 stdout，只落在 stderr 的投影對它不可見。預設模式的 stderr 推理已經是人類可讀的 verbose 面。

**直接傾倒原始工作階段事件。** 它們在增量之外重複整條已組裝訊息，回顯 `user/message`，還夾帶內部事件。在同一條提示詞上實測，pi 的增量流產生 84 行、11.7 KB，而 opencode 是 3 行、962 B；pi 大約四分之一的位元組花在把同一條訊息在 `message_end`、`turn_end`、`agent_end` 裡重複三遍。

**用長駐 SDK 程序代替每次喚醒一個程序。** SDK 已經有結構化事件和顯式的工作階段身份語義，但它會替換掉監督程序所依賴的"一次喚醒一個程序"模型。實測 headless profile 的冷啟動約為熱態 0.45 s、冷態 1.2 s，相對一個真實輪次很小。

**讓監督程序生成工作階段 id。** 身份屬於擁有日誌的執行時。監督程序記錄第一條事件報告的值即可。

**採用或建立語義的 `--session-id`。** 在日誌不存在時建立所請求的 id，會讓寫錯或過期的 id 靜默開出一段監督程序自以為在續接的空歷史；首輪本就不傳該 flag 並從 `session` 事件讀到生成的 id，因此沒有任何呼叫方需要用 `--session-id` 來建立。

**任務只走 argv。** 長提示詞會超出 `ARG_MAX`，並且把提示詞暴露在程序列表裡。
