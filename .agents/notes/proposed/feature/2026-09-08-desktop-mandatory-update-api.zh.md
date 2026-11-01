# Agent Note: Desktop 強制更新介面

Status: proposed

[English](2026-09-08-desktop-mandatory-update-api.md) | 中文

## 問題

Desktop 在業務 server 為本地程序、使用者尚未登入時也需要取得強制更新判定。移動端普通更新回應不定義 Desktop 產物安裝。後端與 Desktop 需要一份自包含協定，明確成功、阻斷和錯誤語義，與 updater 的產物選擇分開。

## 提案

使用未登入可存取的策略介面。本文負責 Desktop 請求回應欄位，[一期更新提案](2026-09-08-desktop-update-policy-and-installation.zh.md)負責用戶端排程、介面、釋出順序與安裝。後端正在接入；API 地址與閘道細節是部署輸入，不表示服務已經可用。理解本協定不依賴旁邊的儲存庫或本機文件。

### 介面與存取

[用戶端決策](../../implemented/feature/2026-09-11-desktop-mandatory-update-client.zh.md)負責已實作的輪詢和阻塞介面。本介面提案仍負責後端部署與真實聯調；本地 fixture（測試前置資料）不能認證服務。

```http
GET /api/v0/check_client_update
```

查詢介面本身必須返回完整強制回應，不能依賴攔截其他業務介面。保持 Android 與 iOS 既有行為，不要求舊移動端補傳 Desktop 新欄位。Desktop 僅接收強制策略，不接收普通更新提示、安裝檔中繼資料、updater 目標版本、裝置 ID、安裝實例 ID 或按實例漸進分配。

### 請求

```http
GET /api/v0/check_client_update?scenario=launch
x-client-platform: desktop-win
x-client-version: 0.1.3-rc.2
x-client-bundle-id:
x-client-locale: zh_CN
x-client-timezone-offset: 28800
x-client-arch: x64
x-client-update-channel: nightly
x-client-bundled-dsh-version: 0.1.3-rc.2
```

以上 header 在每次 Desktop 請求中均為必填；必填 header 的取值可以為空，`x-client-bundle-id` 即如此。描述已安裝軟體的值來自應用與釋出中繼資料，不來自可編輯 UI 欄位。

| Header | 含義與取值 |
|---|---|
| `x-client-platform` | `desktop-win` 或 `desktop-mac` |
| `x-client-version` | 共享的用戶端建置版本，在打包時內聯為 `DSH_CLIENT_VERSION`；完整 SemVer，保留預釋出標識，一期等於內建 dsh 版本 |
| `x-client-bundle-id` | Platform 用該欄位標識 Chat 應用；該欄位對 Harness 不適用，因此 Desktop 傳送空值 |
| `x-client-locale` | `zh_CN` 或 `en_US`，取自目前 UI 語言的主語言子標籤；選擇在地化內容，不代表區域 |
| `x-client-timezone-offset` | 與 UTC 的整秒偏移，東為正，每次請求時從殼取樣 |
| `x-client-arch` | Windows 為 `x64`；macOS 為 `x64` 或 `arm64` |
| `x-client-update-channel` | 一期固定 `nightly`，獨立於版本字尾 |
| `x-client-bundled-dsh-version` | 釋出中繼資料中的完整內建 dsh 版本 |

| Query | 用戶端行為 | 後端一期行為 |
|---|---|---|
| `scenario` | 攜帶查詢來源；`launch` 是啟動範例 | 忽略；桌面最終列舉不阻塞接入 |
| `region` | 可選；僅在有可信區域資訊時攜帶 | 忽略；不從 UI 語言推斷 |

兩個 query 都不參與一期策略匹配或參數驗證。其他用戶端條件相同時，改變或省略任一 query 不得改變判定。生命週期觸發點與 query 列舉不必一一對應；後端啟用使用前再約定列舉與統計。

### 無需強制更新

```json
{
  "code": 0,
  "msg": "",
  "data": {
    "biz_code": 0,
    "biz_msg": "",
    "biz_data": null
  }
}
```

這表示目前用戶端無需強制更新，不表示已安裝版本最新。針對目前用戶端條件的新鮮有效回應可以清除已有阻斷。Desktop 不消費此回應中的移動端普通更新載荷。

### 需要強制更新

```json
{
  "code": 40005,
  "msg": "Client version too low",
  "data": {
    "show_content": {
      "title": "請更新 DeepSeek Harness",
      "detail": "目前版本已停止支援，請下載並安裝新版本。"
    },
    "desktop_app_link": "https://example.com/harness/download"
  }
}
```

範例 URL 是預留位置，不是獲准部署的目標地址。Desktop 使用拍平的 `data` 欄位，不包裹 `alt_app` 或 `biz_data`。尚無已分發 Desktop，因此不需要相容較早巢狀提案的解析器。移動端 `alt_app`、Android 連結與 iOS 應用標識保持既有格式。

| 欄位 | 要求 |
|---|---|
| `code` | `40005` 是回應體錯誤碼，不是 HTTP 狀態 |
| `msg` | 僅用於診斷，不作彈出視窗文案 |
| `data.show_content.title` | 必填，在地化純文字標題 |
| `data.show_content.detail` | 必填，在地化純文字正文 |
| `data.desktop_app_link` | 必填，匹配產品、平臺、架構與通道的 HTTPS 頁面，必須符合用戶端允許列表 |

一期不增加 `mode`、`force_update`、`show_key`、`target_version`、按鈕文案或 updater 中繼資料。`40005` 決定必須升級，實際版本與安裝檔由 updater 中繼資料決定。用戶端不依據本介面另做強制目標版本驗證。用戶端狀態決定在地化操作，每次下載仍需使用者操作。接入應用內 updater 後，頁面仍作為後備。HTTP 狀態對映按閘道聯調確認；閘道必須保留 JSON 錯誤體，不能替換為通用文字或 HTML。

### 錯誤與策略匹配

缺少必填 header、非法 SemVer 或不支援的平臺／架構／通道組合返回明確參數錯誤，不能偽裝為無強制成功或強制策略。優先沿用 `biz_code = 1` 表示缺少版本、`biz_code = 2` 表示版本非法的既有業務含義；最終錯誤碼分配由後端負責。服務異常不得偽裝成成功，因為成功可能解除已有阻斷。

按平臺、架構、Desktop 版本、內建 dsh 版本與通道匹配，由伺服器端維護版本範圍和優先順序。使用完整 SemVer，不按字串排序或截斷預釋出部分。一期兩個版本相等、通道固定 Nightly，獨立修訂與通道切換延後。不得要求降級，也不得僅因用戶端曾查詢或展示過就停止返回 `40005`。

### 策略釋出與目前判定

每條生效策略需要可確定的匹配條件、在地化標題正文和有效目標頁面。伺服器端每次查詢均判定目前用戶端條件。這些是伺服器端設定要求，不增加回應欄位，也不是安裝檔撤回機制。

- 啟用策略前釋出並驗證能解除強制要求的更高版本，確保匹配的頁面與平臺安裝檔可用。
- 對啟用應用內強制更新的用戶端，先向其 updater feed 釋出能解除要求的版本，再啟用強制要求。釋出負責人協調該順序；API 不提供獨立安裝目標、產物適用性回應或普通更新漸進。
- 連結匹配產品、平臺、架構與通道；缺少文案或獲准 HTTPS 目標時拒絕啟用策略。
- 目前用戶端不再命中時返回無強制成功回應，包括升級後；仍命中時持續返回強制策略。

問題版本透過釋出更高修復版本並更新 updater 中繼資料處理。不向本介面增加作廢版本清單、安裝前產物撤回查詢或目標版本驗證。新鮮的無強制回應可以解除 UI 阻斷，但不選擇、替換或作廢 updater 安裝檔。產物雜湊／簽名驗證仍獨立於強制判定執行。

### 容量與快取

容量與速率限制需覆蓋持續未登入請求，並考慮用戶端合併與失敗退避。策略觸達不依賴聊天請求或 SSE（Server-Sent Events）。線上觸達延遲受輪詢和網路影響，離線用戶端無法立即獲知新策略。建議 `Cache-Control: no-store`。閘道不得僅按 URL 跨用戶端版本、平臺、架構或通道共用回應；後續快取必須定義所有策略與文案維度和判定新鮮度。

## 考慮過的替代方案

**依賴遠端業務攔截。** 本地 dsh 請求不一定到達遠端閘道，需要獨立的未登入查詢。

**Desktop 複用移動端巢狀載荷。** 後端約定拍平 Desktop 欄位。按平臺保留移動端相容，不讓新 Desktop 支援從未分發的巢狀變體。

**增加安裝身份與普通更新中繼資料。** 初期策略不需要按安裝實例漸進或第二個安裝器 feed。產物發現繼續由 updater 負責。

## 驗收標準

| 案例 | 預期結果 |
|---|---|
| 未登入 Desktop | 無需業務登入即可查詢 |
| Windows x64、macOS x64 和 arm64 | 正確的平臺策略與頁面 |
| 不命中策略 | `code = 0`、`biz_code = 0`、`biz_data = null` |
| 命中策略 | 頂層 `40005`，文案與頁面直接位於 `data` 下 |
| 改變或省略 query 參數 | 其他條件相同時判定一致 |
| 相等的 Desktop/dsh 預釋出版本、固定 Nightly | 完整 SemVer 匹配，不要求降級或切換通道 |
| 用戶端不再命中，包括升級後 | 返回無強制成功，不作廢 updater 產物 |
| 可解除要求的釋出、頁面或適用 feed 不可用 | 拒絕啟用策略 |
| 必填欄位非法或服務失敗 | 明確錯誤，不偽裝為無強制成功 |
| 不同用戶端條件連續請求 | 不跨用戶端串用快取 |
| 現有移動端請求 | 保持既有要求與回應結構 |

## 風險

後端需提供測試／生產地址、未登入閘道存取、最終 HTTP／錯誤碼對映、速率限制、真實頁面、允許域名、後備語言和策略設定負責人。釋出負責人需逐平臺協調 updater 版本可用與強制策略啟用。這些輸入仍待提供，不得用開發者憑證或猜測 URL 填充。
