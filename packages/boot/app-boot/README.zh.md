---
description: "dsh profile 與臨時 Python SDK 執行時的共享 Loader 啟動支援：環境層、patch、診斷與設定預覽。"
kind: "package-library"
---

# @deepseek-ai/dsh-app-boot

[English](README.md) | 中文

## 概述

`dsh-app-boot` 是 `dsh` profile（包括 Python 執行時 wheel 包所含的 CLI（命令列介面））背後的共享 Loader 啟動庫。它載入環境層、組合 profile 組合包與 patch、啟動每個外掛，再返回執行中的應用，或指出失敗外掛與原因。產品應用使用 `dsh` launcher 而不釋出單獨 bin；直接設定 helper 只保留給低層嵌入方與測試。你還可以在啟動前預覽生效設定，按 profile 選擇即時或僅啟動時應用 patch，並讓持有終端的應用在致命退出前恢復終端。

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

用此包啟動應用是一個小而顯式的入口：你給它一個設定檔，它執行整個啟動過程。本節說明你能做什麼、能得到什麼；每個結果背後的 helper 呼叫記錄在下方可摺疊的實作章節中。

### 何時使用

在實作共享 `dsh` launcher 或嵌入其低層啟動 helper 時使用它。產品功能應放入 profile 組合包，而不是新增應用 bin；只向已執行應用新增外掛的程式碼直接掛載外掛即可。

### 啟動應用

你把設定檔交給入口，程序就會啟動整個應用：載入環境層、應用 patch 與 profile、啟動每個外掛，並在應用執行後返回。在回放模式下，它會啟動同級的 `cordis.snapshot.yml` 替代檔案，使已記錄的工作階段能夠原樣復現。最小的入口只需兩次呼叫：

```text
installFailLoud('dsh')
const ctx = await boot('dsh', resolveConfigPath(argv[2], process.env.DSH_SNAPSHOT))
```

`installFailLoud` 會為未處理 rejection 或未捕捉異常向 stderr 寫一條帶標籤的 `util.inspect` 診斷，在固定超時內等待介面的 release 掛鉤，然後以 1 退出；控制流不會回到失敗的操作，因為只有丟擲點知道哪些狀態仍然完整，事件迴圈只執行到 release 結束或超時。有了這個入口，啟動會保留所有能夠啟用的外掛。啟用但失敗的外掛會產生帶標籤的警告。required entry 失敗時，啟動會拆卸整個應用並以非零碼退出；profile 中不存在的 required id 和已停用的 required entry 不影響啟動。全域 required list 覆蓋共享 Agent 執行、應用 endpoint，以及 Web 啟動與傳輸：`agent-loop`、`webserver`、`modules`、`connection`、`headless-runner`、`acp` 和 `sdk-jsonrpc-server`。

<a id="profiles"></a>
### Profile

Profile 與組合包的宣告型別從 [`@deepseek-ai/dsh-package-manifest`](../../util/package-manifest/README.zh.md) 匯入。App-boot 將 `DshPackageManifest` 適應為包身份可選的 `ProfileManifest`，因為本地 profile 無需釋出版本。App-boot 負責 profile 載入、JSON 總和檢查碼解析後的執行時資料。

profile 是同一套 dsh 安裝提供不同應用介面的方式：`web`、`cch`、`headless`、`acp`、`sdk` 與 `sdk-minimal` 從同一 launcher 啟動不同組合；`cch` 組合 `CCH_PROFILE_BUNDLES`，Desktop profile 也使用這一列表。profile 位於 `$DSH_HOME/profiles/<name>`，由可安裝組合包和自身 `cordis.patch.yml` 組成。組合包的 `dsh.bundle.patch` 指定一個 patch 檔案或一個有序的檔案列表；`bundlePatchFiles` 驗證該宣告，`bundlePatchPaths` 把它解析為絕對路徑；該層按此順序拼接各檔案的 patch 列表。YAML 組合決定是否啟用 HMR。隨產品交付的 `web` 範本即時過載，其他隨附範本只在啟動時應用 patch。`sdk-minimal` 只列出自身的獨立組合包，其他範本保留 base 加模式的組合包棧。`dsh --profile <name> --from-default-profile <template>` 從一個隨附範本，在新的非內建名稱處建立自定義 profile；`dsh plugin` 則初始化以 base 為基礎的 profile，並管理其中安裝的組合包。組合包解析、manifest 讀取或 patch 載入失敗時會跳過該組合包，不改變其選擇狀態；載入結果在 `skippedBundles` 中列出每個被跳過的組合包，啟動器每次啟動時透過 `reportSkippedBundles` 輸出一次。其餘組合包保持原順序；profile 和使用者 patch 錯誤仍會導致啟動失敗。跳過組合包不保證剩餘組合能夠提供所需服務。由應用持有的 npm 專案（例如 Electron 保留的 Desktop profile）透過 `loadProfileDirectory` 載入已經初始化的目錄，而不會將它暴露給 CLI profile 查詢。

profile 匯入外掛前，DSH 會檢查其 `peerDependencies` 中對 `@deepseek-ai/dsh` 和 `@deepseek-ai/dsh-*` 的依賴，與 `getDshRuntimeVersion()` 返回的唯一執行時版本比較。每個宣告的版本範圍都必須匹配；預釋出版本參與範圍匹配。原始碼工作區的 `workspace:^`、`workspace:~` 和 `workspace:*` 指向同一個執行時。未宣告 DSH peer 時不施加版本約束；無效範圍視為不相容。這些檢查使用 peer 宣告，而不是 `engines.dsh`，也不是防範惡意包程式碼的沙箱。

檢查只發生在 DSH 自己持有的組合入口，改寫的是啟動器自己的那份組合：profile 的 patch 層、依賴清單與組合包列表都不會改變。`prepareProfilePatches` 在啟動器的空 profile 根之上組合，並在掛載根 Include 時以及每次 profile 重新組合時執行，因此被拒絕的外掛永遠不會匯入其模組；`prepareProfileEntries` 對 preset 行做同樣的事。被拒絕的普通行會變成遊離的 `disabled: true` 行；原生 group 保持掛載，其被拒絕的子行不會載入；若某個原生 Include 會到達被拒絕的外掛，則整體省略該 Include，因為它的檔案不會被改寫。被策略拒絕的行在 profile 中保留其設定的 `disabled` 值，每次拒絕都會報告包名、版本與風險。組合包本身不是行，因此 `loadProfileDirectory` 在啟動和每次重新組合載入 profile 的組合包層時，檢查每個組合包自己宣告的 DSH peer；沒有豁免的不相容組合包會像無法讀取的組合包一樣被跳過，並列入 `skippedBundles`。這些入口不覆蓋其他嵌入方透過自己的 `ctx.plugin` 呼叫掛載的外掛。工作階段中直接改檔案的兩類編輯只在下一次重新組合或啟動時才被判定：正在執行的外掛自己的 `package.json` peer 宣告，以及 Loader 自己讀取的入口清單檔案（如啟動器的根設定或巢狀的 `cordis:include` 檔案）。`--dump-config` 報告的是設定出的組合，因此被拒絕的外掛行仍會出現在其中，而被拒絕的組合包不提供任何行；`--dump-config-schema` 會匯入每個組合模組以讀取其 schema，請只對已經信任其外掛的 profile 執行。

精確版本豁免儲存在 profile 自己的 `compatibility.json` 中，而不是 `package.json`，因此寫豁免不會觸及依賴清單、組合包列表或 Cordis patch 檔案。它把精確的 `package-name@version` 鍵對映到精確 DSH 執行時版本列表；外掛升級和 DSH 升級都不繼承授權。檔案缺失表示沒有豁免。檔案損壞絕不會阻止 profile 啟動：讀取器接受的記錄仍然生效，每條被拒絕的記錄會與外掛拒絕資訊一起輸出到 stderr，此後該檔案被視為只讀，因此授予或撤銷會拒絕執行並要求使用者手工修復，而不是覆蓋使用者的內容。[外掛管理器](../plugin-manager/README.zh.md#version-compatibility-and-exemptions)負責每次變更所需的授權、撤銷與風險確認。

你的機器本地偏好同樣位於 harness home 中：

- **`.env`**——你的普通環境層：呼叫目錄的檔案優先於 harness home 的檔案，兩者都低於繼承環境。在檔案中設定的程序啟動變數（如 `PATH`、`DSH_*`、`XDG_*`）會被拒絕：請改為匯出這些變數。四個代理名（`HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY`）只從 harness home 的檔案接受，絕不從呼叫目錄的檔案接受——後者隨 clone 一起到來。對於只想載入某個目錄 `.env` 的非產品 bin，檔案缺失不影響啟動，檔案無法載入時輸出一行帶標籤的警告。
- **`cordis.patch.yml`**——你的 tweak 層，應用在所有組合包層之後（先應用逐 profile 的檔案，再應用 home 級檔案，因此後者優先順序更高）：替換某個條目的整個設定（重述你要保留的欄位）、插入新條目，或在啟動時插值 `!!js` 表示式。patch 指定的條目不存在時輸出 stderr 警告；空檔案或僅含註解的檔案會導致啟動失敗——如需停用該層，請改用 `[]`。

啟用的 `dsh-hmr` 外掛會監視 profile manifest 與兩份使用者 patch 檔案，重新讀取按順序排列的組合包層，並應用[過載失敗策略](#startup-and-reload-failures)。[DSH HMR](../hmr/README.zh.md) 將這些過載與[外掛管理器](../plugin-manager/README.zh.md)的設定寫入序列化；包操作在其佇列之外執行。啟動器不安裝 HMR 或監視器；HMR 被停用或不存在時，更改需要重新啟動。

插入條目的外掛名可以是絕對檔案系統路徑、檔案 URL 或包識別符號。patch 載入會把 `insert` 條目及其巢狀分組中的絕對路徑以及相對於 patch 檔案的 `./` 或 `../` 路徑轉換為檔案 URL；對已有條目名稱的斷言及替換用的 `config` 值保持原樣。

掛載 profile 條目前，`dsh` launcher 會從安裝依賴圖與有序 bundle 依賴圖計算一份不可變的 runtime resolution。普通 Node、打包可執行檔案與 Electron Host 等所有 profile 啟動器都使用 runtime 解析，將 runtime resolution 安裝到 Node 的 ESM 與 CommonJS 解析器中，不建立 fallback 連結。

`sanitizeProfile(binName, profileDir, bundles)` 提供檔案恢復，無需載入外掛或解析 patch。Desktop 在原生致命錯誤恢復中呼叫它。呼叫前必須停止 profile 並排除並行 profile 寫入。它將 profile 的 `cordis.patch.yml` 重新命名為帶唯一 `.bak-<timestamp>` 字尾的同目錄備份，並恢復呼叫方指定的 bundle 列表，保留已安裝檔和其他 manifest 欄位。時間戳為 Unix 毫秒數；同名備份已存在時追加序號（`-1`、`-2`、……），時間戳保持不變。回傳值為備份路徑；patch 不存在時返回 `undefined`，缺失的 profile 不會被建立。下次啟動的 profile 初始化會重新建立空 patch。home 級 patch 不變。無效 profile JSON 在修改前報錯；後續錯誤向呼叫方丟擲，保留已完成的修改供重試。

### 預覽生效設定

啟動前，你可以列印應用將掛載的確切設定：dump 會以 `!!js` 表示式原樣展示組合後的條目列表，並按註解分組標明每個原始檔及其 patch 層，輸出是一份可載入的 YAML 文件。未匹配到任何行的 patch 會連同其層標籤一起報告；設定缺失、無法解析或欄位無效都會使 dump 失敗。

### 檢查外掛設定 schema

`generateConfigSchema` 接收用於診斷的 bin 名稱、已準備好的磁碟 profile、有序 patch 列表和安裝錨點，返回 `ConfigSchemaDump`。App-boot 負責組合、執行時解析和收集診斷。呼叫方負責 profile 準備、home/argv 層選擇、程序流及退出策略。`createConfigProjector`、`isNativeConfigSchema` 與 `LOADER_EXPRESSION_SCHEMA` 供不經 profile 收集、只投影單個執行中外掛 Config 的呼叫方使用；投影后的取值位置會引用 `#/$defs/loaderExpression`，外層文件必須定義它。

生成的 JSON Schema 2020-12 描述組合後的 entry list，以 `$defs.patchList` 描述根樹 overlay，並從外掛 Config 圖投影共享定義。它包含停用項、原生 group 和字面量 YAML/JSON include；內建與規範原生包匯出按每棵樹的模組解析基準匹配，包括 profile 本地副本。不會根據 config 欄位猜測自定義承載外掛。include 缺失但有字面量 `initial` 條目時，只在記憶體中展開，不寫檔案。發現和投影診斷保留在 `x-cordis` 中，包括未知 Config 和部分約束。[CLI schema dump 參考](../../../apps/cli/reference/README.zh.md#config-schema-dump)負責說明輸出欄位和編輯語義。

投影器使用 Ajv 根據生成的 schema 檢查字面量預設值，以保留原生省略行為，不執行原生驗證器或 transform 回呼。正則相容性檢查、不支援的情況及遞迴預設值分析會產生顯式限制說明。不透明的輸入轉換和 lazy 中繼資料副作用會放寬驗證，而不是重放原生修改。非 JSON 預設值或展示註解會被省略並附上限制說明，不丟棄結構 schema；無法表示的預設值使省略接受性保持未知，必填欄位除外。這些依賴僅在收集執行時載入。匯入、Config getter 和 lazy builder 仍會執行可信程式碼；收集不是沙箱。profile 解析攔截不得重疊。收集器返回前釋放自己的攔截，而 Node 仍快取匯入的模組；執行時建立的外掛和 Agent preset 實例不在發現範圍內。

### 讀取外掛展示元資訊

使用 `readPluginMeta(specifier, parentURL)` 或 `ctx.pluginPackages.metaOf(specifier, parentURL)` 讀取已安裝檔的展示文字，無需匯入或啟用外掛。查詢使用完整包標識與呼叫方的解析基準，並遵循 Node exports。檔案路徑與檔案 URL 不解析資源，直接返回無元資訊。缺失的 locale 欄位退回到該地址下可存取的 `package.json`；格式錯誤的元資訊返回 `error` 診斷。結果保留翻譯，由 Client 選擇語言。即使 locale 文字完整，讀取器也會將 `package.json.icon` 載入為圖片 data URL；圖示出錯時，保留有效文字並附上診斷。作者格式見[外掛展示元資訊](../../../docs/cookbook/adding-a-package.zh.md#plugin-display-metadata)。

<a id="startup-and-reload-failures"></a>
### 啟動與過載失敗

profile 過載返回未變化的已有故障診斷，不讓無關修改因此失敗。新增未啟用條目、設定或 fiber 變化、診斷變化都會使過載失敗；被移除的 fiber 仍須完成釋放。顯式啟用的目標必須成功啟用，即使它的故障早於本次操作。成功過載在生命週期結束及診斷檢查透過後發出 `app-boot/config-reload`，包括未啟用 HMR 時的程式化更新。事件不攜帶 diff 或解析後的設定。 成功過載在生命週期結束及診斷檢查透過後返回；僅 volatile 的條目變化由 Loader 在更新過程中提交。

Loader 結算後，app-boot 在僅 optional 條目未啟用時輸出警告。如果已啟用的 required 條目無法啟用，`boot()` 會在釋放資源後以 `StartupError` 拒絕。獨立管理生命週期的 logger exporter 會保留非同步資源釋放期間的警告和錯誤記錄，並在 `boot()` 結算前釋放。其訊息分組列出所有失敗外掛和等待的服務，標記 required 條目，並保留原始堆疊、巢狀原因和聚合錯誤成員。CLI 僅輸出該訊息一次，並在儲存[完整啟動診斷](../../../apps/cli/reference/README.zh.md#startup-diagnostics)後以結束代碼 1 結束；其他異常保留正常堆疊輸出。表中的“終止啟動”指釋放已掛載外掛並以非零碼退出，不報告就緒；“繼續”指保留成功執行的外掛。後續設定 HMR 不會再次執行 required 啟動審計，也不會復原整個更新。

| 失敗模式 | Optional 條目啟動時 | Required 條目啟動時 | 後續設定 HMR |
|---|---|---|---|
| 根設定或必需 overlay 缺失、不可讀、格式錯誤，或包含無效條目 | 終止啟動 | 終止啟動 | 拒絕格式錯誤或無效的即時 patch，不改變執行中的設定；有效修改可以應用 |
| 模組 import 失敗或模組求值丟擲異常 | 警告；繼續 | 終止啟動 | 報告錯誤；保留成功的兄弟外掛；修正 import 後可以啟用 |
| 外掛設定 schema 驗證失敗 | 警告；繼續 | 終止啟動 | 新條目保持未啟用；現有條目保留原實例與設定；有效修正可以應用 |
| 設定 `!!js` 求值丟擲異常 | 警告；繼續 | 終止啟動 | 報告錯誤；保留成功的兄弟外掛；有效修正後可以啟用 |
| `disabled: !!js` 求值丟擲異常 | 警告；繼續 | 終止啟動 | 報告求值錯誤，不將條目當作已停用；有效修正後可以啟用 |
| 同步 `apply()` throw | 警告；繼續 | 終止啟動 | 報告錯誤；保留成功的兄弟外掛；修正設定後可以啟用 |
| 非同步 `apply()` throw | 結算後警告；繼續 | 結算後終止啟動 | 結算後報告錯誤；保留成功的兄弟外掛；修正設定後可以啟用 |
| 注入的服務不可用 | 警告；繼續，條目等待依賴 | 終止啟動 | 條目繼續等待；補上缺失的提供者後可以啟用 |
| HTTP 埠繫結失敗 | 警告；繼續，但該端點不可用 | 終止啟動 | 程序繼續執行，但失敗的端點不可用；修正設定後可以恢復 |
| 脫離 `apply()` 返回 Promise 的非同步任務產生未處理 rejection | 致命錯誤：釋放應用並以非零碼退出 | 致命錯誤：釋放應用並以非零碼退出 | 致命錯誤：釋放應用並以非零碼退出，與條目 id 無關 |
| 同步回呼（流的 `'data'` 監聽器、定時器）在程序生命週期任一時刻丟擲未捕捉異常 | 致命錯誤：釋放應用並以非零碼退出；失敗的操作不會被恢復 | 致命錯誤：釋放應用並以非零碼退出；失敗的操作不會被恢復 | 致命錯誤：釋放應用並以非零碼退出，與條目 id 無關 |
| 條目缺失或被顯式停用 | 忽略 | 忽略 | 不啟用該條目；不執行 required 啟動審計 |

上面的 required 列表包含 `modules` 與 `connection`；只要其中一個已啟用條目失敗，Web 就無法成功啟動。Optional 提供者失敗也可能使 required 消費方無法啟用。現有條目的新設定在更新前被 schema 驗證拒絕，並不等於對兄弟外掛的變更做事務復原。

[Web 程序矩陣](../../../apps/cli/tests/profiles/web/tests/web-failure-matrix.expected.e2e.ts)和[啟動驗收測試](../../../apps/cli/tests/profiles/web/tests/web-best-effort-startup.expected.e2e.ts)透過隨附 Web profile 驗證這些結果；[app-boot 測試](tests/app-boot.spec.ts)還覆蓋根 Include 失敗。

如果你的應用持有終端，它可以在程序退出前把終端交還，你的 shell 絕不會殘留在 raw 模式。交還過程有界：卡住的清理只會延遲致命退出，而不會取消它。

### 告訴 agent（智慧代理）harness 所在位置

當你的應用啟動模型驅動的 agent 時，你可以告訴 agent DSH 實作程式碼 checkout 的位置：它得知該路徑，也知道不得據此推斷工作目錄——它應使用 `pwd`。這條指示在系統提示詞靠前位置出現一次。沒有系統提示詞服務的應用會跳過；開發環境中，重新載入系統提示詞後它會消失，直至下次啟動。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋上述結果如何實作，並指出實作它們的程式碼位置；這裡的內容面向開發者，使用本包並不需要。

### 設計說明

- **執行時版本。** `getDshRuntimeVersion()` 透過檔案系統路徑讀取本包清單，也支援可執行檔案內的虛擬檔案系統；版本缺失或無效時會失敗，而不會繞過相容性檢查。
- **Profile 啟動資料。** `ctx.profileContext` 只包含 profile 位置、啟動時組合包名稱、已解析的呼叫級 overlay 與遙測退出值。`readProfilePatches()` 組合傳入的啟動 profile，或讀取這些位置上的目前檔案；呼叫方負責排程和應用結果。
- **程序內模組解析。** launcher 在掛載 profile 條目前，將 runtime resolution 安裝到 Node 的 ESM 與 CommonJS 內部 resolver。exports、conditions、子路徑、模組快取和錯誤碼仍由 Node 負責；路由後的 ESM 失敗報告原始 importer。顯式 CommonJS `paths` 始終保留原生查詢，包括指向 profile 內的路徑。
- **連結目錄。** profile 連結到樹外目錄時，其下的 importer 參與逐層 peer 查詢，即使目標沒有自身的 `package.json`。在每個 `D/node_modules` 位置，目前 `D/package.json` 的 peer 包名若存在於執行時表，就使用執行時包；其他包名查詢物理候選。更近的物理包先於後續 peer 宣告，peer 位置無需物理 `node_modules`。installation 作用域包目錄不參與 linked 攔截，重疊 root 不改變 importer 的查詢順序（[規則](../../../.agents/notes/implemented/architecture/2026-09-19-profile-resolution-lookup-order.zh.md)）。
- **包中繼資料。** `ctx.pluginPackages.packageOf` 定位所屬包，不載入程式碼，也不要求匯出 `package.json`；子路徑選擇其所屬包，不驗證該檔案。安裝 runtime resolution 後，即使查詢未命中也以其選包規則為準。僅安裝服務而不提供 runtime resolution 的底層嵌入方保留原生查詢。展示中繼資料使用上文另述的入口感知讀取器。
- **兩個 Loader builtin。** `mountRootInclude` 把 `cordis:include` 與 `cordis:group` 註冊為 Loader builtin：group 行能把一個提供者與它的消費方放進同一個 `isolate` realm，而位於本工作區之外的 agent preset 無法按名稱解析 `@deepseek-ai/cordis-plugin-group`。兩者都透過主機的模組管線載入，而非被包含樹自身的說明符解析。
- **由 consumer 持有嚴格語義。** 普通 Loader group 保留成功 sibling。App-boot 在首次結算後應用全域 required-entry policy；agent preset 與動態多 entry 組合在需要 all-or-nothing setup 時，持有並拆卸各自的獨立 Loader 子樹。App-boot 讀取 failed fiber 來報告已記錄的錯誤，並在一個程序檢查點內合併 Loader 重複的 rejection 通知。
- **唯一 runtime resolution。** 安裝優先、有序 bundle 逐根 breadth-first 遍歷生成執行時表。runtime 解析不建立連結；runtime resolution 條目佔據 `$DSH_HOME/profiles/node_modules` 上各自的包名位置，其餘包名把該目錄當作普通祖先。profile 載入時刪除 Link 後端釋出版寫進 profile 的 `.dsh-module-fallback` 投影；pnpm 安裝的包保留。package `imports` 選中的外部 bare target 使用相同的選包順序，對映、conditions 和精確 target 解析仍由 Node 負責。完整後繼 runtime resolution 可以在既有包對映和本地包名約束內原子增加 package name、更新 linked root 集合。
- **移除連結攔截。** 後繼 generation 可以移除 linked root，無需重新啟動。目錄不再被任何剩餘 root 覆蓋時，後續請求使用原生查詢，可能找到開發副本，也可能報告缺包。已有模組引用和 Node 快取保持不變。同名、同目標可以重新加入；曾釋出的名稱改指向不同目標時，即使中間移除過也會被拒絕（[generation 規則](../../../.agents/notes/implemented/architecture/2026-09-09-profile-resolution-generations.zh.md#immutable-generations)）。
- **應用自有 profile。** 應用自有 profile 使用相同的 runtime resolution。目標位於目前 profile 目錄內的連結（包括 pnpm store 連結）不算外部 root，即使 profile 位於共享 profiles 樹外。解析過程不修改其 `node_modules`；已安裝檔由 pnpm 管理。
- **自有 Worker。** Worker 建置 banner 會在業務 bundle 前匯入 `@deepseek-ai/dsh-app-boot/worker/profile-resolution-bootstrap`。每個 Worker 在自己的 isolate 中安裝結構化克隆的 runtime resolution。bootstrap bundle 不靜態匯入任何包。原始碼 Worker 入口保留自包含依賴，第三方 Worker 不接受注入。
- **更新完成。** App boot 透過 `internal/update` waterfall 觀察重新啟動失敗。即時 patch 過載在檢查啟用狀態前等待設定樹中的 fiber；單獨呼叫 `Fiber.update()` 或 `Entry.update()` 不能確定重新啟動成功。
- **單一 rejection 檢查點。** `inactiveEntries` 把折入啟動診斷的確切原因保持到下一個程序級 rejection 檢查點可見，使 `installFailLoud` 能合併 Loader 的重複通知，而所有無關的未處理 rejection 仍然致命。
- **兩階段失敗標籤。** 除啟動審計失敗外，`boot()` 區分 `host preparation failed`（`prepare` 在任何設定樹條目掛載前丟擲）與 `plugin tree failed to load`，並追加最深層外掛錯誤的堆疊。外掛診斷保留巢狀原因和聚合錯誤中的各項失敗；原因鏈出現迴圈時會停止遍歷，但不會替換原始錯誤。

啟動錯誤還保留未啟用條目的中繼資料和原始啟動警告、錯誤記錄，不保留 Loader tree。其 `entries` 和 `startup` 欄位不可列舉：直接存取和完整診斷報告保留這些欄位，常規錯誤檢查輸出則省略它們。只有等待條目時沒有 `cause`；存在已記錄錯誤時，`AggregateError` 保留其原始值。收集器在 Loader 掛載前透過 logger 收集匯入錯誤，因為這些匯入尚無 failed Fiber。啟動結算後會移除臨時 exporter。

### Helper 行為

每個匯出各負責啟動的一個階段：設定解析與快照回放、分層環境載入、明確報錯的保護機制、啟用審計、patch 解析、根 include 掛載、設定 dump 渲染、profile 組合，以及 harness 原始碼段落。各匯出的約定在程式碼中，不在本 README——見 [`src/index.ts`](src/index.ts) 與 [`src/profile.ts`](src/profile.ts)。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 啟動 helper：設定解析、環境載入、會明確報錯的保護機制、啟用審計、patch 解析、設定 dump、harness 原始碼段落 |
| [`src/profile.ts`](src/profile.ts) | profile 發現、初始化、組合包解析、runtime resolution 建構 |
| [`src/profile-plugins.ts`](src/profile-plugins.ts) | 已安裝依賴、bundle 啟用策略與 manifest 更新 |
| [`src/profile-sanitize.ts`](src/profile-sanitize.ts) | profile patch 備份與恢復 bundle 啟用狀態 |
| [`src/config-schema/`](src/config-schema/) | Profile schema 生成、發現、原生投影與結果型別 |
| [`src/profile-resolution/`](src/profile-resolution/) | 執行時 resolver、package metadata 服務與建置後 Worker bootstrap |
| — | 不釋出執行時不變式伴生入口；每個 runtime resolution 只有一個攔截所有。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享啟動機制逐步進入組合模型及其背後的決策證據。

- [Cordis 入門](../../../docs/cordis-primer.zh.md)——Loader、`!!js` 設定表示式，以及 include/group 語義。
- [dsh 應用](../../../apps/cli/README.zh.md)——消費這些 helper 的 `dsh` bin。
- [dsh-cmdline](../cmdline/README.zh.md)——各 bin 使用的啟動器到應用命令列交接。
- [Profile 組合包](../../bundle/README.zh.md)——組合進 `dsh --profile` 的可安裝 patch 層。
- [dsh-home-paths](../../util/home-paths/README.zh.md)——harness home 解析器（`resolveDshHome`）。
- [設定來源歸屬](../../../.agents/notes/implemented/architecture/2026-08-04-configuration-source-ownership.zh.md)——被發現的檔案為何不得決定 bootstrap 行為。
- [Profile 外掛組合包](../../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.zh.md)——profile 與組合包組合設計。
- [使用者 patch HMR 測試](../../../.agents/notes/implemented/testing/2026-09-09-user-patch-hmr-test-delivery.zh.md)——即時 patch 行為與原生檔案系統投遞的驗證歸屬。

-----

<a id="model-experience"></a>
## 模型體驗

模型透過此包載入的外掛樹間接受影響——只有該樹貢獻模型上下文；唯一貢獻模型可見文字的匯出 `addHarnessSourceSection`，也只有在消費方啟動後呼叫它時才會產生影響。

#### KV Cache 影響

啟動本身不改變請求字首。`addHarnessSourceSection` 將原始碼路徑放在第一方可複用指令之後，因此工具與設定一致時，不同 checkout 不會改變前置位元組。不保證提供者複用快取。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明此啟動庫在何時不合適，或何時需要特別注意。它們是目前包約束，不是任務積壓。

- **執行時解析依賴 Node 內部機制**——受支援的 Node 版本需要 native builtin access addon 和可執行相容驗證。只有建置後的 Harness 自有 Worker 接收 runtime resolution bootstrap；第三方 Worker 與自定義 `vm` linker 保持原生解析。
- **重新連結 profile 包需要重新啟動**——Node 快取真實路徑，因此改變 profile 連結或依賴連結的目標需要重新啟動程序。
- **連結作用域以記錄的真實目錄為準**——提升後的依賴若在所有 linked root 之外，就使用原生 Node。每次讀取 peer 都不會使 Node 快取失效，也不會改變被監視的檔案。
- **原始碼啟動只安裝 ESM 掛鉤**——CommonJS 請求仍需要 package exports 選中的 JavaScript 檔案，解析器不會補出缺失的建置產物。
- **快照回放替換僅識別特定 basename**——只有以 `cordis.yml` 或 `cordis.yaml` 結尾的設定會對映到同級 `cordis.snapshot.yml`；自定義設定名稱需要呼叫方自行選擇。
- **環境發現以啟動為界**——`loadLayeredEnv` 只讀取一次呼叫目錄與 harness home 中的 `.env`；它不搜尋父目錄，也不跟隨之後選擇的 workspace。`loadEnv` 仍是非產品 bin 使用的單目錄 helper。
- **使用者 patch 會替換匹配到的整個設定**——按 id 定位的 patch 不做深度合併，因此 profile 覆蓋必須重述需要保留的組合包欄位。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 待定：YAML 設定 dump 穩定性

`renderConfigDump` 的輸出是一份可載入的 YAML 文件，其 `# ==` 來源註解與 `!!js` 原樣渲染服務於 `--dump-config` 診斷。任何內容都不承諾跨包版本的位元組穩定性；在程式化消費該輸出之前，請決定 dump 是否成為序列化約定。JSON Schema 輸出遵循單獨的 [pre-stable 相容性規則](../../../apps/cli/reference/README.zh.md#config-schema-dump)。

</details>
