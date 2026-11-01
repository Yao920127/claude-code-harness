# Agent Note：歸檔准入讀取已儲存的任務

狀態：implemented

[English](2026-09-22-archive-admission-reads-stored-tasks.md) | 中文

## 問題

歸檔准入在寫入歸檔前詢問每個提供者：該 Session 還有什麼在跑；隨後「停止並歸檔」再要求它們結束這些工作（[歸檔仍有工作在跑的 Session](2026-09-21-archive-stops-running-session-work.zh.md)）。Schedule 提供者原先回答的是其歸屬 runtime 對活工作階段日誌的 fold，因此只有帶活 Agent 的 Session 才報告 `schedule` 族，停止也走管理 `delete` 路徑。

主機任務儲存在 Schedule 領域文件中，且比其 Session 的 Agent 活得更久（[儲存決策](../architecture/2026-09-16-host-schedule-storage.zh.md)），因此那個 fold 已不存在：`ScheduleRuntime.activeRecords()` 已經移除，已儲存的任務表是到期提醒唯一能被看見的地方。儲存行仍被武裝的冷 Session 因此什麼也不報告，歸檔時不會彈出執行態才會彈出的確認對話方塊，也沒有人被告知主機會繼續保留哪條提醒。

## 決策

Schedule 提供者從已儲存的主機任務行回答歸檔准入，並由停止刪除這些行。`workspace/session-activity` 讀取 `list({ sessionId })`——繫結到該 Session 且狀態為活動的已儲存行——把它們作為 `schedule` 族報告，每條任務一項、攜帶其已儲存 id 與 title，並把該族前插到 `next()` 的結果之前，使其他提供者保留各自條目。`workspace/session-stop` 在與工具相同的序列佇列的一個槽位裡直接刪除這些行，因此停止會排在寫入尚未完成的建立之後，不會漏掉那個建立即將提交的行；它會嘗試每一行，因為留下的行仍會觸發；對已經落實的行先通知觀察者，再把首個失敗交給呼叫方。是否存活從不參與判斷：儲存行仍被武裝的空閒或冷 Session 會拒絕歸檔，確認對話方塊會準確列出這些提醒。兩個監聽器註冊在同一個名為 `schedule.archiveAdmission()` 的 effect 中，解除安裝外掛即一併撤回。

## 已考慮的備選

**只由活著的 Session 報告 `schedule` 族。** 已儲存的任務才是權威，且比其 Session 的 Agent 活得更久，因此以存活為條件會讓儲存行被武裝的冷 Session 靜默歸檔，其到期行隨後投遞進一個被門禁以 `blocked` 收口的回合，在沒有模型步的情況下消耗掉這次觸發。兩種做法在准入上都只需一次讀表。

**每行都走公開的管理 `delete` 路徑刪除。** 在已經持有該槽位的序列佇列內部再次進入佇列會自鎖，因此停止自己刪行：同樣的持久化變更，每次停止一次通知、一次計時器重算，而不是每行各一次。

**在 runtime 側保留該 Session 活動任務的映像。** 映像會重複權威文件、在重新啟動後漂移、並隨 Agent 一起消失——而這正是准入必須仍能回答的情形。

## 後果

准入的代價是一次讀已儲存的表，而沒有活 Agent 的 Session 也能拒絕歸檔：看起來安靜的 Session 現在可能因為其已儲存提醒仍被武裝而要求確認。停止逐行刪除——領域表不提供批次刪除——因此刪到一半失敗時，先前刪除已提交；觀察者會被告知這些，每一行都已被嘗試，首個失敗仍交給呼叫方。由此剩下一處殘餘：在歸檔寫入與停止之間崩潰，會在已歸檔的 Session 裡留下仍被武裝的已儲存行；取消歸檔時它們再次出現；當這類行的目標時刻過去，Schedule runtime 會按自己的定時器選中它並自行 resolve 該 Session 的 Agent——這一步沒有門禁，只有 `agent/pre-step` 拒絕模型步——一次性提醒於是把 follow-up 投遞進一個被門禁以 `blocked` 收口的回合，該次觸發在沒有模型步的情況下被消耗。接縫本身未變：workspace 包仍然不認識 Schedule 詞彙，而這個提供者只擁有提醒。
