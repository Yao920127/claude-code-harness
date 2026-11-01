---
description: "web GUI 主機的 HTTP 伺服器：具名路由與 upgrade 註冊、index 轉換，以及服務 Web 殼 SPA dist 的唯一退回席位。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-webserver

[English](README.md) | 中文

## 概述

瀏覽器經由 `dsh-host-webserver` 透過 HTTP 存取 web GUI：一個 `node:http` 伺服器，其他外掛在其中註冊具名路由、upgrade 路由、index 啟動輸入與一個退回 handler。它不瞭解任何 harness 概念，也不提供任何檔案服務——`/api` 橋接、外掛 bundle、HMR（熱模組替換）事件流與 SPA dist 都屬於註冊它們的外掛。路由匹配順序固定不變：先在整張表中匹配精確 route，再匹配最長字首，最後交給退回 handler。它只服務瀏覽器；Electron 透過 `file://` 載入 dist，並經 IPC 橋接承載 fetch。

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

把 webserver 組合為面向瀏覽器主機的 HTTP 傳輸，然後讓功能外掛認領各自的路由。啟用即開始監聽；註冊順序不影響請求處理，因為具名路由組合起來互不相交。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-host-webserver'
  config:
    host: 127.0.0.1
    port: 3000
```

`host` 只接受兩個值：`127.0.0.1`（預設姿態，僅迴環）與 `0.0.0.0`（有意向網路開放——伺服器自身不攜帶 TLS、認證或來源策略）。`port` 為 0 時請求 OS 分配埠；之後用 `ctx.webServer.port` 讀取正在監聽的埠。

設定 `compression: 'gzip'` 可以包裝符合條件的 socket-backed 回應，而不改變 route API。用戶端必須接受 gzip，且媒體型別必須可壓縮或為 `multipart/form-data`；已知長度小於 `compressionThresholdBytes` 的回應保持未壓縮，未知長度的流則立即符合條件。已有編碼、`Cache-Control: no-transform`、range 回應、SSE（Server-Sent Events）、ZIP 與已打包的 `.gz` Worker image 均保持不變。隨附 Web bundle 使用 level 1 與 1024 位元組閾值；其他組合預設不壓縮。

### 註冊路由

`register(route)` 新增具名的 `exact`／`prefix` HTTP route，`registerUpgrade(route)` 為精確 pathname 新增 upgrade route，兩者返回的 disposer 都會移除註冊。同一張表內的重複路徑會拋錯——route 模式是組合層約定，衝突即設定錯誤。HTTP 匹配先在整張表中匹配精確 route，再匹配最長字首，最後交給退回 handler；upgrade 只做精確匹配，未命中連線直接關閉。

### 退回席位

`registerFallback(handler)` 認領所有未被具名 route 命中的請求的唯一一個 handler。第二次註冊會拋錯；沒有註冊退回時伺服器回答 404。在隨附的 Web 組合中，[SPA dist 伺服器](../frontend-static/README.zh.md)擁有該席位，並對其渲染的每個 index 回應呼叫 `renderIndex`。

index 啟動輸入分兩層。`collectIndexInjections()` 收集一張全新的注入表——每次呼叫發一次 `webserver/index-inject` 事件，每個訂閱方推入其目前行——`renderIndex(html)` 先把這些行渲染進 index.html 正文，再按註冊順序應用原始 `tapIndex(transform)` 轉換。`script-preload` 行會渲染為 classic script 的提示性 preload 連結。靜態部署會在啟動 payload 中攜帶同一批行。`applyIndexTaps(html)` 只應用原始轉換；它是任何行都無法表達的標記的逃生口。

### 失敗時的行為

監聽失敗（例如 EADDRINUSE）會以繫結診斷資訊拒絕外掛初始化。handler 拋錯的 HTTP 請求會得到 400——若回應頭已經發出則銷燬 socket——並記錄 warning；它絕不會退出程序。upgrade handler 拋錯或升級 socket 出現傳輸錯誤時，會記錄 warning 並銷燬對應 socket。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

### 設計理念

本包是一個不帶任何 harness 詞彙的普通路由註冊表：`WebServer` 繼承 Cordis `Service`，持有三張路由表、退回 slot、原始 index 轉換列表，以及 index 渲染器經其收集行的 `webserver/index-inject` 事件。index 渲染每次回應組合兩層：`renderIndex` 先把包含提示性 `script-preload` 行的全新注入表渲染進正文，再按註冊順序應用原始轉換；`applyIndexTaps` 只執行轉換。upgrade handler 擁有協定握手與連線內容；webserver 只交付原始 socket 與 request。`host` 與 `port` getter 暴露其他外掛據以自適應的組合期事實（例如 directory-picker 選擇器）。

### 匹配與生命週期

`match(pathname)` 先查精確表，再遍歷字首表取最長匹配，最後走退回。啟用（`[Service.init]`）即開始監聽；資源釋放會啟動 `close()` 與 `closeAllConnections()`，銷燬所有受跟蹤的升級 socket，並僅在伺服器與這些 socket 均已關閉後返回。Node 的 `closeAllConnections()` 不包含升級 socket，因此服務顯式跟蹤它們。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `WebServer` 服務：路由表、退回席位、index 渲染、匹配、生命週期 |
| — | 不釋出執行時不變式伴生入口；路由註冊與釋放透過同一服務修改同一張路由表，register/dispose 探針只會重複執行實作。真實路由與 HMR 測試負責驗證該行為。 |
| [`src/injections.ts`](src/injections.ts) | 結構化 `IndexInjection` 行與 `renderIndexInjections` 行渲染 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當伺服器約定不夠用時閱讀以下內容：先看子系統參考，再看退回持有者，以及誰註冊哪條路由背後的分層決策。

- [HTTP 伺服器子系統](../../../docs/subsystems/web-server.zh.md)——路由、匹配順序與伺服器接受的設定。
- [SPA dist 伺服器](../frontend-static/README.zh.md)——退回席位的隨附持有者。
- [Web 設定樹啟動與傳輸分層](../../../.agents/notes/implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.zh.md)——功能外掛為何擁有每條路由。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-webserver)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

無。該 HTTP 載體只橋接瀏覽器與 API handler，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明伺服器在何處有意保持最小。它們是目前包約束，不是任務積壓。

- **不提供伺服器級 TLS、認證或來源策略**：`dsh-client-connection` 等 route owner 會實施自己的請求策略。繫結非迴環地址仍會向該網路公開未受保護的 route 與靜態資源。
- **Socket 選項固定不變**：設定只選擇繫結主機與埠；在具體部署產生需求前，backlog 和其他 socket 設定仍保持內部實作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
