---
description: "面向 Host 與瀏覽器 Client Cordis 執行時的實驗性 Chrome DevTools 檢查，包括 Console 求值、Sources、Network 採集、Elements 樹和獨立於 CDP 的查詢 API。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-inspector

[English](README.md) | 中文

## 概述

在 Chrome DevTools 中檢查一個執行中的 dsh Host 及其瀏覽器 Client：Host 與 Client Console context、Host Sources 與除錯、Host fetch 採集和共享 Cordis 樹，全部 CDP 狀態都在 Worker 中。

Inspector 不在預設外掛列表中顯示。使用 `dsh plugin --profile web add @deepseek-ai/dsh-experimental-inspector` 顯式安裝其 bundle。其 [`cordis.patch.yml`](cordis.patch.yml) 掛載已安裝的包；`pnpm run demo:inspector` 則掛載原始碼樹。Host 行需要 Web 伺服器。Worker 不存取即時 Cordis 物件；共享 collector 會在傳輸前把它們投影成已驗證快照。

## 目錄

- [執行時佈局](#runtime-layout)
- [設定](#configuration)
- [觀測 API](#observation-api)
- [Cordis 樹檢查](#cordis-tree-inspection)
- [Host fetch 採集](#host-fetch-capture)
- [安全](#security)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="runtime-layout"></a>
## 執行時佈局

Host 外掛啟動 Worker 並連線專用 `MessagePort`。Client 外掛讀取注入的 `globalThis.__DSH_INSPECTOR__` bootstrap，直接向 Worker 開啟一條獨立、帶授權驗證的 WebSocket；在 Host 行啟用前開啟的頁面沒有 bootstrap，其 Client 外掛會以重新整理提示失敗，重新整理後才能被檢查。Chrome DevTools 連線 Worker 的 CDP WebSocket。每條 DevTools 連線在 Worker 中獨佔一個連線 Host 主執行緒的 `node:inspector.Session`，因此 Host JavaScript 暫停時，Host Console 求值、Sources、斷點和 resume 仍然可用。

原始碼樹遵循這些執行環境：`client/` 與 `host/` 提供映像的介面卡 entry path，`worker/` 只包含 Worker thread orchestration 與 Chrome protocol 狀態，`shared/` 包含與環境無關的 Cordis 和 network model、規範化 realm 後端介面及內部 bridge protocol。Worker 側 Client 與 Host 介面卡映像放在 `worker/realms/` 下；其中的 Client 介面卡仍然在 Worker 中執行。

Host 與 Client producer 傳送內部觀測記錄，不傳送 CDP 訊息。記錄包含 source generation、sequence、source 時鐘時間、topic 和 JSON payload。Worker 驗證每個程序或網路幀，獨佔 source 狀態與保留歷史，並把已識別 topic 轉換成標準 CDP domain。

Client source 宣告型別化 Runtime、Console 和只讀 Sources 能力。`Runtime.enable` 釋出真實 Host execution context，併為每個已連線的 Client source 釋出一個 synthetic context。選擇 Client context 後，求值、屬性讀取、函式呼叫、Promise await 和物件釋放都會路由到該瀏覽器 realm。Client Console argument 使用同一份工作階段本地 object table；`Debugger.enable` 釋出建置後的 `lib/client.js` catalog，`Debugger.getScriptSource` 讀取有界 content chunk。Client script 斷點、step 和 call frame 仍不支援；target-wide pause 與 resume 只控制 Host debugger。

兩個外掛端執行同一份可在瀏覽器中安全執行的 Cordis collector。它把可達 Context 與 Fiber 物件轉換成有版本的 `CordisTreeSnapshot`；Worker 儲存這份與 CDP 無關的表示，並把每個 Host 或 Client source 投影到 Elements 面板。

<a id="configuration"></a>
## 設定

Host 外掛注入 `webServer`，接受以下欄位：

| 欄位 | 預設值 | 含義 |
|---|---:|---|
| `host` | `127.0.0.1` | Worker endpoint 監聽地址；只接受 loopback |
| `port` | `9230` | Worker endpoint 起始埠；埠佔用時向上遞增，`0` 表示由作業系統分配 |
| `clientOrigins` | `[]` | `/ingest` 額外接受的精確瀏覽器 origin；loopback origin 始終允許 |
| `captureFetch` | `true` | 包裝 `globalThis.fetch` 並行布之後的每次呼叫 |
| `maxRequestBodyBytes` | 8 MiB | 每次請求保留的 request body 字首 |
| `maxResponseBodyBytes` | 32 MiB | 每次請求保留的 response body 字首 |
| `maxBodyChunkBytes` | 48 KiB | base64 編碼前一條 body 記錄攜帶的原始位元組數 |
| `maxJournalBytes` | 256 MiB | Worker 保留的請求與回應 body 總位元組數 |
| `maxRetainedRequests` | `2000` | Worker 保留的進行中與已完成請求總數 |
| `maxSourceFrameBytes` | 128 KiB | 編碼後的 source frame 上限 |
| `maxSourceRecordsPerFrame` | `128` | 每個 source batch 的記錄數 |
| `maxQueuedRecords` | `2048` | 每個 producer 等待傳送的記錄數 |
| `maxQueuedBytes` | 16 MiB | 每個 producer 等待傳送的編碼位元組數 |
| `startupTimeoutMs` | 10 秒 | Worker ready 截止時間 |
| `stopTimeoutMs` | 5 秒 | 強制終止前的 Worker 優雅關閉期限 |
| `clientReconnectBaseMs` | 250 ms | Client 首次重連退避上限 |
| `clientReconnectMaxMs` | 5 秒 | Client 最大重連退避上限 |
| `clientRuntimeTimeoutMs` | 30 秒 | 一次 Worker 到 Client Runtime 或 Sources 命令的截止時間 |
| `queryTimeoutMs` | 10 秒 | 一次非 CDP 語義查詢的截止時間 |
| `maxClientRuntimeObjects` | `10000` | 每條 DevTools 連線保留的 Client 即時物件 handle 數 |
| `maxClientRuntimeProperties` | `2000` | 單次 Client 物件檢查返回的屬性描述符數 |
| `maxClientSourceBytes` | 8 MiB | 單個 Client script 或 source map 允許讀取的最大編碼位元組數 |
| `maxCordisNodes` | `2048` | 一個 realm 快照截斷前允許的 Context 與 Fiber 節點數 |
| `maxDisconnectedCordisTrees` | `8` | 作為非即時快照保留的最近斷聯 realm 樹數量 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-experimental-inspector)是全部已接受欄位及其宣告的詳盡來源。

Worker 監聽後，Host 會記錄一個 `devtools://` URL。同一個 Worker 提供 `/json`、`/json/list`、`/json/version`、`/devtools/page/<id>` target WebSocket 和 `/ingest` Client source。

<a id="observation-api"></a>
## 觀測 API

兩個外掛端都提供同一個服務：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { InspectorJsonValue } from '@deepseek-ai/dsh-experimental-inspector'

declare const ctx: Context
declare const topic: string
declare const jsonPayload: InspectorJsonValue

ctx.inspector.publish(topic, jsonPayload)
await ctx.inspector.cordis.getTree()
```

釋出操作先驗證無損 JSON，再排程傳送，不等待 Worker。每個 source 的佇列都有上限；溢位表現為 sequence gap，絕不延遲被觀察的應用操作。`cordis.getTree()` 讀取 Worker 最新的 detached semantic 快照，不建立 CDP 工作階段，也不啟用 Runtime、Debugger 或 Sources。

<a id="cordis-tree-inspection"></a>
## Cordis 樹檢查

Elements document 包含固定的 `<host>` 與 `<clients>` 容器。`<host>` 包含 Host root Context；`<clients>` 為每個 Client source 包含一個 `<client>`，每個 `<client>` 再包含該 realm 的根 Context。Cordis root Fiber 不顯示。其他 Fiber 都是 `fiber.parent` 的子節點，幷包含唯一一個表示 `fiber.ctx` 的 Context 子節點；Fiber 只攜帶 `uid="<Cordis Fiber.uid>"`，Context element 不攜帶 attribute。只有 Context 的 `extend()`、`isolate()` 與 `intercept()` 層仍然是直接 Context 後代。

Host 與 Client 釋出同一種巢狀 `CordisTreeSnapshot` 型別。Context 與 Fiber 節點攜帶用於 realm-local 物件查詢的不透明 object 控制代碼；Fiber 還攜帶 Cordis `uid`。Worker 把這些 realm 快照組合成一棵 `{ host, clients }` inspection tree。Worker 按 source generation 分配 `BackendNodeId`；每條 DevTools 連線分配自己的 `NodeId`；`DOM.resolveNode` 請求所屬 Host 或 Client Runtime 生成連線本地 `RemoteObjectId`。`DOM.requestNode` 把該 object id 對映回同一個 Elements 節點。`ctx.inspector.cordis.getTree()` 與 `DSHInspector.getCordisTree` 讀取不含 routing 控制代碼或 CDP id 的 detached 消費方無關 tree。

節點按 DevTools 連線做深度受限下發：呼叫方省略 `depth` 時 `DOM.getDocument` 提供三層 document，被扣留的層級透過 `childNodeCount` 宣告數量，展開時經 `DOM.requestChildNodes` 取得（`depth: -1` 取整棵子樹）。經 `DOM.performSearch`、`DOM.requestNode` 或 `DOM.pushNodesByBackendIdsToFrontend` 流出的 NodeId 會先把尚未下發的祖先層級以 `DOM.setChildNodes` 事件推送出去。

source 仍釋出完整 snapshot，Worker 在通知 DevTools 前按穩定的 backend node identity 比較差異。無變化的 snapshot 不傳送 DOM 事件；新增、移除和 attribute 變化使用節點級 CDP 事件，插入節點的載荷扣留其子樹，兄弟節點重排只替換對應 parent 的 children。現有 `NodeId` 與未受影響的 Elements 展開狀態保持穩定。

Client 斷聯時，其 Console execution context 與 live object id 會立即銷燬。啟用斷聯樹保留後，Elements 會原樣保留最後一棵樹；連線狀態留在 inspection model 中，不會未經審查就成為 DOM attribute。重連會沿用邏輯 source id，為新的 transport generation 建立新的 synthetic CDP context id，並在完整 snapshot 到達後替換舊樹。Client 把邏輯 id 儲存在 `sessionStorage` 中，並透過 Web Locks 在頁面存活期間獨佔該 id，因此重新整理會複用 id，而複製出的另一個 live tab 會取得新 id。Worker 最多保留 `maxDisconnectedCordisTrees` 棵此類 snapshot；設為零會立即移除。

<a id="host-fetch-capture"></a>
## Host fetch 採集

fetch 採集預設開啟，記錄完整 URL、全部請求與回應 headers、請求體、回應體、狀態、時間、錯誤和取消。它不脫敏 credential、Cookie、query value 或 payload。body 採集讀取 clone；原始 fetch resolve 後，呼叫方立即拿到原始 Response。

設定的 body 上限限制保留量，而不選擇欄位：採集保留字首並標記 truncated。`Network.getRequestPostData` 與 `Network.getResponseBody` 讀取 Worker 保留的位元組。`Network.streamResourceContent` 返回已緩衝的字首，並僅為發起呼叫的 DevTools 連線把後續 response 位元組附加到 `Network.dataReceived`，以驅動即時 Response 與 EventStream 檢視。直接呼叫 Undici Client/Dispatcher，以及外掛啟用前儲存的 fetch 引用，不在觀察範圍內。

response headers 到達後，呼叫方 abort 可能會終止 observer clone；已採集的位元組仍可透過 `Network.getResponseBody` 讀取，採集 metadata 記錄錯誤與截斷，並且 CDP 因 fetch 已返回 Response 而傳送 `Network.loadingFinished`。response headers 到達前發生的 fetch rejection 會傳送 `Network.loadingFailed`，其中 abort 對應 `canceled: true`。

<a id="security"></a>
## 安全

CDP target 透過 `Runtime.evaluate` 提供 Host 和已連線 Client realm 中的任意程式碼執行能力，Host Debugger 操作還會提供額外控制，完整 fetch 採集也包含敏感資訊。因此 Worker 只接受 `127.0.0.1` 監聽地址。Client ingest 還要求 Host 注入的隨機 WebSocket subprotocol token；除非設定明確允許，否則拒絕非 loopback origin。CDP socket 本身不攜帶 token，loopback 監聽是它唯一的存取控制。

<a id="model-experience"></a>
## 模型體驗

無：這個僅供開發者使用的 Inspector 只觀察執行時活動，不改變模型請求。

#### KV Cache 影響

無：本包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

- **Client active debugging 不受支援**——Console event、Runtime 求值、RemoteObject 存取和只讀 `lib/client.js` Sources 可用。Client script debugger request 返回明確的 unsupported error；target-wide pause 與 resume 只控制 Host。
- **Client Sources 只暴露 Inspector bundle**——本包不收錄頁面中的其他 script。
- **Client 求值使用頁面 JavaScript**——頁面 Content Security Policy 可能阻止動態求值；synthetic context 不提供 DevTools command-line helper 或原生 REPL 宣告語義。
- **Client 身份仲裁依賴 Web Locks**——缺少該 API 的瀏覽器仍會透過 `sessionStorage` 保持重連與重新整理身份，但無法區分從同一儲存狀態複製出的兩個同時存活 tab。
- **fetch 攔截範圍是 `globalThis.fetch`**——直接呼叫 Undici API，以及啟用前儲存的 fetch 引用不會被觀察。
- **body clone 有執行成本**——完整採集會 tee 請求與回應流，直至達到設定上限，可能增加記憶體與 I/O 壓力。保留 body 的上限不包含流 tee 內部的緩衝，包括來源提供的超大 chunk，或為讀取較慢的應用分支排隊的資料。
- **不自動重新啟動 Worker**——Worker 意外退出會使目前 Inspector 實例失敗；生命週期恢復留待後續改動。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。wire 解析、generation、Worker 生命週期與 CDP 工作階段會在所屬操作中拒絕無效關係。
