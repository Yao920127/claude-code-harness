# Agent Note: profile 解析的主線祖先鏈與攔截層

Status: implemented

[English](2026-09-19-profile-resolution-lookup-order.md) | 中文

## Problem

profile 從自己的包專案載入外掛。dsh 本體包和 bundle 內嵌的依賴不在 profile 的依賴樹上，Node 預設的 `node_modules` 查詢從 profile 出發找不到它們。

解析規則需要能被開發者一句話複述：哪一段是普通 Node 行為，哪一段是 dsh 的干預，干預的範圍到哪裡為止。此前的執行時實作把 `$DSH_HOME/profiles/node_modules` 整層對所有包名隱藏，又為歷史目錄形狀保留了專門的識別程式碼，規則無法用一句話說清，也無法判斷某次解析結果是否符合預期。

## Decision

普通模組請求保留 Node 的祖先 `node_modules` 順序。profile 內，runtime resolution 條目佔據 `$DSH_HOME/profiles/node_modules` 上對應的包位置。對於已記錄的樹外連結目錄中的 importer，每個候選 `D/node_modules` 只應用一條規則：包名同時出現在 `D/package.json` 的 `peerDependencies` 和 runtime resolution 中，就由執行時包占據該位置；否則 Node 嘗試該位置的物理包。更近的候選先於更高祖先的 peer 宣告。顯式 CommonJS `paths` 始終繞過攔截。其餘解析行為由 Node 負責。[不可變 generation 的建構、釋出、Worker 繼承與執行時載體](2026-09-09-profile-resolution-generations.zh.md)由既有 Note 記錄，本篇不復述。

### 一、解析規則

#### 1. 主線：Node 的祖先 `node_modules` 鏈

importer 指發起 `import` 或 `require` 的那個模組檔案。Node 從 importer 所在目錄開始，沿祖先 `node_modules` 候選位置查到檔案系統根，跳過多餘的 `node_modules/node_modules` 位置。CommonJS 還查詢 `NODE_PATH` 與全域目錄，ESM 不查詢。在 Node 的包入口與失敗規則下，最近的匹配候選優先。

軟連結按 Node 預設行為跟隨到真實路徑。一個模組一旦以真實路徑載入，它後續 import 的主線就是真實路徑的祖先鏈，與它被連結到哪裡無關。

下面這條鏈是全文表格引用的編號。importer 為 `$DSH_HOME/profiles/web/node_modules/my-plugin/index.js`：

```text
① $DSH_HOME/profiles/web/node_modules/my-plugin/node_modules
② $DSH_HOME/profiles/web/node_modules
③ $DSH_HOME/profiles/node_modules
④ $DSH_HOME/node_modules
⑤ /node_modules
```

① 是外掛私有依賴，② 是 profile 安裝的包，③ 是攔截層，runtime resolution 佔據其中有條目的包目錄，④ 是 Harness home，⑤ 是檔案系統根。CommonJS 隨後保留 `NODE_PATH` 與全域目錄的查詢，不在這些額外位置應用 peer 攔截。

#### 2. 攔截層：runtime resolution 佔據 `$DSH_HOME/profiles/node_modules/<包名>`

攔截層是 importer 所屬 profile 目錄（`$DSH_HOME/profiles/<name>`）之上的第一個祖先 `node_modules`。樹內所有 profile 的這一層都是 `$DSH_HOME/profiles/node_modules`。

runtime resolution 中的每個包名，在這一層上佔據 `<攔截層>/<包名>` 這個包目錄的位置。對 `@deepseek-ai/dsh-tools` 這樣的本體包名，③ 上的包目錄就是執行中安裝的那一份；磁碟上同名的舊連結或舊目錄不再是鏈上的成員。對 runtime resolution 沒有的包名，③ 上的包目錄就是磁碟上的物理內容。

一次裸包名請求的順序：主線先走完 profile 目錄內部的各層（①②），有候選就交給 Node 在候選內解析並返回。走到 ③ 時，runtime resolution 有該包名的條目，Node 就在條目記錄的包目錄內解析；找到就返回，包內缺檔案則按 Node 自身對"已找到包"的處理繼續，CommonJS 從 ④ 繼續逐層找子路徑，ESM 直接報錯。runtime resolution 沒有條目，Node 就看 ③ 的物理目錄，再到 ④。

Node 仍然負責 `exports`、`imports`、conditions、`main`、子路徑、副檔名、快取與錯誤碼。被選中的包因 `exports` 拒絕某個子路徑時報錯終局，不會換另一個同名包。

攔截層不讀、不寫、不刪任何磁碟連結。歷史殘留的軟連結一律按普通檔案系統內容處理：本體包名在 ③ 上的位置已被 runtime resolution 佔據，舊連結永遠不會被讀到；其餘包名按主線正常看到 ③ 裡的內容。profile 載入時一次性刪除 dsh 0.1.5 系列釋出版的 Link 後端寫進 profile 的投影：profile `node_modules` 下目標位於 `<profile>/.dsh-module-fallback/node_modules` 內的軟連結，以及該目錄本身。pnpm 安裝的包和其他軟連結都保留。

#### 3. 連結目錄：在每個祖先候選位置應用 peer 攔截

`<profile>/node_modules/<包名>` 連結到 profiles 樹外的真實目錄 R 時，R 是一個 linked root。R 不必包含 `package.json` 或 `node_modules`，可以是包目錄、monorepo 中的單個包，也可以是 `src` 目錄。R 之下的 importer 沿 Node 的真實祖先鏈查詢。記錄的根目錄決定哪些 importer 參與攔截，不會把它們的查詢限制在 R 內。

linked 攔截排除 installation 作用域包目錄內的 importer，同時識別設定路徑和真實路徑。因此，連結整個 checkout 不會接管主機自身的依賴查詢。重疊的 linked root 共同描述參與範圍：祖先鏈由 importer 決定，root 順序和連結名稱都不會選擇另一套 peer 集合。

在每個候選 `D/node_modules`，目前 `D/package.json` 的 peer 宣告命中且執行時表提供該包名時，就使用執行時包。這隻佔據該包的位置，即使 `D/node_modules` 在磁碟上不存在也成立。宣告和執行時條目缺少任一項，Node 就嘗試物理候選。缺少 manifest 不會終止查詢。`dependencies` 與 `devDependencies` 不啟用攔截，peer 的版本範圍也不是額外的解析篩選條件。執行時表提供 React 等第三方 peer 時，同樣適用這條規則。

更近的物理候選先於後續祖先的 peer 宣告。選中包的 `exports` 拒絕請求時，Node 的錯誤是終局。舊式 CommonJS 子路徑缺失可以繼續到下一位置，再應用那個目錄的 peer 規則；不會重試已被佔據位置上的物理副本。每次新的 linked 解析讀取所存取位置的 manifest，不快取選中的路由。不可讀的 manifest 不提供 peer，Node 保留其原生 manifest 診斷。這不清除 Node 快取，也不自動重新載入已載入的模組。

runtime resolution 建構時掃描 `<profile>/node_modules` 的頂層與 `@scope/*` 連結。successor 可以在既有包對映和本地包名約束內新增或移除 linked root。移除無需重新啟動：目錄不再被任何 root 覆蓋時，後續解析恢復原生查詢。[Generation 規則](2026-09-09-profile-resolution-generations.zh.md#immutable-generations)定義了釋出、已有模組引用，以及跨越移除操作的重新連結檢查。依賴的真實路徑在所有已記錄 linked root 之外時，即使外掛連結到它，也不參與攔截。

#### 4. 攔截層裡有什麼：runtime resolution 的掃描內容

runtime resolution 在 profile 啟動時一次算出，由四部分組成。

- installation 閉包：從目前執行的 dsh 包的 `package.json` 出發，沿 `dependencies` 與 `peerDependencies` 做廣度優先遍歷，每條邊從宣告它的 manifest 按 Node 規則解析，同一個包名由第一次找到的已安裝檔佔有。閉包有數百條，約一半在 `@deepseek-ai/` 作用域，一半是第三方庫。這些條目對所有 profile 生效。
- bundle-only 條目：profile 選中的、不屬於閉包的 bundle，從它的 manifest 出發做同樣的遍歷，閉包已佔有的包名不覆蓋。這些條目只對選中該 bundle 的 profile 生效，用於讓 Loader 從 profile 根按裸名匯入 bundle 內嵌的外掛。
- 本地包名：profile 直接依賴中已經安裝在 `$DSH_HOME/profiles/<name>/node_modules` 的包名。它們本來就在主線 ② 上，記錄下來只為免去一次目錄探測。
- linked root：`$DSH_HOME/profiles/<name>/node_modules` 頂層與 `@scope/*` 裡目標同時位於共享 profiles 樹和目前 profile 目錄之外的目錄連結，記錄連結名稱與真實目錄。目錄自身的 manifest 可預設。目標缺失或為檔案的連結都排除。位於共享樹外的應用自有 profile，不會把內部 pnpm store 連結登記為外部 root。

CLI 的安裝錨點來自 `import.meta.url`，Node 已對它做過 realpath；Desktop Host 從其執行時目錄拼出錨點，該目錄不是軟連結。兩者的安裝根目錄都等於真實目錄，bundle 發現與依賴遍歷使用同一個位置。遍歷中每一層依賴都以所屬包的真實目錄作為下一層的查詢錨點，並記錄宣告它的 manifest 位置。命中後 Node 從這個宣告位置解析，得到與該包自己內部 import 相同的結果。每個條目記錄包名、包目錄、版本、宣告位置與作用域。已宣告但未安裝的依賴跳過；bundle 包根自身不成為條目。

#### 5. hook 覆蓋範圍

hook 只在 importer 位於 `$DSH_HOME/profiles/**` 或某個 linked root 之下時參與。builtin、相對路徑、絕對路徑、URL 請求，以及 importer 在這兩處之外的一切請求，直接交給 Node。`require.resolve(request, { paths })` 同樣直接交給 Node，包括路徑指向 profile 或連結目錄的情況。

ESM 與 CommonJS 兩個介面卡呼叫同一個路由函式，主執行緒與 Harness 自有 Worker 都安裝同一份 runtime resolution。實作位於 `packages/boot/app-boot/src/profile-resolution/resolver.ts`，runtime resolution 的建構位於 `packages/boot/app-boot/src/profile.ts`。

#### 6. 包目錄與模組檔案

`packageDir('pkg', parentURL)` 與 `packageDir('pkg/sub', parentURL)` 定位包目錄，不載入程式碼，也不驗證子路徑。普通入口與檔案請求仍由 Node 應用 `exports`、`main`、conditions 和檔案存在性規則。因此，包目錄查詢可以成功，同時匯入缺失或未匯出的檔案會失敗。`import.meta.resolve` 可以為不存在的已匯出檔案返回 URL，但匯入該 URL 仍然失敗，這與原生 Node 一致。

### 二、預演

#### 表 1：ESM 與 CommonJS 在各類請求下的主線與攔截

下表以本體包 `@deepseek-ai/dsh-tools`（runtime resolution 有條目）和第三方庫 `left-pad`（runtime resolution 無條目）為例；`pkg` 泛指兩者。

| 請求形態 | ESM | CommonJS | ③ 上該包名的位置 | 包內缺檔案時 |
|---|---|---|---|---|
| 裸包名 `pkg`，包有 `exports` | ①② 有 `pkg` 目錄則 Node 在其中按 `exports` 取入口 | Node 從同一候選選擇 require condition | 有條目：runtime resolution 的包；無條目：物理目錄 | 已匯出目標缺失時終局報錯 |
| 裸包名 `pkg`，包無 `exports` | 入口取 `main` 或 `index` | 原生舊式入口查詢 | 同上 | ESM 終局報錯；CommonJS 僅對原生查詢未命中繼續，宣告的 `main` 無效時不繼續 |
| 子路徑 `pkg/sub`，包有 `exports` | 第一個找到的 `pkg` 決定；`./sub` 未匯出則 `ERR_PACKAGE_PATH_NOT_EXPORTED` 終局 | 同 ESM | 同上 | 終局，不找別的副本 |
| 子路徑 `pkg/sub`，包無 `exports` | 第一個找到的 `pkg` 內沒有 `sub` 則 `ERR_MODULE_NOT_FOUND` 終局 | 逐層嘗試 `<層>/pkg/sub`：①②，然後 ③ 上該包名的位置（有條目即 runtime resolution 的包目錄），然後 ④ | 同上 | ESM 終局；CommonJS 繼續下一層，即 ④ |
| `#alias` 包內別名 | 所屬 manifest 的 `imports` 對映到裸包名後，按上面各行處理；對映到相對路徑則直接交 Node | 同 ESM，conditions 取呼叫方傳入或預設值 | 同對應行 | 同對應行 |
| `require.resolve(pkg, { paths })` | 無此形式 | 無論路徑位於何處，都把整個請求及原始選項交給 Node | 不攔截，只看物理內容 | 原生 Node 的繼續查詢與錯誤 |
| 包自引用（importer 所屬包按自己的 `name` import） | 交 Node，保留原 importer | 同 ESM | 不參與 | 不適用 |
| 相對 / 絕對 / URL / builtin | 交 Node | 交 Node | 不參與 | 不適用 |

命中 runtime resolution 後，Node 報出的 `ERR_MODULE_NOT_FOUND` 與 `ERR_PACKAGE_PATH_NOT_EXPORTED` 會把內部的宣告位置替換回原 importer；CommonJS 的 require stack 也去掉內部錨點。

#### 表 2：Web 與 Desktop 兩種 profile 的攔截位置

| profile | 目錄 | 攔截層 | 與 web 的差異 |
|---|---|---|---|
| web | `$DSH_HOME/profiles/web` | `$DSH_HOME/profiles/node_modules` | 基準 |
| desktop | `$DSH_HOME/profiles/desktop` | `$DSH_HOME/profiles/node_modules` | 無。同一棵樹、同一層；Desktop 的 Host 以 Node 模式執行同一套 resolver |
| 樹外 profile | `loadProfileDirectory` 接受的任意目錄 | 該目錄之上的第一個祖先 `node_modules` | 規則相同；目前沒有產品使用樹外 profile，只有單元測試覆蓋 |

#### 表 3：外掛被 link 到樹外時的主線

外掛 `my-plugin` 被 `<profile>/node_modules/my-plugin` 連結到真實目錄 R；R 的 manifest 把 `@deepseek-ai/dsh-tools` 宣告為 peer 並裝成 devDependency，把 `zod` 宣告為 dependency。

| import 來源 → 目標 | hook 是否參與 | 結果 |
|---|---|---|
| profile → 連結的外掛 | 參與到 ② 為止 | ② 的軟連結被 Node 跟隨，外掛以真實路徑載入 |
| 連結外掛 → `zod` | 參與，`R/node_modules` 上 `zod` 未被佔據 | `R/node_modules/zod`，開發者自己安裝的版本 |
| 連結外掛 → `@deepseek-ai/dsh-tools`（peer） | 參與，`R/node_modules` 上該名被佔據 | 執行中的 dsh 的那一份；`R/node_modules` 裡的 devDependency 副本不被讀到 |
| 連結外掛 → 只宣告為 dependency 的有狀態 dsh 包 | 參與，未被佔據 | `R/node_modules` 裡自己的副本，產生第二個實例；與樹內把 dsh 包裝進 ② 的錯誤相同，改為 peer 即可 |
| 連結外掛 → 未宣告的包名 | 參與，R 不佔據該包名 | `R/node_modules` 的物理內容，再沿真實祖先鏈逐位置應用同一規則 |
| R 內傳遞依賴 → 任何包名 | 參與 | 每個位置使用自己的 manifest 的 peer；更近的物理候選先於後續 peer 宣告 |
| link 目標 R 無 manifest → 祖先宣告的 peer | 參與 | 從 R 開始查；更近的物理候選優先，否則祖先 peer 可以選中執行時包，即使那裡沒有物理 `node_modules` |
| 真實目錄在所有 linked root 外的提升依賴 → 任何包名 | 不參與 | 從該依賴真實目錄進行原生 Node 查詢 |
| 位於寬連結目錄內的 installation 作用域包 → 任何包名 | 不參與 linked 攔截 | 原生查詢保留主機包自身的依賴 |
| 任意 importer → `require.resolve(pkg, { paths })` | 不參與 | 使用指定路徑進行原生 Node 查詢 |

### 三、開發者接入指引

#### 1. 正常安裝

`dsh plugin --profile <name> add <包名 | git spec | file:../本地檢出>` 把參數轉發給 pnpm，在 profile 目錄內以 hoisted 佈局安裝。profile 的 `pnpm-workspace.yaml` 設定 `autoInstallPeers: false`，外掛宣告為 peer 的 dsh 包不會被裝進 profile，由攔截層提供目前執行安裝的那一份，外掛與 dsh 共用同一個模組實例。

外掛自己的第三方依賴被 hoist 到 `$DSH_HOME/profiles/<name>/node_modules`，按主線 ② 找到。與 installation 閉包同名時最近者優先，外掛使用自己宣告的版本。`file:` 形式把本地檢出複製進 profile，隨後的解析與註冊表安裝完全相同。

#### 2. 開發模式：外掛儲存庫在 profile 樹外

`npm link`，或 `dsh plugin add ../my-plugin` 這類裸目錄路徑（pnpm 按 `link:` 處理），會讓 profile 裡的條目成為指向外掛儲存庫的軟連結，儲存庫目錄成為 linked root。外掛以真實路徑載入。查詢到其 manifest 的 peer 位置時，匹配的執行時條目由目前執行的安裝提供，無論 dsh 來自 npm 全域安裝、Desktop 內建還是原始碼倉啟動。該位置的 devDependency 副本服務編譯器，普通請求不會載入它。link 指向無 manifest 的 `src` 目錄時，也可以透過同一條祖先查詢使用父目錄的 peer。

manifest 的寫法與 harness 自身的包相同：需要與主機共享實例的 dsh 包同時宣告在 `peerDependencies` 與 `devDependencies`，peer 讓 `R/node_modules` 上的位置被佔據，dev 副本給編譯器和獨立測試使用；第三方依賴以及 `@deepseek-ai/dsh-brand`、`@deepseek-ai/dsh-util-values` 這類無狀態 dsh 工具包放在 `dependencies`。修改 `peerDependencies` 後，重新載入外掛時的新解析會使用新宣告；已載入模組的生命週期仍由 Node 和 Cordis 管理。

另兩種可用佈局：外掛儲存庫自裝 `@deepseek-ai/dsh` 並從儲存庫裡啟動 `pnpm exec dsh --profile <name>`；或把 dsh 包 link 到本機原始碼倉並從原始碼倉啟動。兩者讓執行中的 dsh 與儲存庫裡的副本本來就是同一份，但 linked 外掛不要求使用這兩種佈局。

## Alternatives considered

**讓 runtime resolution 只在主線全部走完後後備。** 主線會先在 ③ 讀到歷史殘留的本體連結並使用它，與"本體以目前執行的安裝為準"衝突。runtime resolution 必須佔據 ③ 上本體包名的位置。

**把 runtime resolution 當作插入主線的一整層，而不是佔據 ③ 上的包目錄。** 兩者只在一處不同：CommonJS 命中 runtime resolution 的包後子路徑缺失時，前者會再回頭讀 ③ 上同名的舊副本，後者按 Node 對"已找到的包"的處理直接到 ④。佔據包目錄與 Node 語義一致，也不需要為 ③ 保留任何額外判斷。

**讓 installation 閉包條目絕對優先於更近的副本。** 閉包含 281 個第三方庫。外掛私有的 `zod`、`yaml` 等版本會被安裝閉包裡的版本覆蓋，破壞與 Node 一致的最近者優先。受支援的安裝流程已經不把 dsh 的 peer 裝進 profile，不需要再用覆蓋來保證單實例。

**在解析時識別 `.dsh-module-fallback` 形狀的軟連結並繞過。** 這會為不再產生的目錄在查詢路徑裡保留專門邏輯，每次解析都要付出判斷。在 profile 載入時一次性刪除這些投影能得到同樣的結果：一個 bundle 被停用但仍裝著時，它投影出來的外掛不再遮住 runtime resolution 從另一個 bundle 選出的同名外掛。

**把攔截層所在的物理目錄整層隱藏。** 與"其餘解析與 Node 一致"衝突：放在 `$DSH_HOME/profiles/node_modules` 的非本體包會對所有 profile 不可見。

**讓 runtime resolution 的全部條目佔據 `R/node_modules` 上的包目錄。** 與 ③ 完全同形，但閉包裡的幾百個第三方庫會遮住外掛儲存庫自己安裝的 `zod`、`yaml` 版本，與樹內 ①② 贏 ③ 相反。只佔據 peer 保住了「外掛自己的第三方版本優先」。

**按 importer 最近的 manifest 的 `dependencies` 決定哪些包名走原生。** 這類宣告不標識查詢位置，也無法描述在祖先找到的未宣告包。逐位置的 peer 宣告只增加一條資格規則，不替換 Node 的查詢順序。

**只讀 linked root 的 peer，或要求它自身有 manifest。** link 可以指向 `src` 目錄，更近的包與祖先 manifest 都有各自的查詢位置。把攔截固定在 R 會漏掉這些宣告，或覆蓋更近的物理候選。

**在 runtime resolution 建構時固定 peer 集合。** 開發者每次修改 `peerDependencies` 都得重新啟動 dsh。解析時讀取讓新查詢看到變動，代價是開發模式下要讀取所存取的 manifest。已載入的請求是否需要再次解析，仍由 Node 的模組快取決定。

**攔截指向 profile 內的顯式 CommonJS paths。** 顯式搜尋列表是呼叫方的選擇。原樣交給 Node 能保留一個清晰的例外，而不是讓各個路徑項遵循不同策略。

**把 linked root 之上的主線接回 profile 的 ②③。** 這是 Node `--preserve-symlinks` 的形式，`R/node_modules` 仍是原生的第一層，devDependency 副本照樣先被找到，單實例問題原樣保留。

## Verification

- [profile-resolution.spec.ts](../../../../packages/boot/app-boot/tests/profile-resolution.spec.ts) 中的表驅動矩陣：importer 取 profile 根與 profile 內外掛，包名取 installation 條目、bundle-only 條目與表外包名，①②③④ 四層的每一種有無組合，②③ 各含真目錄與指向別處的軟連結兩種形態；每格斷言 ESM import、CommonJS require、`require.resolve` 與 `packageDir` 中繼資料落在同一個目錄。
- 同一檔案內的 linked root 案例：`<profile>/node_modules` 的軟連結指向樹外儲存庫，儲存庫 `node_modules` 裡放同名 devDependency 副本；包名取宣告為 peer 的 installation 條目、宣告為 dependency 的 installation 條目、儲存庫自己的第三方 dependency、未宣告的包名，importer 取儲存庫自身檔案與儲存庫內傳遞依賴；斷言四種解析方式一致、devDependency 副本不被讀到，以及改寫 `peerDependencies` 後下一次解析立即按新宣告進行。
- [差分矩陣](../../../../packages/boot/app-boot/tests/linked-resolution-matrix.spec.ts)建構獨立的原生、攔截與參考目錄。只有參考副本把合格 peer 位置替換為執行時包的連結，再讓 Node 解析檔案。單包與 pnpm monorepo 案例對比入口、檔案、目錄、import/require、`import.meta.resolve` 與顯式路徑的結果，覆蓋 manifest 缺失、`node_modules` 缺失、錯誤 peer 宣告、React、作用域外 helper 和舊式子路徑繼續查詢。斷言比較選包、現存路徑、錯誤碼與模組實例；顯式 paths 使用未投射的原生參考。
- 同一檔案內的專項案例覆蓋表 1 各行：有無 `exports` 的裸包名與子路徑、`#alias`、顯式 `paths`、包自引用、命中 runtime resolution 後 CommonJS 子路徑缺失時跳過 ③ 直接到 ④，以及樹外 profile 的攔截位置。
- [CLI 真啟動測試](../../../../apps/cli/tests/profiles/headless/tests/profile-resolution.ts)覆蓋 src 與 lib 啟動、普通與 npm-link 佈局，以及指向無 manifest 的 `src` 目錄且其父目錄宣告 peer 的連結。測試檢查 Tools/AgentLoop 共享實例、原生顯式路徑選中開發者副本、依賴沿真實路徑解析，以及檔案和連結目標保持不變。原始碼模式的 CommonJS 檢查使用具備現存 JavaScript 入口的 fixture 包；安裝中真實的 CommonJS 入口需要相應建置產物。

## Consequences

買到的：模組解析無需磁碟投影；命中攔截層的 dsh 本體包來自目前執行的安裝，link 到樹外的外掛宣告的 peer 也適用；其餘解析保留 Node 的祖先鏈和包入口規則；解析路徑不識別歷史投影目錄。

付出的：installation 閉包中的第三方庫仍佔據 ③ 上的包目錄；profile 外掛沒有更近副本時會使用安裝中的版本。linked 請求只在匹配的 peer 位置選中執行時包，更近的物理副本仍優先。開發者需要相應安排宣告與依賴位置。runtime resolution 不驗證 peer 版本範圍。

只有 `<profile>/node_modules` 的直接連結成為 linked root；依賴真實目錄在所有已記錄根之外時使用原生 Node。peer 請求不會回到 profile 的 ②：執行時表不提供的包名必須能在真實祖先鏈上找到。linked 請求承擔即時讀取 peer manifest 的成本。同一連結換目標仍需重新啟動；模組快取失效與自動監視不屬於這條規則。

顯式 CommonJS paths、外掛自行啟動的子程序、第三方 Worker 和外部工具不會獲得執行時 peer 對映。不經過 hook 的消費者無法透過生成的磁碟連結找到本體包。resolver 繼續依賴受支援的 Node Internal 介面。
