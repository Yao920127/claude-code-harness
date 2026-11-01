# Agent Note：以 Claude Code 作為模型路由

Status: implemented

[English](2026-09-25-claude-code-model-route.md) | 中文

## 問題

已登入 Claude Code 但沒有模型 API 金鑰的使用者，無法在 harness Session 中與 Claude Code 對話。[一次性 Claude Code subagent](2026-08-04-claude-code-and-codex-subagent-backends.zh.md) 只把 Claude Code 作為 harness agent 的委派子任務執行，而父級仍需要一條模型路由，這樣的使用者並沒有。harness 需要一種方式，讓 Claude Code 本身成為 Session 的對話物件，同時保持 agent loop、Session 日誌、模型選擇和 preset 不變。

## 決定

[`@deepseek-ai/dsh-llm-claude-code`](../../../../packages/llm/llm-claude-code/README.zh.md) 在 `ctx.llm` 上註冊 `claude-code` 提供者路由。一次模型呼叫會透過官方 Agent SDK 在 Session 工作區中執行一個完整的 Claude Code 回合，使用主機原生的 Claude 設定與登入；繼承環境中的憑證類變數會被清除。loop 收到一條助手訊息：Claude Code 的文字作為文字，思考作為推理內容，每個頂層原生工具呼叫一行推理內容。該訊息不含工具呼叫，因此 loop 結束該步驟。

助手訊息的 replay 狀態儲存帶版本的遊標：原生對話 id 與該回合最後一個頂層鏈條目。下一次請求從本建置可讀取遊標的最新助手訊息處，用 `resume` 和 `resumeSessionAt` 續接，並只傳送結尾的使用者訊息。原生記錄缺少的訊息——第一個 Claude Code 回合之前的全部訊息，或之後由其他路由產生的回合——會在 `<conversation_history>` 塊中引用一次。在持久訊息自身的遊標處續接，使重試、fork 和恢復的 Session 從 harness 日誌繼續，而不是從最新的原生條目繼續。

本路由可在任何 agent preset 下執行。Claude Code 無法返回工具呼叫供 harness 執行，因此路由忽略 preset 的工具 schema，對話回合保留 Claude Code 自己的系統提示，並只傳送由人撰寫的使用者文字：harness 系統提示與外掛插入的 runtime-context 訊息描述的是 Claude Code 不使用的 harness 工具與沙箱。模型選擇器透過 `supportedModels()` 列出 Claude Code 為已登入帳號報告的模型，此請求不會啟動模型回合。主機 Claude 權限規則未決定的操作，會代表發起呼叫的 Agent 經由 `ctx.approval` 處理。路由預設不重試，因為失敗的回合可能已經修改了檔案。輔助呼叫（設定了 `purpose`）會連同其系統提示傳送所有訊息、從不續接，並以無工具、單回合且不持久化記錄的方式執行。

路由複用 `dsh-subagent-claude-code` 中的 `ManagedClaudeCodeProcess` 與 `claudeSpawnSpec`，因此鎖定版本的平臺 CLI 在 `ctx.subprocess` 之下執行，程序樹歸屬與 subagent 相同。

## 考慮過的替代方案

**按 preset 選擇的第二個 agent driver。** `AgentRegistry` 只持有一個 factory，按 preset 路由需要修改核心。空白 Session 會透過 `recompose` 在同一個活動 Agent 上更換 preset，而一個 Agent 無法跨 driver 這樣做。每個與 loop 耦合的外掛也都需要第二套實作，否則會靜默失效。

**在專用 Profile 中替換 agent loop。** Claude Code Session 將無法與其他路由共存，而讀取 `turnBoundary` 與 inbox 等 loop 投影的 Web 介面也需要一個並行的生產者。

**透過程序內 MCP 伺服器向 Claude Code 暴露 harness 工具。** Claude Code 會在模型呼叫內部執行這些工具，繞過 harness 工具管線、其審批，以及讓工具效果可被模型看到並被記錄的 `tool/*` 日誌事件。

**直接用 Claude Code 儲存的 OAuth token 呼叫 Messages API。** 這會繞過被借用登入的產品及其條款；本路由改為執行官方產品。

## 影響

- 使用 Claude Code 模型的 Session 不需要 API 金鑰；缺少登入時以 `INVALID_CREDENTIAL` 失敗，並附登入說明。
- Claude Code 自己的記錄位於主機的 Claude 設定目錄下，儲存其模型所見的上下文；harness 日誌儲存渲染後的對話以及續接所需的遊標。刪除 Session 不會刪除原生記錄。
- 原生工具活動是顯示文字，而不是 `tool/*` 事件，工具結果留在 Claude Code 內部。
- 本路由僅接受文字，停用 `AskUserQuestion`，並把輔助呼叫的 `maxTokens` 視為參考值。
- 在託管部署中把主機使用者的 Claude Code 登入提供給其他使用者，需要取得 Anthropic 的批准。
- 單元測試覆蓋請求規劃、replay 解析、流轉換、審批結果、SDK 選項對映、取消與程序釋放；Loader 組合測試在 headless profile 之上啟動公開的 Bundle 補丁，且不啟動 Claude Code。
