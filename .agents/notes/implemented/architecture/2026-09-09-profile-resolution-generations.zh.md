# Agent Note: 增加不可變 profile 解析代際

Status: implemented

[English](2026-09-09-profile-resolution-generations.md) | 中文

## Problem

profile 從自己的包專案載入外掛設定項，而 Harness 包和所選 bundle 攜帶的包可能位於該專案普通依賴樹之外。透過共享 symlink、profile 自有連結或打包可執行檔案的代理包連線兩棵依賴樹，會讓選包結果跨程序和安裝版本持續存在。這些檔案需要協調和鎖來維護，並向中繼資料讀取方暴露生成的代理 manifest（中繼資料清單），也無法原子表示程序內變更。

執行時設計保留安裝優先、有序 bundle 和本地包優先於 fallback 的順序。它覆蓋外掛模組內部的 import 以及 Loader 設定項的 import，並在主執行緒和 Harness 自有 Worker 中工作。generation 替換保留既有包對映和本地包名，允許調整 linked root 集合，不會逐項修改正在使用的表。

## Decision

profile 啟動生成一個不可變 `RuntimeResolution`，並將其安裝到 Node 的 ESM 與 CommonJS 解析器。runtime 是唯一的解析後端，不提供模式選擇器或磁碟物化器。`PluginPackages.replace()` 透過一次引用替換髮布完整的後繼 generation。

### 唯一選包演算法

包遍歷屬於 `@deepseek-ai/dsh-app-boot`，與 profile 載入程式碼放在一起。普通 Node、原始碼啟動、打包可執行檔案和 Electron Host 消費相同的 runtime resolution 與攔截。

安裝 manifest 是第一個根。它按 BFS 依次遍歷 `dependencies` 和 `peerDependencies`，每條邊從宣告它的 manifest 解析，同名包由第一次找到的已安裝檔佔有。所選 bundle 隨後按 profile 順序逐根遍歷；每個較早根的完整依賴圖優先於所有較晚根。安裝閉包中的名稱被保留，bundle 包根本身不成為外掛 fallback。已宣告但未安裝的包會被跳過。

依賴展開時，每個安裝根、所選 bundle 根和遞迴依賴 manifest 都以所屬包的真實目錄作為查詢錨點。因此，祖先 `node_modules` 查詢沿 Node 通常執行該包的位置進行，而不是沿指向該包的軟連結位置進行。同一宣告錨點會被記錄下來，供執行時委託解析使用。邏輯路徑與真實路徑的祖先不同時，這可能改變所選版本，也可能使原本能發現的依賴不再被收錄；它不只是對已存路徑換一種寫法。

profile 本地和外掛私有 `node_modules` 條目優先於 runtime resolution 條目。runtime resolution 記錄已安裝的 profile 直接包名，用於無 I/O 的原生快速分流。每個條目記錄包名、版本、選定的查詢目錄、宣告該邊的 manifest 錨點和作用域，供原生解析與後繼 generation 驗證使用。

對於 profile 無法透過自身祖先目錄找到的依賴，runtime resolution 的 profile 作用域條目仍然必要。它們將已安裝 manifest 中的依賴展開到目前 profile 的 runtime resolution，而不是為每個外掛建立獨立依賴圖。它既不下載包，也不掃描原始碼 import。執行時掛鉤在考慮原生本地候選後使用這張表。

### 普通安裝與軟連結範例

下面兩種佈局中，profile 都選中 `my-bundle`，其 manifest 宣告 `bridge`；只有 `bridge` 宣告 `leaf`。安裝檔集合和 profile 的直接包都不提供 `leaf`，`bridge` 也沒有私有 `node_modules/leaf`。這些路徑示意了[共享 CLI（命令列介面）profile 測試](../../../../apps/cli/tests/profiles/headless/tests/profile-resolution.ts)覆蓋的兩種佈局。

普通安裝目錄中，`bridge` 向上查詢所屬 bundle 的 `node_modules`，找到版本 1.0.0。另一個版本 2.0.0 不在這條查詢路徑上：

```text
/case/home/profiles/headless/node_modules/my-bundle/
  node_modules/bridge/
  node_modules/leaf/                                  # 1.0.0
/case/dependencies/node_modules/leaf/                 # 2.0.0
```

bundle 採用 npm-link 風格連結，且其傳遞依賴也被軟連結時，bundle 從 `/case/work/my-bundle` 展開，下一層依賴則從 `/case/dependencies/bridge` 開始展開。該次展開找到真實包旁邊的版本 2.0.0：

```text
/case/home/profiles/headless/node_modules/my-bundle -> /case/npm-global/node_modules/my-bundle
/case/npm-global/node_modules/my-bundle -> /case/work/my-bundle
/case/work/my-bundle/node_modules/bridge -> /case/dependencies/bridge
/case/work/my-bundle/node_modules/leaf/                # 1.0.0
/case/dependencies/node_modules/leaf/                 # 2.0.0
```

| Profile 包佈局 | 解析 `leaf` 時使用的宣告目錄 | `tsx/esm` 原始碼啟動 | 普通 Node `lib` 啟動 |
|---|---|---|---|
| 普通目錄 | `/case/home/profiles/headless/node_modules/my-bundle/node_modules/bridge` | 1.0.0 | 1.0.0 |
| bundle 與 bridge 均為軟連結 | `/case/dependencies/bridge` | 2.0.0 | 2.0.0 |

ESM `import` 和 CommonJS `require` 都選中這些版本。在每種模組格式內部，透過 profile fallback 匯入 `leaf` 與在 `bridge` 內部匯入它，會得到同一個模組實例。優先順序更高的原生 profile 包，或安裝集合已保留的同名 fallback，仍按選包規則優先；fallback 不會強制所有匯入方都使用版本 2.0.0。

### 原始碼與建置產物的模組身份

[原始碼啟動器](2026-07-29-dsh-source-launch-tsx-esm.zh.md)使用 tsx 的 ESM-only 掛鉤。匯入方 URL 含有 `/node_modules/` 時，tsx 會跳過 tsconfig `paths`。因此，把 workspace 軟連結的邏輯路徑用作 fallback 宣告錨點，可能選中建置後的 `lib/` 匯出，而這些模組在真實 workspace 路徑中發起的 import 又透過 paths 對映選中 `src/`。真實宣告錨點讓 workspace import 一致遵循原始碼對映；沒有匹配 workspace 對映的包仍使用普通包匯出解析。

例如，`@deepseek-ai/dsh-tools` 使用 `Symbol()` 建立 scheduler 鍵。從 `lib/` 載入的 Tools 實例，無法透過另一個 `src/` 模組實例匯入的鍵暴露該 scheduler。原始碼啟動讓 Tools 與 AgentLoop 都位於 `src/`；普通 Node 啟動讓兩者都位於 `lib/`。scheduler 保留模組本地的 Symbol；正確的 import 共享同一個模組實例。

原始碼啟動器不安裝 CommonJS TypeScript 掛鉤。`createRequire().resolve()` 仍選擇包釋出的 JavaScript 入口，並要求該檔案存在。因此，原始碼模式的解析測試使用 fixture 提供的 CommonJS 檔案，真實安裝檔的 CommonJS 入口檢查則在建置產物存在時執行。

<a id="immutable-generations"></a>
### 不可變 generation

一個 runtime interception 持有一個 `current` generation。每個同步 resolve 在入口只捕捉一次該引用，完整呼叫只讀該引用。generation 建構在釋出前讀取依賴圖所需的全部 manifest；失敗時目前 generation 不變。釋出成功只替換一個引用，執行中的呼叫可以繼續使用它已捕捉的 generation。

選包快取和包中繼資料快取歸 generation 所有。釋出下一代後，舊 generation 在呼叫方退出後自然不可達，不逐項清理快取。profile importer 的命中和原生解析成功結果可以快取，但 generation 未命中會重新掃描，因此未命中後安裝的 profile 本地包會透過原生查詢變為可見。linked importer 的路由不快取，每次解析讀取所存取祖先位置目前的 peer 宣告。顯式 CommonJS paths 完全繞過攔截，非預設 conditions 不復用預設解析快取。

linked root 集合在一個 generation 內不可變。後繼 generation 可以增加或移除 root，無需重新啟動程序。目錄不再被任何剩餘 root 覆蓋時，該目錄後續的解析使用原生 Node 查詢，包括已載入模組發起的新請求。請求可能因此選中開發副本，也可能因缺包而失敗。移除攔截不會解除安裝模組、替換已有引用或清空 Node 自身的快取。

解析器在自身生命週期內保留每個已成功釋出的 link 名稱對應的真實目標，僅用於驗證後繼 generation。移除 root 不會抹掉該記錄，也不會讓其目錄繼續被攔截。同名、同目標可以重新加入；不同目標會被拒絕，因為 Node 快取真實路徑。釋出失敗時，目前 generation 和已記錄目標均不變。

launcher 只建構啟動 generation。服務接受完整的後繼 generation，但本實作沒有包管理器事務呼叫替換操作。

### ESM 與 CommonJS 共用規則

resolver 使用 `node-addon-require-builtin` 讀取 `internal/modules/esm/loader` 和 `internal/modules/cjs/loader`。ESM 介面卡包裝每執行緒單例 `CascadedLoader` 的 resolve 方法。CommonJS 介面卡包裝內部 builtin 匯出的 `Module._resolveFilename`；該 `Module` 與 `node:module` 匯出的物件相同。

兩個介面卡呼叫同一個路由函式。builtin、相對或絕對路徑、URL、profile 與已記錄 linked root 之外的 parent，以及所有帶顯式 `paths` 的 CommonJS 請求，都直接委託原生實作。`#imports` 請求使用所屬 manifest 中的 Node 對映；外部 bare target 按請求的 conditions 遵循相同選包順序，精確 target 解析仍由 Node 負責。包自引用保留原 parent，包括 npm alias。profile 使用固定攔截位置，linked importer 則在每個原生祖先位置應用目前 peer 條件。原生 CommonJS 探測決定舊式子路徑缺失是否繼續查詢下一個位置。完整選包規則由[查詢順序 Note](2026-09-19-profile-resolution-lookup-order.zh.md)統一記錄。

介面卡完成路由後呼叫捕捉的原生 resolver。exports、import/require conditions、main、subpath、副檔名、原生快取和錯誤碼仍歸 Node 處理。路由後的 ESM 失敗會把 Node 診斷中的內部查詢錨點替換為原始 importer。選中包的無效 export 或缺失目標不會觸發另一個同名候選。CommonJS 不替換 `_findPath`，也不複製 `_resolveFilename`。

保證範圍是目前執行緒安裝後發生的 Node 預設 `import`、`import()`、`import.meta.resolve`、`require` 和 `require.resolve`。已經連結的模組、自定義 `vm` linker、不透明的非 Node importer 和第三方 Worker 不在透明保證範圍。

### 活動外掛列表與包中繼資料

runtime resolution 列出它提供的包；Loader entries 組成活動外掛列表，兩者不能合併。消費方繼續使用 Loader 原有 entry 生命週期，並按自身 scope 過濾相關 entries。需要 package metadata 的消費方將 specifier 和所屬樹的 base URL 交給 app-boot 中的輕量服務，無需 package 匯出 `./package.json`。安裝 runtime resolution 後，即使查詢未命中也以它為準；底層嵌入方只安裝服務而不提供 runtime resolution 時，服務保留 Node 原生查詢。

解析器不提供 `imported(entry)`，不觀察 ModuleJob，不包裝 Entry 方法，不把 fiber 與 import 呼叫關聯，也不替換 registry、tree 或 HMR 方法。包目錄查詢使用相同選包規則，包括 linked importer 祖先目前的 peer 宣告，但不驗證所請求的子路徑或載入檔案。需要包中繼資料的非 Node importer 必須顯式實作同一個 resolver 介面。

實作集中在 `app-boot/src/profile-resolution/`。`service.ts` 提供長期存在的 `ctx.pluginPackages`，並擁有主執行緒攔截與 Worker runtime resolution 的生命週期；`resolver.ts` 實作 runtime resolution 查詢和 Node Internal 介面卡；`worker-bootstrap.ts` 線上程內安裝繼承的 runtime resolution。profile 選包和 runtime resolution 建構留在 `profile.ts`。Worker 只透過 `@deepseek-ai/dsh-app-boot/worker/profile-resolution-bootstrap` 公開入口引用 bootstrap。

服務定義與提供者繼續放在 `app-boot`，因為 profile boot 擁有 resolver 生命週期。出現與 launcher 無關的提供者或需要獨立演進的消費方時，再抽出單獨的能力 seam。

### Worker 與 generation 更新

主執行緒透過 Worker environment data 釋出目前 generation 的可結構化克隆表示和 profile scope。每個 Harness 自有 Worker 建置產物透過建置 banner 取得自己的 ESM/CJS Internal 並安裝同一介面卡，不重新遍歷 manifest。bootstrap bundle 不靜態匯入任何包。原始碼 Worker 入口保持原有自包含依賴；第三方 Worker 保持不變。

新 Worker 繼承最新發布的 generation。已執行的 Worker 保留啟動時繼承的 generation，因此釋出後繼 generation 的呼叫方必須重新啟動它們。ESM bootstrap 無法影響其執行前已連結的靜態依賴，因此 Worker bundle 必須保證 bootstrap 之前的靜態 import 可由原生 Node 解析，需要 profile resolver 的業務入口在 bootstrap 後透過 dynamic import 啟動。

### 只增加包的變更

新增包的呼叫方先完成 pnpm 事務，再建構下一代。替換操作會拒絕改變任何既有 package name 的目錄或版本。呼叫方先發布只增加對映的後繼 generation，再掛載新的 Loader 設定項；本實作不提供該包事務。掛載失敗可以留下已安裝但未啟用的包。

修改或刪除既有執行時包對映，或刪除已記錄的 profile 本地包名，需要重新啟動，因為 Node 的 ESM Module Map、CommonJS cache、現存物件引用和執行中的 Worker 都可能保留舊模組 identity。這些限制不禁止從攔截範圍移除 linked root。generation 換代不聲稱解除安裝模組。

### 檔案系統與執行時載體

解析器不建立、更新或刪除 fallback 軟連結與代理包。runtime resolution 條目佔據 `$DSH_HOME/profiles/node_modules` 上各自的包名位置；其餘包名把該目錄當作普通祖先。建構時記錄目標同時位於共享 profiles 樹和目前 profile 自身之外的目錄連結，包括沒有自身 manifest 的目標。installation 作用域包目錄不參與 linked 攔截，即使更寬的 linked root 包含它們。符合條件的 linked importer 保留原生祖先順序與逐位置的 peer 對映。優先順序和範圍見[查詢順序 Note](2026-09-19-profile-resolution-lookup-order.zh.md)。可寫 profile 狀態和包管理器事務不屬於解析器。

執行時解析要求受支援的 Node Internal loader 介面。Electron Host 透過設定 `ELECTRON_RUN_AS_NODE=1` 的 Electron 可執行檔案執行；打包建置從 ASAR 讀取 dsh 依賴樹，並把 ASAR 中的可執行條目對映到 electron-builder 的 unpacked 目錄。pkg 與 Electron 使用和普通 Node 啟動相同的 runtime resolution 機制。

### 效能與驗證

generation 建構發生在啟動或顯式更新階段，不屬於單次 resolve，但需要單獨報告絕對延遲。profile 熱路徑只包括 scope 分類、bare name 提取、本地優先判斷、Map 查詢和一次原生解析；快取命中直接返回 generation 級結果。linked importer 請求執行時表提供的包名時，讀取所存取的祖先 manifest，不快取選中的路由。舊式子路徑缺失時，CommonJS 可以探測多個位置。作用域外呼叫不讀取 manifest，只快取 parent 是否具有攔截層。

實作期間的一次性本地測量用 plain Node 在全新程序中執行建置後的 JavaScript，並與完全沒有安裝 hook 的程序比較。測量腳本和結果未提交，這些資料不是 benchmark 或 CI 預算。七輪交替順序覆蓋 outside、profile-local 和 fallback 的 dynamic import、`import.meta.resolve`、require、`require.resolve`。Node 22.19、24.18 和 26.8 的熱路徑中位數最大正向退回為 4.5%。Node 24.18 的 256 包 cold workload 最大退回為 11.2%，generation 建構中位數為 16.027 ms；32 包本地 `require.resolve` 因固定啟動成本在整批增加 1.033 ms（+34.7%）。

行為測試覆蓋根順序、傳遞依賴和 peer、本地與外層優先順序、exports 與 subpath 錯誤、conditions 和顯式 CommonJS options。Node 相容矩陣會在受支援的內部 loader 變體上執行解析器、服務和 bootstrap 規格。Worker 測試透過 mock 執行緒與原生 loader 介面驗證 environment data 釋出和 bootstrap 安裝，但不會啟動建置後的 Worker。generation 測試證明建構失敗不釋出部分狀態，成功換代只做原子引用替換。

## Alternatives considered

**永久保留磁碟投影。** 這能在沒有程序掛鉤時沿用原生查詢，但仍有跨程序寫入、陳舊 generation、代理 manifest、寫鎖和打包執行時差異。把 link 與 dual 保留為對比模式，也會留下沒有受支援啟動器需要的物化器及其生命週期。

**保留軟連結邏輯錨點。** 這會沿軟連結的祖先查詢，但可能選中與真實包內部 import 不同的依賴，也可能抑制 tsx 的 workspace paths 對映。規範化錨點讓 eager 依賴發現與執行時委託解析都對齊包的執行位置。

**在 resolve 時惰性擴充功能依賴圖。** 這會把 manifest 讀取和錯誤分散到首次使用，改變磁碟實作的時機，使 Worker 啟動更復雜，並讓熱路徑成本隨依賴圖變化。完整建構 generation 更容易比較和原子替換。

**使用 `module.registerHooks`。** 公共 API 會在 profile scope 拒絕請求之前讓相關解析進入 Node 的全域 hook 分發。直接存取已有 ESM/CJS 內部解析器可以保留更小的快速路徑，並繼續讓 Node 完成最終解析。

**透過 Loader 和 HMR 介面卡記錄每個 Entry 的實際 import。** 實際 import 記錄能支援相同輸入返回不同目標的有狀態 resolver。本設計改為以 generation 作為確定性權威，因此這些記錄只會複製 resolver 的答案，同時增加 Entry、fiber、registry、ModuleJob 和 HMR 生命週期狀態。

**每次包操作增量修改一張長期表。** 增量修改會暴露半成品依賴圖，並要求定點失效快取。完整建構下一代使失敗保持原子，並讓所有快取隨 generation 生命週期存在。

**熱替換已經載入的包版本。** 解析表換代無法使所有存活模組實例和物件引用失效。重新啟動可以保證每個程序只使用一個 package identity。

## Verification

- 一次 eager 計算供應 runtime resolution；啟動既不寫入也不退休模組解析資料。
- [Generation 測試](../../../../packages/boot/app-boot/tests/profile-resolution.spec.ts)覆蓋普通目錄和遞迴軟連結下的安裝圖與所選 bundle 圖，包括邏輯錨點和真實錨點旁存在不同依賴版本的情況。測試還覆蓋 linked root 移除、同目標恢復、重疊 root、原生缺包、已載入模組的新請求，以及移除後重新連結不同目標時的拒絕。
- [原始碼啟動測試](../../../../apps/cli/tests/source-launch.compat.spec.ts)與[建置入口測試](../../../../apps/cli/tests/built-bin.e2e.ts)透過真實 CLI 執行兩種 profile 佈局，斷言 ESM/CJS 版本、載入路徑、各模組格式內的依賴身份，以及一致的 Tools/AgentLoop 模組實例和可存取的 scheduler 鍵。
- pkg 與 Electron 載體選擇 runtime 解析；Electron 以 Node 模式從 ASAR 承載的 dsh 依賴樹執行 Host，原生可執行條目保持 unpacked。
- ESM 與 CommonJS 介面卡共享同一個路由器，並把最終解析委託給 Node，不使用 `module.registerHooks` 或替換 `_findPath`。
- 生產 package metadata 查詢不記錄 Loader import 結果，也不包裝 Entry、registry、tree 或 HMR 方法。
- Node 相容矩陣會在受支援的 loader 介面上執行主執行緒 resolver 規格；service 和 bootstrap 規格覆蓋 Worker environment data 與安裝介面，但不會啟動建置後的 Worker。
- 一次性 plain Node 建置產物測量得到上述相對無 hook Node 的熱路徑和 cold 觀察結果；腳本與結果並未提交為證據。

## Consequences

runtime 啟動避免磁碟修改和代理 manifest，同時保留包優先順序規則。真實目錄錨點讓依賴發現對齊 Node 預設載入與 tsx workspace 對映，也覆蓋軟連結邏輯路徑會選中另一版本的情況。實作需要持續維護 Node Internal 相容測試，並在每個自有 Worker 中儘早執行自包含 bootstrap；它不提供純磁碟後端或 dual 對比模式。包對映和本地包名仍只允許新增；linked root 集合可以變化，而不解除安裝模組。
