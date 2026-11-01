---
description: "面向部署方的 OpenTelemetry 工作階段遙測後端說明，用於選擇模式、設定匯出器或排查哪些資料離開本機。"
kind: "package-reference"
---

# @deepseek-ai/dsh-session-telemetry-otel

[English](README.md) | 中文

## 概述

`dsh-session-telemetry-otel` 僅在新的顯式回饋後透過 OTel JS SDK 匯出工作階段記錄，適用於所有使用者和提供者，包括 `deepseek-official`。`FEEDBACK_ONLY` 釋放截至該回饋的權威日誌字首，包含上下文；後續記錄等待下一次顯式回饋。`DISABLED` 不建構傳輸。SDK 批處理可完成已授權的上傳，無需另一次使用者互動或模型呼叫。部署方負責脫敏規則。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

當部署方需要透過 OpenTelemetry 日誌匯出工作階段記錄時掛載此外掛。選擇一個模式、給匯出器一個端點，並決定是否在 seam 上掛載脫敏規則。

### 模式

| `mode` | 行為 |
|---|---|
| `FEEDBACK_ONLY` | 預設值。文字回饋、評分建立或修改、備註修改和撤回釋放尚未交接的字首，截止該權威回饋事件；後續記錄等待 |
| `DISABLED` | 不建構協調器、提供者、處理器或匯出器；沒有遙測記錄離開程序。活躍工作階段回饋在本地告警；冷工作階段修改保持靜默 |

程式化 TypeScript 設定使用匯出的 `SessionTelemetryMode` 列舉；原始字串字面量不可賦值。`FULL` 會被拒絕，不是別名。[`sharing` 屬性](../session-telemetry/README.zh.md#the-sharing-disclosure)報告 `feedback-only` 或 `disabled`，不代表投遞迴執。`/feedback` 確認文字只確認記錄。

### 最小設定

上傳模式需要匯出器 URL，並原樣接受 SDK 選項塊：

```yaml
- id: sessionTelemetry-otel
  name: '@deepseek-ai/dsh-session-telemetry-otel'
  config:
    mode: FEEDBACK_ONLY       # optional; defaults to FEEDBACK_ONLY
    shutdownTimeoutMillis: 3000 # optional; defaults to 3000
    exporter:                # passed verbatim to the SDK's OTLP/HTTP log exporter
      url: https://collector.example.com/v1/logs
      headers:
        authorization: !!js `Bearer ${process.env.OTLP_TOKEN}`
    processor: {}            # optional; passed verbatim to BatchLogRecordProcessor
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `mode` | `FEEDBACK_ONLY` | 共享策略：`FEEDBACK_ONLY` 或 `DISABLED` |
| `exporter.url` | 上傳模式必填 | 完整 OTLP 日誌端點；必須能解析為 `http(s)` |
| `exporter`、`processor` | — | 原樣傳給 SDK 匯出器與批處理器 |
| `shutdownTimeoutMillis` | `3,000` | SDK 完整關閉序列的外層截止時間 |

直接呼叫 `ctx.sessionTelemetry.emit()` 在任何模式下都是空操作，不能繞過回饋授權。繼承的父工作階段回饋不授權子工作階段匯出：子工作階段需要新的自身回饋。授權後的字首包含繼承的上下文。

模型請求、請求頭、Session 建立或接納、恢復，以及外掛掛載或 HMR（熱模組替換）均不授權捕捉。僅憑已儲存的回饋不會觸發任何操作。SDK 定時重新整理和關閉可以完成先前已授權的批次，但絕不捕捉新記錄。

### 哪些資料會離開本機

在上傳模式中，記錄攜帶 seam 的 `sessionTelemetry/record` waterfall（瀑布式事件）返回的完整 `event.data`——訊息內容、工具參數與結果、系統提示詞與工具 schema、todo 文字、壓縮（compaction）摘要、回饋文字，以及工作階段 `cwd`。提供者憑證絕不會出現：介面卡的 API key 是建構函式參數而非工作階段事件，因此它們在結構上就不存在於日誌中，也就不存在於遙測中。`DISABLED` 不建構 SDK 流水線，也不把任何捕捉內容交給後端。

### 失敗與關閉

設定錯誤會在外掛載入時失敗：缺少或非 `http(s)` 的 `exporter.url`、非正整數的 `processor.maxExportBatchSize`（SDK 會接受該值，隨後卻在關閉時掛起）以及無效的 `shutdownTimeoutMillis` 都會在任何記錄匯出前被拒絕。關閉期間，OTel 會先等待 `exporter.forceFlush()`，再等待處理器有界完成 promise；如果該傳輸 promise 始終不結算，本包會在 `shutdownTimeoutMillis` 到期時放棄等待、記錄已隔離的失敗，並讓應用繼續拆卸——屆時仍待處理的記錄可能在程序退出時丟失。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋後端的組合方式；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

後端是對 OTel JS SDK 的薄適應層：它擁有回饋授權、資源身份與外層關閉截止時間。權威 ledger 記錄使用 `@deepseek-ai/dsh-session-telemetry-otel` 插樁作用域；此後端不捕捉運維記錄。資源身份攜帶 `service.name`/`service.version`（來自 `dsh-llm` 的 `APP_IDENTITY`）以及匿名 `user.id`（來自 `$DSH_HOME/.anonymous-user-id`），按匯出批次攜帶一次，而非逐條記錄。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：模式解析、fail-closed 驗證、SDK 流水線接線、協調器組裝、關閉截止時間 |

### 捕捉接線

後端使用包含儲存歷史的按需捕捉。只有新的自身 `feedback/record`、`feedback/message-put` 或 `feedback/message-delete` 事件觸發活躍工作階段捕捉，並以該事件為上限。冷工作階段 `feedback/committed` 通知提供已提交的權威快照，不釋出存活 Session 或 Agent。同物件交接遊標抑制重複捕捉。後端不實作 `flush()`；SDK 負責批處理和關閉排空。

### 欄位映射

每條遙測記錄對映為一條 SDK 日誌記錄，攜帶捕捉的時間戳、嚴重級別、正文和屬性。回饋授權的是尚未交接的完整字首，而非只有回饋載荷。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當後端約定不夠用時閱讀以下頁面。它們從它所實作的 seam 逐步進入子系統參考與它所上報的身份。

- [工作階段遙測 seam](../session-telemetry/README.zh.md)——捕捉約定、記錄詞彙與脫敏 waterfall。
- [工作階段遙測子系統](../../../docs/subsystems/session-telemetry.zh.md)——能力拆分與型別宣告。
- [匿名使用者身份](../../identity/anonymous-user-id/README.zh.md)——作為 OTel Resource `user.id` 上報的 id。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-session-telemetry-otel)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該後端把 seam 記錄轉發進 OTel SDK 流水線，不註冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明 SDK 行為在何處起主導作用、匯出保證止於何處。它們是目前包約束。

- **上游實驗性原始碼樹**——`@opentelemetry/sdk-logs` 從上游實驗性原始碼樹釋出；SDK API 的變動只會落在本包，也僅落在本包，而 seam 約定不動。
- **真實 collector 行為屬於 SDK 匯出器**——身份驗證、TLS、速率限制及其他真實 OTLP 部署行為遵循上游 SDK，不由本包自有相容層處理。
- **盡力交接**——新冷快照以及重新啟動後的新回饋提交可能重複字首；接收方按 Session id、格式版本和事件 seq 去重。沒有持久化 outbox、投遞水位、自動重試承諾或採集端接受保證。OTel 與需顯式啟用的 DeepSeek API 路徑可能重疊。撤回匯出刪除事件，不是遠端擦除。

- **後端可用性**——本外掛停用或解除安裝期間提交的回饋會記錄在本地，但恢復外掛不會自動重放。捕捉要求訂閱方保持掛載直到觀察到提交；在冷寫入尚未完成時解除安裝，可能錯過其 flush 後通知。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。模式選擇只改變 capture handoff、SDK setup 與本地 diagnostics，不改變可由獨立 companion 對照的工作階段或服務狀態。匯出在越過後端邊界後仍由 SDK 內部處理。
