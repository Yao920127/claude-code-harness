# Agent Note: 在列表重新整理後保留已受理工作階段的展示狀態

Status: implemented

[English](2026-09-15-client-session-blank-reconciliation.md) | 中文

## 問題

提示詞請求成功後，用戶端會把 `New Session` 行轉換為普通工作階段，但此時輪次不一定已經開始。後續 `session.list` 回應仍可能返回 `blank: true`，從而撤銷該轉換。重連會觸發同樣的重新整理。若只在 Session 物件內保留轉換狀態，物件被替換時也會丟失。

## 決策

[Manager](../../../../packages/api/session-controller/src/client/sessions/manager.ts) 使用按 Session id 索引的私有集合，保留已觀察到的受理/執行。列表行與既有 Session blank 更新使用 `summary.blank && !engagedSessions.has(sessionId)`，其上仍疊加 `sessionListMetadata` 提示。既有摘要變更、Session 快照欄位、建構函式和投影儲存保留原有職責。

每個成功的提示詞回應都會呼叫既有 `onEngaged` 回呼，包括來自已被替換的 Session 物件的回應。Manager 按 id 更新其保留的觀察、列表行和目前駐留 Session。拒絕不會記錄受理/執行。`running: true` 狀態、新增事件或列表基線也會記錄執行；早於移除的基線不能恢復該觀察，即使該行在拉取期間重新加入。

該觀察跨重新整理、重連和物件替換保留。移除、drop 和成功的列表重新整理僅在列表行、Session 物件及子工作階段地址均不再保留該身份時清除它。重新整理在重放請求期間的變更後判斷保留資格；失敗及被替代的請求不會清理觀察。遲到的受理不能重建已移除的行或 Session 物件。Manager 銷燬會清空集合，並阻止遲到的受理和未完成的列表回應釋出。

受理/執行是展示記憶，不證明輪次已經開始、工作仍在排隊，或訊息已經寫入持久儲存。它不會跨頁面過載持久化。歷史 `sessionListMetadata.blank` 與 Host 摘要預設值保持不變。

## 考慮過的替代方案

**保留所有曾為 false 的摘要位。** 先前的 Host 摘要不能證明用戶端觀察過受理或執行。將所有 false 永久保留，也會在兩種觀察均不存在時阻止後續 Host 校正。

**引入共享 Session 記錄。** 將這份記憶與投影儲存合併，需要修改建構參數及快取生命週期。這些改動獨立於防止 blank 退回，因此不納入。

**等待歷史後再轉換行。** 這會改變現有的受理時展示規則，屬於獨立的 UI 決策。

## 後果

已受理或觀察過執行的 Session 保持既有展示轉換，包括已受理輸入始終沒有開始輪次的情況。草稿、傳送錯誤恢復、側邊欄篩選與標題規則、建立/複用、UUID、Host 協定、持久化及投影快取生命週期保持不變。退回這項純用戶端修復不需要資料遷移。

Manager 額外維護一個按 id 儲存的展示標記。它不替代 Session 本地展示欄位，也不實施歷史/草稿/展示狀態重構。

對於來源不是 subagent、也沒有保留子工作階段地址的身份，移除通知會丟棄它的投影儲存——除非該儲存已帶有非空的 `subagentCatalog`；而仍被保留的 Session 物件繼續持有建構時採用的儲存，例如目前行被移除而它的 Session 仍留在舞臺上。若投影儲存已被丟棄，且該身份在其 Session 物件被銷燬前回到列表，Manager 會新建並寫入第二個儲存，而常駐物件從不讀取它，因此在替換實例採用目前儲存之前，列表行與該物件的投影讀取方可能不一致。該投影歸屬的修復延期到獨立的改動；blank 展示不依賴它。

## 驗證

Manager 測試覆蓋無輪次重新整理、執行轉空閒、物件替換、遲到受理、透過通知或列表對帳移除、保留實例與子工作階段地址、失敗及被替代的請求，以及銷燬。在存在實例的情境中，測試同時檢查列表和 Session 狀態。Session 測試保留首發拒絕及後續傳送行為。瀏覽器驗證使用已有首輪錄製情境，在受理後、`turn/start` 前暫停並進行同頁重連。測試僅替換重連列表回應中的時間戳，用其顯示結果作為同步標記；Host 的 blank/running 值及持久日誌保持不變。

## 相關決策

[作用域與供給決策](../architecture/2026-07-25-web-client-session-scope-and-provide-channel.zh.md) 擁有 Session 作用域、建立/複用及可見 blank 行。[Session/Conversation 歸屬決策](../architecture/2026-08-20-client-session-conversation-ownership.zh.md) 擁有傳輸、裝配及快照內容。
