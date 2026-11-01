# Agent Note: 統一 agent id 與工作階段 id

Status: implemented

[English](2026-06-20-unify-agent-and-session-id.md) | 中文

## 問題

一個存活的 agent（智慧代理）/工作階段對需要使用同一 identity 完成註冊表路由、事件溯源和持久化。讓 factory 接受相互獨立的 `agentId` 和 `sessionId` 輸入，會允許任何生產路徑都無法使用的配對，同時迫使每個消費方為同一生命週期在兩個名稱之間選擇或轉換。

ACP（Agent Client Protocol）對兩種 identity 使用相同值。Stdio 和掛鉤也在工作階段事件流上工作，並且直接需要對應的存活 agent；沒有生產路徑會把一個存活 agent 物件重新附著到多個工作階段，或透過多個 agent id 驅動一個工作階段。

[agent 範圍執行時](../architecture/2026-07-12-agent-scope-runtime-design.zh.md)使用同一個 `AgentCreationTransaction` 執行建立和恢復，agent/工作階段條目共享相同的最終條目衝突規則。第二個 identity 並不代表單獨的存活性、復原或完全停穩；它只會圍繞同一事務增加 API 與轉換狀態。

工作階段 identity 同樣只有一個歸屬，即 `Session.header.id`；`Session.id` 是派生存取器，而非需要重複驗證的獨立狀態。

## 決策

agent 的註冊表 id 等於其工作階段 id。`CreateAgentOptions` 接受一個 `sessionId`，同時用於兩個最終註冊表條目；恢復時以 `resumeSessionId` 註冊 agent；程序內 subagent 建立使用子工作階段 id；`Session.id` 則派生自 `header.id`。遠端 ACP 執行沒有本地 agent/工作階段對：它保留一個由父項鑄造的生命週期 id，而子伺服器協定本地的工作階段 id 仍僅供 ACP 呼叫內部使用。現有建立事務、最終條目衝突檢查和精確條目分離語義保持不變；唯一職責是在本地 id 之間轉換的 map 與欄位已經消失。

設定驅動路徑保留 `agents[].id` 作為穩定設定標籤，而非存活態路由 identity。普通的全新啟動會鑄造組合 id `${label}-session-${randomUUID()}`，使持久重新啟動不會衝突。耦合應用可以預先鑄造並傳入精確的 `sessionId`：首次使用時建立它，而當持久化服務已經存在時，AgentLoop 重新掛載會在同一 identity 下恢復已物化歷史。`resumeSessionId` 則要求已有的持久化 identity。兩個精確 id 輸入互斥。Stdio 使用「恢復或建立」形式，使設定建立的 agent 和 UI 在迴圈過載之間共享一個不透明 identity，而不是根據字首猜測。日誌可以使用穩定標籤，而所有存活態與持久化查詢都使用同一個 `SessionId`。

`agent/created` 和 `agent/disposed` 保留。它們是成對的釋出生命週期事件，而非 identity 別名；以後若發現沒有消費方並要移除，必須先重新搜尋，再提出獨立提案。

## 曾考慮的替代方案

**保持路由與日誌 identity 分離。** 穩定的設定標籤加全新的持久對話確實有用，但不需要兩個存活 identity：標籤可以繼續作為設定/顯示中繼資料，而每次執行的組合 `SessionId` 負責路由和持久化。保留兩個 id 會讓轉換 map 持續存在，允許不可能的配對，卻不會增加生命週期能力。

## 驗證

- agent 建立/恢復和 subagent 建立只攜帶一個 identity，`Session` 也只在一個位置儲存它。
- 建立事務繼續覆蓋最終條目衝突、精確條目分離、復原和完全停穩，無需 identity 特有的生命週期狀態。
- ACP、stdio、掛鉤、bash 歸屬、持久化和 lineage 直接使用共享 `SessionId`。ACP subagent 後端在父名稱空間中鑄造其生命週期 id，因為子伺服器返回的工作階段 id 僅在伺服器本地有效；ACP bridge 根據正向工作階段 map 驗證精確的 `Agent` 歸屬；JSON-RPC 只轉發生命週期事件中由服務快照儲存的 `local` 標記為 true 的事件，從帶範圍的事件 carrier 取得委託父項，並且不保留子 identity 或 lineage cache。
- 設定驅動的恢復或建立策略是顯式的，並在持久化重新啟動情境下得到覆蓋。
- 生產監聽器搜尋確認保留 `agent/created`/`agent/disposed` 及其釋出語義。

## 後果

這排除了潛在的多工作階段 actor 和工作階段交接設計，並使由用戶端選擇、已持久化的工作階段 identity 成為註冊表 identity。如果獨立路由 identity 成為真實需求，就需要顯式的生命週期設計，而不是由呼叫方提供一對不受約束的值。
