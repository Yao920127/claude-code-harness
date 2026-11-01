# Agent Note: 功能路由遵循文件 base，並由門禁維持

Status: implemented

[English](2026-09-17-web-feature-routes-and-route-gate.md) | 中文

## 問題

[Web 應用自有路由相對文件定址](2026-09-14-web-document-relative-app-routes.zh.md)讓外殼、外掛 bundle 與流在任一掛載下到達同一監聽埠。功能包自有的路由仍定址源站根：`/open-in-app/...`、deliverables 的 `present.*` 與 `changes.*` 路由、工作階段日誌匯出下載、上傳 worker 的 `/api/session/uploadFileBinary` 提交，以及本地 markdown 圖片路徑背後的 `/api/file` 路由。在剝離字首的代理之後，這些請求全部落空。也沒有任何機制阻止新的瀏覽器側引用再次把 bundle 繫結到單一掛載。

## 決策

每個功能生產者保留其絕對註冊鍵，並在旁邊派生瀏覽器形式：`OPEN_IN_APP_*_PATH`/`*_ROUTE`、`PRESENT_*_PATH`/`*_ROUTE`、`CHANGED_FILES_PATH` 與 `CHANGES_*_PATH`/`*_ROUTE`、`SESSION_LOG_EXPORT_PATH`/`_ROUTE`、`FILE_UPLOAD_PATH`/`_ROUTE`。瀏覽器程式碼只定址 `*_ROUTE` 形式；頁面安裝的 Fetch 形載體（`FileUploadFetch`、`RpcFetch`）收到該相對路由，並相對自身基準解析。

兩個消費方需要絕對 URL，並相對 `document.baseURI` 解析：上傳 worker（其自身基準是 `blob:` URL）與 markdown 圖片詞彙表（只輸出絕對的 `http(s)`、`blob` 或 `data` 目標）。

`verify-client-route-resolution` 在 `hygiene` 與 CI 靜態檢查中執行，覆蓋 client 編譯面編譯的每個瀏覽器原始檔。它治理請求目標——請求建構器、`fetch` 形呼叫或動態 import 的第一個參數；賦值的資源屬性；JSX 的 `src`/`href` 屬性——拒絕根絕對、協定相對或絕對的應用路由（`api`、`plugins`、`open-in-app` 字首），以及相對 `location` 讀取解析的相對應用路由。作為請求目標使用的共享 `*_PATH`/`*_ENDPOINT` 鍵必須先剝去前導斜槓。同一遍檢查還覆蓋主機側瀏覽器引用的生產者：以根絕對應用路由寫入的 `url`、`src` 或 `href` 欄位被拒絕，而路由鍵與回應表鍵保持絕對，不在範圍內。

## 曾考慮的替代方案

**在瀏覽器程式碼中禁止一切 `location` 讀取。** 否決：身份比較、preview 自身查詢讀取、worker tunnel 的主機相對對映都屬正當。門禁治理請求目標——繫結掛載點的路由真正出現的位置。

**在代理中改寫功能回應。** 否決：這會為代理並不知曉的每條路由在部署設定裡重複掛載點，而文件本就能解析相對引用。

## 後果

門禁只讀取內聯字面片段，因此組合出來的引用（`comboReference(...)`、`artifact.url.slice(1)`）不被追蹤；組合而成的啟動圖 row、批次描述符與 source-map trailer 的迴歸訊號由 `packages/client/modules/tests/node-half.client.spec.ts` 持有。Preview 頁面不會在文件 URL 下暴露其 worker 的檔案 API，因此 markdown 本地檔案圖片 URL 無法到達該 Host。[工作階段正文本地媒體展示](../feature/2026-09-07-session-prose-local-media-display.zh.md)持有圖片詞彙表。

## 測試

門禁自身的 spec 為每條規則固定了負向對照：插值目標（`${origin}/api/file`）、協定相對與絕對形式、未剝前導斜槓的共享鍵、相對路由相對 `location` 讀取解析，以及生產者中根絕對的引用欄位。各功能包的 spec 斷言其瀏覽器半側發出的相對路由；`markdown-images.e2e.ts` 端到端維持本地圖片路徑的覆蓋。發現邏輯的 spec 固定了哪些 client 專案貢獻瀏覽器原始檔：同時被 Host 聚合編譯的 DOM 專案，若沒有 `src/client` 半邊，則其整個 `src/` 都計入。
