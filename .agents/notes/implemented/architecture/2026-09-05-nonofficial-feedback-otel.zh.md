# Agent Note: 僅在顯式回饋後透過 OpenTelemetry 上傳

Status: implemented

[English](2026-09-05-nonofficial-feedback-otel.md) | 中文

## 問題

回饋需要它所描述的工作階段上下文，以及不依賴模型提供者或後續模型請求的投遞路徑。普通活動不得授權上傳。繼承的回饋不得視為子 Session 的同意。

## 決策

基礎設定為所有使用者和提供者以 `FEEDBACK_ONLY` 掛載 OTel，包括 `deepseek-official` 和沒有請求頭的 Session。只有新的自身 `feedback/record`、`feedback/message-put` 和 `feedback/message-delete` 事件授權捕捉，且截止該確切的權威事件。文字回饋、評分、實質備註編輯與撤回均算作回饋。冷工作階段 `feedback/committed` 通知提供已提交快照，不釋出存活 Session 或 Agent。

授權字首包含從 seq 0 到該回饋的所有尚未交接的權威上下文，而非只有回饋載荷。子工作階段需要新的自身回饋；之後其字首包含繼承歷史。後續記錄等待下一次顯式回饋。請求活動、請求頭、Session 建立或接納、恢復、外掛掛載和 HMR（熱模組替換）絕不授權捕捉；僅有儲存的回饋不會觸發任何上傳。

後端使用包含完整歷史的按需捕捉與現有脫敏 waterfall（瀑布式事件）。`DISABLED` 不建構傳輸。`FULL` 被拒絕，不作為別名。直接呼叫 `ctx.sessionTelemetry.emit()` 是空操作，因此呼叫方不能繞過回饋授權。SDK 定時重新整理和關閉可以完成先前已授權的批次，但絕不捕捉新記錄。提交後的傳送無需進一步使用者互動或模型呼叫。

[權威回饋決策](2026-09-05-canonical-feedback-log.zh.md)負責儲存、版本、刪除與純命令確認。[預設開啟的 DeepSeek 貢獻](../../../../packages/session/session-log-deepseek/README.zh.md)保持獨立，保留現有目標與接受行為。

## 考慮過的替代方案

**按提供者或端點主機名過濾。** 回饋為每位使用者授權相同的有界上下文；提供者選擇、閘道或缺失請求頭不改變該授權。

**僅使用後續 DeepSeek 請求。** 其他提供者不攜帶 `dsh_session_log`，而最終回饋之後可能沒有請求。現有 OTel 流水線可獨立傳送，無需自定義上傳器或模型呼叫。

**保留持續捕捉或在生命週期事件上回放儲存的回饋。** 部署設定和舊回饋不授權新捕捉。只有新的顯式提交才授權。父工作階段回饋同樣不能授權子工作階段上傳。

## 後果

交接盡力而為，不代表採集端接受。同物件遊標抑制重複捕捉，但新冷快照和重新啟動後的新回饋可能重複字首；接收方按 `(session.id, session.format_version, event.seq)` 去重。沒有持久化 OTel outbox、投遞水位或 harness HTTP 重試承諾。入隊後適用 SDK 批處理與丟失行為。OTel 與預設開啟的 DeepSeek 路徑可能重疊。撤回匯出刪除事件，不是遠端擦除。

[OTel 測試](../../../../packages/session/session-telemetry-otel/tests/otel.spec.ts)覆蓋顯式回饋捕捉、提供者無關行為、生命週期靜默、fork 同意、冷工作階段提交與直接呼叫拒絕。[協調器測試](../../../../packages/session/session-telemetry/tests/telemetry.spec.ts)覆蓋歷史捕捉；[基礎設定測試](../../../../packages/bundle/base/tests/base.spec.ts)固定掛載預設值。
