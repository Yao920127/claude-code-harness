# Agent Note: 工具呼叫按 callId 管理準備、派發與結果

Status: implemented

[English](2026-09-22-tool-call-three-phases.md) | 中文

## 問題

模型生成工具參數時，工具名和呼叫 ID 往往已經可用，但 `tool/call` 要等整條 Assistant 流結束後才到達。一次回應包含多個呼叫時，前一個呼叫即使已經生成完整參數，仍要等待後續呼叫。檔案正文也屬於 `write` 參數，這段等待可能持續數秒。

只從 `tool/call` 建立工具節點，會把這段時間表現為沒有工具活動；把準備中的呼叫放在 Assistant 片段裡，又需要 Group 在 Assistant 與正式 Tool 節點之間切換引用。準備態和正式呼叫屬於同一個工具生命週期，不應由兩個節點配合表達。

## 決策

### 同一個 Tool 擁有三個階段

[Tool Definition](../../../../packages/client/ui-chat/src/client/conversation-nodes/tool.ts) 按 callId 聚合呼叫，向工具元件提供明確的階段資料。

| 階段 | 建立或更新依據 | 可用資料與展示 |
|---|---|---|
| `preparing` | 帶呼叫 ID 和工具名的即時 delta | 呼叫身份、名稱和時間；不提供完整參數，只顯示不可展開的一行。可選掛鉤可讀取原始參數字首。 |
| `start` | `tool/call` | 完整參數；啟用工具原有的呼叫展示。 |
| `result` | `tool/result` | 呼叫結果，以及目前視窗內可配對的完整參數。 |

參數塊結束不觸發派發階段。展示準備態不改變模型請求、工具派發時機、Session 事件或持久化格式，也不把空參數字串偽裝成正式呼叫。

### start 表示可建立入口

沿用 [Conversation Definition](../../../../packages/client/ui-conversation/src/client/contract/conversation.ts) 的 `match/start/update` 介面和既有角色。持久事件與瞬態 delta 都可以匹配為 start；目前事件序列中最早的 start 初始化 State，後續 Match，包括同 ID 的其他 start，都交給 update。

Tool 的具名 delta 和 `tool/call` 都是建立入口。即時先收到 delta，就從 preparing 建立；歷史先收到 `tool/call`，就從 start 建立。匹配函式仍然只讀取目前事件，不查詢 Context，不增加角色、註冊表或旁路快取。

成功流結束時釋出最終 Assistant 訊息，瞬態 delta 保留到 `step/end`。每個 `tool/call` 更新已有 callId；Assistant 的即時排序錨點也保留到同一次清理。失敗、中斷或廢棄的流立即移除 delta。清理時，Assembler 從剩餘 Match 重新選擇 start 並重算 State；未派發的準備節點隱藏，不合成執行結果。

### 最終狀態收斂，不重現準備過程

歷史分頁不把已結束 Assistant 訊息展開為即時 delta。重連只恢復仍在生成的活躍流。即時展示可以經歷 preparing → start → result，歷史回放可以直接經歷 start → result；相同持久事件得到相同最終狀態即可，不要求中間過程或準備態分組身份一致。

Group 從準備階段起就聚合 Tool 節點，按工具名分類和計數。AssistantNodeView 不查詢工具塊，Group 不編碼工具 groupPart，也不接替工具生命週期。分組仍遵循[節點輸入的分組決策](2026-09-21-conversation-build-groups.zh.md)，Builder 不解釋準備態業務。

### 通用行復用現有外殼

[ToolRow](../../../../packages/client/ui-tool/src/client/tool/components/ToolRow.tsx) 在三個階段複用既有圖示、標題和行元件。公共行模型選擇工具標題，並組合通用工具名字首與已有參數摘要。準備階段沒有完整參數或結果，共享參數解析入口直接返回 null，不解析 JSON。既有 slot 掛鉤繫結可選地提供目前呼叫的原始字首，不增加準備態序號產生器制；ToolRow 禁止準備行展開。

read、read_image、write/edit、search、web、todo、question、details 和通用退回使用這條路徑。Bash、Skill、Present、Cordis 等自定義外殼保留自己的準備態分支。不增加自動／自管註冊宣告，不在 ToolTree 維護另一份工具分類名單。

### 與已有記錄的關係

本記錄替代[業務節點組裝](2026-08-09-client-conversation-node-assembly.zh.md)中“start 只能是持久事件，同一 Context 只能收到一次 start”的限制。該記錄的穩定 ID、業務 Definition、Context、Location、前序依賴和目標 Builder 職責繼續適用。

## 考慮過的替代方案

**只在 `tool/call` 建立節點。** 無法展示參數生成期間已經確定的工具身份，多呼叫回應仍有明顯空等。

**透過 Assistant 片段和 Group 轉接。** 工具需要兩種展示來源、額外去重和身份銜接；生命週期歸屬分散，渲染器還要根據片段標識反查 Assistant 內容。

**儲存或回放 preparing。** 準備態只描述目前生成過程，持久呼叫和結果已經足以重建最終展示；恢復相同中間過程會增加不必要的狀態和事件解釋。

**新增準備態序號產生器制。** 通用工具已經共享 ToolRow 和參數模型，已有圖示與標題可以直接複用。僅為這一階段增加宣告或設定，會多維護一套工具展示資訊。

## 影響

- 工具可以在參數完整前出現，但準備展示不表示工具已經執行，也不暴露依賴參數的互動。
- 同一 ID 的多個 start 被視為同一個生命週期；業務必須為獨立呼叫提供不同 ID，不能再依賴第二個 start 報錯檢測身份複用。
- 各階段複用通用行基礎元件。write/edit 分離準備態與派發後元件，只有前者訂閱原始參數；自定義外殼也可按階段切換內部元件。
- 不提供部分 JSON 解析或 `useToolCallDelta`。`useToolCallArgumentsPartial` 暴露既有 Step 的原始字首，不另建累積器；write/edit 只使用其長度展示準備進度。
- 組裝測試分別覆蓋即時準備態、撤回、活躍流重建、持久歷史與分頁收斂；元件測試檢查無參數展示和階段切換，錄製工作階段覆蓋瀏覽器中的準備態與過載結果。
