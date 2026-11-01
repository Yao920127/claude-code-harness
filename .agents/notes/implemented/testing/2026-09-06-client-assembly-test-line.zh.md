# Agent Note: 基於端點具名 Remote mock 的整機用戶端測試檔

Status: implemented

[English](2026-09-06-client-assembly-test-line.md) | 中文

## 問題

瀏覽器功能 spec 各自手拼測試臺：一個裸 Cordis context、`locale`、`connection`、`remote` 的替身，以及本該由真宣告者做出的 slot 宣告。它們的斷言因此描述的是測試臺而不是產品：一個外掛新增了設定 section、一個宣告者經 Loader 過載、一個 Connection 重連，對它們都不可見，而每個測試臺都重複著同樣的四十行並各有細小漂移。

API 用戶端 spec 用一個可程式設計的 Remote 面假件驅動物件。這個假件重新實作了它本該只是呼叫的 Gateway 語義：從歷史列表推導 follow 流的開場快照、切頁、帶投遞 promise 的流泵，以及一層信封。每一樣都是產品已有契約的第二份實作，它還讓測試描述出生成用戶端做不出來的行為，比如一次會 reject 的一元呼叫。

沒有聚焦原始碼測試按生產方式起用戶端——`bootClient` 按 manifest 每行建一個 Loader entry，再 `mountClient`——外掛之間的組合故障會被手工測試臺遮住。

## 決定

整機檔放在 `@deepseek-ai/dsh-client-test-runtime` 的深 import `src/assembly/` 下，新的 test-support 包 `@deepseek-ai/dsh-remote-mock` 按端點名應答 Remote 流量。兩者的用法由各自 README 描述（[client-runtime](../../../../packages/test-support/client-runtime/README.zh.md)、[remote-mock](../../../../packages/test-support/remote-mock/README.zh.md)）；本文記錄它們背後的決定。

**roster 從 bundle 現讀，絕不複製。** `bundleRoster(bundles)` 用 include 外掛自己的 YAML 方言（帶 `!!js` 的 `entryListSchema`）解析每個 bundle 的 `dsh.bundle.patch`，用它的 `applyEntryPatches` 合成各層，再保留每個未停用且其包宣告 `dsh.client.platform === 'web'` 的行，帶上該宣告的 `inject` 與 `immediately`。`webApp` 是 `web` profile 的 roster（先 `dsh-base`、再 `dsh-web-app`），import 時算出。spec 點名它要測的東西，其餘推導：`webApp.closure([row])` 保留一行及其傳遞 `inject` 錐；`pick` 與 `without` 留給刻意裁剪。測試執行時仍是 Client 面的包：它不 import 任何 Host 模組，此處不用動態 import，其 client 面的 `types` 在 `client-build-environment` 之外加了 `node`，好讓讀取器使用 `node:fs`。`closure` 把 shell 靜態種入的平臺模組（`PLATFORM_MODULES`）視為無需行即已滿足。

**生產啟動路徑只替換 Connection 輸入適應。** `TestClient.start(plan, mock)` 載入每個 roster 行的 `/client` 模組，用 `installConnection(ctx, { transport: { rpc: mock.rpc } })` 替換 Connection 行的頁面全域適應，經生產模組 facade 的 `pendingQueue` 登記這些工廠，經 `bootClient` 啟動，可選經 `mountClient` 掛載，然後等 `connected`。`reload(name)` 經 client-hmr 匯出的 `tearDownEntryFiber` 重建一個 Loader entry；`unload(name)` 移除它；`dispose()` 拆掉一切，然後對任何沒有規則的端點讓測試失敗。jsdom 沒有 `EventSource` 與 `ResizeObserver`；`start` 只對全域缺失的惰性替身做引用計數。模組系統、Connection 載體、Remote mock、過載和銷燬都歸實例所有，因此用戶端可以並行啟動，不透過頁面全域變數協調。

modules 外掛啟用時從自己的 `ctx.loader.internal` 讀取模組系統。過載 bootstrap 行會重新發布同一個實例而不讓 bootstrap 程式碼失效，另一個用戶端的 Loader 與 `ctx.modules` 不受影響。

**`remote.<ns>` 是無契約代理，不是生成用戶端。** `@deepseek-ai/dsh-api-remotes` 行被去掉，因為它生成的用戶端只存在於建置後的 `lib/`。對 roster 行注入的每個 `remote.<ns>`，加上 mock 有規則的每個名稱空間，本檔各提供一個 Proxy：`ctx.remote.<ns>.<method>(...args)` 經 roster 自己的 Connection 用位置參數呼叫端點 `<ns>/<method>`，mock 為它登記了流腳本就走流、否則走一元。Cordis 把 `ctx.remote.<ns>` 解析到服務 `remote.<ns>`，所以 Gateway 用戶端本身不動。一元應答原樣返回；一元拒絕按生成用戶端摺疊載體拋錯的方式摺疊，經 Gateway 用戶端匯出的 `carrierFailure` 與 `cancelledFailure`，因此不等待就發出 Remote 呼叫的產品程式碼看不到任何 reject。流的項與失敗按流吐出的樣子直傳。

**原生 mock 負責回應設定和呼叫斷言。** 測試透過 `mock.remote.<namespace>.<method>` 使用 `mockResolvedValue`、`mockResolvedValueOnce`、`mockReturnValueOnce` 或 `mockImplementation`，簽名由生成的 API 提供。每個 mock 實例獨立持有原生回應佇列。可複用的表只登記預設值或位置參數 handler，每個端點僅保留最新預設回應。有狀態回呼和 deferred promise 歸各測試所有。`ok` 建構成功信封。流需要顯式宣告，可提供接收開啟參數與控制代碼（`push`、`end`、`fail`）的腳本；無腳本的宣告產生流漏配，未宣告端點預設走一元。值不驗證。`mock.streams` 控制腳本流並提供開啟／排空等待；`mock.log` 記錄載體呼叫（`pending`、`answered`、`failed`）、腳本流狀態、首參數 `requests(endpoint?)` 和未匹配請求。`RemoteMock.create()` 為 `$events` 應答 ready 幀，讓用戶端可以連線。

**Vitest 擁有每條測試的 mock 和用戶端生命週期。** `createClientTest(plan, options)` 增加原生 `mock`、`remote` 與 `start` fixture。mock 每次新建並攜帶預設回應；`remote` 是它的名稱空間 Proxy，顯式 `start()` 留出設定啟動期應答的時機，同一測試共用一個啟動 Promise。不需要 Connection 的物件層 spec 直接使用 `remote`；需要 Gateway `$stream` 的案例呼叫 `start()`。收尾等待啟動，即使斷言失敗也銷燬成功建立的用戶端、檢查漏配，並拒絕後續啟動。啟動錯誤由呼叫方 await 觀察。分別擁有多個用戶端時仍用 `TestClient.start`。情境資料直接設定原生 mock；返回 mutation 應答與更新後續 describe 應答仍是兩個獨立操作。

**`remoteDefaultResponses` 是啟動期 Remote 端點的預設回應。** 這張表恰好列出 `web` roster 在沒有 session、沒有 workspace、預設設定下啟動並渲染時會打的端點，每行註明呼叫方。spec 在其上疊加自己的 `RemoteTable`；新的啟動期呼叫會在 `dispose()` 時讓 spec 失敗。

歸應用所有的 built-bundle 測試會在 `AppWebEntry` 啟動前透過 `__DSH_TRANSPORT__` 安裝一份新的 `RemoteMock`。情境資料留在 `apps/web/tests` 下；生產 Connection 包不包含情境資料集或由 query 選擇的測試 transport。需要 Host 行為的瀏覽器案例使用 `launchWebScaffold()` 和真實 HTTP/WebSocket 路徑。

`mock.remote` 使用直接呼叫方與 Connection 分發共用的原生 `@vitest/spy.fn` 函式。`MockedRemote` 對完整生成的名稱空間對映應用 Vitest 深層 mock 型別轉換；對映為空時僅這個 Proxy 弱化為 `any`。生產 `Context` 與 Remote 宣告保持嚴格，不需要名稱空間專屬型別副本或編譯器 Flag。[Proxy 型別指引](../../../../packages/test-support/remote-mock/README.zh.md#remote-proxy)要求即使無建置測試透過，本地也必須執行建置後的型別檢查。

## 為本檔新增的產品匯出

- `client/connection`：`ClientTransportHooks.rpc?` 接受由程序內組合持有的已解碼載體；`fetch` 可選。`installConnection(ctx, options)` 從實例區域性的 transport、recovery 與 location 輸入安裝同一個生產服務。
- `client/hmr`：`tearDownEntryFiber(entry)` 就是 `reload` 本來執行的 registry 先行的 fiber 拆除。
- `client/modules`：`parseDshClient` 與 `exactPackageSpecifier` 從 client 面匯出，由 Host 和 roster 讀取器共用。測試工廠使用已有註冊佇列。roster 行到 boot graph 的合成只有測試消費者，放在本檔裡。
- `client/web`：`bootClient` 與 `mountClient` 從 `AppWebEntry.run()` 抽出，後者現在呼叫它們。
- `api/gateway`：匯出 `carrierFailure` 與 `cancelledFailure`，讓生成用戶端的替身摺疊得一模一樣。

## 考慮過的替代方案

**從建置後的 `lib/` 執行生成的 `/remote` 用戶端。** 否決：它讓原始碼面的 spec 依賴建置產物，而代理只需要 mock 已持有的一元或流宣告。

**帶漂移門禁的生成靜態 roster 模組。** 評審後否決：它是測試包內的一份 bundle 資料複製，基於它寫的每個子集都是會漏行的手列清單。用 include 外掛自己的 schema 與補丁應用在 import 時讀 bundle，把複製、生成器和門禁一起去掉。

**給測試執行時加 Host 編譯面、動態 import 一個 Host 模組，或用 vitest `globalSetup` 經 `provide`/`inject` 傳 roster。** 否決：Client 測試執行時不得 import Host 程式碼，動態 import 藏起依賴，設定層通道藏起 roster 的來源。啟動器用的合成函式本就面中立，這些都不需要。

**自寫一套測試側的 YAML 與補丁解析器。** 否決：`entryListSchema` 與 `applyEntryPatches` 就是啟動器自己的，不帶 Host Context 合併；本檔只寫讀檔案、定位 package.json 和 web 行過濾。

**用一個 mock 模組替代 Gateway 用戶端。** 否決：mock 不得干涉 Gateway 內部；把它傳給生產 Connection 安裝函式會讓重試、摺疊與流語義都保持真實。

**在生產 Connection 包中保留由 query 選擇的 fixture transport 與情境資料集。** 否決：這會把交付程式碼耦合到易變的應用測試資料，並讓 URL 標記成為隱藏的 transport 選擇器。僅用戶端的組裝測試注入 `RemoteMock`；擁有 Host 行為的瀏覽器測試使用真實 Host scaffold。

**用 worker 級啟動輪次包住頁面全域 Connection 載體。** 否決：用戶端會共享可變程序狀態，每次啟動或 Connection 過載都必須序列安裝當事用戶端的載體。實例區域性的 Connection 安裝讓獨立外掛樹可以並行啟動和過載。

**第二套帶型別的 Gateway 實作，包含 `Api` 泛型、信封與錯誤類以及 fixtures 目錄。** 否決：它重複 Gateway 宣告與編解碼。mock 從生成的名稱空間對映派生方法型別，執行時只宣告一元或流行為。

**代理把一元拒絕原樣直傳。** 否決：產品程式碼從不等待 Remote 的 reject，因為生成用戶端會摺疊載體拋錯，於是沒匹配的端點造成未處理的拒絕；經匯出的輔助函式摺疊恢復了用戶端的面。

**保留 CallContext，再用介面卡包裝原生 spy。** 否決：每個測試都要解開合成呼叫物件，還保留沒有業務 spec 消費者的計數／狀態機制。位置參數 handler 直接使用現有測試生態。

**獨立的 `once` / `sequence` DSL 與退回規則棧。** 否決：按實例持有的原生佇列已經能表達消費方使用的延遲回應和臨時失敗。不可變表宣告配合每次登記的遊標雖能共享一次性回應表，但目前沒有共享表需要它。本檔放棄最新登記優先的退回和表級末項重複宣告，測試改用原生佇列順序與持續預設回應。回應值和有狀態 handler 仍按引用借用，不做克隆。

**獨立的預載入模組選項或 `staticModules`。** 否決：現有待註冊佇列能在 Loader 啟動前接收同樣的工廠。`staticModules` 繞過工廠物化，也不共享圖的預取／失效行為；佇列在保留這些行為的同時省掉額外選項。僅裝配內部使用的 helper 保留在葉模組，不從推薦入口再匯出。

**編譯器級全域降級 Flag 或私有型別增補包。** 否決：宣告合併會影響同一 TypeScript Program 中能夠到達該匯入的所有檔案；`private: true` 只阻止釋出。拆分測試編譯圖或增加策略檢查會增加設定維護成本，卻不能把降級限制在真正使用它的 Helper 中。區域性條件型別只弱化這些消費方的型別推斷。

**為每個名稱空間編寫方法清單和獨立 spy 別名的 Helper。** 否決：它們重複操作名稱和原生 mock 已經提供的控制功能。通用 Proxy 從生產名稱空間對映派生每個方法，fixture 擁有返回資料，而不再實作另一份領域寫入或釋出機制。

## 後果

spec 起的是真外掛：整個 `web` roster 冷啟動約五秒、熱啟動遠低於一秒，三行的錐每例約二十毫秒。斷言讀的是產品事實——真實的 section 清單、真實的宣告者、一次 Loader 重建、重連時的第二代 `$events`——並隨產品變化而變化。

代理跳過了生成用戶端的 zod 驗證、wire 欄位名對映與 scoped 身份注入；mock 規則讀位置 `args`，生成用戶端仍由建置產物 e2e 車道覆蓋。外掛新增啟動期呼叫時 `remoteDefaultResponses` 必須加一行，加之前會響亮失敗。`web` profile 的兩個 bundle 名在 `WEB_PROFILE_BUNDLES` 裡重複了一次，對應啟動器的 `PROFILE_TEMPLATES.web`，且兩者之間沒有機檢聯絡：用戶端測試程式不能 import `@deepseek-ai/dsh-app-boot`（其 Host `Context` 合併與 Client 的衝突），而測試執行時連測試也不引入 Host 依賴。範本變更因此要靠人工帶到這個常數。

共享函式讓生產和測試呼叫方使用同一份實作。`AppWebEntry.run()` 在立即層預取落定後掛載 Loader；應用 entry 仍在預取之後建立，因此讓 Loader 安裝與預取序列不會提前應用啟用。

原生流覆蓋可以返回自有 iterable，此時呼叫方負責消費與取消，這些 iterable 不參與腳本流日誌或控制。已登記的腳本仍使用受控佇列與取消機制。這一區分保留原生 mock 行為，無需再新增 iterator 包裝器或改變拉取時機。

## 遺留事項

本檔暴露出來、原樣保留的產品事實：

- 沒有任何 `declare module` 增強宣告 `Context.connection`；消費方一律 `ctx.get('connection') as ConnectionHandle`，`TestClient.connection` 是本檔提供的帶型別入口。
- `TestClient.start` 沒有頁面 URL 選項，需要 `connection` 外掛把頁面判為 off-loopback 的 spec 只能重配 vitest 掛在 `globalThis.jsdom` 上的 jsdom 實例，這是 jsdom 環境提供者的私有細節。
- `ISessions` 沒有 queue 觀察點，queue 幀只能直接經 `handleControlFrame` 到達 `Session`，而不是走 `session/control` 流。
- 同 seq 的 durable 事件二次推送在 `RemoteJournalStream` 尾部被當作重放丟棄，到不了 `SessionQueueMirror.acceptDurable`。
- vendored Loader 在模組 import 失敗時讓 `create()` reject，因此 `assertEntriesActive` 的 import 失敗分支經 `create()` 不可達。
- session-controller 用戶端把 `ctx.remote` cast 成 `SessionRemotes`；在用戶端測試程式裡這個 cast 是多餘的，因為生成的 `/remote` 合併在那裡可見。

## 測試

`packages/test-support/remote-mock/tests/` 覆蓋規則、流、日誌與載體面；`packages/test-support/client-runtime/tests/` 下的 `assembly-` 系列 spec 覆蓋在真 bundle 與臨時安裝上的 roster 讀取器、模組載入、含摺疊的代理、並行用戶端啟動、實例區域性的模組與 Connection 過載，以及 jsdom 與純 Node 下的 `TestClient`。`apps/web/tests/` 下歸應用所有的 built-client spec 注入一份新的 RemoteMock，並將有狀態情境資料留在這些 spec 旁邊。`packages/client/ui-settings-general/tests/` 下，shell 與 apply 兩條起整個 `web` roster；apply 從 mock 應答的 Host settings 文件讀它的中文文案，併為 off-loopback 分支重配 jsdom 頁面 URL。`packages/client/ui-message-feedback/tests/` 下，物件層 spec 直接傳入 RemoteMock 的 `messageFeedback` 名稱空間。`packages/api/session-controller/tests/` 下，Session、queue-store、pending-submission、projection tail-page、sessions-service 以及驗證流的 manager 案例啟動 Gateway 依賴錐；其餘 manager 案例與 projection-store 的 manager-routing 案例直接使用同一組逐測試 Remote fixture，不啟動用戶端；client-apply 則啟動外掛的依賴錐，把 Remote 事件作為 `$events` 上的 emit 幀投遞。`packages/api/workspace-controller/tests/` 下，transport 的 apply 案例起外掛錐、手工建構流與 controller 的案例起 gateway 錐，因為進了 roster 的外掛會共用 follow 端點。每個包在 `tests/remote/` 保有自己的預設回應與幀建構。fixture 測試包含預期的斷言失敗，並獨立觀察用戶端清理完成；settings 過載測試觀察註冊身份被替換，寫入測試斷言全部 mutation 參數。teardown 失敗測試先執行真實樹清理，再報告注入的失敗，並觀察 `$events` 流的取消狀態。
