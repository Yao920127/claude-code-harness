# Agent Note: 用戶端殼分層與動態包邊界

Status: implemented

[English](2026-08-15-client-shells-and-dynamic-packages.md) | 中文

> [Client 外掛裝載模型](2026-07-23-client-plugin-loading-model.zh.md)負責模組到達、Cordis 生命週期和 HMR。本 Note 負責包歸屬、建置 face、共享模組請求及 npm 依賴宣告；這些決定取代裝載 Note 中較早的包分類和 import 邊規則。

## Problem

Client npm 依賴區段描述安裝和開發關係，但不能可靠描述 bundle 內容。把 `dependencies`、`peerDependencies` 或 `devDependencies` 當作隱式 bundler 指令，可能內聯本應共享的 React 或 workspace 身份，也可能讓建置後的庫攜帶未解析子 import，卻沒有交給預期的主機組裝。

瀏覽器應用還包含不同角色：HTML/Vite 編譯入口、不依賴框架的 Cordis 啟動核心、靜態裝配庫，以及由 Loader 治理的外掛。HTML 提前執行屬於到達策略，不定義包類別。Modules 必須先於 Vite 主模組到達，同時繼續使用普通 `lib/client.js` 產物和動態圖 row。

共享 UI 庫仍向大量消費者暴露同步 TypeScript 與 React 實體。在這些實體進入 service 或 slot 前，形式上把庫改為動態 entry 只會保留實體耦合，並模糊外殼必須共享的模組身份。

## Decision

### 分層與建置形態

| 層 | 成員 | 職責 | 建置與載入形態 |
| --- | --- | --- | --- |
| Web 編譯殼 | `apps/web` | 擁有 `index.html`、Vite 設定、dist chunk 和靜態資源 | 從已建置 package export 組裝最終瀏覽器產物 |
| 啟動核心 | `packages/client/web` | 擁有純 DOM 啟動頁、模組系統接線、Cordis settle 和 renderer handoff | `staticLinked` `lib/index.js`；無 `dsh.client` row |
| 靜態裝配庫 | Cordis、`ui-primitives`、`ui-slots` | 提供共享模組身份和直接實體 API | ESM `lib/index.js`，由 Vite 合併拆分；不是 Loader entry |
| 模組自舉包 | `packages/client/modules` | 提供 client 模組表及其 Cordis wrapper | 帶一個普通 `lib/client.js` 的動態包；host 提前送達其 factory |
| 動態 client 包 | connection、`ui-renderer`、主題和功能外掛 | 透過 Cordis service、slot 和 effect 參與應用 | 宣告 `dsh.client`，產出自注冊 `lib/client.js`，並保留 host graph entry |

`packages/client/web` 把 Cordis 保持為 matching peer 與開發依賴，並把 modules 和靜態 UI 包作為開發期編譯輸入。`apps/web` 消費已建置 package export，不透過 alias 讀取 workspace 原始碼。

`staticLinked` 預設讓 `lib/index.js` 中每個 bare specifier 保持 external import，並在旁邊輸出相對 CSS 資產。Vite 主機負責解析和去重這些 import，並決定最終 chunk 邊界。靜態庫不會把主機打包策略複製進自身產物。

### 共享模組請求

動態瀏覽器 bundle 會隱式 external 統一基座：`PLATFORM_MODULES` 命名由外殼播種的 React、Cordis 和靜態 UI 身份，`PRELOADED_CLIENT_EXTERNALS` 則為必須先於 shell 啟動到達的動態身份預留，目前為空。包只在精確請求基座外實體時使用 `dsh.client.external`。純型別 import 會被擦除，不產生請求；允許的第三方實作庫保留為 bundle 私有內容。

請求只有兩種提供者：

1. 請求所命名的 dynamic package row；末尾 `/client` 會別名到該 package row。
2. 外殼靜態模組表中的精確 key。

不存在通用 `dsh.client.provide` 別名機制。動態 row 和靜態 key 已窮盡實際提供者，Cordis service provide 與此相互獨立。圖組合會拒絕畸形或缺失請求、自請求和同步請求環，並把動態提供者排在消費者之前。`ClientModuleSystem.import()` 與 `prefetch()` 會在消費者能夠物化前遞迴登記這些動態提供者的 factory，因此網路時序無法破壞同步請求圖。

### Parser 預載與 React 移交

Modules Node 半按以下順序向實際返回的 HTML 注入啟動協定：

1. 以 queue 模式安裝 `window.__ModuleLoader__`，包含 `pendingQueue`、`load()` 與 `create()`。
2. 開始預載入所有帶 revision 的 application combo URL，其中包含 modules 之外的 row。
3. 執行所有阻塞式 bootstrap combo URL；目前其中包含普通的 modules factory registration。
4. 賦值 `window.__DSH_BOOT__`，其中包含全部排程描述及每個 row 的單資源 HMR combo URL。
5. 執行 Vite 主模組。

Bootstrap combo 目前只登記 modules factory。啟動核心把原始圖與外殼 seed 傳給 `__ModuleLoader__.create()`。Facade 移除 modules registration，用拒絕全部 external 的 `require` 函式將其物化，再呼叫其 `createClientModuleSystem` 匯出。Modules bundle 解析圖、建構並返回 `ClientModuleSystem`、把自身 exports 快取為 modules row，並把同一 facade 切換到 live 模式。核心把該實例裝成自身 Loader 的 `internal`，modules 外掛從這裡讀取並提供 `ctx.modules`。因此 modules client face 保持零 external 的自舉要求，也沒有模組級系統身份。

Host 釋出 graph 與 combo descriptor 時不會拼接回應 body。每個腳本 URL 共用一個惰性 Promise，在首次 `GET` 時拼接捕捉的 bundle 位元組並追加對應的 map URL；每個 map URL 使用另一個惰性 Promise，只在首次 `GET` 時讀取並組合 source map。`HEAD` 不觸發任一 body。Web URL 仍由 Loader 結算和 required-entry audit 控制，但這個就緒點不會物化 combo body；index 請求讀取當時的最新 graph。

Theme 的 Host 貢獻會前置到 index 收集順序。head 中的 CSS 選擇初始文件畫布調色盤，`system` 偏好直接使用 `prefers-color-scheme`；body 腳本在載入頁面和應用模組之前應用既有的調色盤屬性與字號變數。

`immediately` 層級完成 factory 註冊後，核心建立全部 Loader entry，等待 Cordis 靜止，並要求每個 fiber 都進入 ACTIVE。隨後呼叫 `ctx.uiRenderer.mount(container)`。動態 `ui-renderer` 包擁有 React、slot 渲染、已有啟動 DOM 的 hydrate 和 React root 生命週期；啟動核心與失敗頁保持 React-free。

### 依賴宣告

每個 Client 包都把 Cordis 保持為範圍一致的 `peerDependencies` 和 `devDependencies`；Cordis 是唯一的 peer。Browser import、型別引用、模組擴充與 `dsh.client.inject` 都是開發輸入，因為 Client 建置與釋出 profile 會提供其執行期身份。同時釋出 Host 入口的包把該入口的執行期 value import 放在 `dependencies`。[釋出依賴門面](../process/2026-08-26-published-dependency-faces.zh.md)負責包發現、例外與顯式 Host 名冊。

普通安裝庫仍放在 `dependencies`：動態建置可以內聯私有實作，而 `staticLinked` 庫會保留 bare import 交給最終主機。各建置 face 獨立決定 external，不由 npm 區段推導。釋出檔案列表覆蓋產物實際可達的每個執行期入口、相對資產和宣告檔案。

`verify-package-dependencies` 檢查並修復依賴區段。`verify-client-packages` 檢查建置形態、parser preload 對齊、共享模組請求和模組圖無環性。儲存庫 publint pass 負責檢查釋出閉包。

## Alternatives considered

**立即把所有 client 包改為動態外掛。** `ui-primitives` 與 `ui-slots` 仍提供同步實體，且沒有獨立 service 或 slot 生命週期；只加 manifest 宣告不會移除這些 import。

**為 modules 生成單獨的 `client-static.js`。** 該包仍是動態圖 row 和 Cordis 外掛，只有 factory 提前到達。第二份產物會把主機策略編碼進檔名，並讓同一原始碼產生兩個執行期產品。

**把全部共享模組編進 Vite entry。** 這會讓業務外掛失去部署組合與外掛級替換能力，包括 renderer 和主題。

**保留通用模組 provider 宣告。** Package row 和精確靜態 key 已命名全部提供者；別名會增加另一套歸屬協定，卻沒有第三種供給來源。

**在 `apps/web/index.html` 中硬編碼預載 URL。** URL 與 `rev` 屬於 host 目前 graph。改寫實際返回的 HTML 才能讓 queue、bundle URL 和 manifest 使用同一 graph revision。

## Consequences

內部 DSH 關係僅放在開發區段時，bundle 內容仍保持穩定，因為每個建置 face 都直接宣告 external。靜態庫繼續由主機裝配，動態包則保留統一產物與生命週期治理。釋出 profile 擁有完整 Client 包名冊，因此各 Client 包不再要求 npm 透過 peer placement 重複求解同一張圖。

啟動協定依賴 modules 的 package id，modules 還必須保持執行期自包含。Combo 生成保留其普通 package 產物，併為其他全部 row 提供一條共享初始傳輸；HMR 使用同一條路由，並只把該 row 作為資源。回應 body 的延遲生成會把拼接移到首次存取，而 map 的獨立延遲生成會讓僅供偵錯程式使用的工作不進入腳本交付路徑。缺少 bootstrap registration 會在 Cordis 啟動前失敗；後續外掛 import、apply 與 service 等待失敗仍由啟動頁的 ACTIVE 掃描呈現。

外殼消費已建置 `lib/` 產品，因此在相關 build 或 watcher 執行前，原始碼與瀏覽器產物可能漂移。僅原始碼 typecheck 透過不能證明實際服務的應用使用同一份程式碼。

兩個靜態 UI 庫仍是明確例外。把其中任一項轉換為動態包時，必須在同一變更中把全部實體消費者遷移到 service 或 slot，並從靜態 seed 刪除對應身份。
