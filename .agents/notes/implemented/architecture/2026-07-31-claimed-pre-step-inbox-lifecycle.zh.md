# Agent Note: 在單一 pre-step 決策前領取 inbox 輸入

Status: implemented

[English](2026-07-31-claimed-pre-step-inbox-lifecycle.md) | 中文

## 問題

迴圈此前把一個步驟邊界拆成提示詞準備、提示詞准入與序列步驟掛鉤。准入結果可以保留或丟棄已領取輸入，即時佇列事件還攜帶了與持久 inbox 狀態重複的資料結構。外掛不得不在修改 inbox、改寫已提交批次與直接追加工作階段歷史之間選擇，而觀察方無法依賴一套明確順序。

單次出現專屬的 inbox 包裝層也重複了每個 `UserMessage` 已有的標識。它把插入、編輯、領取、取消、重連投影與步驟進入合併成一套協定，但僅追加工作階段本就擁有持久佇列投影。

## 決策

每個擬議步驟之前，迴圈包內部的 `ReactLoopInbox` 會原子領取完整批次：全部 `next-step` 訊息，以及輪次邊界上的一條 `next-turn` 訊息。在首次邊界，迴圈會先提交 `turn/start`，使領取及其唯一一次 `agent/pre-step` 決策擁有持久輪次歸屬。領取會記錄規範化、不帶 outcome 的純刪除 `agent/inbox/spliced`，針對每條已領取訊息發出一次 `agent/inbox/claimed { message, turn }`，並把獨佔批次返回給迴圈，由後者用 `{ turn, step, signal }` 等待 waterfall（瀑布式事件）。

`PreStepDecision` 為 `{ kind: 'reject' } | { kind: 'enter'; messages: UserMessage[] }`。reject 不會開啟步驟，會讓已領取批次保持已刪除，並將輪次關閉為 blocked，且不產生任何步驟事件。空的 enter、取消以及 `step/start` 前的失敗同樣會關閉一個邊界平衡的無步驟輪次。enter 提供在 `step/start` 後以 `user/message` 追加的完整批次。包裝 `next()` 的監聽器會保留下游變更，除非有意替換，因此全部訊息改寫只在最終回傳值中一次性結算。系統不再存在 `agent/prompt-prepare`、`agent/prompt-submit` 或 `agent/step` 擴充功能點。

持久 inbox 仍是兩份透過 `MessageId` 定址的 `UserMessage[]` 列表。`append`、`prepend` 與 `splice` 接受 target；`replace(messageId, newMessage)` 與 `remove(messageId)` 則在提交規範化 splice 前，透過 `MessageId` 跨兩份列表定位待處理訊息。替換可以改變標識，並先將舊訊息作為 discarded 釋出，再將新訊息作為 inserted 釋出。每次插入發出 `agent/inbox/inserted { message }`；普通刪除記錄 `outcome: 'canceled'` 並行出 `agent/inbox/discarded { message }`。領取記錄不帶 outcome 的純刪除，並由 `ReactLoopInbox` 發出 claimed 事件。這些即時事件不增加 placement、outcome 或批次欄位。

`Agent.inbox` 只暴露用於讀取和變更待處理工作的結構化 `Inbox` 介面；僅供迴圈使用的 `hasPending` 與領取操作不在該公開介面上。dsh-agent-loop 只建構一個 `ReactLoopInbox`，同時用於結構化命令與驅動器操作。具體建構函式直接接收 `SessionProjectionRegistry`，而不是更寬泛的 Cordis `Context`。`AgentLoop` 在服務生命週期內持有標準投影註冊，讓沒有 live Agent 時的冷 Inbox 讀取仍然可用；`ReactLoopInbox` 只讀取和變更該共享狀態。

兩類事件介面服務不同消費方。跟蹤單條訊息的觀察方使用 `agent/inbox/inserted`、`claimed` 與 `discarded`。`AgentLoop` 在持久 `agent/inbox/spliced` 流上貢獻標準 `inbox` 投影；UI 編輯與移除透過 Inbox 變更方法處理，從而讓同一投影記錄所有變化。該投影重建持久歷史時，會拒絕不安全或越界的座標，以及跨兩份列表重複的 `MessageId`，並報告出錯事件的 seq。整體佇列的 control 消費方使用通用投影變更流，直接讀取完整的 Inbox 值。

必須對目前步驟進行原子改寫的外掛從 `agent/pre-step` 返回訊息。只需要稍後上下文的外掛可以直接修改 `agent.inbox`。Workspace context 同時使用兩條路徑：非同步檔案系統投影會暫存一條可替換的 `next-step` 訊息，而下一次進入步驟的 pre-step 會把該訊息或新組合的基線折入最終批次，並移除仍待處理的副本。reject 會讓該條目繼續排隊。

已歸檔的[可定址佇列項決策](../../archived/feature/2026-07-29-addressable-queue-operations.md)描述了已被取代的單次出現包裝層設計。`MessageId` 負責定址，而 `AgentLoop` 把 `inbox` 作為持久 splice 上的標準工作階段投影貢獻給投影註冊表。通用投影傳輸層會將該摺疊結果用於即時更新、歷史尾頁的重連基線和冷程序重新啟動恢復，無需 live Agent 映像。

## 曾考慮的替代方案

**保留分離的 prepare 與 admit 掛鉤。** 這樣準備階段可以在領取前修改 inbox，准入階段可以在領取後改寫，但同一邊界會出現兩個順序表面，取消歸屬也會變得模糊。

**reject 時把已領取批次重新入隊。** 這看似保留重試行為，卻會讓否決隱式修改佇列；若不為每個競態加圍欄，還會複製後續工作，並使 claim 無法成為原子所有權轉移。

**在每個即時事件上攜帶 placement 與 outcome。** 持久 splice 已經擁有這些事實。即時通知重複它們會建立可能漂移的第二份約定，而持有確切訊息標識的消費方並不需要這些欄位。

## 驗證

agent loop（智慧代理迴圈）覆蓋固定先 `turn/start`、再領取、後 pre-step 的順序、即時事件的確切載荷、邊界平衡的無步驟 reject、最終批次改寫、領取後插入的輸入、監聽器失敗、取消，以及Agent 解除安裝後 Inbox 仍可讀取，以及 AgentLoop 解除安裝時移除投影。Inbox 和消費方測試固定純領取刪除、普通刪除的 canceled 結果、agent-instructions 的暫存、替換與同一步驟進入、plan/goal/掛鉤行為、UI 清理、壓縮（compaction）、檢查點、恢復後的持久投影、對非法持久座標或跨列表重複標識的拒絕，以及 controller 早於投影註冊表註冊時仍使用摺疊後佇列值。只有當永續性不屬於測試物件時，消費方領域測試才使用程序內 Inbox 樁；領取、持久投影、恢復、驗證與即時通知測試透過生產 AgentLoop 測試 harness 建立 Agent，因此測試支援程式碼不會重新實作該投影。生成的事件與型別目錄只公開新的 waterfall 與載荷。

## 後果

迴圈在每個步驟前只有一個需等待的決策，對輸入也只有一次所有權轉移。已領取訊息不會隱式返回 inbox；後續插入保持獨立。即時事件與其他 inbox 通知保持對稱，但不映像持久中繼資料；外掛可以顯式選擇精確的目前步驟改寫，或普通的後續 inbox 投遞。
