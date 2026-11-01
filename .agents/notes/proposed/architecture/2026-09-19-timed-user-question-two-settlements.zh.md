# Agent Note: 計時使用者提問的兩次結算

Status: proposed

[English](2026-09-19-timed-user-question-two-settlements.md) | 中文

## Problem

即使還有不依賴回答的工作可做，問題仍可能阻塞 agent（智慧代理）。等待後放行工具呼叫不能丟棄問題：使用者可能在 agent 繼續執行後，或重新開啟 Session 後才回答。pending 結果既不是跳過回答，也不是開展需要批准的工作的授權。

前臺工具結果與最終回答的生命週期不同。`user-questions/request` waterfall（瀑布式事件）只結算一次；返回 pending 後仍保留它，會產生一條活過呼叫方的第二回答路徑。倒計時、聚焦和編輯的歸屬也不同於持久問題狀態。

## Proposal

前臺回答繼續使用現有 Remote Event waterfall。超時結束該請求並返回 pending；遲到回答透過業務 RPC steer 一條持久使用者訊息。接手 stream 只控制前臺等待，既不傳遞迴答，也不替代 Remote Event。

### 模式與範圍

- 預設 `mode: legacy` 保留阻塞式 schema 和 `ask()` 路徑。顯式 `mode: timed` 增加 `timeout`，省略時使用設定預設值 120 秒。
- 正整數超時選擇 `askTimed()`；`-1` 選擇阻塞式 `ask()`。timed schema 發出的阻塞呼叫仍參與計時問題投影和答案檢視，並不等同於 legacy 呼叫。
- 計劃評審保留 `ask()`、`plan-review` 意圖及 `BAD_INTENT` 驗證。本決策不把計劃評審遷移到其他包。
- 提供 Agent 時，人機互動要求它是執行時中確切的存活根實例。陳舊實例以 `CALLER_NOT_LIVE` 失敗；被其他 agent 擁有的子實例以 `DELEGATED_CALLER` 失敗。持久 Session 的血緣關係不妨礙恢復後的執行時根實例提問。

### 職責歸屬

| 歸屬方 | 職責 |
|---|---|
| `tool-ask-user` | 模型 schema、超時驗證、服務選擇和 pending 結果文字。 |
| `UserQuestionService` | 前臺等待與 Client 接手、無人接手時的 deadline、遲到回答驗證與 steering（中途引導），以及持久問題投影。 |
| Gateway 與 Remote 執行時 | 現有請求投遞、結算、取消及 Remote stream 傳輸；不包含問題專屬計時器或按事件名分支。 |
| `ui-user-questions` | 每個 Session 和呼叫的一張卡片、回答通道選擇、本地倒計時與草稿，以及回覆 Definition 和渲染器。 |
| `ui-chat` | 基於訊息 id 的呈現聚合，以及普透過程／輪次摺疊。 |
| 問題專用工具行 | pending／已回答呈現與面板操作，在 `QuestionToolRow` 中組合，不向通用 `ToolRow` 新增 `rowAction`。 |

[問題服務](../../../../packages/interaction/user-questions/README.zh.md)、[工具](../../../../packages/interaction/tool-ask-user/README.zh.md)和[問題 UI](../../../../packages/client/ui-user-questions/README.zh.md)分別擁有各包的約定。

### 前臺等待與接手生命週期

`TimedQuestionWait` 擁有專屬取消 signal、原始 Host deadline 和 Client 接手記錄。Host 只在沒有回答 UI 接手時執行計時器。投遞到傳輸佇列不算接手。最後一個接手方離開後恢復原 deadline，已經過期則立即到期。

計時請求攜帶 `wait: { callId, timed: true }`。Client 在掛接回答通道前開啟業務 Remote stream `attachWait`，接收一幀由 Host 計算的 `remainingMs`，並在接手期間保持 stream 開啟。聚焦、編輯和心跳不經過該 stream。

Client 將接手保留到 waterfall 結果交付給 Host。本地返回回答不等於交付：此時釋放接手會讓已經到期的 Host 計時器搶在回答之前結算。Host 在前臺請求結算時關閉接手。顯式委託在 `next()` 前釋放接手；外掛拆卸會委託請求並取消自己的 stream。

Client 倒計時到期以 `ASK_TIMED_OUT` 拒絕 waterfall。無人接手時，Host 到期只以同一業務錯誤中止等待專屬 signal。`askTimed()` 只把該錯誤對映為 pending，把父級取消對映為 `ASK_ABORTED`，其餘失敗繼續傳播。`NO_PROVIDER` 等待同一個有界等待生命週期，而不是永不結算的 Promise。前臺完成時釋放計時器、接手記錄及等待註冊項。

### 持久狀態與遲到回答

`userQuestions` 投影從現有 Session 事件重建問題狀態。它透過 `request/header` 記錄的 `timeout` 參數識別 timed schema，不跟蹤 legacy 呼叫。有效的 `tool/call` 開啟問題。其 `tool/result` 在 pending 或 `TOOL_OUTCOME_UNKNOWN` 時將問題標為已繼續，在有效回答批次時結算並儲存答案，其他結果或失敗則移除問題。

已繼續的問題接受 `answer(agent, callId, answer)`。未知或非已繼續呼叫返回 `false`；回答批次沒有恰好包含每個問題一次時丟擲 `BAD_ANSWER`。接受的回答透過 `agent.steer(createUserMessage(...))` 送入 agent，來源為 `{ kind: 'user-question-reply', callId, outcome: 'answered' }`，JSON 文字包含 `answer_to_pending_question`、呼叫 id、原問題及答案。Remote 根據 Session id 解析 Agent 時按需恢復根實例；恢復操作不屬於 `answer()` 方法體。

inbox 訊息就是持久回覆。`agent/inbox/spliced` 在訊息入隊時結算問題；隨後接納的 `user/message` 對該結算是冪等的。已結算答案批次保留在投影中，讓原工具行即使自身結果仍是 pending，也能顯示遲到回答。無法使用的已記錄回覆文字以空答案批次結算。

無需新增 Session 事件型別或等待狀態日誌。訊息來源擴充功能需要儲存庫的持久化型別變更確認。`dismissed` 為歷史記錄保留可讀性，但沒有生產者：隱藏面板不會偽造回覆。

### 卡片狀態與投遞競爭

`QuestionCards` 按 Session 和 `callId`，讓即時請求與已繼續投影共享一個 `PendingQuestion`。沒有呼叫 id 的阻塞請求擁有獨立的逐請求卡片。開放卡片透過 waterfall 提交；缺少該通道時停用提交。已繼續卡片使用遲到回答 RPC。

waterfall 提交沒有送達確認。Gateway 可能丟棄輸掉結算競爭的結果，因此卡片保留草稿並保持忙碌，等待投影同步。若提交期間問題變為已繼續，控制元件帶重提提示重新可用，使用者可以透過 RPC 提交保留的草稿。這不是自動重試，也不保證每次本地提交都能到達模型。

按工具呼叫標識的卡片在呼叫不屬於活動投影且沒有 waterfall 時移除。移除會關閉卡片並清理草稿。本地提交和傳輸取消幀都不能單獨決定問題已經回答。無呼叫標識的阻塞卡片隨 waterfall 結束；關閉這種阻塞面板以 `ASK_CANCELLED` 拒絕請求。

### 本地倒計時與面板操作

Client 計算 `Date.now() + remainingMs`。手動聚焦未編輯的回答區會暫停倒計時，失焦後從保留的剩餘時間繼續。接手握手前的聚焦在 deadline 到達時仍生效；握手前失焦不會製造計時器。首次編輯或「慢慢回答」凍結倒計時，該狀態與瀏覽器本地草稿一起儲存。

只有回答通道就緒、沒有活動倒計時且卡片未鎖定時才自動聚焦。隱藏計時呼叫的面板會保留接手和倒計時，工具行可以重新開啟面板。已結算呼叫依據記錄的問題與答案開啟只讀面板，不產生另一條回答通道。

### 回覆節點與分組

問題 UI 透過 `source.kind` 識別遲到回覆，再解析已記錄的 JSON 來呈現問答。普通使用者訊息貼上相同 JSON 不會被識別為回覆。無法讀取的已記錄載荷保留原始文字呈現。

普通訊息 Definition 和問答回覆 Definition 都匹配追加的訊息，在 Node Store 中保留訊息 id 相同的獨立投影。存在同 id 的 `question-reply` 時，Chat 業務分組省略 `turn-trigger` 呈現。重複觸發節點既不渲染，也不切開分組，回覆只顯示一次。相同聚合也適用於無輪次歸屬的歷史輸入。

回覆參與普透過程分組和整輪摺疊，不保證獨立可見：閱讀時可能需要展開所屬輪次與過程分組。輪次摺疊控制元件始終在所控制的分組之前，包括由回覆開啟輪次的情況。

本決策不新增 process-role 欄位、獨立佈局標記、使用者訊息結構變更或目標內 fallback 派發。獨立 kind 規則保留在 Chat 現有分組邏輯中。由節點 data 宣告分組與重疊語義的機制是留待拆分的基礎設施，不屬於問題功能。

## Alternatives considered

**無條件 Host deadline 或 Gateway 擁有問題計時器。** 無條件 deadline 會覆蓋本地編輯和「慢慢回答」。把例外放入 pending Remote Events，或在 Remote 派發中按問題事件分支，會讓通用傳輸擁有業務策略。接手機制將策略留在問題服務中。

**返回 pending 後繼續保留 waterfall。** 請求活過工具呼叫方，遲到的 waterfall 回答與 RPC 競爭。結束前臺請求讓每次結算各有一條回答路徑。

**立即委託所有計時請求。** 向故意留空的回答方集合派發請求，浪費現有阻塞回答路徑，還要求特殊處理 `NO_PROVIDER`。委託表示回答方不可用，不代表計時模式本身。

**持久化整值等待／聚焦／編輯流，或使用 Host 聚焦租約。** 持久問題狀態可從工具與 inbox 事件推導。聚焦和編輯屬於本地 UI 狀態；記錄它們或同步聚焦租約會增加 Host 狀態，卻不能讓多個 Client 共享同一編輯工作階段。

**在通用 `MessageItem` 內重新分類 JSON、借用 relay form，或使用預設 context 行。** 解析文字來識別業務訊息混淆了來源與內容；relay form 表示其他 agent 的訊息，通用 context 行則會暴露 JSON。專用來源、Definition 和渲染器擁有問題呈現。

**透過通用節點中繼資料讓回覆獨立佈局。** 這會把問題功能擴大為對話基礎設施變更。普通摺疊與 Chat 內聚合足以滿足本決策；由節點 data 獨立宣告分組語義仍是單獨的設計任務。

**面板關閉時寫僅入日誌的關閉事件，或偽造放棄訊息。** 僅入日誌會讓模型看不到使用者決定，還增加另一套持久機制。偽造回覆則把隱藏面板當成回答。因此關閉面板仍讓計時問題保持可回答。

**在 inbox 訊息之外增加專用遲到回覆 Session 事件。** inbox 插入與接納的使用者訊息已經記錄回覆。第三個事件重複同一事實，並增加另一種持久化型別。

## Acceptance criteria

- 服務測試覆蓋有人與無人接手、最後接手方斷開、取消、超時錯誤對映、僅接受已繼續問題的回答，以及答案 id 的精確驗證。
- 投影測試區分 legacy 與 timed schema，並覆蓋 pending、已回答、其他失敗、恢復修復及 inbox／訊息重複結算。
- Client 測試覆蓋接手保留到 Host 接受結果、握手前聚焦、無限期等待、草稿保留、RPC 重提及面板隱藏／重開。
- 分組與瀏覽器回放覆蓋保留兩個投影但只渲染一次回覆、普通摺疊位置、摺疊控制元件順序，以及原工具行的遲到答案只讀面板。
- legacy 問答往返、取消、計劃評審意圖及 Session 重新掛載保留既有行為。真實多 Client 投遞競爭與真實 Host 重新啟動仍是獨立生命週期和投影測試之外的整合覆蓋缺口。

## Risks

- 「慢慢回答」隻影響一個 Client。其他 Client 可以回答或讓共享 waterfall 到期，本地聚焦不構成全域暫停。
- 接手 stream 的終止性失敗可能讓前臺問題失敗，而不是產生 pending。不為該失敗提供無人接手等待的 fallback。
- Host 與 Client 時鐘不必對齊，但 Client 系統時鐘變化可能移動到期時間，傳輸延遲可能推遲本地倒計時的開始。
- 重複投影仍保留在儲存中。聚合在結構性分組重建時增加線性掃描；普通純文字 stream 更新保留增量路徑。這是演算法複雜度界限，不是實測延遲結論。
- 無人回答的已繼續問題可以在重新開啟 Session 後繼續存在。關閉面板不寫記錄，可見性遵循普通摺疊，而不是保證回覆始終可見。
