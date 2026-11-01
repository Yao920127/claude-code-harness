# Agent Note: Web 應用自有路由相對文件定址

Status: implemented

[English](2026-09-14-web-document-relative-app-routes.md) | 中文

## 問題

瀏覽器對外殼自有路由的每一處引用都以源站根絕對形式書寫：`/api/...` RPC、`/plugins/??...` 外掛 bundle、Remote 流 mux、HMR 事件流，以及啟動入口清理 token 時重定向到的 `/`。當一個監聽埠位於剝離字首的代理之後（例如 `https://host/tools/dsh/` 這樣的掛載，把 `/tools/dsh/...` 轉發為 `/...`），這些請求會落在源站根，那裡沒有任何路由應答：外殼、外掛 bundle、流全部落空。同一份 bundle 必須同時服務源站根與任一掛載，而不能為此再建置一次。

掛載點無法從傳輸層恢復。設定 base URL 會把它變成部署輸入，轉發字首推斷會讓請求頭對路由具有權威性，代理內改寫在碎片裡重複同一事實。唯一已經知道掛載點的地方，就是所服務的文件自身。

## 決策

所服務的 HTTP 外殼擁有自己的文件 base。其 index 攜帶唯一的 `<base href="./">`，在原始 index 轉換執行後拼接於起始 head 標籤之後，因此它先於啟動 manifest、每一行外掛資源，以及任何轉換插入的標記。該 base 凍結入口目錄：`/mount/` 與 `/mount/index.html` 是受支援的入口，而文件 URL 之後移動（頁面內 `pushState`）不會移動 base。系統不推斷任何字首，因此深層直接載入與重新載入不是入口；裸掛載仍需依賴代理自身的規範化補齊尾部斜槓。

瀏覽器對這些路由的引用相對該文件——`api/x`、`plugins/x`——而伺服器端路由鍵保持絕對路徑名：RPC channel 鍵 `/api`、`webServer` 註冊路徑，以及以 combo 路由 `/plugins/??...&rev=...` 為鍵的回應表。命名路由鍵的共享常數（`*_PATH`、`*_ENDPOINT`）在邊界處被剝去前導斜槓（`KEY.slice(1)`）後瀏覽器程式碼才使用，瀏覽器形式以 `*_ROUTE` 與之並列。

主機在每個生產者裡只在一處組合瀏覽器引用。模組啟動圖 row 與批次描述符攜帶文件相對的 combo 引用；source-map trailer 只攜帶 combo 查詢，因為腳本的 source-map 引用相對該腳本自身目錄（`.../plugins/`）解析，而非相對文件。回應表仍以絕對路由為鍵，而請求在代理剝去字首後到達的也正是該路由。

啟動入口遵循同一規則。`authenticatedUrl` 把程序 token 加到呼叫方的 URL 上並保留其 authority 與掛載；token 交換重定向到 `./`，移除 query token 的同時保留請求 URL 的目錄。Host/Origin 柵欄與 cookie 規則不變。

需要絕對 URL 的消費方相對 `document.baseURI` 解析：Gateway 建構 WebSocket URL 並選擇 `ws:` 或 `wss:` 時，以及 Inspector 從啟動圖定位自身 bundle 時。

Desktop 是另一個文件所有者。它的視窗載入 `dsh-app://app/`：該來源在根目錄提供同一份 dist，並把其他所有應用路徑轉發給它擁有的 Host，因此它的文件目錄本就是根目錄，無需為它注入 base 行；它改為透過傳輸層的 `streamBaseUrl` 為 Gateway 指定該 Host origin。它的資源就位於該根目錄，這也是所服務 HTTP 外殼的 `./` 不適用於它的原因。

## 曾考慮的替代方案

**把設定 base URL 當作路由 base（`publicUrl`）。** 否決：文件已經知道自己的 URL，因此這是為頁面本可讀取的事實引入第二個易漂移來源，而且必須把它接入每個消費方，而不是隻做一次外殼決策。對外公告的公開 URL 仍是面向運維的列印／開啟輸入，不是路由輸入。

**從轉發字首請求頭推斷掛載點。** 否決：這會讓請求頭對路由具有權威性，任何設定該頭的用戶端都能挪動應用自有路由，代理約定也會變成伺服器端可見的設定。

**共享 `Connection.resolveUrl` 或 routes base。** HTTP 載體的文件基準與 worker tunnel 的 Host 根路徑對映不同。在 Connection 中統一解析所有目標，會把靜態 preview 路徑加到 worker 本地路由之前，或丟失所服務的掛載。各載體解析自己的目標；UI 資源消費方使用文件基準。

**保留絕對 `/` 重定向並讓代理改寫 `Location`。** 否決：瀏覽器已經知道請求所在目錄，而設定出來的重定向目標無法同時適用於 loopback 入口與代理掛載。

## 後果

一份 bundle 服務源站根與任一掛載，所服務的文件是掛載點的唯一來源。代價是顯式的：受支援的入口只有 dist 根與設定的 index 路徑；裸掛載依賴代理的斜槓規範化；頁面內深層路徑重新載入會在該路徑重新進入，而非凍結目錄。

功能包自有的路由（open-in-app、deliverables、工作階段日誌匯出、上傳、markdown 媒體）透過各自的 `*_ROUTE` 常數遵循同一規則；讓瀏覽器原始碼持續遵守該規則的靜態門禁隨那些改動一併記錄。

## 測試

frontend-static 的真實組合測試透過 Loader 提供 index，並斷言唯一的 `<base href="./">` 先於注入的外掛資源行與轉換標記。client-modules node 半側測試斷言啟動圖 row、批次描述符與 source-map trailer 均為文件相對，而回應表仍按路由提供它們，用戶端測試 roster 與 assembled-boot fixture 攜帶同一相對形式。`browser-auth.host.spec.ts` 覆蓋 `./` 重定向與保留 authority 和掛載的 `authenticatedUrl`；`frontend-static.spec.ts` 與 `apps/cli/tests/web-auth.e2e.ts` 分別經真實 Loader 組合與建置後的 CLI 執行該交換。

`apps/web/tests/public-mount.e2e.ts` 是瀏覽器證據：真實 Chromium 經剝離字首的代理到達同一監聽埠，掛載下的 WebSocket 雙向成流，`pushState` 到更深路徑後 `document.baseURI` 仍停在掛載點，而文件相對的 `fetch('api/session/create')` 在其下依然成功。
