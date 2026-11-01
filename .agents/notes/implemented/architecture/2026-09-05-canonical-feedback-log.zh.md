# Agent Note: 權威回饋日誌與請求投遞

Status: implemented

[English](2026-09-05-canonical-feedback-log.md) | 中文

## 問題

可編輯的訊息評分需要一個能由 Session 匯出與請求投遞保留的持久權威來源。獨立的回饋儲存會讓這些消費方拿到不完整的資料，並引入與目標訊息之間的第二套提交關係。記錄人類判斷不能改變模型輸入，也不能暗示採集端已經接受資料。

## 決策

權威 Session 日誌擁有回饋。Session 級備註使用 `feedback/record`；訊息的實質編輯與刪除使用 `feedback/message-put` 和 `feedback/message-delete`。三者都僅寫日誌。服務從與請求的 `sessionId` 匹配的事件中歸約目前條目，因此繼承的父級事件不會成為 fork 的目前回饋。刪除會移除目前條目，但不會抹除日誌中早先的評分或備註。

live 訊息回饋變更透過所屬 Session 追加，並等待其持久化檢查點；cold 變更在讀取、比較、追加和 flush 期間持有持久化寫控制代碼，不建立 Session 或 Agent。匹配版本的無變更操作不追加事件，但仍等待持久化。故障會原樣傳播，live flush 失敗可能留下可觀測的記憶體條目以供重試。逐條版本避免不同訊息的編輯互相沖突；嚴格拒絕陳舊寫入避免 ABA 覆蓋，即使期望值已經匹配也不例外。目標驗證把判斷繫結到已傳送的 assistant 訊息，fork 保持獨立判斷。這些選擇保留[已歸檔伴隨記錄決策](../../archived/architecture/2026-08-10-message-feedback-sidecar.md)記載的理由，但其儲存與提交機制已被取代。

現有預設開啟的 [session-log-deepseek 貢獻](../../../../packages/session/session-log-deepseek/README.zh.md)會在後續符合條件的請求中，把回饋納入普通 `dsh_session_log` 字尾。它使用現有的 DeepSeek 目標選擇和接受水位。沒有獨立的 `dsh_feedback` 上傳器、回饋觸發的 LLM 請求或模型輸入欄位。[顯式回饋 OTel 決策](2026-09-05-nonofficial-feedback-otel.zh.md)負責面向所有使用者和提供者的獨立回饋觸發上傳。

命令用 Session 與匿名使用者 id 確認記錄，不依賴遙測，也不披露其策略。其追加仍不執行 flush。這取代[已歸檔共享披露記錄](../../archived/feature/2026-08-07-feedback-acknowledgement-sharing-disclosure.md)中的命令文案決策。[遙測服務的策略 API](../../../../packages/session/session-telemetry/README.zh.md#the-sharing-disclosure) 仍可獨立使用：後端披露策略，而不保證投遞或保留，可選 OTel 包不擁有這套詞彙。

## 考慮過的替代方案

**保留伴隨記錄。** 它支援破壞性的本地編輯，但若不增加關聯讀取及持久化關係，就無法讓回饋參與普通權威日誌匯出與投遞。

**對訊息編輯複用 `feedback/record`。** 自由文字的 Session 備註不能標識條目變更。獨立事件保留訊息身份和刪除語義；上傳策略仍由消費方負責。

**增加專用回饋上傳器或立即發起 LLM 請求。** 預設開啟的日誌貢獻在符合條件的請求上傳送權威事件。現有 OTel 流水線獨立處理所有提供者的顯式回饋上傳，無需自定義回饋上傳器或另一個模型請求。

## 後果

回饋隨普通日誌匯出與回放保留，不消耗模型輸入 token，也不改變 KV Cache。刪除目前條目不等於抹除歷史。DeepSeek 請求貢獻可能讓最終回饋留在本地，直到下次符合條件的請求；OTel 按自身策略獨立傳送已授權批次。Web 控制器仍消費一元 Remote，不消費回饋日誌事件來更新其他標籤頁。

[訊息回饋測試](../../../../packages/feedback/message-feedback/tests/message-feedback.spec.ts)覆蓋實質事件、無變更操作、嚴格版本、fork 隔離與持久化故障。[請求貢獻測試](../../../../packages/session/session-log-deepseek/tests)負責字尾接受與重試；[命令測試](../../../../packages/feedback/command-feedback/tests/command-feedback.spec.ts)固定純確認文字。
