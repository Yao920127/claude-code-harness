---
description: "面向部署方與後端作者的工作階段遙測捕捉 seam 說明，用於選擇上報後端、掛載脫敏規則或實作後端約定。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-telemetry

[English](README.md) | 中文

## 概述

工作階段遙測讓部署方傳送工作階段活動的有序副本用於上報，同時保留權威工作階段日誌。部署方選擇一個上報後端，並可在投遞前脫敏每個外發副本；如果沒有脫敏規則，捕捉的資料將原樣離開程序。交接以非阻塞方式完成，因此上報不會延遲工作階段處理。投遞採用盡力而為方式；如果程序崩潰，佇列中的記錄可能丟失。

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

作為部署方，選擇一個後端並掛載它，當記錄不能以捕捉原樣離開程序時新增脫敏規則。作為後端作者，實作三成員約定，並以一種捕捉模式組裝協調器。

### 選擇並掛載後端

只載入一個後端外掛；它把捕捉協調器與投遞流水線註冊為 `ctx.sessionTelemetry`。重複載入會丟擲異常。必需的 [`sharing` 成員](#the-sharing-disclosure) 報告部署模式，不代表工作階段准入或投遞。只有在未掛載任何遙測服務時，消費方才可報告「未設定」。`/feedback` 命令確認記錄，不讀取此策略。

### 後端約定

後端實作三個成員：`emit(record)` 必須是非阻塞入隊，因為它會在工作階段事件路徑上同步執行；可選的 `flush()` 是輪次結束後的即發即忘提示，多數後端為了遵循 SDK 自身的批處理計劃而省略它；`shutdown()` 排空已入隊記錄，並在 SDK 停止後結束，dispose（資源釋放）會等待它。實作 `flush()` 的後端必須安排並行 flush 與最終 `shutdown()` 排空的先後順序。

### 捕捉內容

捕捉以兩種模式之一執行。`live` 捕捉在追加時跟隨工作階段事件、在掛載時回放已存活工作階段並記錄生命週期標記；`on-demand` 捕捉只在後端透過 `captureSession(session, throughSeq?)` 請求字首時讀取權威工作階段日誌。協調器選項決定是否包含儲存歷史。每條權威工作階段事件都按順序對映為一條 ledger 記錄。`assistant/message` 或 `assistant/attempt` 記錄會攜帶完整的嵌入式緊湊流，包括失敗和重試輸出。每條 ledger 記錄還攜帶 `session.id`、`session.format_version`、數值型事件標識、可選 header 事實與預先對映的嚴重級別（`tool/result.isError`、`turn/end` 的錯誤原因與 `agent-error` 對映為 `error`；其餘為 `info`）。

### 共享披露

<a id="the-sharing-disclosure"></a>

每個後端透過 `sharing` 披露部署模式：`full`、`feedback-only` 或 `disabled`。後端還可限制符合條件的工作階段。該屬性不是投遞迴執；交接是非阻塞入隊，批處理、重試與丟失策略屬於後端 SDK。

### 脫敏記錄

<a id="the-redact-waterfall"></a>

協調器複製權威事件後，每條外發記錄都會立即經過 `sessionTelemetry/record` waterfall（瀑布式事件）。本包不帶任何規則：未掛載監聽器時，記錄以捕捉時的原樣到達後端，因此匯出資料能幹淨到什麼程度，恰恰取決於部署方掛載了什麼規則。監聽器透過變換 `next()` 的回傳值來堆疊；丟擲異常的監聽器以 fail-closed 方式攔下這一條記錄。脫敏只作用於外發副本——權威工作階段日誌永不改寫。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋捕捉設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

seam 建立在一個邊界之上：harness 的職責止於 `emit()`。完整事件捕捉、脫敏與 handoff 遊標都在這裡；批處理、重試、排隊與丟失策略屬於上報 SDK，本包有意不建模也不包裝。設計與被否決的替代方案見[復活 Agent Note](../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.zh.md)。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition：`SessionTelemetryBackend`/`SessionTelemetrySink` 約定、記錄詞彙、`session-telemetry/record` waterfall 宣告 |
| [`src/coordinator.ts`](src/coordinator.ts) | 捕捉：live 監聽器、生命週期本地 on-demand 回放、脫敏、handoff 遊標、異常隔離 |

### 捕捉流程

即時捕捉透過組合 fiber 的 effect 註冊 Session 事件、重新整理提示、關閉標記與 agent/error 觀察器。按需捕捉只註冊釋放 effect，並按歷史策略讀取請求的權威日誌字首。同步處理器隔離失敗，避免影響 agent loop（智慧代理迴圈）或其他監聽器。

### handoff 遊標

模組級 `WeakMap<Session, seq>` 記錄已經移交的最高序號，而不是已送達的最高序號。再次接管同一物件時從該遊標之後繼續。採集從 `firstLifecycleSeq` 開始：新 fork 包含子工作階段自有的標記與 fork 結束事件；恢復的 Session 排除已儲存字首，包括先前的子工作階段輪次。顯式 `includeHistory: true` 會讓尚未移交的物件從 seq 0 開始，包括恢復或 fork 歷史。Backend 負責採集授權；已有儲存歷史本身不構成授權，OTel backend 等待新的顯式回饋。接收方透過 `(session.id, session.format_version, event.seq)` 對重複記錄去重。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當 seam 約定不夠用時閱讀以下頁面。它們從隨附後端逐步進入子系統參考與決策證據。

- [OpenTelemetry 遙測後端](../session-telemetry-otel/README.zh.md)——部署方載入的隨附後端，含模式與匯出器設定。
- [工作階段遙測子系統](../../../docs/subsystems/session-telemetry.zh.md)——能力拆分與型別宣告。
- [工作階段遙測復活決策](../../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.zh.md)——理由、權衡與被否決的替代方案。
- [工作階段包對映](../README.zh.md)——相鄰的持久化、投影、標題與遙測包。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為該 seam 觀察工作階段流並把脫敏後的副本交給外部；它不註冊任何面向模型的內容。

#### KV Cache 影響

無；本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制定義部署方能得到的投遞與資料保護保證。它們是目前包約束。

- **盡力而為的投遞**——遊標標記的是已交接而非已投遞；在過載視窗內被拆除的工作階段無法重新收養，崩潰時留在後端佇列中的內容會丟失。持久化 outbox（spool、每 sink 遊標、at-least-once）推遲到有部署方提出明確的崩潰丟失要求時再實作。
- **不內建脫敏規則**——未掛載 `sessionTelemetry/record` 監聽器時，記錄以捕捉時的原樣離開程序，包括檔案內容或命令輸出中內嵌的任何憑證；向共享 collector 匯出的部署方自行負責其規則集。
- **按需脫敏使用目前狀態**——未捕捉的事件只存在於權威工作階段日誌中；後續的 `captureSession()` 會使用當時掛載的策略，深複製並脫敏其目前值，且不存在捕捉時的遙測快照或持久化的捕捉前 spool。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包的全部輸出都是後端交接，即在所有權威事件流之外同步呼叫 `emit()`；捕捉側不追加工作階段事件，因此不存在可供獨立 companion 觀察的事件與資料關係。
