# Agent Note: 三條獨立序列的私有 NPM 釋出

Status: implemented

[English](2026-08-10-npm-release-sequences.md) | 中文

## 問題

這個儲存庫有三組互不相干的可釋出包，卻沒有任何釋出通道把它們送上 registry。

`packages/*/*` 與 `apps/*` 組成 `@deepseek-ai/dsh` 的執行面；`vendor/*` 是九個 rescope 過的 Cordis 框架包，各自帶著上游的版本號；`native/system/packages/*` 是 Linux 平臺包，有自己的 workflow。三組的版本基線、變更節奏和建置要求都不同：dsh 隨產品迭代，vendor 只在同步上游或改動本地修改時才動，native 需要 musl 工具鏈和逐架建置置。把它們塞進一條釋出流水線，等於每次產品發版都要重發框架和原生二進位制。

擋路的還有兩處硬門。全部 217 個 workspace manifest 都是 `private: true`，`npm publish` 直接拒絕。更隱蔽的是 933 條 dsh 兄弟包之間硬寫的 `peerDependencies: "^0.0.1"`：`pnpm pack` 只替換 `workspace:` 協定，不動語義範圍，而 `^0.0.1` 等於 `>=0.0.1 <0.0.2`——發 `0.0.2` 落不進去，發 `0.0.1-rc.1` 也落不進去（semver 規定不帶預釋出段的範圍排除預釋出版本）。這些條目至今沒出事，只因為版本一直停在 `0.0.1`。

`scripts/publish-npm-baseline.ts` 是本機發布腳本：它把 pack 與 publish 放進同一個程序，需要人工在本機完成認證與重試，且把 vendor 排除在釋出集之外。它不能作為 CI 釋出的基礎，但其中的 tarball payload 驗證與已安裝產物探針是驗證過的零件。

## 決策

### 三條獨立序列

`packages/`、`vendor/`、`native/` 各自一條 bump 序列、各自一次釋出，不共享版本號、不共享觸發、不互相等待。發 dsh 不重發 vendor，發 vendor 不重發 native。

| 序列 | 成員 | 版本基線 | tag | workflow |
|---|---|---|---|---|
| dsh | 釋出集：`packages/*/*` + `apps/*` 中的公開成員，保留[私有實驗包例外](2026-09-12-experimental-publication-denylist.zh.md)；私有包僅加入共享版本 bump | 釋出集、私有 dsh 包與 workspace 根共用一個 `0.0.x` | `dsh-v<版本>` | `release.yml`（pack）/ `release-publish.yml`（釋出） |
| vendored framework | `vendor/*` 九個包 | 每包各自一條版本線 | `vendor-<包名>-v<版本>`（每包一個） | `release-vendor.yml`（pack）/ `release-vendor-publish.yml`（釋出） |
| native | `native/system/packages/*` | 自己的 `0.0.x` | `node-addon-system-v<版本>` | `node-addon-system-release.yml` |

三組一律發到 npmjs.com 的 `@deepseek-ai` scope，且 access 按序列而非按 scope 區分：vendored 框架與 native 包是 `public`，dsh 族自 2026-08-13 其自身序列公開發布起即為 `public`（[理由](../../archived/process/2026-08-13-public-vendor-and-native-sequences.md)）。沒有任何釋出路徑傳 `--access`——一個選項無法服務級別互不相同的序列，且會覆蓋真正擁有該級別的 manifest。

### 版本由本地命令寫進儲存庫，CI 只核對與上傳

每條序列有一條 bump-and-commit 命令：算出目標版本，寫進相關 manifest，跑 `pnpm install --lockfile-only`，再把 manifest 連 lockfile 一起 commit。釋出版本因此在儲存庫裡查得到。tag 由人工在 commit 合入 master 後打；CI 不寫儲存庫，也不需要寫權限。

`release:dsh` 接受 `major`、`minor`、`patch` 或顯式版本號，把同一個版本寫進可釋出族、`packages/*/*` 下的每個私有包**以及 workspace 根**。私有包不會獲得釋出 tag，仍位於 pack 與 publish 之外；它們跟隨版本是因為[靜態版本一致性門禁](../../archived/process/2026-09-03-workspace-version-coherence-gate.md)要求每個 dsh 包的版本等於根版本。根的檢查接受預釋出段，因此 `0.0.1-alpha.1`、`0.0.1-canary.1` 和 `0.0.1-rc.1` 等顯式版本走同一條 pack、已安裝產物探針和釋出路徑。釋出 dsh 時，`alpha` 和 `canary` 分別對映到同名 npm dist-tag，包含 `rc` 在內的其他預釋出版本對映到 `next`，穩定版本則沿用 npm 預設的 `latest`。其他釋出家族保留各自的 dist-tag 規則。

基礎版本號相同時，SemVer 按字典序比較字母數字型預釋出標識：`alpha` 小於 `canary`，`canary` 小於 `rc`，所有預釋出版本都小於穩定版本。npm dist-tag 是可變別名，不參與版本優先順序比較。

### vendor：誰改了誰發版，tag 就是帳本

vendor 九包加了 scope 之後與上游脫鉤，但保留各自的版本線。釋出版本取「manifest 版本」與「上次釋出版本」中較高的那個，再遞增 patch——這一步同時去掉上游的預釋出段。首發版本：

| 包 | 上游版本 | 首發版本 |
|---|---|---|
| `@deepseek-ai/cordis` | 4.0.0-rc.7 | 4.0.1 |
| `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | 1.0.1 |
| `@deepseek-ai/cosmokit` | 1.8.1 | 1.8.2 |
| `@deepseek-ai/schemastery` | 3.18.0 | 3.18.1 |
| `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | 1.0.16 |
| `@deepseek-ai/cordis-plugin-include` | 1.0.4 | 1.0.5 |
| `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | 1.1.3 |
| `@deepseek-ai/cordis-plugin-group` | 1.0.0 | 1.0.1 |
| `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | 1.0.1 |

以「上次釋出版本」為基線才扛得住重同步：本倉發過 `4.0.1` 之後上游把版本恢復成 `4.0.0-rc.8`，只看 manifest 會再算出 `4.0.1` 並撞上已發版本。加 `--prerelease rc.1` 則發一次排練版：它進 `--tag next`，而且不佔用那組數字——預釋出的優先順序低於它所先行的正式版，所以 `4.0.1` 仍然接在 `4.0.1-rc.1` 之後。這個次序由腳本自己算，不讀 `git tag --sort=v:refname`——git 會把預釋出排在正式版之前。

只發改動過的包，而變更判據不引入新的狀態檔案：**每包一個 tag，tag 就是「上次釋出到哪個 commit」的記錄**。bump 對每個包取最新的 `vendor-<包名>-v*` tag，拿包目錄與它做 diff。一條路徑算命中的條件是：manifest 的 `files` 選中它，或 npm 無論如何都會發布它（`package.json`、`README*`、`LICENSE*`），或者——當該包的 `files` 選中 `lib/` 時——它是建置輸入（`src/**`、`tsconfig*.json`、建置設定）。最後那條規則的存在理由是建置產物不在 git 裡：沒有它，真實的原始碼改動會讀成「沒變化」，而下一次釋出會在一個位元組已變的版本上失敗。

tag 只是 commit 指標，不是釋出成功的證明。bump 會向 registry 核對「最新 tag 指向的版本是否真的存在」，不存在就明確失敗交人處理——否則一個為失敗釋出而推的 tag 會被讀成「已釋出」，從此永遠跳過該包。查詢私有包需要憑證，因此未授權驗證的機器只報告這道核對被跳過，不失敗。

`vendor/cordis` 現在也釋出 `src`。它的 exports 宣告瞭 `"./src/*"`，tarball 裡沒有這些檔案就等於把消費方指向不存在的路徑；而 `files` 只選建置產物，也讓變更判據沒有任何受 git 跟蹤的路徑可匹配。

### 釋出只在 GitHub 執行，由 registry 狀態決定發什麼

釋出只從 GitHub Actions 執行，沒有本機發布路徑。publish 不讀 tag、不讀任何「本次釋出包含什麼」的清單，而是對每個打包好的 tarball 拿版本與 registry 比對，分三態：

| 狀態 | 處置 |
|---|---|
| registry 上沒有該版本 | 釋出 |
| 已有該版本，且 tarball 的 sha512 等於記錄的 `dist.integrity` | 跳過：這是同一批產物的重跑 |
| 已有該版本，但 integrity 不同 | 失敗退出，報「內容已變但版本未 bump」 |

第三態攔住「改了程式碼卻沒 bump 版本」。前兩態給出冪等——同一個 artifact 重跑 publish 不會重複釋出，也不需要人工挑揀包。同一條規則還解決了「一次 vendor 釋出攜帶多個 tag，而 workflow 只能從一個 ref 觸發」的矛盾：workflow 從不從觸發它的 tag 去推斷該發哪些包。

三條序列都按這套判定，native 也在內：它透過自己的腳本釋出，而不是 shell 迴圈——一串裸 `npm publish` 無法重試，registry 對「重發已存在的版本」的回答是永久失敗，因此中途失敗一次就沒有前路了。

registry 的兩個行為決定了「怎麼嘗試一次釋出」。寫入之間至少間隔兩秒並帶退避重試，因為連續背靠背發多個包會超出 registry 自身的處理速度，換來 `E409 Failed to save packument`。而每次重試都先重查 registry：報出來的失敗可能對應一次其實已經落實的寫入，所以「該版本現在存在且 integrity 與本 tarball 相同」算作已釋出，而不是又一個待放置的版本。

### workspace 內部引用走 `workspace:` 協定

所有指向 workspace 成員的引用都用 `workspace:` 協定。[釋出範圍策略](2026-09-22-workspace-release-ranges.zh.md)要求每個消費者的所有依賴區段對 DSH 使用精確的 `workspace:*` 引用，對 vendor/native 使用 `workspace:~` 引用，包括原生入口的可選平臺包。本地 workspace 連結方式不變。

`scripts/check-workspace-constraints.ts` 讀取 `pnpm-workspace.yaml` 宣告的全部成員及根清單，按依賴目標而非消費者目錄驗證範圍。Invariant companion 規則要求 `@deepseek-ai/dsh-invariants` 使用 `workspace:*`；依賴修復器保留 vendor/native tilde 範圍。因此，釋出的 DSH peer 要求匹配的釋出版本，而不接納後續相容版本。

### 釋出依賴門面使用顯式策略

[`verify-package-dependencies`](../../../../scripts/verify-package-dependencies.ts) 按已釋出的 Client 與 Host 用法分類 workspace 關係，讓受管包只保留 Cordis peer，並應用一份較小的顯式 Host 名冊。[釋出依賴門面與有限 peer 中繼](2026-08-26-published-dependency-faces.zh.md)記錄選包規則與理由。

`pnpm run benchmark:npm-resolution` 使用目前安裝的 npm 手動測量該依賴圖。`pnpm run benchmark:npm-resolution:next` 還會逐個嘗試每個可達且未設定的 Host 包，再序列復測領先候選。兩個命令都使用迴環 metadata registry 並拒絕包歸檔請求，因此耗時不包含包下載。排程器負載與 metadata 完成順序會使牆鍾閾值失去確定性，所以兩個命令都不進入聚合門禁。

### optional 依賴絕不在模組作用域被載入

`optionalDependencies` 裡的依賴，或帶 `peerDependenciesMeta.<name>.optional` 的 peer，在安裝出來的樹裡可以不存在——這份「可以不存在」正是 optional 的全部承諾。而靜態 import 在引入方模組載入時就求值，於是一個缺失的包不再表現為「這個能力不可用」，而是變成所有能走到該模組的程式碼的載入失敗。這種失敗只在「缺了該包的安裝樹」裡出現，而本倉沒有任何測試建構這種樹：workspace 安裝總是把每個包都裝上，所以單測、快照、打包安裝探針全都會過，而那個拒絕了這個 optional peer 的消費者拿到的卻是壞的包。

[`verify-optional-dependency-imports`](../../../../scripts/verify-optional-dependency-imports.ts) 堵掉這個洞。它從每個包自己的 manifest 讀取「這個包允許誰缺失」，再掃描會發布出去的檔案——`packages/*/*/src/` 與 `apps/*/src/`——且兩個編譯門面各掃一遍。`vendor/` 不在範圍內，那是[受 vendoring 政策管轄](../../../../vendor/README.md)的固定上游原始碼。值與型別的判定對著繫結好的 Program 做，而不是看 import 寫法，因為 `verbatimModuleSyntax` 是關的：編譯器本來就會消除繫結解析為型別的 import，所以 `import type {}`、`import {}`、內聯 `type` 說明符、以及解析為型別的具名繫結都不產生產物、一律放行，而裸 import、值繫結、星號 re-export 會被保留、一律報錯。只有 type 相位會消除 import：`import defer` 仍然解析並連結它的模組，只推遲求值，所以門禁把它算作一次載入。

報錯會點名這個包、點名是哪條宣告把它標成 optional 的，並按順序給出出路——把它作為型別引入（宣告合併需要的僅此而已），或者調整寫法讓模組作用域不再需要這個包。動態 `import()` 只是把失敗推遲到首次使用，它屬於那種確實需要這個包、並且自己處理缺失的呼叫方；會想到它，往往說明這個依賴並不 optional，所以門禁不把它作為解法給出。

初始化與啟動無關、且相容 CommonJS 的必需 Host 依賴可以使用 `createLazyRequire(specifier, import.meta.url)`。呼叫方保留 type-only import，傳入字面量依賴 specifier，並在所屬操作中呼叫返回的 loader。`verify-package-dependencies` 會把該字面量識別為 Host runtime edge，因此 Client/Host 包即使沒有靜態值 import，仍會把它保留在 `dependencies`。該工具只快取成功載入，並保留呼叫方相對解析；它不會把 optional 依賴變成必需依賴，也不會隱藏首次使用失敗。

### 釋出族物件

這個領域裡的實體是**釋出族**：一組共享版本基線與 tag 命名、可整體釋出的包。新增一族等於加一個子類和一條 workflow lane，不改核心。

| 物件 | 職責 |
|---|---|
| `ReleaseFamily` | 一族的身份：成員發現、版本基線、tag 字首、打包 payload 規則、已安裝入口 |
| `ReleaseMember` | 一個可釋出包：目錄、包名、版本、manifest |
| `publishOrder` | 按 npm 會安裝的依賴段加 peer 宣告做拓撲序，同層按包名排；安裝依賴成環是報錯而不是隨意定序，任何排不進去的 peer 邊被丟棄並點名 |
| `pack` | 把整族打進一個目錄並記錄上傳順序 |
| `verify` | 族的版本基線、完整列印出來的釋出順序；釋出時還要求本次執行來自該族的 tag、且成員可釋出 |
| `verify-packed-install` | 把一個或多個 pack 目錄的 tarball 裝進一次性 consumer，並驅動已安裝的可執行入口 |
| `publish` | 上面那三態 |
| `process` / `tarball` | 啟動命令、讀取打包 tarball 的唯一正家，其中的入口守衛讓每個腳本都可被 import |

dsh 族套用儲存庫的釋出 payload 策略（拒絕原始碼與宣告對映）。vendored 族保留上游 payload，因為那些 manifest 匯出 `./src/*`，去掉 `src` 會發出一個匯出對映指向不存在檔案的包。

### workflow 形狀：PR/push 上 pack，從手動 dispatch 工作流釋出

`pack` job 一趟遍歷整個釋出集，把每個成員打進同一個目錄，寫出上傳順序，整個目錄作為一份 artifact 上傳；它位於 `release.yml` / `release-vendor.yml`。釋出集是一個整體——絕不會出現一半的包已經上了 registry、另一半還在建置。

`pack` 無憑證，在每個 pull request 和每次 master push 上跑，所以一個 pull request 就能證明發布集仍能完整打出來。釋出則位於獨立的 `release-publish.yml` / `release-vendor-publish.yml` 工作流，僅 `workflow_dispatch`（因此不會作為 PR check 出現）：它重新打包目前樹，再按順序逐個釋出，掛在 `npm-publish` environment 後面等人工審批。pack 的 run 按 ref 分組，並行的 pull request 不會互相頂掉；全域 `Release-publish` 分組落在 `publish` job 上，因為 dist-tag 是共享的 registry 狀態。dsh 釋出成功後，釋出操作者按[釋出記錄](../../../../docs/session-format-status.zh.md#updating-the-record)核實其 Session 寫入器；若交付了更高的 Session 格式，則更新該記錄。

dsh 的驗證會一併安裝 vendored 族的 pack 產物。harness 的包把 vendored 框架宣告成 peer，而那些包屬於另一條序列，無憑證的 job 無法從私有 registry 取到——所以 dsh 的 `pack` job 為驗證而打包 vendored 族，釋出的仍只有 dsh 那一份。釋出工作流（`release-publish.yml`）重新打包目前樹，只發布 dsh 族。

驗證還會打一份 Landlock entry 的 tarball——`dsh-sandbox-local` 把它宣告為普通 `dependencies`——同時略去可選依賴。那些可選項背後的平臺包需要 musl 工具鏈且每個架構各建置一次，單臺 runner 產不出來；而裝不到它們的消費方也必須能起，這正是「可選」在這裡的含義。因此驗證按目錄內容讀取 tarball，而不是讀釋出順序：一個目錄可能只裝著為滿足跨序列依賴而打出來的包，任何釋出順序都不描述它。

已安裝消費方探針會捕捉 npm 的 HTTP 診斷資訊，並在安裝失敗時輸出。即使 npm 將 peer manifest 取得失敗報告為版本未定義的 `ERESOLVE`，日誌中仍能看到 registry 回應碼和快取狀態。

### 本次帶出的儲存庫改動

| 項 | 內容 |
|---|---|
| 釋出集 manifest | 去掉 `private: true`；按序列補 `publishConfig.access` 與帶各自 `directory` 的 `repository` |
| 釋出集邊界 | `packages/*/*`、`apps/*`、`vendor/*` 的全部成員 |
| 依賴協定 | 每個 workspace 消費者對 DSH 目標使用 `workspace:*`，對 vendor/native 目標使用 `workspace:~` |
| 根 `AGENTS.md` | 「vendored 包是 `private: true`」這條約定不再成立 |
| `vendor/README.md` | 記錄「`src` 加入 `cordis` 的 `files`」這條本地修改 |
| native 三包 | `publishConfig.access: public`，且其 workflow 不傳 `--access` |

### 與先前提案的關係

本 Note 取代 早先以產物為先的 NPM 基線提案中的版本方案與釋出集邊界：那篇的 `<base>-<時間戳>-<短 SHA>` 預釋出版本與 `dev-<base>` dist-tag 不再採用，vendor 也不排除在釋出集之外。兩篇一致的部分保留：pack 與 publish 分離、publish 只消費已驗證的 tarball、payload 與安裝後探針作為釋出門。

## 曾考慮的替代方案

**`<base>-<時間戳>-<短 SHA>` 版本號。** 曾計劃用於持續 dev 釋出。它與「把釋出版本留在儲存庫裡」衝突：版本內嵌 commit SHA，而把版本寫回會產生新的 commit，於是 SHA 只能指向被髮布的父 commit，這條鏈要靠約定解釋。改用數字版本後，`0.0.1-rc.1` 這類預釋出號已經覆蓋「先驗證再正式發」。

**用 `vendor/published.json` 帳本記錄每包的已發版本與 commit。** 這是 tag 方案之前的設計。它新增一份必須與 registry 不漂移的狀態檔案；per-package tag 提供同樣的 commit 指標，而 tag 本來就要打，不引入第二處狀態。

**事件級 tag（`vendor-r1`、`vendor-r2`）。** 為「一次釋出事件攜帶多個包版本」準備。既然由 registry 決定發什麼，workflow 就不再從 tag 推斷集合，per-package tag 夠用，而且每個 tag 攜帶的是它自己那個包的真實版本。

**把九個 vendored 包統一到一條 `4.0.x` 版本線。** 省掉變更檢測，但 cosmokit 會從 `1.8.1` 跳到 `4.0.1`、丟失上游血緣；九包內部的上游範圍（`^1.8.1` 之類）會立刻失配，必須改寫 vendored manifest。

**每次 vendor 釋出把九包全部 patch+1，不做變更檢測。** 機制最少，代價是內容與上一版逐位元組相同的包也拿到新版本號。tag 把變更檢測的成本壓到「讀一個 tag、跑一次 diff」，不值得為省這點讓版本號虛漲。

**只按版本號判斷「是否已釋出」，不比對內容。** 參照流程根本不查 registry：publish 逐個上傳，重複版本由 npm 拒絕。只按版本號跳過會漏掉「改了程式碼沒 bump」，而這是唯一會安靜地把舊位元組留在 registry 上的錯誤。代價是引入一次 registry 查詢和對建置可復現性的依賴。

**只做打包後安裝驗證，不起本地 registry。** 參照流程是把 tarball 解包成一棵樹、用普通 Node 驅動，這繞過了版本範圍解析。曾提議在 CI 裡起本地 registry 補這一層，被否：產物正確性已由既有測試覆蓋，釋出路徑由 master 的排練覆蓋，而 pull request 只需證明發布集能打出來。用 `file:` 說明符安裝依然會對每個內部依賴走一遍範圍解析。

**按入口閉包挑一部分包發。** 從 `@deepseek-ai/dsh` 與 `@deepseek-ai/dsh-web-frontend` 沿 `dependencies` 爬得到 156 個包，比全量少 61 個。但本倉的外掛是 `cordis.yml` 按名字掛載的、不是被 import 的：`vendor/cordis-plugin-group` 與 `vendor/cordis-plugin-logger-console` 落在依賴閉包之外，卻是執行時必需。照程式碼依賴挑的失敗形態是「消費方裝完起不來」，而且要額外持續證明「沒漏任何掛載項」。私有 scope 下多出來的包對組織外不可見。`python/`、`docs/` 與 `website/` 不屬於 release family 成員。

**在 `scripts/publish-npm-baseline.ts` 上擴充功能。** 它是本機發布腳本，把 pack 與 publish 放在同一程序，與「無憑證 pack、受保護 publish」的分離相反。它驗證過的零件——payload 驗證與已安裝產物探針——被搬運複用，以免 `pnpm run duplication` 判重複。

**一個 workflow 用 `family` 輸入選擇序列。** 兩套版本模型塞進一個檔案，會讓 concurrency 組、tag 字首、排練觸發條件全部分叉成條件表示式。一族一個檔案更短也更好讀。

**在釋出期改寫依賴範圍。** 與協定相比，改寫邏輯只在 CI 執行過，本機 `pnpm install` 看不出它是否正確，而且每次釋出都要重來一遍。

**在 CI 裡執行 bump 並把版本推回儲存庫。** 需要給 workflow 儲存庫寫權限，且釋出分支上的版本 commit 會與人的 commit 競爭。bump 與 commit 留在本地，CI 只核對與上傳。

## 後果

釋出腳本是帶入口守衛的可 import 模組，其判斷都有單測覆蓋：tag 命名、釋出順序與環報告、版本基線運算、payload 變更判據，以及各族的 payload 策略。第一版帶過的兩個缺陷——publish 命令在 import 時執行了 pack 命令、變更判據對 `vendor/cordis` 的原始碼改動失明——正是這類測試在對應接縫上能抓住的。

一個 pull request 會為兩條序列跑完整的 pack（無憑證），並把打包好的 dsh tarball 裝進一次性 consumer，用普通 Node 驅動 `dsh --version`。這個探針刻意只有一條命令：它證明 `files` 選出了完整 payload、釋出出去的範圍可解析，不涉及任何互動行為。

代價：

- **tag 可能與 registry 漂移。** 為失敗釋出而推的 tag 由 bump 的 registry 核對攔下，但只在有憑證的地方；未授權驗證的機器只報告這道核對被跳過。
- **變更判據依賴 tag 可見。** shallow clone 或未拉 tag 會把 vendored 族的判據退化成「全部首發」。`fetch-depth: 0` 是前提，不是最佳化。
- **協定改寫觸及 1504 處依賴宣告。** 它不改變本機解析（pnpm 本來就從 workspace 解析），但改變了釋出出去的範圍寫法。
- **私有包需要憑證才能安裝。** 任何消費方——CI、沙箱 e2e、外部使用者——都要持有 scope 憑證，Landlock 三包也在其中；它們從未釋出過，所以沒有切斷既有的匿名安裝路徑。
- **`repository` 指向的組織與執行 workflow 的組織不同。** 用 token 釋出不受影響；npm 的 OIDC attestation 要求二者一致，屆時要麼把 `repository` 改指過去，要麼從它指向的組織釋出。
- **位元組可復現性是假定的，沒有實測。** 「integrity 相同則跳過」這一態建立在「同一 commit 兩次 pack 得到相同位元組」之上。目前沒有任何東西測量過它：若建置嵌入了絕對路徑或時間，重跑會誤報失敗。在第一次可能被重跑的釋出之前實測，若不成立就退到比對 tarball 內逐檔案內容雜湊。
- **用較舊的 artifact 重跑 publish 會把 `latest` 拉回舊版。** 釋出是按版本決定的，所以在較新版本之後重發較舊的一批，會讓穩定 dist-tag 再次指向舊版。排練用的是預釋出版本，它永遠不佔 `latest`。
- **首發是一次大步。** 九個 vendored 包與整個 dsh 集一次發出，任何 payload 缺陷都會集中在同一次釋出裡暴露——這正是先用預釋出版本把完整鏈結走一遍的理由。
