# Agent Note: 外掛安裝的註冊表

Status: implemented

[English](2026-09-18-plugin-install-registries.md) | 中文

## Problem

安裝對話方塊把 spec 交給 `pnpm add` 時不指定註冊表，pnpm 就從它自身設定指定的地方解析包；對於從未寫過 `.npmrc` 的人，那就是 `registry.npmjs.org`。在連不上它的網路裡，每次安裝都在 pnpm 自身重試之後以網路錯誤告終——對不應答的註冊表，這要一分多鐘；安裝前的檢查也以同樣方式失敗，而沒有任何地方提供映像。映像是中國大陸的常規答案，但 pnpm 的 `--registry` 是對話方塊傳不了的命令列參數，而 `.npmrc` 不是對話方塊的受眾會去編輯的東西。

## Decision

**管理器詢問的是一個註冊表計劃，不是一個註冊表。** `PluginManager.Config` 新增 `registry`——首先詢問的註冊表（預設為 `null`，即 pnpm 自身設定指定的那個）和 `fallbackRegistries`——隨後依次詢問的註冊表，預設為 npmmirror。`registryPlan` 解出一次操作的計劃：請求的註冊表，否則設定的第一個，然後是設定集合中的其餘。請求的註冊表不在這個集合裡時只問它自己：私有源永遠不會落到公共源，否則兩邊都有的名字會裝上別人的包。註冊表按 pnpm 的形式比較：小寫主機名加尾部斜槓。

**pnpm 自身的註冊表只有讀出來是公共的才算公共。** `null` 指向本機 `.npmrc` 鏈說的任何地方，可能是公司註冊表。每次做計劃前管理器在 profile 目錄裡用 `pnpm config get registry` 讀出它，只有它是 npm 官方源或某個設定的備選源時 `null` 才進入設定集合；否則不論以 `null` 還是以它的 URL 請求都只問它自己，改問公共源時也絕不回落到它。pnpm 已經指向的註冊表只問一次而不是兩次。讀取失敗時保守處理：讀不出來就讓 `null` 只問自己。`registries()` 把讀出的結果作為 `resolved` 返回，所以 pnpm 指向的不是 npm 官方源時，對話方塊按其主機名標註該選項。

**只有換一個註冊表能改變的失敗才讓操作繼續。** `attributeFailure` 把 `network`、`timeout` 歸於註冊表，把 `not-found`、`no-matching-version` 也歸於註冊表，因為映像落後於它複製的註冊表，幾分鐘前剛釋出的包還沒到那裡；其他種類立即停止。git spec 和 tarball URL 攜帶 pnpm 拉取它們的 `host`，沒有註冊表能替代它：錯誤行點名那臺主機的失敗歸於 spec 自身主機並停止，而點名註冊表（spec 的依賴來自那裡）的失敗則繼續；僅僅連結到該主機的警告行不算。歸因以 `ChangeResult.failedAt` 交給呼叫方，所以對話方塊按 Host 的判斷而不是自己的猜測來措辭並決定是否提供換源。分類器新增 npm 的 `FETCH_ERROR` 作為網路失敗；pnpm 的 `ERR_PNPM_NO_OFFLINE_META` 是離線快取缺失，換註冊表改變不了，保持未分類。

**檢查決定哪個註冊表活著；安裝從那裡開始。** `inspect` 以 `--registry` 和 `--config.fetch-retries=0` 執行 `pnpm view`，所以不應答的註冊表會在 `inspectTimeoutMs` 內報告——pnpm 自身的節奏是重試之間先等十秒再等一分鐘——然後詢問下一個；在這個上限被殺掉的查詢與連線被拒一樣作為 `network` 問題拒絕。pnpm 把 `--json` 的拒絕以 `{ error: { code, message } }` 列印在 stdout 而 stderr 為空，所以分類器兩者都讀。透過的答覆帶上作答的 `registry`；用戶端把它傳給 `installBundle`，安裝從那裡開始，而不是從檢查已經發現死掉的註冊表開始。安裝保留 pnpm 的重試設定：它要下載 tarball，更短的超時會在慢但可用的網路上掐斷下載，且它只在執行中途失敗時才轉問下一個註冊表。為此不寫 `pnpm-workspace.yaml`：那裡的 `fetchRetries` 與 `fetchTimeout` 會同時約束安裝的下載和檢查，而命令列傳入的 `--config.fetch-timeout` 會讓 pnpm 11.8 崩潰，因為它被當作字串讀取。

**每次嘗試都可見。** `installBundle` 每問一個註冊表通告一次 `installing`，帶上這次的註冊表、序號和計劃長度，兩次嘗試之間恢復 profile 檔案，並在使用者已經取消時不再以失效的訊號啟動下一次執行，每次執行以自己的 job id 流式輸出且命令列帶 `--registry`，並在最後一次執行的結果旁報告問過的 `registries`。被拒絕的檢查同樣列出它問過的 `registries`。對話方塊提供設定集合、pnpm 自身的註冊表（標題帶上它指向的主機名）和手動輸入的地址，在瀏覽器 `localStorage` 記住選擇之前從 Host 首先詢問的註冊表開始，在 Host 轉問時說明現在問的是哪個註冊表，給每次執行標上註冊表，所有註冊表都連不上時逐一列出，而 Host 把失敗歸於 spec 自身主機時則點名那臺主機。它不描述計劃：詢問順序是 Host 的，發生時才顯示。手動輸入的地址用 Host 驗證所用的同一個 `REGISTRY_URL` 檢查，該常數經包的 `./registry` 入口釋出給瀏覽器。

## Alternatives considered

**把所選註冊表寫進 profile 的 `.npmrc` 或 `pnpm-workspace.yaml`。** 否決：這個選擇屬於一次安裝，不屬於 profile 裡之後的每條 pnpm 命令，而 pnpm 每次執行都讀的檔案得在每次嘗試前後改寫再恢復。

**把上次選擇存進 Host 設定。** 暫時否決：一個設定名稱空間、它的控制器寫入路徑和目錄條目換來的是跨瀏覽器並與 CLI 共享的選擇，而 `dsh plugin add --registry` 已經在命令列接受它；對話方塊的選擇顯式傳給每次呼叫，Host 不為它儲存狀態，由瀏覽器記住。

**任何失敗都換遍所有註冊表。** 否決：被攔下的建置腳本、寫滿的磁碟、不宣告組合包的包在哪裡都同樣失敗，連不上的 git 主機經由任何註冊表也連不上；重試這些只讓人白等，還掩蓋原因。

**私有源之後落到公共源。** 否決：依賴混淆。私有源提供而公共源也有的名字，會在私有源宕機時裝上公共源的包。這對本機 `.npmrc` 指定的私有源和對話方塊裡手填的私有源同樣成立，所以 pnpm 自身的註冊表要先讀出來才可能進入計劃。

**不讀取就把 pnpm 自身的註冊表當作公共源。** 否決：那樣出廠設定會把每個 `.npmrc` 設定了公司註冊表的使用者的失敗轉到 npmmirror。讀取的代價是每次計劃一個 `pnpm config get registry` 程序，約 170 ms。

**讓對話方塊描述計劃。** 否決：成員規則的副本立刻就漂移了——手填沒有尾斜槓的映像 URL 在對話方塊裡讀作單獨的註冊表，而 Host 歸一化後把它併入集合——而且選項下方一句關於備選的說明對正在選源的人只是噪音。對話方塊只在 Host 詢問時按實際順序顯示。

**像檢查一樣限制安裝的請求。** 否決：檢查只發一個小請求，它的存活答覆正是計劃所需；安裝在慢但可用的連線上下載 tarball 需要 pnpm 的預設值，而安裝從檢查發現活著的註冊表開始。

## Consequences

`Config` 新增 `registry` 與 `fallbackRegistries`；`inspect` 在 signal 之前接受 `InspectOptions`，並答覆作答的註冊表、spec 自身的主機和拒絕時問過的註冊表；`InstallBundleOptions`、`ChangeResult`（含 `registries` 與 `failedAt`）、`PluginInstallProgress` 和 `plugin_manager` 工具攜帶註冊表；`registries()` 加入 Remote 並答覆 `resolved`。`viewProfilePackage` 接受 `registry` 且從不讓 pnpm 重試；`readProfileRegistry` 向 pnpm 詢問其設定指向哪裡。包把 `./registry`——`registryPlan`、`normalizeRegistry`、`REGISTRY_URL`——作為瀏覽器安全的入口釋出，用戶端 bundle 內聯它；對話方塊使用 `REGISTRY_URL`。每次計劃花費一個 pnpm 程序做讀取；pnpm 讀不出來的機器沒有備選。

## Testing

`packages/boot/plugin-manager/tests/registry.spec.ts` 釘住計劃（含私有與未知的 pnpm 註冊表）與歸因；`install-spec.spec.ts` 釘住各 spec 形式攜帶的主機和分類器的模式；`manager.spec.ts` 從檢查和安裝依次詢問註冊表、讀取列印在 stdout 的拒絕、在嘗試之間恢復檔案、在 git 主機和設定集合之外的註冊表處停下、把兩次嘗試之間的取消報告為已取消，並在載入時拒絕不是 http(s) URL 的註冊表；`operations.spec.ts` 釘住查詢的參數和 pnpm 註冊表的讀取。`packages/client/ui-plugin-manager/tests` 覆蓋 store 的選擇、跨控制器的記憶、Host 通告的嘗試、帶著展開選項回到 spec，以及頁面的選擇器、嘗試文案、執行標記和失敗句子。
