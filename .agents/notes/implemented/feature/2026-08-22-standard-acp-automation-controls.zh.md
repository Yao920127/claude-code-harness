# Agent Note: 標準 ACP v1 自動化控制

Status: implemented

[English](2026-08-22-standard-acp-automation-controls.md) | 中文

> 本說明僅取代 [ACP 作為純自動化協定](../simplification/2026-07-23-acp-automation-only-protocol.zh.md) 中僅支援提示詞的協定清單。該決策關於禁止 ACP 成為第二套產品 UI 的規定仍具權威性。

## 問題

純自動化 ACP 橋接層可以建立新工作階段、一次提交一個提示詞、取消提示詞、接收已提交 assistant 訊息，並回答一次性權限請求。通用外部自動化控制器仍需依賴私有程序知識，才能發現模型、掛載 MCP 伺服器、在重新啟動後找到持久工作階段、恢復工作階段、獨立關閉一個工作階段，以及觀察 reasoning、工具或上下文壓力進度。如果在整合專用 runtime 中複製這些控制，ACP 只會名義上可互操作，而 DSH 自動化仍依賴私有旁路協定。

穩定 ACP v1 協定已經定義所需的控制詞彙。增加私有 `_meta`、自定義方法、案例專用環境處理或展示投影會割裂該詞彙，並重新引入純自動化決策已經移除的 UI 耦合。

## 決策

`@deepseek-ai/dsh-acp` 實作通用控制器需要的完整標準 ACP v1 自動化子集：`session/new`、`session/list`、`session/resume`、`session/close`、`session/prompt`、`session/cancel`、`session/set_config_option`、JSON-RPC `$/cancel_request`、`session/update` 和 `session/request_permission`。儲存庫內每條連線的兩端都使用 `@agentclientprotocol/sdk` 1.4 的 app／context 介面。

能力會省略未支援的方法和功能。DSH 不增加自定義方法、能力標記或 `_meta`，也不為用戶端中繼資料賦予私有含義。`session/load`、`session/delete`、`session/fork`、附加目錄、SSE 和 ACP 傳輸 MCP、模式、命令、計劃、終端、用戶端檔案系統操作和 elicitation 仍不受支援。工作階段控制和語義更新是自動化協定資料；它們不會使 ACP 成為人工 UI。

## Per-session 所有權

每個已公佈 Agent 由一個 `AcpSession` 模組擁有，該模組同時擁有所選模型狀態、請求 MCP 掛載、單提示詞槽位、有序更新鏈和記憶化關閉操作。全域事件監聽器只識別確切 Agent 或 Session，再委託給該模組。模組會在記憶體中把准入快照與已識別訊息關聯到 inbox claim 時刻，再將其固定到已准入輪次。因此，圖片能力檢查、提示詞變數、請求 header 和每個模型步驟都使用同一個提供者／模型／reasoning tuple，而普通持久使用者 source 保持不變。並行設定變更從下一個 ACP 輪次開始生效。

顯式 `session/close`、連線丟失和外掛釋放呼叫同一個關閉操作。它會先取消准入和 Agent 工作，再等待；隨後 drain 已提交更新和可繼續後代、flush 持久化，並釋放 Agent scope 及其 MCP 用戶端。關閉流程會保留事件路由直到 drain 完成。只有所有自有工作階段 teardown 都完成後才報告失敗，其他前端的 Agent 和後代不受影響。

## 持久工作階段控制

完整 ACP 生命週期支援要求掛載工作階段持久化。`session/list` 讀取已實體化的頂層 header，排除活動工作階段和後代工作階段，按規範物理 `cwd` 過濾，按建立時間和 id 排序，並透過不透明 keyset cursor 返回有界頁面。摘要有意省略標題和展示中繼資料。

`session/new` 會顯式要求持久化在不虛構工作階段事件的情況下實體化 live session header，因此即使空工作階段也可以關閉、列出和恢復。其他前端仍保留持久化 seam 的惰性預設行為，不會實體化被放棄的空工作階段。`session/resume` 拒絕活動 id，以及非頂層或未知的持久 id；在組合 Agent 前驗證請求的規範 `cwd`；恢復持久日誌但不向用戶端重放；掛載該請求提供的 MCP 宣告。`session/close` 讓持久日誌可供後續程序使用。

持久化有意把 `create(meta)` 視為 live registration：交付的 JSONL provider 在首次追加事件前不建立 artifact。該預設行為會移除被放棄的空工作階段，但 ACP 不能繼承它，因為 `session/new` 會在任何提示詞出現前公佈工作階段身份，而程序可能在返回成功回應後、收到 `session/close` 前停止。橋接層只在 Agent 和 MCP 組合成功後、返回 `session/new` 前執行實體化；組合失敗仍不留下殘留物，每個已返回 id 則都能在重新啟動後繼續存在。

bridge 經由普通的永續性屏障實體化：`ctx.sessions.flush(session)` 抵達該工作階段的寫控制代碼，其 `flush` 在尚無任何追加時寫入僅 header 實體化。JSONL 寫入一個 header frame；儲存庫外 provider 必須原子實體化等價 header 狀態，否則拒絕該操作。重複呼叫冪等。讓 `create` 全面 eager 會改變所有前端放棄工作階段的行為；追加 synthetic event 會僅為觸發儲存而虛構 sequence 與 replay 事實；等到關閉時再寫入則會讓永續性與程序丟失競爭。

## 標準設定選項

建議性 LLM catalog 現在服務於另一個自動化 consumer，但不會成為請求驗證。ACP 公開按提供者分組的 `model` select，其不透明值保留提供者／模型對；還會公開來自已解析確切模型的依賴 `reasoning_effort` select。具有 efforts 但沒有 adapter 設定預設值的模型會包含 `Provider default`，以保留省略狀態並讓提供者自行選擇。新建、恢復和設定回應都返回完整狀態。Adapter 拓撲事件發出 `config_option_update`；每個工作階段按接收順序序列處理變更。設定的 ACP 提供者／模型仍是初始選擇；未列出的設定路由會合成到返回選項中，而不會被拒絕。

## 標準 MCP 對映

`session/new` 和 `session/resume` 接受標準 stdio 和 Streamable HTTP MCP 宣告。Stdio 使用工作階段 `cwd`；HTTP 使用已宣告 URL 和 header；兩者都保留 `dsh-mcp-client` 的超時和重連預設值。名稱、命令、URL、環境項、header 和重複的規範化 namespace 都會在 Agent 公佈前驗證。初始連線或發現失敗會復原尚未公佈的 Agent。

MCP namespace reservation 跟隨最近的 DSH registration scope，而不是程序 root。獨立 Agent scope 可以使用同一伺服器名，同一 Agent 內的重複名稱仍會失敗。Scoped disposal 會釋放工具、傳輸和 reservation。

ACP 用戶端是受信任的控制器：stdio 宣告授權執行程序，HTTP 宣告授權攜帶其 header 發起請求。DSH 不增加每伺服器私有 cwd 或超時欄位。工具掛載後，普通 DSH 工具策略仍然約束呼叫。

## 語義更新投影

只有已提交的持久事實會進入 `session/update`。Assistant 文字／圖片變成 `agent_message_chunk`；reasoning 變成 `agent_thought_chunk`；工具呼叫／結果變成通用 `tool_call` 和 `tool_call_update`；已知的測量上下文壓力與容量變成 `usage_update`；adapter 拓撲變化變成 `config_option_update`。持久訊息 id 和工具呼叫 id 保留關聯。規範 DSH 工具名作為標準工具呼叫 title。

Per-session 鏈會序列處理所有更新，並在提示詞完成前 drain。引用工具呼叫的權限請求只會在該工具呼叫通知 drain 後傳送。原始模型 delta、重試嘗試、卡片、終端狀態、diff、位置、計劃、標題、todo 和不受支援內容不會進入 wire。

`session/cancel` 和 `$/cancel_request` 進入同一個提示詞自有取消路徑。關聯結尾只對映到標準 stop reason 和 JSON-RPC error；模型輸出達到上限時報告 `max_tokens`。ACP 不返回額外 DSH 結果結構。

## 考慮過的替代方案

**增加私有控制器擴充功能。** 已拒絕，因為標準 ACP v1 已經承載所需生命週期、設定、MCP、取消、權限和語義更新概念。私有擴充功能會使通用 SDK 用戶端不完整。

**恢復之前的編輯器投影。** 已拒絕，因為計劃、終端、diff、卡片、導航和人工 elicitation 屬於展示職責。語義工具和 reasoning 事實可以作為有用的自動化遙測，而無需匯入展示模組。

**實作所有 ACP 工作階段方法。** 已拒絕。列出、恢復和關閉已經完成持久自動化生命週期。載入／重放、刪除和 fork 會引入本案例不需要的獨立 transcript、破壞性儲存和 lineage 語義。

**使用不穩定 provider 方法發現模型。** 已拒絕，因為標準工作階段設定選項可以表達該選擇，並保持工作階段 scope。

**把每個 DSH runtime 欄位複製到 ACP 中繼資料。** 已拒絕，因為精確 token 明細、私有結果狀態、程式化展示名稱和每 MCP tunable 沒有穩定 ACP v1 對應項。

## 驗證

聚焦測試覆蓋：無私有中繼資料的確切能力公佈；模型／reasoning 選擇、無效和並行變更、拓撲更新以及圖片路由固定；stdio／HTTP MCP 設定、宣告復原、scope 隔離、恢復和釋放；列表分頁、規範 workspace 驗證、活動衝突、關閉／恢復和重新啟動恢復；訊息／思考／工具／用量順序與 id；工具先於權限；標準 stop reason；請求和工作階段取消；連線丟失 teardown。

通用 keyless conformance 測試會啟動真實 ACP demo 兩次，並且只使用公開 ACP SDK：選擇模型和 reasoning effort、掛載 MCP 伺服器、執行工具輪次、觀察標準更新、關閉、重新啟動、列出、恢復和取消。它不包含整合專用名稱、依賴、中繼資料或環境行為。

## 後果

外部自動化專案可以透過穩定 ACP v1 使用 DSH，而無需維護 DSH 專用 runtime 協定。橋接層的控制介面變大，但仍小於 UI：它擁有生命週期和語義互操作，而人工展示和互動仍屬於產品用戶端。

持久生命週期和請求 MCP 掛載讓工作階段建立更嚴格。設定錯誤和初始 MCP 失敗會在公佈前拒絕，關閉會等待真實完全停穩和持久化。這是避免部分 Agent、洩漏工具或孤兒程序所需的所有權證明。
