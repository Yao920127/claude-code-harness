---
description: "Web GUI 的瀏覽器與 Host 之間的協定層：Remote RPC、帶重連的事件流投遞、精確 Fetch 路由、/api HTTP 橋與瀏覽器信任柵欄。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-connection

[English](README.md) | 中文

## 概述

本包承載瀏覽器到 Host 的 Remote 呼叫、精確 Fetch 回應與 connection generation。Client 外掛掛載 `ctx.connection`，其中包含目前頁面的 loopback 狀態、通用 RPC、目前 generation 及其 Host 資訊、可觀察的恢復狀態、立即重連命令，以及單一 generation source 的註冊點。source 報告 ready 後 generation 才可見；source 結束、失敗、被撤回或顯式 stop 都會清空它，再由 `ConnectionController` 執行重試策略。

## 目錄

- [使用本包](#use-this-package)
- [瀏覽器認證與請求信任](#browser-authentication-and-request-trust)
- [Connection generation](#connection-generation)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

靜態桌面頁面可以透過 `__DSH_TRANSPORT__.streamBaseUrl` 提供其所擁有 Host 的 HTTP origin。Gateway 將該 origin 用於 WebSocket，HTTP 傳輸仍獨立選擇。桌面載體負責認證；僅設定 origin 不會授予存取權限。

一元 RPC 請求使用 JSON。Host handler 可以返回已經從 JSON 相容結果值中分離的位元組附件，每個附件標明其相對於結果的路徑。Connection 將這些值寫為 multipart 部分。JSON `metadata` 部分包含帶 `null` 佔位值的 RPC 回應信封，以及記錄各路徑、codec 和部分識別符號的附件表。路徑使用字串鍵與數字陣列下標，不保留任何業務欄位名。Client 驗證信封、`rpcId`、附件表和各部分，再將每個位元組值恢復為以 `ArrayBuffer` 為底層緩衝區的檢視。沒有附件的結果（包括 base64 字串）與失敗仍使用 JSON。邏輯 RPC 載體直接返回解碼後的原生值。Connection 不識別二進位制欄位，也不依賴 Typert；擁有結果協定的 handler 在返回前執行按型別或按執行時值的投影。不支援二進位制參數、事件和二進位制流式結果。

瀏覽器透過 HTTP POST 執行 Remote 一元呼叫；API Gateway 自己擁有 `/api/remote.mux` WebSocket 及其邏輯流。由 shell 持有的組合透過 `connection.rpc.open` 提供等價的 Remote 流（包括流的上行），不開啟 WebSocket。瀏覽器外掛讀取頁面 transport、恢復設定與 location，再委託 `installConnection(ctx, options)`。持有自身載體的組合可以直接呼叫同一個安裝函式；整機用戶端測試檔就是這一消費者。每次呼叫都會建立一個歸所屬 Context 的服務，因此同一 realm 中的多棵 Client 樹可以使用不同載體。Host half 始終提供與載體無關的 RPC 註冊表和精確 `GET`/`HEAD`/`POST` 路由註冊表。存在 Web 載體時，它還持有唯一 `/api` route、Fetch bridge、瀏覽器認證與 Host/Origin 驗證；由 shell 持有的載體則直接分派共享 Fetch handler。每條精確路由會在 bridge 讀取任何位元組前宣告緩衝或流式請求體處理方式。Typert Gateway 認領生成的 Remote endpoint，功能包註冊 Session 日誌下載、原始檔案上傳等非 JSON 回應，未認領的請求返回 404。Loopback hostname 判定只供瀏覽器側目前頁面狀態使用，留在包內。瀏覽器原始請求體傳輸由 [`dsh-client-file-upload`](../file-upload/README.zh.md) 提供。

-----

<a id="browser-authentication-and-request-trust"></a>
## 瀏覽器認證與請求信任

每個 Host RPC 方法和 WebSocket 流都要求一個瀏覽器工作階段，不存在按方法區分的 loopback 層。每個程序生成一個隨機啟動權杖。`dsh-web-app` 列印並開啟帶 `?token=...` 的應用 URL，保留呼叫方的 authority 與掛載；`frontend-static` 把根路徑和 index 請求交給 `ctx.connection.authorizeIndex`，後者只在 `GET /` 接受該權杖，寫入繫結 authority 的簽名 cookie，再重定向到乾淨的 `./`，移除權杖並保留請求目錄。缺失、過期、畸形或 authority 不匹配的 cookie 會在 RPC 分發前得到 401。靜態資源保持公開。HTTP 載體不在根路徑交換之外接受 query token，也不接受 Authorization header token。

cookie 簽名金鑰是 `ctx.credentials` 中由 `client-connection/browser-session` 擁有的 grant 記錄。本地提供者把它持久化到 `$DSH_HOME/.credentials.yaml`；`BrowserAuth` 在 Connection 啟用期間載入或建立該記錄，並把金鑰留在記憶體中，因此請求認證同步執行。刪除或替換該記錄會在下一次 Connection 啟用時生效。cookie 攜帶絕對簽發與過期區間，`cookieMaxAgeDays` 預設設為 30 天，並在確定性名稱與簽名 payload 中同時繫結規範化 hostname 和 port。它是 host-only、`Path=/`、`HttpOnly`、`SameSite=Strict`；隨附伺服器使用 loopback HTTP，因此刻意不設定 `Secure`。

認證之前，每個請求仍經過 `src/api-request-trust.ts`。其 `Host` 必須是 loopback，或與 `trustedHosts` 條目匹配：帶埠的 `host:port` 精確匹配，不帶埠的條目匹配任意埠，兩側均經 WHATWG 歸一化。若附帶 `Origin`，它必須等於該 Host；`sec-fetch-site: cross-site` 一律拒絕。畸形設定 authority 會讓外掛載入失敗。這些檢查防禦 DNS rebinding 與跨站瀏覽器請求，絕不建立身份。Host/Origin 驗證失敗返回 403；Host 可信但未認證的請求返回 401。`dsh web --host 0.0.0.0` 仍不受支援。決策記錄：[瀏覽器請求信任](../../../.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.zh.md)與[瀏覽器權杖認證](../../../.agents/notes/implemented/architecture/2026-08-24-browser-token-authentication.zh.md)。

每個被接納的請求都代表同一個 Peer——操作者。`ctx.connection.operator` 就是這個 `PeerScope`：其 `ctx` 是擁有連線期註冊的 Cordis scope，隨 Connection 一起釋放。`ctx.connection.admit(request)` 執行信任與認證檢查，以拒絕狀態或操作者作答；`/api` 路由與 Gateway 的 WebSocket 升級都經它接納，每個 RPC 處理器都收到本次呼叫的 Peer。`OperatorPeer` 對外匯出，供沒有 Connection 的組合（例如 Gateway 的程序內載體）以同一約定擁有一個操作者 scope。

透過認證的共享 HTTP 請求在傳輸請求體之前經過 `connection/request` waterfall。監聽器可以拒絕新請求，或等待 `next()` 直到回應完成；釋放所屬 fiber 會移除准入行為。Desktop 使用此擴充功能點，在已批准的安裝期間鎖住新的 API 工作，而不取消已接納的工作。用戶端斷開會中止處理函式的訊號；橋接器停止寫入 socket，並排空剩餘回應塊。WebSocket 流仍由 API Gateway 負責。

<a id="connection-generation"></a>
## Connection generation

API Gateway Client 把內部 `$events` 邏輯流注冊為唯一 generation source，與有無 `$on` 訂閱無關。Host 在 API Remotes source factory 同步掛好所有增量 listener 後，先傳送唯一 `{ type: 'ready', clientId, host: { home } }` 項，再傳送事件。`ConnectionController` 僅在收到該 ready 項後釋出 generation 並呼叫 `onConnected`，因此 baseline 不會跑在增量 listener 前面。

`$events` 結束、Remote 流報錯、收到非 ready 首項或畸形事件項，都會使目前 generation 失效。預設情況下，掛起的握手在 3 秒後記錄 Host 回應緩慢告警，在 15 秒後記錄就緒超時並中止，包含等待物理 socket 的時間。取消後，source 必須停止投遞、釋放資源並結束，替換 source 才能啟動；已取消 source 遲到的 ready 不能釋出 generation。瀏覽器報告網路可用時，Controller 釋出 `connecting`，並在 500ms、1s、2s、4s、8s 與 10s 上限內採用 50%–100% 抖動重試，達到終檔後繼續嘗試直到恢復。每次重試都要求 Gateway 替換一次物理 WebSocket，再重開 `$events`。[持續恢復決策](../../../.agents/notes/implemented/bug-fix/2026-09-05-continuous-client-recovery.zh.md)規定握手期限與重試策略。

`ctx.connection.reconnect()` 會中斷活動工作、重置序列，並立即開始 retry 1。瀏覽器 `offline` 會中斷活動工作、釋出 `disconnected` 並暫停自動嘗試；下一次 `online` 轉換會重置序列並從 500ms 檔開始。只有 ready 項會發布 `connected`。Gateway mux 不擁有獨立重試排程。

可透過 Host Connection 行的 `config.recovery` 覆蓋重試上限、增長因子或握手告警與取消時間；[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-connection)列出接受的欄位。Host 驗證這些值，並將其注入所提供的每個頁面。Client 在提供 Connection 前驗證啟動資料，並在 Gateway 啟動迴圈時採用這些預設值；顯式傳給 `start()` 的時序覆蓋優先。增長因子必須是至少為一的有限數。若就緒、失敗、取消或硬期限先於告警發生，該告警會被取消。修改 Host 恢復設定後需重新載入頁面。


<a id="model-experience"></a>
## 模型體驗

無。協定消費層只在瀏覽器與主機之間搬運已經組合好的訊息；這裡沒有任何內容進入模型請求。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>

- **緩衝型 `/api` 路由會把每個請求體保留在記憶體裡**：`maxRequestBodyBytes`（預設 300 MiB，按預設 200 MiB 圖片總量上限經 base64 膨脹加信封餘量得出）限制普通圖片與 RPC 信封。顯式啟用的流式路由接收帶背壓的分塊並繞過總量上限；路由實作負責持久化、取消與儲存配額。
- **瀏覽器 cookie 不帶 `Secure`**：目前隨產品提供的傳輸方式是 loopback HTTP；若部署經明文網路暴露同一 authority，bearer cookie 可能在傳輸中洩露。
- **沒有 logout 操作**：清除瀏覽器 cookie 會結束單個瀏覽器工作階段；刪除 owner 憑證記錄並重新啟動 `dsh` 會撤銷全部工作階段。


<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。瀏覽器工作階段驗證會在請求授權工作時非同步讀取憑證記錄，而記錄的 commit-event 生命週期由 credentials 伴生入口負責；流與重連的時序及 rpcId 往返約束由行為規範直接驗證，路由註冊與 dispose（資源釋放）的對稱性由 webserver 伴生入口審計。
