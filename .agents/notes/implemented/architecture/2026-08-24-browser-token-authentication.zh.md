# Agent Note: 瀏覽器啟動權杖認證

Status: implemented

[English](2026-08-24-browser-token-authentication.md) | 中文

## 問題

Web Host 以目前作業系統使用者的權限執行具有工具能力的 Session，但其 HTTP 介面用請求路由事實識別特權呼叫者。具體而言，按方法維護的 loopback 列表把 loopback `Host` 值視為本地 authority，儘管 HTTP 用戶端可以控制該 header。能夠到達伺服器的呼叫者因此可以宣告 `localhost`、進入設定方法，再利用模型發現等 Host 側操作披露儲存的憑證。隨附 CLI 繫結 loopback 可以限制普通可達性，卻不能認證被轉發或以其他方式送達該 socket 的請求。

## 決策

`dsh-client-connection` 在分發前認證完整 Host API。每個 API Proxy 方法、Remote 一元呼叫、通用 Connection channel 和 Remote WebSocket stream 都要求同一個瀏覽器工作階段；endpoint 所有權與方法名稱不改變 authority。既有 Host/Origin 驗證先執行，繼續負責 DNS rebinding 和跨站請求防禦，失敗時返回 403。Host 可信但沒有有效瀏覽器工作階段時返回 401。瀏覽器信任規則仍由[載體級瀏覽器信任決策](2026-07-28-api-browser-trust-boundary.zh.md)持有。

每個 Host 程序生成隨機啟動權杖，並由應用根 context 跨 Connection 熱過載保留。`dsh-web-app` 每個程序只列印並開啟一次 query 中帶該權杖的普通根 URL。`frontend-static` 請求 Connection 授權 index 回應：只有 `GET /?token=...` 會把程序權杖交換為 cookie，再重定向到乾淨的 `./`；API 路徑和 Authorization header 都不接受該權杖。過時權杖如果同時帶有有效 cookie，會重定向到乾淨的 `./`。缺失與無效憑證得到同一份最小 401 回應。非 index 靜態資產保持公開。

cookie 是簽名且繫結 authority 的 bearer。確定性名稱與簽名 payload 都包含規範化 hostname 和 port，因此同一 Harness home 可以在不同 Web port 執行而不發生 cookie 衝突。payload 在絕對有效期內攜帶安全整數形式的簽發與過期時間；`cookieMaxAgeDays` 預設為 30。cookie 是 host-only、`Path=/`、`HttpOnly`、`SameSite=Strict`。隨附伺服器使用 loopback HTTP，因此不設定 `Secure`。這裡沒有 logout 操作。

HMAC 金鑰是 `ctx.credentials` 中位於 `client-connection/browser-session` 的版本化 `grant` 記錄；本地提供者將其存入 `$DSH_HOME/.credentials.yaml`。Connection 在啟用期間載入或建立該記錄，並保留金鑰以同步驗證請求。持久記錄發生變化後，目前 Connection 繼續使用已載入的金鑰；下一次啟用會載入替換記錄或建立缺失記錄，因此刪除記錄並重新啟動程序會撤銷全部既有 cookie。無效 owner payload 會明確失敗，而不是被覆蓋。啟動權杖本身絕不持久化並在每次程序啟動時變化；未過期 cookie 則能在相同 authority 上跨重新啟動繼續有效。

頁內 Web Worker preview 不暴露網路 socket。其由頁面持有的 `postMessage` tunnel 先進入真實 route，收到 401 或 403 後再經 worker 本地 fetch handler 重試。這樣既保留 Connection interceptor，又把認證繞過限制在建立 Host worker 的頁面內。

隨附 CLI 繼續拒絕 `--host 0.0.0.0`。認證不代表支援網路部署、TLS、轉發 header 解釋或代理設定。

## 驗證

單元覆蓋 Connection 過載時保留程序權杖、每次啟用只載入一次金鑰、無需讀取憑證提供者的同步驗證、cookie 屬性、HMAC 與 payload 驗證、authority 與有效期驗證、記錄刪除在下一次啟用時生效、無效持久記錄，以及用有效 cookie 清理過時權杖 URL。Host 傳輸套件固定通用 RPC、Typert Remote HTTP、精確 Fetch 路由和 WebSocket upgrade 路徑上一致的 401/403 行為。frontend 真實組合測試經 Loader 啟動 credentials、Connection、webserver 與靜態服務，證明讀取 index 前完成權杖交換，同時靜態資產仍公開。打包 worker 測試證明 cookie 編碼可移植，並覆蓋認證與信任拒絕後的 worker 本地重試。真實 CLI 測試在臨時 `DSH_HOME` 上用同一埠兩次啟動 `dsh web`，證明偽造 `Host: localhost` 仍未認證，以交換所得 cookie 呼叫 `settings/describe`，觀測新的程序權杖，並在重新啟動後複用舊 cookie。

## 曾考慮的替代方案

**從 TCP 對端地址判定特權呼叫者。** 直接對端地址仍可能只識別本地轉發程序，而非瀏覽器使用者；它會在 API 的命令執行能力旁保留第二套 authority 模型，並要求代理策略回答原始呼叫者是誰。一個應用憑證才是每項操作都能執行的身份。

**保留按方法的特權列表，並把儲存憑證限制在已設定目標。** 列表可能漏掉新 endpoint，也不能約束已經控制工具型 Session 的呼叫者。`discoverModels` 目標規則不構成安全邊界，因為同一已認證主體可以更新 settings 並執行命令。統一認證覆蓋授予程序控制權的操作。

**持久化啟動權杖或把它作為 API bearer 接受。** 持久啟動權杖會成為第二份長期憑證；Authorization header 支援則會增加沒有目前 consumer 的非瀏覽器用戶端約定。程序權杖只完成一次瀏覽器 cookie 交換。

**每次重新啟動都輪換籤名金鑰。** 這會阻止既有瀏覽器在普通 DSH 重新啟動後重連。只持久化簽名金鑰既保留該工作流，又由程序權杖輪換把啟動 URL 限定在一個程序生命週期。

**增加 logout、TLS 代理和轉發 header 設定。** loopback Web 應用與已報告認證缺口都不需要這些能力；加入它們會在沒有目前 consumer 時定義部署約定。瀏覽器站點資料控制會撤銷單個瀏覽器工作階段；刪除憑證記錄並重新啟動程序會撤銷全部工作階段。

## 後果

持有瀏覽器 cookie 就能呼叫完整的工具型 Host API，這與 Web 應用在建立 Session 後暴露的 authority 一致。`Host` 不授予更高的方法層級，方法在 API Proxy 與 Typert Remote 之間遷移也不會改變呼叫者集合。

持久金鑰使 cookie 跨重新啟動生效，也讓被盜 cookie 最多保有設定的絕對有效期。刪除記錄並重新啟動程序是全域撤銷機制；目前 Connection 刻意避免在每個請求上存取憑證提供者。不設定 `Secure` 保留 loopback HTTP，但如果操作者讓同一 cookie authority 經未加密網路可達，cookie 會以明文傳輸。啟動 URL 含程序憑證，必須視為敏感輸出；執行時診斷不會重複它。

本決策部分取代[瀏覽器信任說明](2026-07-28-api-browser-trust-boundary.zh.md)中的認證延期與未認證非 loopback 後果。該說明仍是媒體型別、Host、Origin、Fetch-Metadata 和設定 authority 驗證的有效權威。沒有 active Agent Note 被歸檔：重疊只發生在區域性，兩條安全規則都保有未來決策價值。
