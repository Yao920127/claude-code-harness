---
description: "Web 殼的 SPA dist 伺服器：佔據 webserver 退回席位，以遍歷拒絕與 SPA index 退回服務已建置的前端。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-frontend-static

[English](README.md) | 中文

## 概述

從設定的釋出目錄向瀏覽器提供已建置的 Web 殼。根路徑與設定的 index 路徑渲染包含啟動資訊的 index；已有資產直接提供，而缺失或非檔案路徑返回 404、路徑遍歷返回 403、不支援的方法返回 405。存取 index 需要有效的程序 token 或瀏覽器 cookie，但靜態資產仍可公開存取。同一時間只能有一個實例處理未匹配的路由；第二個實例啟動失敗，解除安裝活動實例後，未匹配的請求返回 404。

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

在服務已建置 Web 殼的瀏覽器主機中組合本外掛：它佔據 webserver 的退回席位，並應答所有未被具名路由命中的請求。它只需要一個設定值——已建置前端的 `index.html` 位於何處。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-host-frontend-static'
  config:
    distIndex: /absolute/path/to/dist/index.html
```

`distIndex` 是組合應用的組裝事實：[`dsh-web-app`](../../bundle/web-app/README.zh.md) 透過前端包的 exports 解析它並掛載本外掛；部署絕不硬編碼它。

### 伺服器實施的約束

請求從 dist 根目錄（包含 `distIndex` 的目錄）提供。dist 根目錄與設定的 index 路徑以 HTTP 200 渲染 `index.html`；任何其他已有檔案按自身 MIME 型別直接提供，未知副檔名按 `application/octet-stream` 提供。解析到根目錄之外的路徑以 403 拒絕，因此精心建構的路徑無法讀取 dist 之上的檔案。dist 根目錄內不存在或不是檔案的目標——檔案缺失、目錄或設定的 index 缺失——返回空 404。沒有匹配具名路由的非 GET／HEAD 請求返回 405。每個成功的 index 回應都經 webserver 的 `renderIndex` 渲染，因此啟動 manifest（中繼資料清單）會透過 `/` 與設定的 index 路徑送達頁面。

所服務的 HTML 攜帶唯一的文件 base `<base href="./">`，位於每一條注入資源行之前，因此它凍結頁面載入時所處的入口目錄：shell 自身的應用目錄相對引用與主機的外掛資源行都在服務該頁面的掛載下解析。同一份 index 因而既服務源站根目錄，也服務剝離字首的代理所擁有的任一掛載；本外掛只為 dist 根目錄與設定的 index 路徑渲染它。

根路徑與設定的 index 回應會在讀取 HTML 前呼叫 `ctx.connection.authorizeIndex`。有效程序 token 會得到 303 重定向與持久瀏覽器 cookie；已有有效 cookie 時直接提供 index；其他 index 請求得到 Connection 所有的 401 回應。非 index 檔案仍是公開靜態資源。Token、cookie、過期時間與簽名記錄語義都歸 Connection 所有。

### 可觀察的失敗

遍歷返回 403 而不是錯誤頁。dist 根目錄內不存在或不是檔案的目標返回空 404，因此失效連結或拼錯的 pathname 是顯式失敗，而不是靜默的 SPA 退回。第二次佔據席位會拋錯，而席位無人佔據時 webserver 返回 404——本外掛的 fiber 被 dispose（資源釋放）後，瀏覽器看到的就是該回應。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

### 設計理念

本包是圍繞 `serveStatic` 的一個函式外掛：`apply` 從 `distIndex` 解析出 dist 根目錄，建置一個對原始 `index.html` 執行 `ctx.webServer.renderIndex` 並把文件 base 拼接在起始 head 標籤之後的 `renderIndex` 閉包（在原始轉換之後執行，因此也先於其標記），並在 effect 作用域下注冊退回 handler。按 webserver 的約定，席位只有單一所有者——第二次註冊會拋錯——且受 effect 作用域約束，因此 dispose fiber 即釋放席位。

### 遍歷柵欄

`serveStatic` 規範化請求的 pathname 並拼接到 dist 根目錄，然後要求目標就是根目錄本身或保持在它之下。檢查使用 `sep` 而非 `/`，因為 `resolve()` 在 Windows 上輸出反斜槓路徑，此時 `/` 字尾會把每個合法子路徑都當作遍歷拒絕。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `serveStatic` 與 `apply`：退回佔據、遍歷拒絕、index 渲染、MIME 表 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當服務約定不夠用時閱讀以下內容：先看席位所有者的約定，再看解析 dist 的組合與子系統參考。

- [Webserver](../webserver/README.zh.md)——本外掛佔據的退回席位與它執行的 index 轉換器。
- [dsh-web-app 組合包](../../bundle/web-app/README.zh.md)——解析 `distIndex` 並掛載本外掛的應用。
- [HTTP 伺服器子系統](../../../docs/subsystems/web-server.zh.md)——退回席位如何融入路由表。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-frontend-static)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

無。該 SPA dist 伺服器只應答瀏覽器資產請求，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明某個資產類別何時尚未被覆蓋。它們是目前包約束，不是任務積壓。

- **初始 MIME 表很精簡**：它覆蓋 Vite 輸出的資產集合及實際交付的 PWA manifest；其他副檔名在相應資產類別釋出前都會退回到 `application/octet-stream`。
- **Pathname 路由是顯式宣告**——目前用戶端從根目錄或設定的 index 路徑進入，沒有 History API pathname 路由。新增一條需要顯式伺服器規則與真實組合覆蓋，而不是對每次未命中做寬泛退回。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。唯一受本包所有的關係是單個退回席位，但無法從 teardown 流中探測它：`internal/plugin` 在正在釋放的 fiber 執行 effect disposer 前觸發，因此通知發出時合法所有者仍佔據席位，任何佔位探測都會把每次正確釋放誤報為失敗；這不同於 webserver companion 對保留路徑的探測，後者不會與存活註冊衝突。席位的註冊／釋放對稱性由本包真實組合的 HMR（熱模組替換）安全測試覆蓋。
