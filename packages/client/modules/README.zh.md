---
description: "面向使用者與維護者的 web GUI 用戶端模組系統說明：主機側組合啟動圖並提供外掛 bundle，瀏覽器側按需載入，用於組合或排查用戶端外掛。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-modules

[English](README.md) | 中文

## 概述

`dsh-client-modules` 把外掛包的 `dsh.client` 宣告變成可載入的瀏覽器 bundle：主機半側掃描已啟用的 Loader 條目並組合啟動圖，可用的 Web 載體透過 `/plugins` 提供每個 bundle，由 shell 持有的載體則透過 `fetchBundle()` 分派完全相同的 bundle 回應。瀏覽器半側按需惰性載入這些 bundle。外掛 bundle 惰性執行——執行 bundle 只註冊 factory，模組副作用在物化時執行——因此外掛首次被使用之前什麼都不會執行。這裡的一切都是瀏覽器核心機制；模型永遠看不到它。

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

宣告型別使用 [`DshClientManifest`](../../util/package-manifest/README.zh.md)。Client-modules 驗證 JSON，並持有歸一化後的啟動圖。

組合或建置瀏覽器用戶端外掛時使用它：本包把包的 `dsh.client` 宣告變成可載入的瀏覽器 bundle，無需任何逐外掛接線。它隨 web 組合啟用；外殼在任何外掛執行前啟動它。

### 宣告用戶端外掛

瀏覽器外掛包在其 `package.json` 中以 `platform: 'web'` 宣告 `dsh.client`，匯出 `./client` bundle，並在 `dsh.client.external` 下列出任何基座之外的模組請求。主機半側把每份宣告變成 `/plugins` 下提供的 bundle，並讓動態提供者先於其消費方載入。

### 瀏覽器載入什麼

application combo 腳本只攜帶每個外掛的 `client.js` 入口，並在啟動時僅註冊一次這些 factory；模組主體仍保持惰性，只在首次 import 或物化時執行。經 tsdown 拆分的原始碼 `import()` 會編譯為 `require.async("./client.<name>.js")`；只有執行該表示式時，對應的帶版本同級腳本才會到達。共享 combo URL 的 row 共用一個進行中的腳本任務。`<script>` 載入失敗的 combo 會再請求一次；載入成功但沒有註冊某條 row 的 combo 絕不會重新執行，因為批次腳本按順序註冊各個包，重放會在第一個重複註冊處停止。兩種情況下，每條仍缺失的 row 隨後載入自己的單資源 combo URL，因此一個失敗的 batch 對每條缺失 row 最多花費三次請求，且不影響它已經註冊的 row。模組系統按 row 記錄最後一次 import 失敗（傳輸、註冊、依賴級聯或 factory 執行）；Web 啟動審計按條目報告該文字。HMR（熱模組替換）會讓一條發生變化的 row 改用帶 revision 的單資源 combo URL。`<id>/client` 與裸 id 解析到同一組匯出，因為外掛 bundle 就是其包的用戶端半側。

### 外掛動態組合

已開啟的 Web 頁面透過 HMR 傳輸跟隨 Host 的完整模組圖。啟用普通外掛會新增其 Loader 條目；停用會移除條目，並在其非同步 effect 完成清理後回收未使用的模組與樣式。再次啟用會載入一個帶樣式的實例。其他 Loader 貢獻方的條目及活動條目仍需使用的共享模組會保留。「設定 → 外掛 → 外掛列表」顯示目前頁面的同步失敗，並提供不改變 Host 啟用狀態的重試。

### 共享模組

外殼初始化一張凍結的模組表（`PLATFORM_MODULES`：React、Cordis 與靜態 UI 庫）；每個動態 bundle 都精確針對該基座解析其 external。`dsh.client.external` 只新增基座之外的精確請求；系統會將每個請求解析到其指定的動態包 row 或完全匹配的靜態表鍵。純型別 import 會被擦除，不產生請求。組合階段會拒絕畸形請求、缺失提供者、自請求與同步請求環。

### 建置要求

主機提供的是已建置的用戶端 bundle，因此啟動前 `pnpm run build` 必須已產出每個 `lib/client.js`；缺失 bundle 會明確導致啟用失敗，並給出一條建置說明及包／路徑列表。原始碼啟動會把主機側匯入對映到 TypeScript 原始碼，但仍消費這一建置後的用戶端匯出。本包自身不接受任何外掛設定。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋模組系統的建置方式；可觀察行為已在[使用本包](#use-this-package)中說明。

### 設計理念

本包分為兩側：Node 半側負責組合與提供（`ctx.clientModules`，`ClientModuleRegistry`），瀏覽器半側負責載入（`ctx.modules`，`ClientModuleSystem`）。兩者之間的協定是啟動圖——以 `window.__DSH_BOOT__` 注入的 `WebBootEntry` 行，`<` 已轉義，外掛控制的字串無法逃出 script 元素。vendored Loader 唯一的消費點是 `EntryTree.import`，因此模組系統就是「外掛程式碼如何到達」的唯一可替換實作。

### 惰性 CJS 模型

執行外掛 bundle 只註冊其 factory；每個模組主體副作用（包括 CSS 注入）都位於 factory 閉包中，在物化時執行（`factory(require)` → 匯出，在 `loadCache` 中記憶化）。factory 依賴另一個已註冊但未物化的模組時會遞迴物化它；require 迴圈會丟擲異常，因為 factory 形式的 CJS 無法提供部分匯出。解析會依次檢查平臺 seed 表、已記憶記錄、啟動圖 row 與已註冊 factory；其他情況一律拋錯。交給 factory 的同步 `require` 使用相同順序，但不含非同步圖 row 載入，並把觀察到的邊記錄到模組記錄中。它的 `require.async` 操作返回 Promise，並在一次性物化編譯器生成的包內 chunk 前先取得該 chunk。該協定只支援自包含 chunk：入口與 chunk 產物不能同步 require 另一個相對 `client*.js` 產物。

### 增量組合

Node 半側逐包增量掃描——沒有全量重掃路徑。每次發出 `internal/plugin` 事件時，系統都會把該 fiber 的 entry 名標髒；微任務 flush 會把每個髒名與目前 loader 條目對帳，啟用 pass 會初始化同一個髒集合並同步 flush，因此首次掃描與穩態共用同一實作。包中繼資料按 Loader specifier 與所屬 tree base URL 快取至重新啟動，解析出的 manifest（中繼資料清單）包名作為瀏覽器模組身份。若不同的 active Loader source 解析到同一包名，組合會失敗；移除衝突來源後，剩餘來源無需重新啟動 fiber 即可接替。bundle 內容變更只能透過 `rebuilt()`（HMR 掛鉤）進入圖。

Node 半側會在釋出前快照每個 `client.js` 入口，並在不建置回應 body 的情況下建立 combo descriptor。它把資源分組為 combo 路由鍵（`/plugins/??...&rev=...`）：modules row 使用一個 bootstrap combo，其餘 row 使用一個或多個 application combo；每個階段都會在 URL 超過 3 KiB 之前分割槽。啟動圖與批次描述符攜帶同一路由鍵的應用目錄相對形式（`plugins/??...&rev=...`），瀏覽器文件會按其自身掛載解析它，而回應表仍以絕對路由為鍵；source-map trailer 則相對該 combo 腳本自身目錄解析。腳本 body 在首次 `GET` 時只組合一次，並以對應的 map 引用結尾；map 檔案則在首次 map `GET` 時單獨讀取、驗證並組合，`HEAD` 不會物化任一 body。Host 不掃描也不預載入同級 chunk：精確的 `/plugins/<package>/client.<name>.js?rev=<rev>` 請求會讀取並快取該腳本，其 map 仍會等到 map URL 被請求後才計算。瀏覽器從所屬 row 派生出該 chunk 引用，因此它同樣是文件相對形式（`plugins/<package>/client.<name>.js?rev=<rev>`）；chunk 腳本攜帶的 map trailer 則是裸檔名 `client.<name>.js.map?rev=<rev>`，由該腳本自身目錄解析。每個 combo 或 chunk map 都是 Indexed Source Map v3，並在可用時使用作者提供的 section，否則為已打包 bundle 生成 identity section。首次釋出與 HMR 都從入口的 `mtimeMs`、`ctimeMs` 和大小派生逐外掛 revision，不對產物內容求雜湊。狀態變更時間用於區分保留 mtime 和大小的重寫。未變化的產物因此會跨 Host 重新啟動保持 revision，SSE 重連不會替換其瀏覽器外掛。共享預設會在該包所有輸出寫完後標記 `client.js`，因此僅 chunk 發生重建也會更換 owner revision，無需 Host 掃描 chunk。combo revision 從有序 row revision 派生。已公告的 combo 回應與已請求的 chunk 回應會跨無關圖重組保持不可變；未知資源或 revision 返回 404。

### 啟動 manifest 注入

bundle 路由隨注入的 `webServer` 生命週期註冊：服務就緒時註冊，服務被替換時移除並重新註冊。模組組合與 `fetchBundle()` 在沒有 Web server 時仍可用。

主機貢獻結構化 index 行，並向 `<head>` 注入：`window.__ModuleLoader__` queue facade、每個 application combo 的提示性 preload、阻塞 parser 的 bootstrap combo 腳本，然後才是外殼讀取前的啟動圖。Web 載體把這些行渲染進 index 回應；由 shell 持有的載體則可以在沒有 Web server 時渲染同一批行。facade 的 `create()` 物化 modules bundle、把建構委託給其 `createClientModuleSystem` 匯出，並讓同一 facade 進入 live registration 模式。外殼把返回的系統裝成自身 Loader 的 `internal`；modules 外掛將該實例釋出為 `ctx.modules`，因此不同 Cordis 樹不會透過模組級全域狀態選擇實例。

### 條目所有權

`ClientEntries` 記錄啟動時建立的條目，並在同一個 Loader 上序列執行完整圖更新、重試和程式碼過載。本地代際阻止舊下載在目標條目或程式碼變化後掛載；目標相同的快照共用進行中的載入。新增模組使用單資源 URL，不會重新執行可能重複註冊現有 factory 的啟動 batch。Factory 在條目建立前就保留產物 revision；圖更新會在匯入消費者前丟棄未歸屬條目的陳舊 factory、其樣式和失敗的到達目標。清理會保留每個剩餘 Loader 條目的已宣告及已觀察到的傳遞模組依賴。其可觀察狀態不匯入執行時庫，因為 modules bootstrap 在平臺種子可用之前物化。

### 原始碼索引

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Node 半側：`ClientModuleRegistry`、掃描、產物快照、可選 combo 路由、結構化 index 行 |
| [`src/client/index.ts`](src/client/index.ts) | 瀏覽器半側：bootstrap 匯出、`ctx.modules` 登記 |
| [`src/client/system.ts`](src/client/system.ts) | `ClientModuleSystem`：載入／物化／失效機制 |
| [`src/client/entries.ts`](src/client/entries.ts) | 頁麵條目對帳、重試與程式碼替換 |
| [`src/client/entry-lifecycle.ts`](src/client/entry-lifecycle.ts) | 透過註冊表清理 Loader fiber，回收模組自身樣式 |
| [`src/client/manifest.ts`](src/client/manifest.ts) | 協定型別、啟動清單解析與 `dsh.client` 宣告解析器 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當模組約定不夠用時閱讀以下頁面：子系統參考、啟動外掛樹的外殼，以及圖背後的用戶端編寫規則。

- [用戶端模組子系統](../../../docs/subsystems/client-modules.zh.md)——web 外掛表、`WebBootGraph` 協定與 bundle 路由。
- [Web 啟動核心](../web/README.zh.md)——建立模組系統並啟動外掛樹的外殼。
- [用戶端 HMR 驅動器](../hmr/README.zh.md)——在重建 bundle 上驅動 `invalidate`/`prefetch` 的過載鏈結。
- [用戶端編寫規則](../AGENTS.md#shared-modules-and-the-module-graph)——共享模組基座與 `dsh.client.external` 語義。
- [用戶端組地圖](../README.zh.md)——本包所屬的瀏覽器半側。

-----

<a id="model-experience"></a>
## 模型體驗

無。模組 loader 屬於瀏覽器側核心機制，不註冊任何面向模型的內容。

#### KV Cache 影響

無；該包既不組裝也不傳送提供者請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明模組系統不做什麼。它們是目前包約束，不是任務積壓。

- **基於中繼資料的 revision**——revision 標識檔案系統代際，而非內容相等性。僅中繼資料變化也可能過載外掛；mtime、ctime 和大小都無法反映的變化無法區分。
- **有意採用扁平模組圖**——每個 bundle 是一個模組節點，其邊只指向表中的葉節點；介面（`loadCache`/`edges`/`invalidate`）已經支援通用模組圖，因此可以改變 externalization 粒度而不更改介面。
- **Bootstrap 與程式碼替換限制**——頁面保留 modules bootstrap 和靜態平臺模組的身份。移除或替換 bootstrap 需要重新整理頁面；動態替換請求會報告頁面本地錯誤，並保留其 fiber 與匯出；替換包程式碼及其所有現有消費者不屬於普通啟停同步。
- **惰性提供會保留已請求的 body**——Host 在記憶體中保留每個 bundle 與惰性回應計劃；腳本或 map body 在首次 `GET` 後保留快取，HMR 還會保留上一代啟動回應。記憶體僅隨用戶端實際請求的回應 body 增長，同時保留一代競態容忍。
- **從未請求的上一代 map 會讀取目前 map 檔案**——combo revision 跟蹤可執行 bundle，而不跟蹤除錯產物。若 HMR 在保留的舊 URL 首次收到 map `GET` 前重建 map，該回應會把目前 authored map 與舊 bundle offset 組合；在重建前請求 map 會固定該 URL 的回應。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
