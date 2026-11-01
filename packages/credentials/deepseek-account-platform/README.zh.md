---
description: "透過系統瀏覽器登入，並將帳號憑證儲存在現有本地憑證儲存中。本地取消會阻止遲到的回呼和兌換回應使使用者登入。"
kind: "package-reference"
---

# @deepseek-ai/dsh-deepseek-account-platform

[English](README.md) | 中文

每個到達 Platform 的操作都接收呼叫方的 `AccountClientMetadata`：用戶端版本、目前介面語言和以秒為單位的 UTC 偏移。提供者據此與組合出的平臺推導五個 Platform 用戶端請求頭，因此每個請求報告的是發起它的介面，而不是 Host 上一次見到的呼叫方。新的登入申請會為該申請的初始化、兌換和取消捕捉這份中繼資料，中途加入的呼叫方不會替換它；退登則為在請求之後繼續進行的撤銷重試捕捉這份中繼資料。

getPlatformSession 僅在已存授權的 issuer 與 platformOrigin 一致時匯出該授權。這個僅限 Host 的操作支援原生 Platform 內嵌，不擴大 resolveToken 設定的模型及檔案請求來源。其 userId 複製最近一次成功 getProfile 得到的穩定帳號 ID；尚無一次成功讀取或資料不含 ID 時為 null。快照不自行發起資料請求，因此資料請求緩慢或失敗都不會延遲它；ID 未知時 userId 為 null，使用方將其視為臨時儲存模式。讀取授權期間憑證變化時丟棄快照。

`desktopPlatform` 預設為 `null`，此時攜帶 `x-client-platform: web`；Desktop profile 提供 `darwin` 或 `win32`，改為 `desktop-mac` 或 `desktop-win`。五個請求頭均由 provider 擁有，部署設定無法覆蓋；`x-client-bundle-id` 有意保持為空，`x-client-locale` 將呼叫方語言歸約為 `zh_CN` 或 `en_US`。PlatformSession 只攜帶部署請求頭，內嵌用戶端為自行開啟的 Platform 文件和 API 請求組裝同樣的五個請求頭，且僅在設定來源傳送。

資料和餘額介面返回 HTTP 401 或頂層回應碼 `40003`（授權驗證失效）時清除被拒絕的本地憑證，併傳送即時 `deepseek-account/session-expired` 通知。並行回應共用一次清除操作；已失效憑證代次的回應不能清除替換後的憑證。其他 HTTP 錯誤保留憑證。Host 推理呼叫方可以透過 `rejectToken` 報告被拒絕的請求 token；僅當它仍匹配目前登入憑證時才執行清除。

## 概述

透過系統瀏覽器登入，並將帳號憑證儲存在現有本地憑證儲存中。本地取消會阻止遲到的回呼和兌換回應使使用者登入。

## 目錄

- [使用此包](#use-this-package)
- [模型體驗](#model-experience)
- [已知限制與後續工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用此包

本地退出登入期間拒絕解析 token。本地授權成功刪除後，先發布 `deepseek-account/signed-out`，再返回已退出的狀態快照；遠端撤銷獨立執行。

帳號資料投影將 `id_profile.picture` 對映為 `avatarUrl`，沒有設定大頭貼時返回 null。

getProfile / getBalance 將儲存的授權 token 透過 x-dsh-auth-token 請求頭，向 platformOrigin 上的 GET /auth-api/v0/users/current 和 GET /api/v0/users/get_user_summary 發起請求。授權簽發來源必須與該來源一致。Host 只投影帳號 UID、資料名稱、大頭貼 URL、由 Platform 脫敏的手機號或電子郵件（原樣保留），以及 normal_wallets / bonus_wallets 的幣種和餘額字串，丟棄回應 token 與其他欄位。餘額和贈金金額字串只要符合 Platform Web 用戶端交給 big.js 的數字文法即可透過，該文法和 big.js 一致，允許省略整數或小數部分以及十進位制指數，因此 0E-16、5.0000000000000000 這類值仍然有效；原始字串會保留，NaN、Infinity 和非法文字仍被拒絕。贈送錢包不計入充值餘額。憑證變化和銷燬會使進行中的查詢失效。

getUnnotifiedBonuses 讀取同一來源上的 GET /api/v0/users/get_unnotified_bonuses，ackBonusNotified 向 POST /api/v0/users/ack_bonus_notified 傳送僅含訂單號的 JSON 正文，兩者都按呼叫方中繼資料組裝這五個用戶端請求頭。二者都先為捕捉到的授權解析帳號身份，因此退登或切號時返回 null 或 false，而不會確認另一個帳號的贈金；一次讀取只有在同一憑證生命週期內全部結算後才釋出。Host 按 Platform 返回順序轉發贈金列表，把每條的 msg 對映為 message，其餘欄位不額外丟棄；格式錯誤、其他 HTTP 失敗和其他業務失敗都會丟擲，而憑證被拒絕（HTTP 401 或回應碼 `40003`）會使目前授權失效並返回 null 或 false。

餘額請求使用 balanceTimeoutMs（預設 30,000ms）；超時返回失敗結果，不清除帳號，也不製造零餘額。在外掛行設定 platformOrigin、allowLoopbackHttp、requestTimeoutMs、balanceTimeoutMs 和 attemptTimeoutMs。HTTP 僅用於顯式啟用的本機開發。提供者先在現有 Host webServer 註冊 /oauth/callback，再呼叫 auth_init；驗證 state、使用 S256 PKCE 授權碼兌換一次，並在跳轉 auth_exchange.biz_data.authorized_url 前提交授權記錄。瀏覽器地址預設要求匹配設定的平臺來源，並始終要求固定的 /dsh/authorize 或 /dsh/authorized 路徑。完成頁地址將 `login_source` 設為發起登入的用戶端型別（`web` 或 `desktop`），並保留平臺返回的其他查詢參數。裝置標識是獨立的隨機 UUID 記錄，由使用同一憑證儲存的程序共享；device_model 報告作業系統和架構。

開放平臺 URL 統一由 `platformOrigin` 設定管理。授權請求、瀏覽器地址驗證、完成跳轉、用量和充值入口都使用該來源。將設定放在私有的 `$DSH_HOME/cordis.patch.yml`，部署地址不進入原始碼儲存庫。預設要求 HTTPS；只有本機 HTTP 可透過 `allowLoopbackHttp: true` 顯式啟用。模型及檔案 token 的目標由獨立的 `inferenceOrigin` 設定管理。

`requestHeaders` 為 `platformOrigin` 上的授權、資料、餘額和退登請求新增僅 Host 使用的請求頭。請求頭值屬於敏感設定，不包含在帳號 UI 狀態中。Authorization、X-DSH-Auth-Token、Host、Content-Type 及連線和訊息分幀請求頭由提供者保留。用戶端身份請求頭覆蓋部署設定中的同名請求頭。重定向會失敗，不會轉發請求頭。開發環境 Cookie 應儲存在私有設定或環境變數中；不會自動收集瀏覽器 Cookie。

私有 patch 也可透過 Cordis 表示式讀取環境變數：

```yaml
- id: deepseek-account
  config:
    platformOrigin: !!js process.env.DSH_PLATFORM_ORIGIN
    allowLoopbackHttp: !!js process.env.DSH_PLATFORM_ALLOW_LOOPBACK_HTTP === '1'
    requestHeaders: !!js |
      process.env.DSH_PLATFORM_COOKIE ? { Cookie: process.env.DSH_PLATFORM_COOKIE } : {}
```

已授權驗證用戶端提供瀏覽器可存取的回呼來源（含 SSH 本地轉發埠）和 UI 型別。提供者固定回呼路徑，並在初始化與兌換時使用同一個 redirect_uri。回呼請求使用 state 和 PKCE 驗證，不要求 RPC 授權驗證。完成、取消和解除安裝僅移除本次嘗試的路由。兌換失敗釋出 failed 狀態，不自動重試：Web 關閉授權標籤頁，原標籤頁顯示失敗彈出視窗；回呼頁嘗試自行關閉，並提供手動關閉提示。Desktop 收到 HTTP 204，並透過帳號狀態流聚焦現有登入介面。

Host 診斷透過標準輸出及 Host 偵錯程式 Console 輸出，字首為 `[deepseek-account]`。日誌包含介面路徑、HTTP 狀態、數值回應碼、失敗階段、驗證失敗的欄位路徑、實際型別和驗證碼，以及瀏覽器 URL 拒絕規則，不包含請求頭、請求和回應正文、授權 URL 或原始異常。

`rewriteBrowserOrigin` 預設為 `false`，要求瀏覽器地址同源。私有開發 patch 可設為 `true`，將授權頁和完成頁地址對映到 `platformOrigin`，保留固定路徑和查詢字串。原地址必須使用 HTTPS 或已匹配設定來源；仍拒絕使用者名稱密碼、片段和非預期路徑。釋出的 profile 保持嚴格同源驗證。

inferenceOrigin 預設為 `https://api.deepseek.com`。私有部署 patch 可將其替換為一個精確的 HTTP(S) 來源（含埠），讓推理及檔案請求透過 x-dsh-auth-token 認證。設定不得包含路徑、URL 憑證、查詢或片段。其他來源要求授權由設定的 platformOrigin 簽發；仍拒絕 Mock token。本機授權不能認證官方生產 API。部署地址儲存在私有 patch 中，不隨預設設定釋出。

提供者初始化時，若有效的已存授權 issuer 與 platformOrigin 不同，會在使用方讀取帳號狀態前刪除該本地授權，以未登入態繼續啟動，不傳送遠端退登請求；API Key 和裝置標識保留。儲存錯誤仍明確報錯，帳號 HTTP 或回應驗證失敗不會刪除來源匹配的授權。

<a id="understand-the-implementation"></a>
## 理解實作

不釋出執行時 invariant：帳號是否存在直接讀取憑證儲存，嘗試狀態直接投影私有狀態；不存在可與另一個獨立索引比較的帳號索引。非同步取消和提交由行為測試驗證。

<a id="further-exploration"></a>
## 深入探索

[憑證子系統](../../../docs/subsystems/credentials.zh.md)定義儲存介面；[架構](../../../docs/architecture.zh.md)說明應用組合。

attemptTimeoutMs 包含初始化、等待瀏覽器和兌換的耗時。初始化不會延長絕對截止時間；伺服器端 TTL 只能縮短剩餘時間。在到期前已獲准的憑證持久化不再取消。

<a id="model-experience"></a>
## 模型體驗

無，因為帳號憑證隻影響 HTTP 認證，不進入模型提示、Session 日誌或工具結果。

#### KV Cache effect

不改變模型請求字首。

## 已知限制與後續工作

<a id="known-limitations-and-deferred-work"></a>

- 瀏覽器登入需要 Host webServer，僅支援透過帶顯式埠的 HTTP localhost、127.0.0.1 或 [::1] 本機存取及 SSH 本地轉發，不支援非本機域名的反向代理。帳號 token 沒有過期或重新整理流程；使用者主動在 DSH 退出登入時，先刪除本地授權，再在後臺呼叫 POST /auth-api/v0/users/logout。遠端失敗不會恢復本地登入態。預設僅針對捕捉的舊 token 最多額外重試五次，指數退避間隔為 1、2、4、8、16 秒；logoutMaxRetries（0–5）和 logoutRetryDelayMs 可設定該策略。每次請求使用 requestTimeoutMs。提供者關閉時取消請求和等待，不持久化待撤銷任務。本地憑證刪除失敗仍向呼叫者報錯。簽發 token 前的授權嘗試仍有有效期。初始化後的取消或超時會在後臺傳送一次 POST /auth-api/v0/dsh/auth_cancel，攜帶 auth_init.biz_data 中的 authorize_id 和原始 code_verifier，不附帶帳號授權。本地取消不等待該請求，也不會因失敗而恢復；requestTimeoutMs 限制請求時間，提供者關閉時中止請求。TODO(product-error-ui)：產品需定義已給定 biz code 的在地化文案和互動表現。在此之前，業務失敗沿用現有“操作失敗，請重試”後備；其他 code 和 HTTP 錯誤也使用該後備。開發授權不能認證生產請求。

<a id="dev-note"></a>
### 開發備註

[桌面登入決策](../../../.agents/notes/implemented/architecture/2026-09-14-deepseek-account-login.zh.md)記錄取消和儲存的職責。

登入後首次讀取資料使用 auth_exchange 返回並經篩選的 user。user 為 null 或格式無效時退回到 current；後續重新整理及 Host 重新啟動也查詢 current。current 請求失敗時保留 Host 記憶體中同一憑證最近一次成功的資料；憑證變更或提供者銷燬時清空。current 成功返回的穩定帳號 ID 首次可用或變化時會通知 watch 訂閱者，供標識使用方重新讀取 getPlatformSession；重複相同 ID 的重新整理不通知。exchange 負責登記提交的裝置資訊。

accountRequestHeaders 覆蓋 requestHeaders，供 current、餘額以及內嵌 Platform 頁面/API 請求使用。Cookie 按名稱合併，路由覆蓋保留其他部署 Cookie。授權初始化、兌換、取消和退登保持使用 requestHeaders。兩組請求頭僅供 Host 和 Electron 主程序使用；快照的 userId 同樣僅限 Host，渲染層 bootstrap 僅接收 origin 和 token。

帳號提供者的 `embeddedPageDist` 設定為內嵌用量和充值頁面 URL 新增 `dist` 查詢參數。預設值為空；私有前端分支選擇值應寫在本地 profile patch 中。此設定不改變 API 地址或憑證傳遞方式。

Platform 錢包餘額接受帶可選科學計數法的十進位制字串（包括 `0E-16`），提供者保留原始字串供呼叫方使用。
