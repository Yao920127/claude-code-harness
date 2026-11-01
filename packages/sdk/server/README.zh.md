---
description: "面向讓程序外 SDK 用戶端在 DeepSeek Harness 執行時中開啟工作階段並驅動 agent 的部署的 stdio JSON-RPC 服務外掛。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdk-jsonrpc-server

[English](README.md) | 中文

## 概述

`dsh-sdk-jsonrpc-server` 透過 stdio 服務 SDK 協定格式（wire format），使程序外用戶端能夠驅動 harness agent（智慧代理）：它為每個 `sessionId` 開啟一個工作階段、把使用者提示詞排入佇列，並把每個工作階段事件與 agent 狀態轉換流式發回用戶端。把它作為 `jsonrpc` 外掛掛載到 Loader 組合中；外圍外掛樹提供其餘一切——agent、模型介面卡、持久化與工具。Stdout 只承載 JSON-RPC 幀，因此部署不得組合 stdout logger。它透過 dispose（資源釋放）根執行時並以 0 退出應答 `shutdown`；EOF 與訊號退出歸 app bin 負責。

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

當執行時必須服務 SDK 用戶端時掛載本外掛：把它加入組合了 agent 服務的 `cordis.yml`，啟動執行時，用戶端即可透過 stdio 連線。常用路徑是顯式的——外掛需要 `agents` 服務；其餘每個能力都來自外圍外掛樹。

### 組裝

外掛在首次使用時為每個 `sessionId` 建立一個 agent。已註冊的模型介面卡優先用於該路由；尚無介面卡負責的 `deepseek-official` 路由會掛載 DeepSeek 介面卡，任何其他尚無介面卡負責的提供者都會導致初始化失敗。初始化成功前，所選介面卡會解析確切模型與可選推理強度。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxTokensAsSuccess` | `false` | 把 max-token 輪次或 subagent 終止報告為成功的 SDK 結果 |

profile 組合擁有每個根 agent 的工具。`input`、`output` 與 `exit` 是僅供測試的執行時傳輸掛鉤；生產環境使用程序 stdio 與 `process.exit`。生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-sdk-jsonrpc-server)是每個受支援欄位的窮盡式真源。

### stdout 即協定

Stdout 只承載 JSON-RPC 幀，用戶端可以逐位元組解析；診斷資訊應寫入 stderr。請勿在組合的外掛樹中加入 stdout logger。

### SDK 用戶端可以做什麼

`initialize` 是執行時就緒邊界：伺服器由 Loader 組合掛載時，會等待目前外掛樹完成所有載入任務後再回應，因此首次提示詞能夠看到 MCP 初始工具發現等非同步同級能力。握手返回協定穩定標識 `deepseek-harness-sdk-runtime`。伺服器會透過所選介面卡驗證提供者／模型路由與可選的非空 `reasoningEffort`，再儲存這些值；省略時不會儲存推理強度，因此模型保留自身預設值。可選的正整數 `maxTokens` 會成為每個 SDK 建立的 agent 及其程序內後代的請求輸出上限，省略時則應用所選介面卡或提供者路由的預設值。JSON-RPC 請求可能並行分派，因此在一次 `initialize` 成功完成之前，`session/prompt` 會拒絕；用戶端必須等待握手完成後再傳送提示詞。已接受的提示詞會把一條帶標識的使用者訊息排入佇列，並立即返回 `{ messageId }`；伺服器隨後把每個持久事實作為 `session.event`、把整個 agent 生命週期的每次狀態轉換作為 `session.status` 流式發出。它不會把某條助手訊息或 `turn/end` 歸屬於某個提示詞，同一工作階段上的獨立請求可以繼續排入更多工作。持久化根目錄與 persona 來自外圍組合。

### 關閉與退出

外掛應答 `shutdown`，重新整理回應並 dispose 根上下文，使 SDK 持有的 agent、訂閱與持久化達到完全停穩，然後以 0 退出。EOF 與訊號退出歸 app bin 負責，後者也會 dispose 根上下文。僅解除安裝此外掛會停止服務，但不會退出程序。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務外掛背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本外掛是輕量的展示介面卡：[`HarnessSdkJsonRpcServer`](src/server.ts) 負責協定方法與通知，傳輸與具名協定型別來自 `dsh-sdk-protocol`，與用戶端 SDK 共享。它訂閱工作階段、agent 與 subagent 生命週期事件，並把它們作為協定通知轉發；只有當服務在生命週期建立快照時記錄的 `local` 標誌為 true 時才轉發 subagent 完成事件——提供者名稱、子級 id 與持久化譜系均不能證明本地性。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、stdio 接線、請求分發、共享關閉與退出任務 |
| [`src/server.ts`](src/server.ts) | `HarnessSdkJsonRpcServer`：協定方法、逐工作階段 agent 建立、生命週期訂閱、清理 |
| — | 不釋出執行時不變式伴生入口；此展示介面卡不擁有包內持久事件流；邊界與回放測試覆蓋協定對映。 |

### 請求流程

每個協定方法在執行前都會驗證輸入並解析負責該請求的狀態——`initialize` 儲存 SDK 路由，`session/prompt` 解析存活的 agent 與工作階段配對並排入訊息，`shutdown` 重新整理回應，再 dispose 根上下文使其達到完全停穩，最後以 0 退出——共享退出任務確保競爭的 `shutdown` 請求絕不會重複 dispose 或退出。分發邏輯位於 [src/index.ts](src/index.ts) 與 [src/server.ts](src/server.ts)。

### 清理

`server.shutdown()` 只 dispose 伺服器自身持有的內容——僅解除安裝本外掛時，外圍上下文保持執行。協定 `shutdown` 則 dispose 根 fiber，使持久化與整個執行時在程序退出前達到完全停穩。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當外掛約定不夠用時閱讀以下頁面。它們從協定格式進入用戶端與可執行應用。

- [SDK 協定格式](../protocol/README.zh.md) — 本外掛服務的協定方法與載荷結構。
- [TypeScript SDK 用戶端](../client/README.zh.md) — 驅動本外掛的用戶端。
- [SDK 應用組合包](../../bundle/sdk-app/README.zh.md) — 啟動本外掛的 `dsh --profile sdk` 應用。
- [Python SDK](../../../python/README.zh.md) — 驅動同一伺服器的 Python 用戶端。
- [SDK 執行時分發決策](../../../.agents/notes/implemented/architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.zh.md) — 打包執行時為何服務封閉外掛樹。

-----

<a id="model-experience"></a>
## 模型體驗

### SDK 使用者訊息

#### 模型看到什麼

對於每個已接受的 `session/prompt`，文字和持久內容引用會原樣進入一條使用者訊息。內聯 `SdkEncodedImageBlock` 會先透過組合中的附件儲存完成驗證與提交，因此工作階段日誌保留內容定址的圖片引用而不是 base64 位元組。此包不會新增系統提示詞文字或工具 schema；這些內容來自組合中的其他外掛。

#### Token 影響

依資料而定的使用者訊息 token 會進入保留的工作階段歷史，並在後續輪次中重複傳送，直至另一個包將其壓縮（compaction）。JSON-RPC 幀、工作階段通知與伺服器內部記錄不會增加模型上下文 token。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本外掛何時需要特別的運維注意。它們是目前包約束，不是與其他服務方式的對比或任務積壓。

- **協定沒有逐工作階段關閉或提示詞取消方法**——SDK 建立的 agent 會一直存活到程序關閉。
- **沒有逐提示詞結果**——`MessageId` 只標識 inbox 准入；擁有自動化活動區間的用戶端必須自行定義並觀察該區間。
- **stdout 純淨性由部署保證**——外圍設定仍可能載入 stdout logger 並破壞 JSON-RPC 通道；此外掛不會檢查或否決同級 logger。
- **自動掛載介面卡僅支援 DeepSeek**——`initialize` 可以複用任何預先註冊的模型介面卡，但唯一的退回行為是掛載 DeepSeek 介面卡。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性——已交付的行為與限制見上文各節與程式碼。單檔案可執行執行時分發將本外掛與打包的 `jsonrpc-demo` bin 配對；請讓關閉與退出約定與負責 EOF 和訊號退出的 app bin 保持一致。沒有記錄其他未解決的開放設計問題。

</details>
