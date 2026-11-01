# Agent Note: 釋出依賴門面與有限 peer 中繼

Status: implemented

[English](2026-08-26-published-dependency-faces.md) | 中文

## 問題

一個包可能同時包含瀏覽器 bundle、Host 入口、共享 TypeScript 宣告和 Cordis 注入中繼資料。把這些關係全部編碼成必需 npm peer 會使已釋出 CLI 的安裝代價過高：npm 會自動安裝 peer，並沿深層、反覆匯合的 peer 路徑重複執行放置檢查。修改版本範圍或把 peer 標成 optional 都不會消除這類遍歷。

Client 建置輸入由釋出 profile 選擇，而 Host value import 由匯入它的包透過 Node 載入；兩者需要不同的 npm 區段。把規則應用到每個 Host 包雖然也能縮小依賴圖，卻會製造一個沒有對應安裝收益的大範圍遷移。

## 決策

### 包選擇

[`verify-package-dependencies`](../../../../scripts/verify-package-dependencies.ts) 統一負責依賴區段策略。它始終覆蓋 `packages/client/` 下的包，以及宣告 `dsh.client` 的每個非實驗包。在該目錄內，`dsh.client` 標記需要掃描 Host 入口的 Client/Host 包；沒有該宣告的包是僅供 Client 編譯的靜態輸入。在目錄外，`dsh.client` 選擇相同的 Client/Host 掃描。僅有 `"./client"` export 只是 API，不參與 npm 依賴策略選包。

[`package-dependency-policy.ts`](../../../../scripts/package-dependency-policy.ts) 提供顯式 Client 門面 include 與 exclude 列表。include 用於沒有 `dsh.client` 的例外包，exclude 用於移除 `packages/client/` 之外自動發現的雙面包。驗證器拒絕未知、失效、冗餘、重複、相互重疊和無法生效的設定項。include 列表為空；exclude 列表包含 `@deepseek-ai/dsh-api-session-controller` 和 `@deepseek-ai/dsh-api-workspace-controller`。把 Session Controller 加回會多遷移九條 Host 邊，而五次候選複測的 resolver 中位數僅改善 0.15 秒。

Host-only 包透過另一份顯式列表加入同一策略。該列表包含 `@deepseek-ai/dsh-llm` 和 `@deepseek-ai/dsh-session`；原始碼 import 不會自動擴大列表。

### 依賴區段

每個受管包都把 `@deepseek-ai/cordis` 保持在範圍一致的 `peerDependencies` 和 `devDependencies` 中。Cordis 是由應用控制身份的共享外掛執行時。

Host 入口閉包中的執行期 value import 所到達的 workspace 包，只有在其完整執行時入口列入 `duplicateSafePackages`，或每個執行期匯出都列入 `safeHostDependencyExports` 時才只屬於 `dependencies`。包級列表包含 `@deepseek-ai/dsh-brand`、`@deepseek-ai/dsh-typert-protocol`、`@deepseek-ai/dsh-util-crypto` 與 `@deepseek-ai/dsh-util-values`：它們的值無狀態、按結構識別，或透過帶版本且可互操作的描述符儲存。匯出表負責處理其他匯出無法提供同等保證的混合包中的已審查值。

constructor 身份或模組狀態必須共享的匯出列入 `peerRequiredHostExports`；一旦使用這類匯出，整條包依賴邊就保留在範圍一致的 `peerDependencies` 與 `devDependencies` 中。每個匯出表的 key 都是精確 module specifier，每個 value 都是經審查的匯出集合。驗證器從 Host 入口沿執行期本地 import 掃描，記錄具名與預設 import 和 re-export，並拒絕既沒有包級分類、也沒有匯出級分類的匯出；除非完整的精確入口已按包分類，否則 namespace、dynamic 和 side-effect import 仍無法限定範圍。

Client bundle 使用的 workspace import、純型別 import、模組擴充、`dsh.client.inject` 和僅有中繼資料的現存 peer 只屬於 `devDependencies`。Host 執行時 import（包括額外 Node 入口）遵循 Host 分類。[瀏覽器第三方建置輸入](2026-09-08-browser-third-party-build-inputs.zh.md)規定普通第三方宣告，部分取代本決策對它們原區段的保留。[釋出範圍](2026-09-22-workspace-release-ranges.zh.md)要求 DSH 引用使用 `workspace:*`，vendor/native 引用使用 `workspace:~`。

部分開發期關係只存在於 `dsh.client.inject` 或 TypeScript project reference 中。策略的 `configurationOnlyDevDependencies` 表只列出這些已評審的依賴邊，並將它們保留在 `devDependencies` 中。

驗證器讀取原始碼 manifest 和原始碼檔案，因此可以在沒有已建置 `lib/` 的乾淨工作樹上執行。每個被選中的 Host face 都必須存在 `src/index.ts`。未分類的 Host 執行期匯出屬於策略違規，會阻止 `--fix` 的全部寫入；維護者必須審查該匯出，並選擇分類該匯出、修改原始碼關係或修改選包範圍。原始碼安全檢查透過後，`--fix` 只執行分類所確定的區段與範圍變更，並刪除失效的 peer 中繼資料。

### 維護流程

不帶 `--fix` 執行驗證器，會以只讀方式檢查選包範圍、匯出分類、依賴區段、workspace range 與 peer metadata。未分類的執行期 import 會按每個匯出分別報告可點選的 `path:line:column` 診斷。

```sh
pnpm run verify-package-dependencies
```

生成 manifest 前，在 [`package-dependency-policy.ts`](../../../../scripts/package-dependency-policy.ts) 中分類每個新增 Host 執行期匯出。`duplicateSafePackages` 允許一個精確根入口的全部執行期匯出使用普通 dependency；`safeHostDependencyExports` 只允許列出的匯出；`peerRequiredHostExports` 讓整個提供包依賴邊保留在範圍一致的 peer 與開發區段。一個匯出只能獲得一種分類。移除包級的 identity 或狀態要求後，按包分類其根入口；只改變混合包中的一個匯出時，則更新精確匯出表。只有當一條依賴邊的所有 import 都不再使用 peer-required 匯出時，它才會成為普通 dependency。

用一條命令生成受管 manifest 和所有直接派生產物。存在策略違規時，`--fix` 不寫任何檔案；成功後，它會重新整理 `pnpm-lock.yaml`、重新生成中英文 module graph 及其配對記錄，並列印普通 dependency 與 peer-required 依賴邊。

```sh
pnpm run verify-package-dependencies -- --fix
git diff -- packages pnpm-lock.yaml docs/module-graph.md docs/module-graph.zh.md docs/module-graph.i18n.yaml
```

透過僅 metadata 的本地 registry 測量工作樹依賴圖與 Git ref。每輪都會建立全新 consumer 與 npm cache，用明確的 peer、hoisting 和 registry 設定替換繼承的 npm 設定，執行 `npm install --package-lock-only`，拒絕下載包歸檔，並保持儲存庫不變。`--runs` 控制重複次數，`--timeout-ms` 會在期限到達後終止 npm 程序樹，可選 `--max-ms` 會在最慢一輪超過閾值時讓命令失敗。

```sh
pnpm run benchmark:npm-resolution -- --runs=5 --timeout-ms=300000
pnpm run benchmark:npm-resolution -- --ref=origin/master --runs=5 --timeout-ms=300000
```

透過兩個互不相容的 DSH 合成版本驗證包落位。驗證器把每份目前 DSH manifest 分別複製為 `0.1.0` 和 `0.2.0`，只要求 npm 生成 package lock，並拒絕跨版本 DSH 解析、非預期 DSH 路徑、兩套版本清單不一致、多個 Cordis 實例以及包歸檔請求。本地索引只包含目前平臺已安裝的 metadata，因此只報告而不拒絕 npm 已接受的不可用可選包探測。

```sh
pnpm run verify-npm-install-layout
```

計算下一項 Host 包時，命令會在記憶體中應用目前策略、測量 baseline、逐個嘗試可達且未設定的包，並序列復測粗篩中最快的候選。正數 `gainSeconds` 等於 `baseline median - candidate median`；`--candidates` 限定名冊，`--jobs` 控制粗篩並行度，兩個階段都不寫 manifest。選中的候選仍需先完成匯出分類，才能加入 `hostPackages`。

```sh
pnpm run benchmark:npm-resolution:next -- --runs=1 --finalist-runs=5 --finalists=5 --jobs=8 --timeout-ms=120000
```

### 效能驗證

[`verify-npm-install-layout`](../../../../scripts/verify-npm-install-layout.ts) 是 `Release (dsh)` workflow 在每個 pull request 和 master push 上執行的確定性包路徑與版本檢查；它不限制 resolver 耗時。[`benchmark-npm-resolution`](../../../../scripts/benchmark-npm-resolution.ts) 與 [`benchmark-next-package-dependency`](../../../../scripts/benchmark-next-package-dependency.ts) 保持為手動工具，因為 resolver 耗時會隨機器負載和 metadata 完成順序變化。它們透過全新 consumer 和僅 metadata 的執行，把 npm 依賴樹計算與 registry 延遲、包歸檔下載分離，因此相對結果可以定位 peer 中繼，但不構成釋出時效能承諾。

生成後的策略目前在 13 個包中留下 27 條位於 `dependencies` 的受管 Host 執行時邊。兩條邊仍位於 `peerDependencies`：`dsh-api-remotes → dsh-scope` 使用 `carrierKeyOf`，`dsh-session → dsh-scope` 使用 `scopeOf` 與 `scopeTarget`。

## 考慮過的替代方案

**把內部關係繼續保留為 peer。** npm 必須沿匯合的祖先路徑放置並驗證每個必需 peer；即使內部版本全部相容，也會重新產生已報告的安裝耗時問題。

**用 `"./client"` export 作為 Client 門面名冊。** 包可能釋出 Client 型別或瀏覽器 API，卻不貢獻動態裝載 row。選中這類包會把遷移擴大到 Goal、Session Title 和 Todo 等無關 Host 包。`dsh.client` 標識動態 row，而 `packages/client/` 目錄獨立覆蓋靜態 Client 輸入。

**拍平全部 Host 包。** 這會移除更多 peer 工作，卻把遷移擴大到單包 benchmark 收益可忽略的包。顯式 Host 列表會保留其餘 peer 約束，直到測量結果證明應增加新成員。

**把所有 Client 相關宣告都改為僅開發依賴。** 雙面包的 Host value import 仍是實際的 Node 載入；從釋出依賴圖中刪掉它們，會讓包依賴 profile 的偶然提升。

**在 CI 中強制牆鍾閾值。** Resolver 耗時會隨機器負載和 metadata 完成順序變化。確定性的 manifest 分類進入 CI，耗時測量保留為維護者 benchmark。

## 結果

釋出依賴圖按產物歸屬而不是原始碼目錄耦合分類。Client bundle 與釋出 profile 提供瀏覽器執行時身份，Host 模組安裝自己載入的可重複實體，而 Cordis 和顯式標為 peer-required 的 Host 匯出繼續共享包實例。

把公開純型別關係放進 `devDependencies`，意味著獨立 TypeScript 消費者在使用該宣告時必須自行安裝被引用的型別包。釋出 profile 會安裝完整的受支援包族；若要支援獨立組裝的 TypeScript 消費者，需要另一套策略。

顯式 override、Host 列表、包分類與匯出分類都是需要評審的決策。當 `instanceof` 使用的 class constructor、私有 symbol 和模組本地 registry 跨包傳遞 identity 或不可存取狀態時，它們要求 peer。穩定的結構標記或帶版本的 prototype 描述符可以讓特定值互操作，但僅僅屬於 value import 並不能做到這一點。修改分類會改變安裝圖，因此需要執行聚焦 verifier 測試、雙版本佈局檢查並重新執行 next-package benchmark。僅 metadata benchmark 是診斷證據，不是釋出時安裝耗時承諾。
