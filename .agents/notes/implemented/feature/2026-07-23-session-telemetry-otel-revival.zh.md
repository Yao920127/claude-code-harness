# Agent Note: 設有強制脫敏點和 OTel 後端的工作階段遙測 seam

Status: implemented

[English](2026-07-23-session-telemetry-otel-revival.md) | 中文

## 問題

每個想把 harness 工作階段接入可觀測性體系的部署方都得手寫一個工作階段日誌消費方：訂閱、生命週期交接、以及最難的脫敏——原始日誌攜帶檔案內容與命令輸出，可能內嵌憑證。遙測 seam 和 OTel 後端曾在 `session-telemetry-otlp-rfc` 分支（PR #222/#231）上完成過一版，但從未進入 master：該提案將原始工作階段事件原樣匯出，法務評審未予透過。可複用的捕捉側設計包括後端約定、coordinator、handoff 遊標與工作階段事件訂閱；匯出側的立場才是阻塞點。

## 決策

`packages/session/`（原 `telemetry/`）以 SDK 立場復活這兩個經過評審的包——harness 提供能力，部署方設定上報去向並對匯出內容負責：

- **`@deepseek-ai/dsh-session-telemetry`** —— seam 本體。`SessionTelemetrySink`（`emit`/`flush?`/`shutdown`）、服務註冊形態的 `SessionTelemetryBackend` 與 `SessionTelemetryCoordinator` 共同擁有生命週期本地捕捉：每個新的 Session 物件從 `firstLiveSeq` 之前開始，隨後逐 append firehose 以零 I/O 深複製、脫敏並交接每個事件；重新收養同一物件時從模組作用域遊標之後繼續。無緩衝按需捕捉使用同樣的一事件一記錄對映，直到可選的包含式邊界。Ledger 身份包含 `session.id`、`session.format_version` 與 `event.seq`；即時捕捉還會轉發 `agent/error`，並建立 dispose（資源釋放）時的 `shutdown` 記錄。
- **`session-telemetry/record` waterfall（瀑布式事件）** —— 相對分支版本的增量，也是該 seam 的脫敏擴充功能點。每條記錄抵達任何後端前必經此處；seam 自身不帶任何規則——最內層 `next()` 原樣直接傳遞，部署方以監聽器掛載自己的規則（透過變換 `next()` 的回傳值堆疊），拋異常的規則將該記錄 fail-closed 扣下。脫敏只作用於匯出副本；canonical log 永不改寫。
- **`@deepseek-ai/dsh-session-telemetry-otel`** —— 參考後端：OTel JS SDK 日誌流水線（`LoggerProvider` → `BatchLogRecordProcessor` → OTLP/HTTP exporter），經 `exporter`/`processor` passthrough 原樣設定。`DISABLED` 是外掛預設值，且不建構任何傳輸。`FEEDBACK_ONLY` 要求 `exporter.url`；[顯式回饋策略](../architecture/2026-09-05-nonofficial-feedback-otel.zh.md)要求每次有界捕捉都由新提交觸發，適用於所有提供者。[無緩衝回饋回放](../../archived/simplification/2026-08-06-buffer-free-feedback-telemetry.md)避免在記憶體中建立工作階段字首的第二份副本。

邊界公理保持不變：harness 的職責止於 `emit()`。批處理、重試、排隊與丟失策略屬於 reporting SDK，並經 passthrough 設定。投遞是盡力而為：崩潰可能丟失已排隊記錄。後端重試或丟失同一 live 物件的模組作用域遊標可能重複生命週期本地 row，因此接收端基於 `(session.id, session.format_version, event.seq)` 去重。

## 考慮過的替代方案

**實作 runtime-telemetry RFC 的 outbox（寫入磁碟 spool、每 sink 遊標、at-least-once、持久化 seam 的 `readCommitted` 方法）。** 推遲而非否決：SDK 立場使投遞語義歸屬 reporting SDK，OTel SDK 自身的批處理流水線是誠實的預設。outbox 是純增量層（`emit()` 約定不動）；待某個部署提出遙測必須滿足的崩潰丟失要求時再復活。

**不設程式內脫敏點，交給接收端 collector processor。** 否決——接收端脫敏是先把秘密發出去再擦除。waterfall 在位元組離開程式前提供一個可審計、可堆疊的擦除點；分支版本（PR #222 交付的形態）完全沒有脫敏點，如今每條記錄都必經該脫敏點。

**在 waterfall 最內層 `next()` 內建一套保守規則集。** 否決：作為 SDK 我們無法預知某個部署裡什麼模式算秘密，內建列表只覆蓋已知形狀卻會帶來「脫敏已開啟」的虛假信心，且誤報會破壞未提出此要求的消費方所接收的匯出 body。seam 擁有機制，部署方擁有策略——最內層 `next()` 原樣直接傳遞，規則以監聽器掛載。

**對映到 OTel span（GenAI 語義約定）而非日誌。** 本次復活否決：分支實作的日誌對映已經過評審、形態可交付；span 模型對可 fork、可中斷的工作階段有損，留給將來真正有 span 查詢需求的消費方。

**自動回放每個 constructor seed。** fork 的繼承事件和恢復的日誌可能早於目前共享動作。協調器對新物件預設從 `firstLiveSeq` 開始；`includeHistory` 顯式允許後端捕捉儲存的上下文。OTel 僅在新的自身回饋時選擇完整歷史，絕不在建構、恢復或 HMR 時捕捉。同物件遊標減少重複交接，但不保證歷史投遞，也不替代延後的持久化 outbox。

**將 seam 的輪次邊界 `flush()` 提示轉發到 OTel 提供者的 `forceFlush()`。** 首輪復活曾交付此轉發，其後移除：三條不同的靜默丟失路徑共用同一份包裝層狀態——dispose 與進行中的 flush 之間的競態（SDK 的並行 flush 防護會令 shutdown 的內部排空被跳過）、相互重疊的提示頂掉留存的 promise、以及提供者固定的 30 秒 flush 超時在批處理器仍在排空時便 reject。這些路徑存在的唯一原因，是該轉發讓這個後端成為程序內第二個執行 flush 的元件，面對的還是上游實驗性（experimental）原始碼樹中未見諸文件的 SDK 內部行為；不實作 `flush()` 時，批處理器就是唯一執行 flush 的元件，其 `scheduledDelayMillis`（已可由部署方經 `processor` passthrough 調優）決定匯出節奏，`shutdown()` 的排空從建構上就是完整的。僅當某個部署提出 `scheduledDelayMillis` 無法滿足的輪次邊界延遲要求時才恢復此轉發——且屆時應呼叫留存的 `BatchLogRecordProcessor` 自身的 `forceFlush()`，絕不呼叫提供者那個帶超時包裝的版本。

## 後果

部署方設定 OTLP endpoint 並選擇 `FEEDBACK_ONLY`，即可在新的顯式回饋時釋放完整權威日誌字首。`DISABLED` 是外掛預設值（[`dsh-session-telemetry-otel` README](../../../../packages/session/session-telemetry-otel/README.zh.md)），且不建構上報流水線；刪除設定項是靜默退出方式，而停用模式保留本地回饋警告。SDK 定時重新整理和關閉只排空已授權批次，不捕捉後續記錄。未掛載規則的部署會匯出每條已捕捉事件的正文，包括緊湊 assistant stream 以及檔案內容或命令輸出中內嵌的憑證，因此跨信任邊界的部署必須掛載 `session-telemetry/record` 監聽器。脫敏後的正文可能與權威日誌位元組不同；日誌仍是真源。丟失交接遊標可能使後續已授權捕捉產生重複，崩潰永續性則在上述 outbox 決定重新審議前繼續不在範圍內。
