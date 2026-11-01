# Agent Note: client 外掛裝載——惰性 factory、Cordis 生命週期與熱過載

Status: implemented

[English](2026-07-23-client-plugin-loading-model.md) | 中文

> 範圍：瀏覽器側外掛裝載機件——程式碼如何到達、Cordis 如何治理程式碼，以及熱過載如何搭乘這套模型。本 Note 擁有裝載鏈；[client 外殼分層 Note](2026-08-15-client-shells-and-dynamic-packages.zh.md)擁有包分類、建置 face、共享模組請求與 npm 依賴宣告，[Web 用戶端架構筆記](2026-07-19-gui-web-client-architecture.zh.md)則擁有 slot 與資料物件層。

## Problem

host 側，cordis 外掛裝載站在 Node 的模組機制之上——require cache 與內部 ESM loader 擁有模組身份與位元組。vendored `@cordisjs/plugin-loader` 在這層基座之上實作外掛治理與熱過載，二者在唯一一道邊界相接：`Loader.internal`。

瀏覽器用戶端跑同一套 cordis 外掛機制，因此底下需要同樣的基座——而瀏覽器沒有 Node 模組系統。

常規前端工程在建置期消化全部依賴：單一 bundle，external 由打包器解決，執行時無物可管。在此之上再做執行時模組管理，正是這裡的特殊需求。client 因此拆成兩層：上層是經同一份 vendored Loader 的 cordis 外掛裝載，下層是模組粒度的依賴管理——`dsh-client-modules`。

下層供給四項能力：external（平臺清單）、遠端到達（同源外部 classic script 加惰性工廠登記）、不可變的版本化交付、熱更新（invalidate/prefetch）。

外掛 bundle 獨立建置在 Vite 模組圖之外。若把回應文字塞進內聯 script，瀏覽器只能看到一次動態原始碼執行：網路資源、生成 bundle、TypeScript/TSX 原始碼之間沒有標準 sourcemap 鏈，效能 profile 與 stack 只能落到生成後的 `client.js`；模組系統還要持有整份原始碼文字，並把同一項到達職責拆成 fetch 與 execute 兩道傳輸邊界。

在此之上，client 與 host 外掛以一致的方式註冊與裝載：包宣告一次 `dsh.client`，host 把宣告掃描進 boot 圖，同一套 Loader 語義在兩側治理 entry。

第一代 client loader（`createClientLoader`）把這兩層手寫進了同一個函式。這一融合留下的是：沒有解除安裝/過載路徑（裝載一次性，style 標籤從不移除）、在三個檔案間人肉抄寫且早已漂移的依賴清單、一條供跨外掛 import 走的模組表後門——既複製了 cordis 的服務機制，又把裝載順序變成正確性約束。下文的結構取代了它。

## Decision

### 包成員與模組請求

[Client 外殼分層 Note](2026-08-15-client-shells-and-dynamic-packages.zh.md)定義目前的靜態、動態包集合及其 import 規則。裝載機件把每個 `dsh.client` 包視為一個 host graph row；每個包都有一個普通 `lib/client.js` factory bundle，還可有編譯器生成的 `lib/client.<name>.js` chunk。包宣告攜帶 Cordis `inject` 邊、同步模組表 `external` 請求，以及可選的 `immediately` 預取標記；負責組合的 app 只擁有掛載名冊。

Web 核心保持不依賴框架，也不 import 任何動態包實體。Modules 本身是動態圖 row，但 host parser 會在 Vite 主模組前送達其 factory。核心呼叫 `create()` 時，由 HTML 安裝的 `__ModuleLoader__` facade 使用該 factory 建構模組系統。其他每個動態圖 row 都歸屬一個 application combo 腳本；React、Cordis 與靜態 UI 庫的身份由外殼 seed 提供。

### 一套模組系統，一個外掛治理器

瀏覽器復刻 host 側的分工。`dsh-client-modules`（`ClientModuleSystem`）坐上 host 側由 Node 內部 ESM loader 佔據的模組系統席位；同一份 vendored `@cordisjs/plugin-loader` 在兩側都坐治理席。二者的分界線一句話說盡：**模組系統擁有模組身份與位元組——程式碼怎麼到達、怎麼登記、怎麼變成匯出內容；Loader 擁有外掛生命週期——外掛何時掛載、等待什麼、如何拆除。**

`ClientModuleSystem` 是一張 lazy CJS 表。執行 bundle 只**登記**其 factory——入口呼叫 `window.__ModuleLoader__.load({ id, factory })`，chunk 還會提供其生成檔名——此外什麼都不發生。模組體的一切副作用（包括 CSS 注入）都住在 factory 閉包裡，在物化時執行：物化即該 id 的首次 `require`/import，此後記憶化。Import 和 prefetch 會先遞迴登記已宣告的動態請求，再登記消費者；隨後 factory 會同步物化任何已登記但尚未物化的請求。可呼叫的 `require` 解析同步模組表請求；其 `require.async` 操作返回 Promise，負責載入、登記並物化一個包內 chunk。共享 tsdown 預設把原始碼中針對包內 chunk 的 `import()` 表示式編譯到這個獨立操作。受支援的產物必須自包含：入口或 chunk 不能同步 require 另一個相對 `client*.js` 產物。模組表按固定分支順序解析：seed word → 記憶化記錄 → graph row classic-script 登記 → 已登記 factory 物化 → 大聲拋錯。Modules factory 是自舉例外：HTML facade 先物化它，建構過程再把同一 exports 直接寫入記憶化表。最後這一拋是建置期純度門禁在執行時的映像。系統還保管逐模組簿記——名下 `<style data-plugin>` 標籤 id、觀測到的 require 邊——並暴露 HMR（熱模組替換）需要的兩個動詞：`prefetch(id)`（登記所請求的動態 factory 和本 row 自身的 factory；並行到達共享一個任務）與 `invalidate(id)`（推進 owner 代次並丟棄非 bootstrap 包的入口和 chunk factory 及記錄，讓下次到達重新載入它們）。在舊代次捕捉的 chunk 請求不能填充新代次。

vendored Loader 經其 `internal` 約定消費模組系統——唯一呼叫點是 `tree.import`——並擁有一切 entry 形狀的事務：entry 建立、fiber 經 cordis 服務等待的啟用（注入的服務未就位即保持 PENDING，服務 provide 時級聯啟用）、update/refresh、拆除。治理程式碼按 vendor 政策與 host 側逐位元組相同。瀏覽器化是殼 vite 設定裡的編譯期對映：一個 `node:module` stub 別名加若干 `process.*` define，使 `ModuleLoader.fromInternal()` 返回 undefined——這正是留給殼來填的空槽。模組系統掛載為 `ctx.modules`。

### Combo 外部腳本到達與原始碼對映

Host 會快照每個已建置外掛入口 bundle，並把每個排程階段的有序 row 劃入一個或多個同源 classic script。它在更長的 map 形式請求 URL 保持在 3 KiB 以內時貪心填充每組，既保留 graph 順序，也以增加請求代替超長 URL。每個腳本只包含 `client.js` 資源，並由這些 package 資源定址，例如 `/plugins/??<package-a>/client.js,<package-b>/client.js&rev=<rev>`。Host 不掃描同級檔案，也不把 chunk 加入啟動 combo。`bootstrap` 與 `application` 是圖中的排程階段，不是 URL 組成部分：HTML 先預載入所有 application URL，再執行所有阻塞 parser 的 bootstrap URL。模組系統按 combo URL 複用進行中的傳輸，因此同組 row 的並行到達只執行一個腳本。成功結算仍要求模組表中已經存在被請求 row 的 factory id；登記不會執行 factory，所以副作用邊界依然是首次物化。

一次 `require.async("./client.<name>.js")` 呼叫會請求精確的帶 revision URL：`/plugins/<package>/client.<name>.js?rev=<rev>`。Host 只在收到請求時讀取該檔案，把檔案已有的 chunk 登記包裝為一個腳本回應，並按 URL 快取回應。並行呼叫共享一個進行中的腳本任務；成功結算要求 chunk 已登記，隨後 loader 才會物化並記憶化其 exports。未知名稱、缺失檔案以及不同於所屬 graph row 的 revision 都返回 404。

共享 tsdown 預設為每個外掛入口與 chunk 產出 map，並把第一方原始碼路徑重寫成瀏覽器可識別的儲存庫形式 `/packages/<group>/<package>/src/...`。生產 Client 建置會消費 `lib/types`；預設把每份 tsc map 交給 Rolldown，並從原檔案補齊 `sourcesContent`，使最終 map 回到 TypeScript/TSX，而不是停在編譯後的 JavaScript。內聯進 bundle 的其他 workspace 原始碼同樣回到其 `packages/` 歸屬，依賴包路徑保持原樣。Combo 生成會移除每個區域性除錯指令、記錄其生成行偏移、以原外掛 map URL 解析每個自帶 source，再產出 Indexed Source Map v3。外掛有自帶 map 時直接用於對應 section；沒有時則生成 identity section，內嵌建置後 bundle，並在存在時把 packer 寫入的 `sourceURL` 用作 source 名。絕對 combo map URL 會平行改寫腳本資源列表中的每個 `client.js` 字尾，因此 `/plugins/??<package-a>/client.js,<package-b>/client.js&rev=<rev>` 指向 `/plugins/??<package-a>/client.js.map,<package-b>/client.js.map&rev=<rev>`。chunk 腳本同樣指向自己的 map URL。只有在這些 map URL 收到 `GET` 後，source map 檔案才會被讀取和組合；`HEAD` 不會物化腳本或 map body。Vite 殼同樣產出 sourcemap，使殼程式碼與經外部載入的外掛都能從 stack 和效能 profile 回到 TypeScript/TSX。

圖為 HMR 保留每個 row 帶 revision 的單資源 combo URL，併為每個啟動 combo 請求增加帶 revision 的描述；多條描述可以使用同一排程階段。首次釋出與 `rebuilt(id)` 使用相同的入口 mtime、ctime 和大小雜湊；產物內容不參與求雜湊。ctime 用於區分保留 mtime 和大小的重寫。Host 重新啟動時若產物未變，每個 row 的 revision 都保持不變，因此重連後的 SSE 快照不會觸發瀏覽器外掛替換。共享預設會在每個包輸出寫完後標記入口；因此只重建 chunk 也會推進 owner revision，無需 Host 掃描 sibling。啟動 combo revision 從有序 row revision 派生。腳本 body 在首次 `GET` 時組合；source map 檔案在首次 map `GET` 時單獨讀取並組合。`HEAD` 不會物化任一 body。版本化腳本與 map 使用 immutable 快取，無關圖重組會保留相同 revision 下已經物化的 chunk 回應。Host 只提供精確生成的 URL；陳舊 revision 與未釋出資源列表返回 404，不會別名到其他位元組。外部腳本的 `error` 事件不給回應狀態與正文，因此失敗診斷只報告 URL；同源 Host 與建置期寫入的 registration id 是身份邊界，`load` 後的 factory 存在性檢查負責拒絕未登記預期 id 的產物。

### 裝載流程，端到端

從 `dsh web` 啟動到 UI 出現之間發生了什麼？三個階段：host 組合 graph 並由 parser 預載 bootstrap factory，HTML facade 建立模組系統且外殼執行預取，然後 Cordis 編排。

**host 側——組合這張圖。**

1. 負責組合的 app（`apps/cli`）把名冊作為普通行放進它的 `cordis.yml` 設定樹——client 外掛包與每個 host 外掛一樣是 entry 行，包括無條件掛載的 `client-hmr` 行。`auditStartupEntries` 報告 import 失敗、帶原始 stack 的啟用錯誤，以及待滿足的依賴；optional entry 輸出 warning，required entry 則使啟動失敗（[啟動策略](2026-09-09-consumer-owned-startup-strictness.zh.md)）。
2. `dsh-client-modules` 的 node 半（該包是雙面的：瀏覽器半就是模組表）使用 Host face import 時相同的 `name` 與所屬 tree `baseUrl` 解析每個 live Loader entry，再讀取最近歸屬 package.json 的 `dsh.client` 宣告並組合出 `window.__DSH_BOOT__`：`{ rev, entries: [{ id, url, rev, inject?, immediately?, external? }], batches: [{ phase, url, rev, entries }] }`。即使 overlay 指向相對的 source 或 built entry 檔案，manifest 包名仍是瀏覽器模組身份。若不同的 active Loader source 解析到同一包名，組合會失敗；一個來源解除安裝後，仍存活的來源無需重新啟動 fiber 即可提供該 row。Row 的三個可選欄位都來自 manifest，永不人肉抄寫。組合會把被請求的動態圖 row 排到消費者之前、拒絕同步請求環，並把每個 row 恰好分配給一個初始批次。它會拒絕沒有已建置 `./client` bundle 的已宣告外掛，並把它們的 package/path 行歸到一條原始碼建置要求下；畸形宣告欄位同樣會讓啟用失敗，Host 檢查會從 FAILED fiber 報告這兩類錯誤。
3. 掃描是單包增量——不存在全量重掃程式碼路徑。每次 cordis `internal/plugin` 發射把該 fiber 的 entry 名標髒（無 entry 的 fiber O(1) 丟棄）；微任務 flush 把每個髒名對帳 live loader entries，包中繼資料（含「非 client 包」的否定結論）按 entry 名與所屬 tree base URL 快取至程序結束，變化後 bundle 的釋出只經 `rebuilt(id)` 可達。啟用趟從目前 entries 灌同一髒集合並同步 flush，初掃與穩態共享一條實作。初始 row 對讀取前的檔案系統中繼資料求雜湊；啟動 combo revision 對有序 row 的身份與 revision 求雜湊，row 與批次描述再共同雜湊進 `graph.rev`。圖型別單源在 modules 包的 `./client` 出口——webserver 對圖一無所知；modules 會註冊 combo 路由並貢獻結構化 index 注入行。

為什麼名冊是 yml 行而不是掃描？因為哪些外掛組合進一次部署是組合決策，不是包屬性——一個在儲存庫中宣告瞭 dsh.client 的包，不代表這次部署要掛載它，掃描發現無從替人做這個決定；node 半隻掃描設定樹實際掛載了的東西。

**第一階段——模組面。**注入的 HTML 以 queue 模式安裝 `window.__ModuleLoader__`，開始預載入所有 application combo URL，以阻塞式 classic script 依次執行所有 bootstrap combo URL，賦值 `window.__DSH_BOOT__`，然後啟動 Vite 主模組。核心把原始圖和外殼 seed 傳給 facade 的 `create()`。Facade 移除 modules registration，用拒絕全部 external 的 bootstrap `require` 將其物化，再呼叫其 `createClientModuleSystem` 匯出。Modules bundle 解析圖、建構並返回系統、記憶化自身 exports，並把同一 facade 切換到 live registration。隨後核心並行預取每個 `immediately` row；同一 application combo 中的 row 共享一次執行，不同 combo 會在 immediate row、被請求依賴或普通 entry import 首次觸及時獨立載入。預取失敗在這裡被吞下，因為第二階段 import 會重試並擁有那次大聲失敗。`immediately` 仍是 registration barrier，不是包身份。

**第二階段——外掛面。**

1. 核心掛載 vendored Loader，在任何 entry 存在之前就把模組系統注入為 `internal`。順序有講究：`tree.import` 的裸 import 後備分支在瀏覽器裡絕不能跑到。
2. 它統一建立每個 graph row。Import modules row 會返回記憶化的 bootstrap exports，其 `apply()` 讀取該樹的 `Loader.internal`，把同一個實例提供為 `ctx.modules`；需要該 service 的 row 會保持 PENDING 直至此時，因此 modules row 無需特殊建立位置。渲染組裝是由 `dsh-client-ui-renderer` 提供的普通 host graph row；核心不追加組裝偽 entry。
3. Graph 順序治理同步 factory 可用性；Cordis 啟用與之獨立，仍經服務等待推進。
4. `settled` = 每個 entry 已建立 + `loader.await()` 完全停穩 + 一次全 ACTIVE 掃描。掃描列出每個 import 失敗、FAILED 或 PENDING 的 fiber 及其缺失的服務。它存在的理由：cordis 的 inject 等待沒有超時——這次掃描就是大聲失敗的後備線。
5. 不依賴框架的 loading 頁經 `internal/status` 投影真實 fiber 狀態。檢查完成後，核心呼叫 `ctx.uiRenderer.mount(container)`，一次切換到真實 UI。

### 動態圖對帳

modules 控制器只持有從啟動清單建立的 Loader 條目。Host 的完整快照更新模組描述並對帳這些條目；其他 Loader 貢獻方保留自身所有權。新增模組透過單資源 URL 到達，因為重放啟動 batch 可能重複註冊現有 factory。移除使用 Loader 刪除語義，隨後等待已捕捉 fiber 清理完畢，再移除未使用的模組與樣式。已宣告及已觀察到的傳遞依賴使共享模組保持存活。Factory revision 的跟蹤獨立於條目啟用，因為下載或物化完成後仍可能沒有建立條目。圖更新會在任何消費者匯入依賴前，使未歸屬受管條目的陳舊 factory 和失敗的到達目標失效，並清除其樣式；重建幀也會對帳因匯入失敗而缺失的條目。

Host SSE 介面卡轉發現有圖變化通知，並在連線時傳送目前完整圖。圖描述瀏覽器的目標條目，不代表 Host 清理完成：Host 生命週期順序屬於其 Loader，每個瀏覽器則等待自身被移除 fiber 的清理。圖對帳與程式碼重建共用一個頁面佇列。本地代際阻止過期下載掛載；不透明 revision 只比較相等。失敗頁面報告本地錯誤，並可重試同一張圖而不改變 Host 啟用狀態。這保留了無關頁面狀態，也無需重新啟動應用或引入第二套外掛執行器。Electron 的獨立安裝流程不屬於此機制。

### 熱過載：一個驅動外掛，自行監視的 bundle

熱過載是一項組合決策：web 組合包無條件掛載 `client-hmr` 行（一個常規的外掛包），其 node 半帶來 bundle 監視與 SSE（Server-Sent Events）通道；沒有重建 watcher 改寫用戶端 bundle 時鏈結保持空閒。不應暴露它的組合可以停用該行。

重建好的 bundle 怎麼變成過載訊號？hmr 的 node 半自己觀察——沒有建置器來通知它。模組 host 在讀取每份啟動快照前捕捉入口 stat 基線，並透過 `ctx.clientModules.artifactBaseline(id)` 暴露它。HMR 自持的單個定時器把目前圖的每個 row 與這份基線比較：未變化的 row 直接開始監視，不讀取內容也不求雜湊；基線捕捉後的寫入已經形成 stat 差異，只有該 row 會進入 `rebuilt(id)`。這既避免安裝 watcher 時重複讀取，也避開 `fs.watchFile` 以非同步首次 stat 建立基線、可能靜默吸收建構期重建的問題。監視集合的成員隨 `onGraphChanged` 更新；消失的 row 撤下監視，輪詢時缺失的入口則讓對應 row 保持標髒狀態，檔案重現時即使 mtime 和大小與基線相同也重試釋出。共享 tsdown 預設會在每個 sibling 輸出寫完後標記 `client.js`；入口 mtime、ctime 或大小變化、或 row 處於標髒狀態時，`rebuilt(id)` 從這三個中繼資料值派生 revision。只有 revision 變化時，它才讀取新的 bundle 快照。只修改 chunk 因此也會更換 revision；部分寫入之後的完成標記還會提供一次更晚的 stat 變化以完成自愈。`rev` 變化時，node 半在 `GET /plugins/events` 上廣播 `rebuilt` 幀——這是一條系統級 SSE 通道，連線即發全量圖，變更時發 `rebuilt` 幀，僅供呈現的 wire，永不進工作階段日誌。輪詢是刻意選擇：inotify 在 weka 網路掛載上不觸發，建置側監視器需要 `--poll` 也是同一原因；每個 row 每個間隔只需一次入口 stat，輪詢間隔是一個經驗證的設定欄位（預設 500ms），dispose（資源釋放）會清掉那一個定時器。重建產物的程序必須使用共享 Client tsdown 預設；`scripts/dev-web.ts` 仍作為 watch 建置入口保留，其包清單在啟動時掃描 `packages/*/*/package.json` 按 dsh.client 發現，建置器與 host 之間沒有通知協定。

瀏覽器側的傳輸把程式碼替換交給負責圖對帳的同一個 modules 控制器：

1. `invalidate`——丟棄陳舊的 factory 與記錄，並把 rebuilt 幀的 revision 繫結到該 row 的單資源 combo URL。Factory 還活著會讓下一步變成 no-op。
2. `prefetch`——載入該單資源外部腳本並登記新 factory，舊 fiber 此刻仍在服役。初始多資源腳本不會再次執行。
3. `registry.delete`——先於任何 fiber 操作。裸做 fiber dispose 會觸發 vendored Loader 的自 dispose 分支，把 entry 永久停用。
4. 排空舊 fiber 的各 disposer。
5. 移除名下的 `<style data-plugin>` 標籤。
6. 透過模組系統物化新匯出，再呼叫 `entry.refresh()` 由 Loader 掛載。CSS 在舊 disposer 清理完成後重新注入；顯式物化使匯入錯誤能夠被捕捉，而不只留下 Loader 的控制檯日誌。
7. `fiber.await()`——讓失敗大聲重拋。

Bootstrap 替換會在失效或解除安裝前被拒絕：模組系統保留其初始匯出，重新掛載舊程式碼會重置消費者，卻無法應用請求的 revision。頁面會報告需要重新整理，並保留 bootstrap fiber。所有非 bootstrap 外掛都共享同一套替換語義；`immediately` 行的過載與 lazy 行分毫不差。依賴級聯不花一行 client 程式碼：fiber 的啟用紀元串接著它各服務提供者的 uid，因此替換 connection 等基礎 provider 的 fiber 時，每個依賴方都會經 cordis 本身重新裝載——行為正確，但代價較高。

過載會建立新的 fiber 和元件狀態，不保留被替換外掛內部的 React 狀態。靜態組裝庫與應用殼需要重建後的頁面。匯入或啟用失敗仍可診斷和重試，不會復原無關外掛。自過載關閉舊 SSE 通道並開啟新通道；其完整快照補齊遺漏的圖變更。啟動、圖更新和重建幀共用同一佇列，因此程式碼替換不會與初始模組到達重疊。

## 包歸屬

目前包盤點與建置形態位於[client 外殼分層 Note](2026-08-15-client-shells-and-dynamic-packages.zh.md)。本 Note 只保留適用於每個動態圖 row 的裝載屬性：惰性 factory 登記、Cordis entry 治理、外部 script 到達、sourcemap 與 HMR。

## Consequences

Wire 兩側執行同一份治理實作；瀏覽器特有層只包含一套模組系統和一個過載外掛。動態包只有一種產物形態，因此純度檢查覆蓋全部動態包。Cordis 依賴、模組請求與啟動檔位都與其所有者——manifest——同住，負責組合的 app 只握名冊。Host graph 驗證與遞迴請求到達使同步 factory 依賴保持顯式。瀏覽器原生 script 裝載保留外掛網路資源、生成 bundle 與 TypeScript/TSX 原始碼之間的標準對映，模組系統也只保留一個可替換的 `loadBundle` 掛鉤。

接受的代價：vendored Loader 在瀏覽器裡揹著閒置機件（EntryTree 持久化是 no-op，分組／隔離未用）；開發期每次修改外掛都要付一次 bundle 重建加 fiber 重掛；graph `inject` row 指導 factory 到達，但服務可用性仍是啟用權威，因此不匹配會在 settled 掃描時浮出；靜態 UI 庫保留直接實體匯出；每個 bundle 多出一份 sourcemap 產物，外部 script 失敗也只能給出粗粒度 URL 診斷，不能像顯式 fetch 那樣報告 HTTP 狀態。Host 為目前圖及上一代啟動圖保留 bundle 快照與惰性回應計劃。腳本和 map body 在首次 `GET` 後快取，因此記憶體隨 bundle 快照和已請求的回應 body 增長。每份已物化回應在其 URL 下保持固定；若上一代 map 在重建後才首次被請求，則會讀取目前 map 檔案。

名冊位於 web 組合包的設定樹（`packages/bundle/web-app/cordis.patch.yml`）；`mountWebPlugins` 與 `CLIENT_PACKAGES` 常數已消失，重組一次部署等於替換 yml/overlay。Graph 組合器位於 `dsh-client-modules` node 半，由 parser 預載的 Client face 則自舉瀏覽器模組表。Webserver 繼續作為樸素路由註冊外掛；`/api/*` 繫結、瀏覽器認證、RPC envelope 與精確 Fetch 路由屬於 Connection node 半，Remote 分發屬於 API Gateway，開發期 bundle 監視與 SSE 通道屬於 HMR node 半。

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| 兩軸分類體系（entry × 到達），基礎設施包不帶 dsh.client | 抹掉了 manifest 依賴邊（inject 洩漏給組合方）、把外掛形態拆成兩種、讓純度門禁對一半外掛失明 |
| 繼續把手寫 loader 演化成治理器 | 重新實作 vendored Loader 已擁有的 entry/fiber 生命週期；HMR 將與 host 側毫無共享骨架 |
| 在瀏覽器複用 `@cordisjs/plugin-hmr` | 約 80% 在解決瀏覽器沒有的問題（fs 監聽、深度圖著色、Node 的雙快取）；只按形狀抄用其過載骨架 |
| 模組聯邦（module federation） | 獨立建置的遠端 bundle 恰是 vite 聯邦不支援的形態 |
| import map | 早已排除；DI require 表是終局機制 |
| 現在就徹底 ctx 化（React 與庫全走服務，不設模組表） | 靜態 UI 庫仍暴露同步實體，因此刪除模組表會讓這些 import 失去共享身份 |
| 凍結表 + 到達即實例化 | 會在 script 到達時執行 bundle 副作用；惰性登記把執行推遲到 Cordis import，並由遞迴 `require` 物化已登記請求 |
| fetch 回應文字後注入內聯 `<script>` | 模組系統必須緩衝整份原始碼並維護 fetch/execute 兩條路徑；動態原始碼執行也切斷瀏覽器網路資源、sourcemap 與 profile 的原生關聯 |
| 建置器推送重建通道（編排器在 `onSuccess` 裡 POST `/plugins/rebuilt`） | 把過載耦合到一個欽定的建置器程序和第二套 wire 協定；webserver 本就握有每個 bundle 路徑，stat 輪詢（每次 stat 變化即釋出）已兜住當年為推送辯護的撕裂寫競態 |
