# Agent Note: 所有 /api 路由共用一道載體級瀏覽器信任邊界

Status: implemented

[English](2026-07-28-api-browser-trust-boundary.md) | 中文

## 問題

Web GUI 主機以純 loopback HTTP 提供 `/api`（預設 `127.0.0.1:3080`；CLI 拒絕 `--host 0.0.0.0`），而這個面上有遠端程式碼執行級別的方法——`session.prompt` 驅動的 agent（智慧代理）可以執行 bash。瀏覽器會用兩種經典方式把操作者變成攻擊此類本地 API 的「混淆代理人」：惡意頁面發出跨站「簡單請求」 POST（`text/plain`——不經 CORS 預檢即發出），其副作用照常執行、只是回應不可讀；以及 DNS rebinding 後的源以「同源」身份直連 socket，CORS 整體失效，只有 `Host` 頭會暴露攻擊者的域名。在本決策之前，系統裡唯一的瀏覽器信任檢查（`isTrustedNativeDialogRequest`：迴環 socket、同源、迴環 Host）只守著一個裝飾性的路由——`host.pickDirectory`，其原生對話方塊彈在主機螢幕上——而所有真正具有嚴重後果的方法都沒有防護。按 RPC 逐個設防也活不過應用內目錄瀏覽器：它存在的意義就是服務合法的遠端用戶端，迴環規則恰恰會拒絕它們。

## 決策

在載體層對整個 `/api` 字首一次性執行瀏覽器信任檢查——分為兩部分：

- **媒體型別柵欄（dsh-client-connection）**：每個 `/api` POST 必須宣告 `application/json`，否則在解析前以 415 拒絕。跨站「簡單請求」由此不復存在：任何跨站嘗試都被逼進一次本伺服器從不應答的 CORS 預檢。
- **權威柵欄（dsh-client-connection，`src/api-request-trust.ts`）**：每個請求的 `Host` 都必須是迴環地址，或與某個 `trustedHosts` 條目匹配（帶埠的 `host:port` 條目精確匹配，不帶埠的條目匹配任意埠，均經 WHATWG 歸一化；rebinding 防禦）。刻意不為無標記請求開捷徑：明文 HTTP 下瀏覽器的讀取（EventSource、圖片、導航——這些頭只發給可信目標）既不帶 `Origin` 也不帶 Fetch-Metadata，因此無標記請求可能是被重綁頁面發起且回應可被讀走的讀取，而 Host 是重綁唯一偽造不了的請求頭；非瀏覽器用戶端經由迴環地址、推導的 LAN IP 字面量或已宣告的權威透過。若帶 `Origin` 則必須與 Host 權威完全一致；`sec-fetch-site: cross-site` 一律拒絕。不是單純規範化 authority 的 `trustedHosts` 條目會導致外掛載入失敗——否則 WHATWG 解析會悄悄授權筆誤裡的 hostname，或放大精確埠授權。`host.pickDirectory` 失去專屬守衛，與其他請求同柵而行。

可達性由 webserver 的繫結設定（`host: 127.0.0.1 | 0.0.0.0`）控制，這道柵欄是混淆代理人防禦，而不是身份。Connection 在柵欄之後應用獨立的[瀏覽器權杖認證](2026-08-24-browser-token-authentication.zh.md)。柵欄不檢查對端 socket 地址：繫結表達可達性，`trustedHosts` 點名接受的 authority，socket 地址提供不了 Host/Origin 驗證需要的額外資訊。

## 曾考慮的替代方案

- **按 RPC 設防（延續現狀）。** 否決：守衛清單永遠追著方法清單跑，價值最高的方法本來就沒被守住，而 browse RPC 上的迴環規則會破壞它們為之存在的遠端部署。
- **CORS 頭與省略憑證。** 否決：我們根本不想要任何跨源讀取，應答預檢只會擴大暴露面；拒絕預檢嚴格更強也更簡單。
- **認證權杖。** 在本變更中否決：權杖簽發、儲存與輪換屬於獨立產品決策。後續[瀏覽器權杖認證](2026-08-24-browser-token-authentication.zh.md)持有這些機制，不改變本柵欄。

## 後果

- 未來任何 `/api` 方法天然在覆蓋範圍內；不存在會被遺忘的按路由信任決定。
- 自定義非 loopback 組合必須信任其服務 authority，否則請求會被拒絕；隨後仍像每個 loopback 請求一樣滿足瀏覽器認證。隨附 CLI 拒絕 `--host 0.0.0.0`；`--trusted-host` 只擴充功能 Host/Origin 柵欄，絕不授予身份。
- 用戶端必須給 POST 體標註 `application/json`（我們自己的用戶端一向如此；裸 fetch 測試補上了該頭）。
- Host 與 Origin 仍只是請求路由證據。程序權杖與簽名 cookie 建立每個 Host 方法使用的瀏覽器身份。
