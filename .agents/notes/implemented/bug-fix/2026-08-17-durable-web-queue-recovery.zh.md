# Agent Note: 從持久 Inbox 狀態恢復 Web Queue

Status: implemented

[English](2026-08-17-durable-web-queue-recovery.md) | 中文

## 問題

Inbox 接受訊息時會記錄規範化的 `agent/inbox/spliced` 事件，但 Web Queue 使用另一份透過列舉 live Agent 建置的 mux 基線。Host 程序重新啟動後，持久化的普通 Session 會保持冷狀態，直到某項操作需要其 Agent，因此 live-only 基線會遺漏仍存在於持久日誌中的已接受待處理訊息。

只修復重連邏輯仍會保留兩套恢復實作：一套用於 live Inbox，另一套用於 Web 冷讀取。正確的所有者是 Inbox 領域，而工作階段投影框架已經提供 live 驅動、冷摺疊、重連基線和快取恢復。

## 決策

組合了 Session projection registry 時，`AgentLoop` 在服務啟用時註冊標準 `inbox` 投影，使冷 Session 無需 live Agent 即可讀取。[Inbox 認領生命週期](../architecture/2026-07-31-claimed-pre-step-inbox-lifecycle.zh.md) 定義 splice 規範化、訊息唯一性、live 通知和持久重建。投影共用一份 schema 與 `InboxState` 定義；訊息值依賴既有的型別化 `UserMessage` 約定，而不增加第二套執行時訊息驗證器。

註冊表在 `Session.append()` 返回前摺疊已提交的 splice；每個 Agent 的 `ReactLoopInbox` 命令 facade 都讀取同一份 live 狀態，而不另行維護摺疊狀態。

通用工作階段投影傳輸層是唯一 Web 傳輸。它傳送 seq 更高的 `session/projection` 值，在每次 `session.follow` 的起始快照中包含完整 values 塊，摺疊已分離的冷日誌，並在快取有效時使用投影快取。系統不存在 Host 擁有的 `queue` 投影、placement 詞彙、handoff 列表、專用 queue 幀或列舉 live Agent 的重連邏輯。

對已就緒 Host generation 的同步訂閱會先丟棄所有保留的投影值及其水位，再重新整理查詢並重新開啟 control stream，其中也包括程序本地 control baseline 中沒有列出的冷 Session。首次 control stream 會等待 generation 就緒；baseline 不會先於舊狀態清理到達，再被較晚的 Cordis `connection/reset` 通知清除。Observable face 保留自身標識及訂閱。較早 generation 的 list 請求不能釋出值或使目前請求結束，因此新 generation 的歷史與 list 值可以建立較低的持久 seq，而不會被尚未持久化的狀態擋住。同一 generation 內，所有 Host 排序過的值都遵循較高 seq 優先，因此延遲到達的 control baseline 不能刪除或覆蓋較新的 history 值或活 Session 的 list 值；從 projection cache 看出來的 cached list block 則讓位於該 baseline（[只讀面按 lifecycle 身份匹配與 cached 行](../architecture/2026-09-19-projection-cache-listing-identity-and-cached-rows.zh.md)）。

用戶端 Session binding 在通用逐工作階段投影儲存中保留 `inbox`，不會把它複製進 `SessionSnapshot`。QueueDock 直接讀取 `next-turn`。ChatView 直接讀取使用者來源的 `next-step` 訊息，並忽略注入上下文。認領操作透過持久 splice 移除待處理值；後續 `user/message` 由普通工作階段投影渲染。

`session.updateQueue` 在修改 Inbox 前透過共享 Agent 解析器解析普通冷 Session。因此，恢復出的待處理行在重新啟動後仍可編輯、移除或 steering，而 subagent ownership 保持與其他 Agent 操作相同的 fence。

系統沒有引入新的工作階段事件或磁碟格式。既有 splice 流仍是持久真源。

## 驗證

Host 投影覆蓋會讀取包含待處理輸入的已分離持久 Session，在 `session.follow` 的起始快照中返回 `values.inbox`，並證明不需要 live Agent。冷操作覆蓋證明 `session.updateQueue` 會恢復 Session 並追加持久刪除 splice。

用戶端覆蓋固定通用 Inbox 投影投遞、重連時清理遺漏冷 Session 的舊值、基線的兩種到達順序、過期 list 請求的結果、Session 實例化前保留 seq 更高的值，以及 `SessionSnapshot` 不含 queue 狀態。UI 覆蓋固定 QueueDock 直接渲染 `next-turn`，以及 ChatView 渲染使用者來源的 `next-step`。無金鑰 Web fixture 會開啟一份冷持久 Session，並在重新啟動後觀察其待處理行。

## 考慮過的替代方案

**把冷 Session 加入舊 queue 重連迴圈。** 不予採納，因為這會重複投影註冊表的冷摺疊，並讓即時推送、歷史、快取和重連繼續使用不同實作。

**在 Session Controller 註冊 Web 專屬 `queue` 投影。** 不予採納，因為待處理輸入屬於 Inbox。placement 行與 handoff 列表會只為一個用戶端引入第二套領域模型。

**在每條 splice 事件中儲存完整 Inbox 快照。** 不予採納，因為持久事件是規範化變更，不是重複聚合。聚合重建與 checkpoint 屬於投影框架。

**在用戶端根據原始工作階段事件重建 Inbox。** 不予採納，因為分頁可能省略建立目前狀態的插入事件，每個用戶端也會重複實作 splice 語義。

**開啟 mux 流時恢復每個冷 Agent。** 不予採納，因為展示持久狀態不應釋出執行時資源、掛載 preset 或啟動生命週期工作。

## 後果

待處理 Queue 與 steering 輸入可在 Host 程序重新啟動後恢復，而無需恢復 Agent。live Inbox 讀取、冷歷史、重連與投影快取使用同一份領域擁有的摺疊與註冊表狀態。操作恢復出的行時會恢復其普通 Agent，從而保留 preset 組合與所有權檢查。

用戶端接收原始的兩列表 Inbox 值，並自行決定介面呈現哪些訊息。投影的狀態版本會在其序列化狀態或摺疊語義變化時使快取行失效。

[輸入回顯入檔決策](2026-09-22-input-echo-admission-ownership.zh.md)負責本地 Chat/Dock 接管和遲到 Inbox 行的排除，不替換這裡的恢復模型。
