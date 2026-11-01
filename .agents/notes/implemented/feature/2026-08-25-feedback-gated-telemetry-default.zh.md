# Agent Note: 回饋門控的工作階段遙測預設值

Status: implemented

[English](2026-08-25-feedback-gated-telemetry-default.md) | 中文

## 問題

診斷一條 `/feedback` 報告需要報告所描述的工作階段資料。共享基礎設定把未設定的 `DSH_TELEMETRY_MODE` 解析為 `DISABLED`，因此預設安裝發出的回饋到達接收方時不帶任何工作階段資料，報告者在求助的那一刻也沒有授權共享的途徑；只有事先匯出了 `DSH_TELEMETRY_MODE` 的部署才能交付可診斷的報告。

## 決定

[顯式回饋 OTel 決策](../architecture/2026-09-05-nonofficial-feedback-otel.zh.md)負責所有使用者的上傳授權，包括 `deepseek-official`。本記錄保留基礎預設值的理由：選擇回饋門控釋放而非持續匯出。

共享基礎設定把未設定或為空的 `DSH_TELEMETRY_MODE` 解析為 `FEEDBACK_ONLY`。外掛自身省略 `mode` 的預設值是 `DISABLED`；`FULL` 被拒絕，非空 `DSH_TELEMETRY_DISABLED` 是載入前的強制關閉開關。新的自身文字回饋、訊息評分編輯和撤回釋放尚未交接的權威字首，截止該事件，包含儲存的上下文。繼承的父工作階段回饋不授權子工作階段匯出。

回饋門控釋放讓報告者無需復現問題就能共享出問題的 Session。它用顯式回饋觸發取代持續匯出。[已歸檔預設關閉](../../archived/feature/2026-08-10-telemetry-default-off.md)與[預設掛載](../../archived/feature/2026-07-31-web-telemetry-default-mount.md)記錄記載早期組合；目前設定由[基礎補丁](../../../../packages/bundle/base/cordis.patch.yml)與 [OTel README](../../../../packages/session/session-telemetry-otel/README.zh.md) 持有。

## 考慮過的替代方案

**要求報告者啟用遙測後重跑。** 不作為回饋門控工作流：值得保留的證據是出問題的那個 Session，重跑會丟掉它。

**允許持續匯出。** 否決：部署設定不授權沒有顯式回饋的捕捉。

**僅透過後續 DeepSeek 請求投遞。** 獨立的需顯式啟用的貢獻可傳送權威回饋，但最終回饋之後可能沒有請求。OTel 為每個提供者釋放回饋，無需發起另一個 LLM 請求。

## 後果

- 隨附基礎設定僅在新的顯式回饋時釋放有界字首。普通請求、生命週期事件和已儲存回饋不觸發捕捉。後續記錄等待下一次顯式回饋。
- 按需捕捉在回饋時複製權威日誌並脫敏。部署未掛載脫敏規則時，匯出資料可能包含訊息文字、工具參數和結果，以及 workspace 路徑。
- 命令確認文字確認記錄，而非共享或投遞。要求事先知情同意的部署必須在啟用上傳前提供該步驟；OTel 交接仍受 SDK 的批處理、重試與丟失策略約束。
