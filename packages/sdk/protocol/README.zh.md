---
description: "面向用戶端與伺服器端實作者的 SDK 協定格式（wire format）說明：Harness 執行時與其 SDK 用戶端之間使用的按換行分幀 JSON-RPC 傳輸，以及具名的請求、結果與通知型別。"
kind: "package-library"
---

# @deepseek-ai/dsh-sdk-protocol

[English](README.md) | 中文

## 概述

`dsh-sdk-protocol` 讓 DeepSeek Harness 執行時與其 SDK 用戶端透過按換行分幀的位元組流交換 JSON-RPC 2.0 訊息：一個傳輸類，加上協定兩端共同使用的具名請求、結果與通知型別。伺服器端是 [`dsh-sdk-jsonrpc-server`](../server/README.zh.md) 外掛；用戶端是 TypeScript 的 [`dsh-sdk-client`](../client/README.zh.md) 與 [Python SDK](../../../python/README.zh.md)（後者復現這些結構但不匯入它們）。當你實作或除錯協定某一端時使用本包：分幀規則、方法名、載荷型別與錯誤語義都在這裡。它是純庫——無外掛、無設定、無註冊。

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

當你建置或除錯 SDK 協定端——服務外掛、用戶端庫或使用該協定的自定義工具——時使用本包。它為你提供一個在呼叫方持有的位元組流上承載 JSON-RPC 2.0 的傳輸，以及每個 SDK 方法與通知的型別化結構。

### 分幀與傳輸

在你擁有的位元組流上，每個 `\n` 結尾的行承載一條 JSON-RPC 2.0 訊息。同時帶 `id` 與 `method` 的幀是請求，僅 `id` 是回應，僅 `method` 是通知；格式錯誤的行會被忽略。沒有註冊處理器的請求應答 `-32601`，處理器失敗應答 `-32603`，錯誤回應會以 `JsonRpcResponseError` 拒絕掛起的請求，並保留協定中的 `code` 與可選 `data`。`start()` 掛接流監聽器，`close()` 移除監聽器並拒絕掛起請求，但不銷燬流。

### SDK 方法

兩個協定端共享同一套方法：三個用戶端到伺服器端請求與四個伺服器端到用戶端通知。

| 方向 | 方法 | 載荷型別 |
|---|---|---|
| client→server | `initialize` | `InitializeParams` → `InitializeResult` |
| client→server | `session/prompt` | `SessionPromptParams` → `SessionPromptResult`（持久入隊回執） |
| client→server | `shutdown` | 無參數 → `{}` |
| server→client | `session.event` | `SessionEventNotification`（執行時內每個工作階段，不過濾） |
| server→client | `session.status` | `SessionStatusNotification`（整個 agent（智慧代理）的 `running`/`idle` 轉換） |
| server→client | `subagent.started` | `SubagentStartedNotification` |
| server→client | `subagent.finished` | `SubagentFinishedNotification`（僅程序內執行） |

`HarnessSdkRequestMap` 與 `HarnessSdkNotificationMap` 按方法名索引這些結構；包根與傳輸一起匯出它們。

### 載荷語義

`SessionPromptResult.messageId` 標識已排隊的使用者訊息；它不標識後續的助手訊息、輪次結束或提示詞結果。`SdkPromptContentBlock` 接受普通持久內容以及 `SdkEncodedImageBlock { type: "image", data, mimeType }`；伺服器在入隊前把編碼影象轉換為持久引用。`InitializeParams.reasoningEffort` 是所選提供者／模型路由可選的非空介面卡自有識別符號；省略時保留該模型的預設值。`InitializeParams.maxTokens` 是可選的正安全整數，用於限制 SDK 建立的 agent 及其程序內後代的每次對話模型輸出；省略時應用所選介面卡的確切模型預設值。伺服器會在初始化期間解析確切路由，並在握手成功前拒絕 `session/prompt`，因此缺少介面卡、模型不可用或推理強度不受支援時，不會退回到建構期預設值。`SubagentFinishedNotification.lastAssistantMessage` 攜帶子 agent 最後一條非空 assistant 訊息；若不存在這類訊息，則攜帶其累積的 assistant 文字；子 agent 兩種輸出均未產生時，該欄位預設。`serverInfo.name` 的協定值固定為 `deepseek-harness-sdk-runtime`。通知載荷依賴 `SessionEvent`（`dsh-session`）、`ContentBlock`（`dsh-llm`）與 `SubagentStopReason`（`dsh-subagent`），因此工作階段詞彙是協定格式約定的一部分。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋協定庫背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包採用一種職責分離設計：兩個協定端共用一個按換行分幀的傳輸類，並以具名型別索引協定方法。包根是唯一的匯入面——源模組不支援深層匯入。它是沒有外掛、設定或註冊的純庫；服務外掛與用戶端負責其周圍的一切行為。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/transport.ts`](src/transport.ts) | `JsonRpcLineTransport`：行分幀、請求/回應/通知分發、錯誤對映、掛起請求記帳 |
| [`src/types.ts`](src/types.ts) | 具名請求/結果與通知載荷型別，按方法索引 |
| [`src/index.ts`](src/index.ts) | 消費方介面：傳輸與具名協定型別 |
| — | 不釋出執行時不變式伴生入口；這是一個由傳輸類和型別宣告組成的純協定庫，自身沒有事件流或可變資料關係；兩個協定端各自負責其協定行為。 |

### 幀分發

入站行逐條解析：帶 `id` 與 `method` 的幀透過請求處理器應答（或應答 `-32601`），僅 `id` 的幀結算匹配的掛起請求（錯誤幀以 `JsonRpcResponseError` 拒絕它），僅 `method` 的幀交給通知處理器。`start()` 掛接輸入監聽器；`close()` 移除它們並在不銷燬流的情況下失敗所有掛起請求。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當協定約定不夠用時閱讀以下頁面。它們從服務外掛進入用戶端與可執行應用。

- [JSON-RPC 服務外掛](../server/README.zh.md) — 透過 stdio 服務該協定的執行時外掛。
- [TypeScript SDK 用戶端](../client/README.zh.md) — 驅動該協定的用戶端。
- [Python SDK](../../../python/README.zh.md) — 復現這些結構的 Python 對應實作。
- [SDK 應用組合包](../../bundle/sdk-app/README.zh.md) — 啟動伺服器的 `dsh --profile sdk` 應用。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為這是面向用戶端的協定庫；模型可見行為歸對外服務入口後方的執行時外掛所有。

#### KV Cache 影響

無；此包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明協定未覆蓋或未承諾的內容。它們是目前包約束，不是與其他協定格式的對比或任務積壓。

- **無協定版本協商**——握手只攜帶 `serverInfo.version`（`0.0.1`，用戶端不驗證）；處於預釋出階段，無相容承諾。
- **無取消與工作階段關閉方法**——用戶端放棄輪次的方式是關閉執行時程序；見 [JSON-RPC 服務外掛](../server/README.zh.md)。
- **server→client 請求是未使用的能力**——傳輸層支援，但伺服器從不傳送；Python SDK 的應答介面為未來審批流程預留。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性——已交付的行為與限制見上文各節與程式碼。本協定的各個結構由 Python SDK 復現（而非匯入），因此在這裡更改方法、載荷或協定穩定值 `serverInfo.name` 時，必須在同一次變更中更新 Python 對側與 TypeScript 用戶端。沒有記錄其他未解決的開放設計問題。

</details>
