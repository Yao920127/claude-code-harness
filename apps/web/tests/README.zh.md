# apps/web 瀏覽器 e2e

[English](README.md) | 中文

這些測試在程序內啟動真實的 web 組合，並用真實瀏覽器透過真實 HTTP 驅動它。Chromium 執行整個 lane；[模型與推理強度選擇情境](declared-reasoning.e2e.ts) 還在 WebKit 中執行，以覆蓋原生滑鼠焦點行為。該 lane 的執行機制——模式、fixture（測試前置資料）、golden，以及與 `dsh web` 之間刻意保留的組合差異——記錄在 [`scaffold.ts`](scaffold.ts) 和 [瀏覽器 e2e Agent Note](../../../.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.zh.md) 中。

安裝工作區依賴後，在儲存庫根目錄安裝瀏覽器及其系統依賴：

```sh
pnpm --filter @deepseek-ai/dsh-web-frontend exec playwright install --with-deps chromium webkit
```

在 Linux 上，`--with-deps` 會透過系統包管理器安裝依賴。持久化 CI VM 必須透過映像維護提供這些依賴，CI 只安裝瀏覽器程式，遵循[故障切換手冊](../../../.agents/notes/implemented/process/2026-07-26-ci-failover-runbook.zh.md)的要求。

普通情境以沒有已登記 Workspace 或 Session、但持久化標記記錄預設 Workspace 已被刪除的狀態啟動，使顯式資料夾選擇情境自行決定 cwd。`launchWebScaffold({ firstUse: true })` 保留初始化資格，供啟動情境使用。

## 完成狀態觀察

依賴狀態的案例使用 Workspace、接納、附件和模型流屏障，區分可見中間狀態與已完成操作。模型選擇器的持久化斷言等待預設設定儲存完成，不以選單關閉作為完成訊號。詳情關閉等待框架過渡結束；歸檔驗證為 seed Session 設定顯式標題，並跨過載跟蹤該身份。參見 [CI fixture 同步決策](../../../.agents/notes/implemented/testing/2026-09-08-ci-completion-observations.zh.md)。

顯式滾動使用 `support.ts` 的 `scrollIntoView`：舊元素脫離 DOM 時重新解析 locator，並在同一個瀏覽器任務中檢查連線狀態、執行原生滾動。各情境保留滾動後的可見性與幾何斷言。

## 這些是 Host 面的測試

它們在根 `tsconfig.host.json` 中做型別檢查，而不在 Client aggregate 中，因為它們直接讀取 Host 服務：`ctx.connection`、Host 側 `SessionStore` 與 `ctx.sessionProjectionCache`。執行時驅動瀏覽器並不使一個檔案成為 Client 程式的一部分——兩個 face 在相同的鍵上以不同服務合併 Cordis `Context`，因此單個程式無法同時看見兩者。把這些檔案挪進 Client aggregate 會讓每一處 Host 服務存取都無法編譯。

## 不要在此 import `@deepseek-ai/dsh-client-*`

import 一個 Client 包——無論值還是型別——都會把它整個 TypeScript 工程、以及它引用的每個工程拉進 **Host 建置圖**。這已經坑過本 lane 一次：四個 Client 消費方包引用了 `api/remotes` 的 Client face，而該 face 必須等 Host tsdown 生成 `@deepseek-ai/dsh-goal/remote` 之後才能編譯，於是 Host 建置階段變成在等一個由它自己產出的產物。

當某個情境需要 Client 持有的常數或純函式時，改為在此處映像一份，並緊挨著一條註解掉的 import 點明源模組。這樣漂移會表現為選擇器未命中或映像值陳舊——是響亮的失敗，絕不會是靜默透過。`scaffold.ts` 按此規則映像 welcome-notice 的 namespace、確認欄位、版本和被斷言的中文文案。

built-client harness 是例外。`assembled-boot.ts` import `AppWebEntry`、boot manifest（中繼資料清單）型別與 `RemoteMock`；`assembled-remote.ts` import Client test runtime 的預設回應與 `RemoteMock`。這些包是顯式的工程引用，用於透過測試持有的 carrier 啟動真實 shell。chat 情境仍在 `support.ts` 中映像 `conversationContextKey`，而不 import 其 Client owner。

沒有任何機制強制這條規則；靠 review 守住它。
