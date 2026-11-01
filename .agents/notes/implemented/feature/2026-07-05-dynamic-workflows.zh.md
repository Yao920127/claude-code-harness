# Agent Note: 動態工作流——腳本驅動的多 agent 編排 seam

Status: implemented

[English](2026-07-05-dynamic-workflows.md) | 中文

## 問題

harness 可以透過 `dsh-tool-subagent` 將一個任務委派給一個子 agent（智慧代理），但需要扇出到多個獨立部分的工作——跨多檔案審計、遷移、多角度調研、對抗式驗證——迫使模型逐輪次編排：每個中間結果都落入父上下文，計劃無處持久儲存，每一步的協調都要消耗一次模型往返。Claude Code 以[動態工作流](https://code.claude.com/docs/en/workflows)的形式提供了這一能力：模型編寫一段 JavaScript 編排腳本，執行時執行它，由腳本（而非對話）持有迴圈、分支和中間結果。

## 決策

在 `packages/workflow/` 下以 bash seam 的形態（Service Definition／Service Provider／Consumer）提供一組工作流能力，以及它在 subagent seam 上所需的結構化輸出基礎。

### 腳本約定（相容 Claude Code）

一次工作流呼叫包含 JSON `meta`（`name`、`description`，以及可選的 `whenToUse`/`phases`）和一段支援頂層 `await` 並返回 JSON 值的 JavaScript `script` 正文。中繼資料作為資料驗證，從不被執行。正文接收 `agent(prompt, options)`、`parallel(thunks)`、`pipeline(items, ...stages)`、`phase(title)`、`log(message)` 和 `args`。流水線各階段接收 `(prev, item, index)`，階段之間無屏障；失敗的子 agent 和普通階段錯誤將受影響的 item 結算為 `null` 並跳過其剩餘階段。Claude Code 的確定性限制隨日誌機制一併延後實作，因此相容的腳本正文在將 meta 頭移入參數後可以使用時鐘和隨機數。

與 CC 有一處刻意的嚴格性差異：掛鉤誤用——未知或延遲的選項（`effort`/`isolation`/`agentType`）、格式錯誤的參數、超出支援子集的 schema、觸發上限、seam 啟動失敗——會丟擲帶 `fatal: true` 的 `WorkflowError`，組合器會重新丟擲 fatal 錯誤而非將 item 置為 null。如果不這樣做，一個拼錯的選項會悄然變成一個與子 agent 失敗無法區分的 `null`——這正是本儲存庫禁止的「被接受後被忽略」的失敗模式。另有一處新增：工具的 `args` 參數是一個 JSON 物件（裸列表被包裝為一個欄位），使協定格式（wire format）保持誠實。

### seam（dsh-workflow）

`ctx.workflowEngine` 是 bash 形態的抽象 `WorkflowEngine`——每個上下文一個引擎，無命名提供者註冊表（引擎是部署級替換，不是共存者）。`start(request)` 對無法啟動的腳本同步丟擲；返回的 `WorkflowRun` 的 `result` 永不 reject（失敗時結算為 `stopReason: 'error' | 'cancelled'`）。`workflow/*` 事件是僅觀察的 emit，攜帶資料快照（id + meta；`workflow/end` 省略 result 值），按監聽器隔離，與 `subagent/start`/`subagent/end` 對稱——控制權留在 run 的持有者手中。詞彙詳情見 [subsystems/workflow.md](../../../../docs/subsystems/workflow.zh.md)。

### 引擎（dsh-workflow-ptc）：共享 Node 程序執行

[工作流沙箱複用決策](../architecture/2026-09-13-workflow-ptc-sandbox-reuse.zh.md)取代 worker-thread 執行與信任實作。引擎在沙箱化 PTC Node 程序中保留 VM 與輔助函式。VM 定義腳本 API；OS 檔案策略和受管程序清理由共享執行提供者負責。

主機在釋出前驗證中繼資料並解析正文。Host 繫結將 guest 連線到 subagent 和工作流觀察器。待啟動與已釋出子記錄共享取消訊號；[agent 作用域執行時設計 Agent Note](../architecture/2026-07-12-agent-scope-runtime-design.zh.md#workflow-children-are-pending-starts-or-published-records)負責其生命週期規則。

**Meta 是資料**：Host 從不執行中繼資料字面量。**值是無損 JSON**：guest 側 realm 物化在 PTC 傳輸前拒絕不支援的值。getter 在受限程序內執行，掛鉤錯誤跨 realm 保留穩定的 `name` 與 `code` 欄位。保留協作式輔助函式上限與最初同步片段超時；不增加整體工作流經過時間定時器。

### Consumer（`dsh-tool-workflow`）

一個 `workflow` 工具，映像 `dsh-tool-subagent` 的同步形態：啟動、await、`try/finally` dispose、abort 橋接 `exec.signal`、非 `completed` → `isError`。渲染意圖：一張以呼叫的 `meta.name` 參數為標題的 `generic` 卡片（展示是參數的純函式）。工具描述即面向模型的編寫規範。使用策略以工具自身的 `tool:<toolName>` 提示詞段落隨工具釋出（顯式請求才使用的引導——工具引導存在於工具外掛中，從不在部署 persona 中）；harness 沒有 ultracode 風格的 effort 門控。

對於頂層工具執行，同一消費方還會把執行及實際成員生命週期寫入呼叫方父 Session，形成四類 log-only `tool-workflow/*` 事件。記錄路徑只觀察、不控制執行：第一次 append 失敗會停用本執行後續寫入並留下合法字首，不改變工具結果。[`ui-workflow-run`](../../../../packages/client/ui-workflow-run/README.zh.md) 透過 Conversation Node 引擎重建這些事實，形成獨立 keyed Chat 行；現有 generic 工具行繼續擁有自己的展示。持久化、回放、展開/收起與即時導航的詳細決策見 [Chat 中的持久工作流執行](../../archived/feature/2026-08-10-durable-workflow-runs-in-chat.md)。

### 基礎：subagent seam 上的結構化輸出

`SubagentStartRequest.outputSchema` 由 `dsh-subagent-in-process-driver` 為兩個程序內後端實作。每個結構化子 agent 在 `child.ctx` 上獲得自己的作用域捕捉工具、指令和強制註冊；並行子 agent 可以使用不同的 schema 而不共享可變策略，dispose 子 agent 時移除整個附件。

輸出 schema 使一次 schema 有效的已提交捕捉成為子 agent 成功完成的必要條件。作用域執行時呈現捕捉工具和指令，僅提交成功的最終結果（包括 SDK 呼叫時外層 `run_code` 的結果），在捕捉變為 pending 後拒絕後續副作用，並在提交後不再進行模型步驟即停止子 agent。驗證失敗仍是可重試的工具錯誤；沒有已提交捕捉的正常完成以錯誤結算。

`ObjectJsonSchema` 是 `dsh-tools` 統一且可強制執行的原始 JSON Schema 子集所提供的物件根消費方檢視；不支援的關鍵字會明確報錯，因為該協定資料會逐字成為捕捉工具的 parameters。[統一 JSON 值 schema Agent Note](../architecture/2026-07-20-unified-json-value-schema-dsl.zh.md)定義詞彙與驗證語義，[agent 作用域執行時設計 Agent Note](../architecture/2026-07-12-agent-scope-runtime-design.zh.md#structured-output-commits-only-authoritative-outcomes)則定義組裝、提交、守衛和終止停止演算法。

## 測試

驗證由工作流輔助函式和 Host 生命週期測試、共享 Node PTC 約束測試，以及透過已釋出 profile 的原始碼／建置後工作流執行負責。已記錄工作流與顯式啟用的 Ralph 情境負責組裝後的模型轉錄；使用 passthrough 沙箱的回放設定不能證明 OS 強制能力。

## 延遲（明確的非目標）

- **後臺收集**（啟動工具 → run id → 完成通知 → 收集），與 shell/subagent 後臺統一一起設計。
- **日誌化 + 恢復**（`resumeFromRunId`、快取的 agent() 字首）：實作它會以腳本約定收緊的形式重新引入 CC 的確定性禁令（腳本可以讀取時鐘）。
- **儲存／打包的工作流**（`.deepseek/workflows/` 註冊表、斜槓命令 API）和**腳本持久化到執行目錄**（工具呼叫事件已經持久記錄了腳本）。
- **巢狀 `workflow()`**、**token `budget`**，以及 `effort`/`isolation`/`agentType` agent 選項（每個都會明確拒絕，並在訊息中註明其已延遲實作）。
- **整體執行的掛鐘超時**：工作流生命週期仍由呼叫方控制；顯式取消停止 PTC 執行並等待子 agent 清理。
- **ACP（Agent Client Protocol）後端結構化輸出**和 **`toolFilter`**（兩者仍以能力標誌 `false` 門控）。

## 曾考慮的替代方案

- **VM 值的 Host 側防護**（代理拒絕、描述符遍歷和跨 realm 克隆）：這些無法強制 OS 檔案權限。VM 求值與物化屬於受限程序內部；共享 PTC 提供者負責程序傳輸處的驗證。
- **程序內 `node:vm` 執行**：機械上最簡——無 RPC、無執行緒——但 `start()` 會在腳本的初始同步切片期間阻塞呼叫方，第一個 await 之後的同步自旋無法在程序內終止（vm `timeout` 僅覆蓋第一個切片），且 `dispose()` 只能在主機迴圈上放棄一個未 settle 的腳本。PTC 程序保持 vm 上下文腳本 API，同時解除主機阻塞並提供受管終止。
- **`isolated-vm`**：引入另一套 JavaScript 引擎會增加原生依賴與部署要求；共享 PTC 提供者已提供程序約束。
- **後臺執行作為預設**（CC 的形態）：延遲。前臺同步與 `dsh-tool-subagent` 的目前形態一致，後臺語義應在 bash、subagent 和工作流之間統一設計一次，而非逐工具設計。
- **工作流層為 `agent({schema})` 做 JSON 解析**：在一個消費方重複 seam 關注點，而 seam 的能力標誌仍不誠實地為 `false`。
- **Meta 嵌入腳本中作為 `export const meta = {...}`**（CC 的確切格式）：保持腳本自包含且 CC 腳本可直接使用，但取得 meta 需要在主機上執行模型編寫的文字。即使一個空的限時 vm 上下文也無法約束腳本控制的 getter（當主機讀取結果物件時）。JSON 參數消除了掃描器、執行和主機自旋漏洞；代價是 CC 腳本的 meta 頭必須移入參數（正文保持可直接使用）。
- **`ValueSchemaSpec` 作為 `outputSchema` 協定型別**：面向作者的形式如今具有等價詞彙，但工作流提供的是來自其他 realm 的原始 JSON Schema 資料；將這類執行時資料假裝成可信的作者宣告，會跳過原始 schema 斷言邊界。
- **schema 物件庫（zod 或本儲存庫的 schemastery）用於結構化輸出子集**：schema 是協定資料——純 JSON，跨越 `agent({schema})` 中的 vm realm 邊界並逐字落入強制工具的 parameters——正是活 schema 物件無法存在的位置；在執行時消費原始 JSON Schema 需要在其上加一個第三方轉換器（zod core 只輸出 JSON Schema，不能反向），且會在 schemastery 的設定角色旁邊放置第二種 schema 語言。
- **ajv 用於值驗證**：它驗證完整 JSON Schema，因此子集門控——模組的真正要點，因為每個被接受的關鍵字都必須是 harness 強制執行的——無論如何仍需手寫；它透過 `new Function` 編譯驗證器；且它將成為 dsh-tools 的第一個執行時依賴，僅為替換約 70 行的值遍歷器，而帶路徑且逐一報告所有違規的錯誤報告無論如何都是自定義的。
- **提供者 JSON 模式代替捕捉工具**：它保證 JSON 有效，但不保證其符合 schema，且它與工具呼叫的互動不明確。捕捉工具保留了輪次內的驗證重試。提供者側的嚴格工具 schema 後續可以在不改變本設計的情況下收窄接受的子集。

## 後果

扇出計劃現在存在於可重執行的腳本中，`outputSchema` 提供權威的結構化子 agent 結果。每次執行付出 PTC 程序啟動與繫結 RPC 成本。Host 執行保持非阻塞，取消停止受管程序，JSON 序列化將 guest 值與 Host 分開。無效選項會失敗而非退化為 Claude Code 的 `null`；消費方透過 run handle 保持控制權，觀察者僅接收快照。頂層 Web 使用者還會得到持久、可回放的工作流記錄，同時不擴寬執行 seam，也不把原工具卡耦合到工作流專屬 UI。
