---
description: "ctx.web 的匿名公共 HTTP(S) 抓取後端：部署方如何掛載有界、安全的 URL 抓取，含同源重定向與僅文字解碼。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-fetch-http

[English](README.md) | 中文

## 概述

有了 `dsh-web-fetch-http`，harness 可以透過 web 服務（`ctx.web`）抓取公共 HTTP(S) 頁面，並在不傳送憑證的情況下獲得狀態碼與有界、解碼後的內容。當組合需要 URL 驗證、公開地址解析、連線固定、僅同源重定向、位元組和字元上限及顯式產品 `User-Agent` 時選擇它。它把非 2xx 回應作為結果而非錯誤返回，並拒絕非公開目標、二進位制資料與不受支援的內容型別。面向模型的 `web_fetch` 工具位於 `dsh-tool-web`，由它渲染本提供者的正文。

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

在已載入 web 服務的組合中掛載本提供者；它以 `http` 抓取提供者身份註冊，因此當它是唯一可用的抓取後端時，`ctx.web.fetch()` 會自動解析到它——也可以用 `fetchProvider: http` 固定。

### 何時選擇

當部署必須以有界輸出和安全傳輸抓取公共頁面時選擇此後端：不傳送憑證，每個已解析地址必須是公共地址，每次連線都固定到已驗證的地址集合，重定向無法逃出源站，每個回應都有上限。

### 最小設定

載入 web 服務與本提供者；可設定上限都有安全預設值，並在外掛建構時驗證，因此無效值會直接報錯，而不是建構出上限荒謬的提供者。URL 安全上限固定為 2,048 個字元。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-fetch-http'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxResponseBytes` | `5,000,000` | 回應主體最大位元組數 |
| `maxBodyChars` | `100,000` | 解碼主體最大字元數 |
| `timeoutMs` | `30,000` | 抓取超時——資源後備，不是面向模型的工具預算 |
| `maxRedirects` | `5` | 同源重定向最大跳數（`0` 表示不跟隨） |
| `userAgent` | `deepseek-harness/…` | 每次請求傳送的 `User-Agent` 標頭 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-fetch-http)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 抓取返回什麼

成功呼叫產生 `WebFetchResult`：允許的重定向之後的最終 URL、HTTP 狀態碼、分類為 `html` 或 `text` 的解碼正文，以及 `truncated` 標誌。非 2xx 回應是結果而非錯誤——狀態碼是被抓取資源狀態的一部分；`WebError` 只用於無法安全取得或表示資源的失敗。

```text
const page = await ctx.web.fetch({ url: 'https://example.com' })
// page.body.kind === 'html' | 'text'; page.statusCode === 200 | 404 | ...
```

### 傳輸行為

提供者保持請求匿名且有界：只接受不含內嵌憑證且不超過 2,048 個字元的 `http:` 與 `https:` URL。它只解析一次主機名；只要結果中有任何 IPv4 或 IPv6 地址不是公共單播地址，就拒絕整個結果，並把連線固定到已驗證的地址集合。IPv6 檢查會發現活動 DNS64 字首，並拒絕指向非公開 IPv4 的轉換地址。每次同源重定向都會重複解析與固定；跨源重定向會失敗並要求重新呼叫。提供者還強制執行位元組、字元、跳數和時間上限，拒絕不支援的內容型別，併傳送顯式產品 `User-Agent`。

### 失敗與恢復

失敗會丟擲 `WebError`，其中包含可供程式路由的錯誤碼：`WEB_INVALID_URL`、`WEB_BLOCKED_URL`、`WEB_FETCH_TOO_LARGE`、`WEB_FETCH_TIMEOUT`、`WEB_REDIRECT_BLOCKED`、`WEB_UNSUPPORTED_CONTENT_TYPE`、`WEB_ABORTED` 或 `WEB_PROVIDER_ERROR`。直接呼叫方可以按錯誤碼路由；面向模型的 `web_fetch` 工具會在自己的錯誤包裝層內把失敗文字呈現給模型。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋提供者背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本包基於一項職責分離和一套分層超時機制：

- **安全取得與呈現分離。** 本提供者擁有 URL 驗證、公開地址強制規則、連線固定、HTTP 傳輸、重定向策略、上限、charset 解碼與二進位制拒絕；`dsh-tool-web` 擁有 HTML→markdown 與截斷格式化。非 2xx 回應是資料，不是失敗。
- **兩層超時。** 提供者的 `timeoutMs` 是直接 `ctx.web.fetch()` 呼叫方的資源後備；面向模型的工具呼叫預算屬於 `dsh-tool-call-timeout-policy`，由它觸發 `exec.signal`。外層截止期限先到時，提供者報告 `WEB_ABORTED`，策略再以 `TOOL_TIMEOUT` 替換；因此 `WEB_FETCH_TIMEOUT` 標識的是提供者預算耗盡的直接服務呼叫方。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：設定 schema、上限驗證、提供者註冊 |
| [`src/provider.ts`](src/provider.ts) | `HttpFetchProvider`：固定連線、重定向跟隨、有界讀取、charset 解碼 |
| [`src/network.ts`](src/network.ts) | 公開地址解析、DNS64 發現與連線固定 |
| [`src/policy.ts`](src/policy.ts) | URL 驗證、同源檢查、內容型別分類、charset 解析 |
| — | 不釋出執行時不變數配套入口；除所屬 seam 強制執行的約定外，本包沒有獨立的事件序列或可變資料關係。 |

### 讀取路徑

抓取先驗證 URL，只解析一次主機名，結果中只要有非公開地址就拒絕，並把連線固定到已接受地址。每次同源重定向都重複該檢查；跨源重定向或非公開目標在接收回應位元組前失敗。最終回應按 `Content-Type` 分類、依宣告的 charset 解碼，並在位元組上限內讀取；解碼後的文字再截斷到字元上限。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞彙逐步進入服務、面向模型的工具與設計依據。

- [web 子系統](../../../docs/subsystems/web.zh.md)——窮盡式的抓取請求／結果詞彙與錯誤碼。
- [web 包對映](../README.zh.md)——六包家族與各角色。
- [dsh-web](../web/README.zh.md)——本提供者註冊進入的 web 服務。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染本提供者正文的面向模型 `web_fetch` 工具。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-fetch-http)——每個受支援設定欄位及其源宣告。
- [web 能力 seam 決策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜尋與抓取為何共用一項提供者選擇服務。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，透過 `dsh-tool-web`：該工具把本提供者經 `maxBodyChars` 限制的解碼文字或由 HTML 轉換得到的 markdown 置於抓取結果包裝層內，而重定向、標頭與傳輸上限保持隱藏。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提供者何時不安全或不合適。它們是目前包約束。

- **只解碼文字內容**——包括 html/xhtml 與 `text/*` 加 JSON/XML 家族；缺少 `Content-Type` 或任何二進位制型別都會丟擲 `WEB_UNSUPPORTED_CONTENT_TYPE`，可提取文字的 PDF 解碼屬於明確的延期工作。
- **charset 只來自 `Content-Type` 標頭**（預設 UTF-8）——HTML `<meta charset>` 宣告會被忽略；宣告但無法識別的 charset 標籤會丟擲異常，而非退回。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
