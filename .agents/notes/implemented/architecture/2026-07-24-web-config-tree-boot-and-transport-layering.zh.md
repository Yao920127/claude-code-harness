# Agent Note: dsh web 的 config-tree boot 與 web 傳輸分層

Status: implemented

[English](2026-07-24-web-config-tree-boot-and-transport-layering.md) | 中文

> 範圍：`dsh web` 如何組合（cordis.yml + cordis 之前的 boot 類 + 設定源），以及 web 傳輸如何跨包分層（閘道 / 載體 / 繫結 / 圖 / 開發期過載）。瀏覽器側裝載鏈歸 [client 外掛裝載 note](2026-07-23-client-plugin-loading-model.zh.md) 所有，本組合只是它的供給方。

## 問題

`dsh web` 曾是僅剩的手工裝配面：`bootHost` 逐個掛 32 個外掛、config 釘死在程式碼裡（違反 no-hardcoded-tunables），client roster 是 `web.ts` 常數，而 TUI/headless 早已是 yml 組合。傳輸層的職責錯位與之配套：webserver 自稱啞載體卻認識 `__DSH_BOOT__` 圖、擁有 SSE（Server-Sent Events）通道、硬編碼 `/api/*` 字首；dev 的 bundle watch 寄居在 prod 註冊表裡靠 `watch?` 參數開關、生命週期無主；圖註冊表對每次 `internal/plugin` 全量重掃；單請求失敗與致命 server 錯誤共用一個一律退出程序的 sink。還有一個使用者可見缺陷：web 路徑從不載入 `$DSH_HOME/.env`，`DSH_HOME=… dsh web` 讀不到自定義 home 下的 API key。

## 決策

**組合結果是一棵平鋪設定樹。** `apps/cli/config/base.cordis.yml` 與 `apps/cli/config/web.cordis.yml` 共同持有全部行——host 執行時（32 行）、`api-gateway` 行、`webserver` 行、`dsh.client` 行（瀏覽器 roster；modules 行同時是 host 行）。不做主幹 bundle：每外掛一行、每個 config 欄位 yml 可改。這一立場後來推廣到全倉：兩個 surface 共享的設定項被抽取進 `apps/cli/config/base.cordis.yml`，各 surface 則收斂為一份 overlay（[共享 base overlay](../../archived/simplification/2026-07-29-shared-base-config-overlays.md)）。`dsh-client-hmr` 行是普通的始終啟用的 bundle 行（最初由 `--dev` 在程式碼中追加；該旗標已廢除）。行序無裝載語義；啟用由服務可用性驅動。`auditStartupEntries` 報告 import 失敗、讀取失敗 fiber 的原始啟用錯誤，並列出讓 fiber 停在 `PENDING` 的服務。[啟動策略](2026-09-09-consumer-owned-startup-strictness.zh.md)將 optional failure 作為 warning，將 required failure 視為致命錯誤。已報告的 rejection 原因會保持標記至一個程序級檢查點，使 `installFailLoud` 合併 Loader 的重複通知，而無關的未處理 rejection 仍然致命。Node app-boot 產物內嵌 `@cordisjs/plugin-include`，但將 `@cordisjs/plugin-loader` 保持為外部依賴，因此 include 的 `EntryTree` 與 host 會繫結到同一個 Loader peer，而不會讓一棵設定樹橫跨兩個 Loader 實作。

**boot 膠水由兩個類組成。** `AppCLIEntry`（apps/cli）與 `AppWebEntry`（殼核心）只持有那些必須獨立於 cordis、提前存在的東西：argv 事實、合成的 patch 集、解析出的 boot manifest（中繼資料清單）、模組系統實例、loading 頁控制代碼——其餘一律進外掛。`AppCLIEntry.run()` 三段：分層 env（ambient > cwd `.env` > `$DSH_HOME/.env`，順手關掉上述缺陷）→ patch 合成 → Loader include boot 加 activation audit。`AppWebEntry.run()` 在瀏覽器側映像它：把 `window.__DSH_BOOT__` 解析成 `BootManifest`（雙視角：npm 包行給模組表、cordis 外掛行給 entry 組合；畸形 wire 大聲拋）、建模組系統、渲染 loading 頁、immediately 層預取與 Context/Loader 準備並行、**create entry 之前等預取齊**（物化是 `tree.import` 的同步 require，不受 fiber inject 等待保護；i18n → runtime/client 這類跨包 require 邊要求 immediately 層工廠全部註冊完——否則有實測 10–25% 的 boot 競態）、收編 modules entry、逐一建立圖行、settle、sweep。

**每個設定源有唯一宣告位置。** 組合包 yml 值是工程預設，Settings 分節是可寫的使用者偏好，CLI（命令列介面）flags 面向其歸屬的啟動器設定行，env 值則透過 yml `!!js` 表示式進入。patch 會整體替換一行的 config。解析後的前端 `distIndex` 透過同一條 patch 通道作為組裝事實傳遞。與傳輸無關的提供者／模型預設值歸 `ctx.agentDefaultModel` 所有；[直接 headless 入口](../../archived/architecture/2026-08-09-headless-direct-core-entry-point.md)與 Session Controller 消費同一份狀態。

**傳輸職責各有明確 owner。** `dsh-client-connection` 持有 `/api` 路由、請求與回應 envelope、瀏覽器認證、Host/Origin 檢查、精確 Fetch 路由註冊以及共享 Typert interceptor 席位。`dsh-api-gateway` 持有型別化 Remote 分發和多路複用 WebSocket。`dsh-host-webserver` 是樸素的路由註冊外掛：`WebServer` provide `ctx.webServer`（`register(route) → disposer`、重複 pattern 即拋、`renderIndex` 渲染——先結構化 `webserver/index-inject` 行、後原始 `tapIndex` 按註冊序應用——與 `port`），啟用即 listen，單請求失敗時答 400 並記日誌，且不認識任何 harness 概念。其基於 socket 的 Node HTTP 入口可以透過受維護的中介軟體應用已設定的 gzip，無需新增回應寫出服務方法或改變 route owner；Web Worker 隧道傳遞 identity 位元組。modules node 半（`ClientModuleRegistry`，provide `ctx.clientModules`）持有單包增量掃描、bundle 路由、啟動注入行與 `onRebuilt`/`onGraphChanged` 通知。HMR（熱模組替換）node 半透過 `fs.watchFile` membership 與 `/plugins/events` SSE 路由持有開發期過載。

**包出口紀律。** modules 包只暴露 `.`（node 半）與 `./client`（完整瀏覽器半：`ClientModuleSystem`、`parseBootManifest`、收編外掛面）——不設專用子路徑；wire 型別經根出口 re-export 給 host 側消費方。收編握手：核心在 cordis 之前把建好的實例寫入 `window.__DSH_MODULES__`；`./client` 的 apply 讀取該槽位（缺少時顯式拋錯）並 provide `ctx.modules`。

## 後果

- 重組一個 web 部署 = 改 yml/patch；退役件（`mountWebPlugins`、`CLIENT_PACKAGES`、`createHostWebPluginRegistry`、`startWebServer`、webserver 的圖/SSE/api 知識）全部刪除。
- [Headless 是直接 core 入口](../../archived/architecture/2026-08-09-headless-direct-core-entry-point.md)：其隨附 profile 包含共享的 base Agent 能力，並省去 Host、HTTP、Web 與瀏覽器層。本筆記的傳輸劃分是瀏覽器 surface 的約定。
- 一個值得記住的 TypeScript 坑：`declare module 'cordis'` augmentation 所在檔案若**沒有任何 cordis import**，會被降級成獨立模組宣告，無聲打散全程式的 `Context` merge（`ctx.on`/`ctx.effect` 全程式消失）。用 `import type {} from 'cordis'` 錨定。

## 考慮過的替代方案

| 棄案 | 一行理由 |
|---|---|
| 專門的 `dsh-host-profile` 受體包 | 使用者模型狀態歸 Settings 支撐的 `ctx.agentDefaultModel` 所有；額外的 Host 受體會重複歸屬，並排除直接入口 |
| 執行時裡的 `assembly` 墊層外掛（provide `apiHandler`） | Connection 已在傳輸邊緣把 Remote interception 與功能自有的精確 Fetch 路由組合成一個 handler |
| 全量重掃與增量掃描並存 | 兩條實作兩份語義；單包路徑足以覆蓋啟用初掃 |
| modules 包特設 `./impl` 出口 | 出口不統一；標準 `./client` 承載完整瀏覽器半 |
| dev overlay / `cordis.dev.yml` | 一套 yml；`!!js` 無法條件化行存在性，`--dev` 追加一行就是全部差異 |
| env 進對映表 | 同一欄位將出現 env/json 雙源，需再發明優先順序 |
| create 不等預取（以 `arrive()` 去重為安全依據） | 被 10–25% boot 競態證偽：在途去重只覆蓋同包雙拉，不覆蓋跨包同步 require 邊 |
| json 直接當 loader patches 檔案 | json 鍵名將耦合 yml 行結構，profile 編寫者要懂 cordis |
| 公開回應寫出方法並讓每條 route 選擇接入 | 回應編碼屬於 Node HTTP 策略；經 `ctx.webServer` 暴露會讓每個 route 所有者與測試替身依賴這項策略 |
| 手寫 gzip 協商與流生命週期 | 受維護的中介軟體已經處理協商、媒體型別篩選、回應頭改寫、背壓與閾值行為 |
