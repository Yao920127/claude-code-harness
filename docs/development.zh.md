# 開發指南

[English](development.md) | 中文

搭建教學引導新貢獻者從準備前置條件開始，直到檢出目錄透過檢查。後面的貢獻者參考介紹儲存庫佈局、日常工作流和 CI 組織方式。設計依據與實作細節屬於連結的 Agent Note 和腳本。

<a id="setup-tutorial"></a>

## 搭建教學

### 前置條件

- Node.js 支援 22.19+ 與 24+。CI 覆蓋 22.19、24 和 26；見 [Node 引擎下限 Agent Note](../.agents/notes/implemented/process/2026-07-06-node-engine-floor.zh.md)。
- 啟用了 Corepack 的 pnpm。儲存庫在 `package.json` 中固定使用 `pnpm@11.7.0`；如果 `pnpm --version` 無法透過 Corepack 解析，請先執行 `corepack enable`。
- Git 2.26 或更高版本；掛鉤設定會啟用 Git 的 worktree 專屬設定擴充功能。
- 可選：一個 DeepSeek API key，用於 Web、headless 和 ACP（Agent Client Protocol）自動化 agent（智慧代理）演示以及真實 API 的 e2e 測試。

### Windows 與 WSL 2

在 Windows 上，可以使用原生工具開發，也可以透過 WSL 2 使用 Linux 環境。WSL 2 既可用於驗證 Linux 行為，也可在原生依賴編譯或檔案系統權限阻礙 Windows 開發時提供使用 Linux 工具鏈的途徑。每種環境都需要準備相應的執行時、編譯工具和權限；WSL 是可選項。

將檢出目錄、已安裝的依賴和工具鏈放在同一作業系統環境中。使用 WSL 2 時，將檢出目錄放在 Linux 檔案系統中；使用 Windows 原生工具時，則使用 Windows 檔案系統。跨兩種檔案系統存取會給 Git、依賴安裝和建置等 I/O 密集型操作增加開銷。參見微軟的[檔案儲存與效能指南](https://learn.microsoft.com/en-us/windows/wsl/filesystems#file-storage-and-performance-across-file-systems)。

在每種環境中分別安裝依賴，因為不同作業系統使用的原生二進位制和連結可能不同。測試結果適用於執行測試的環境；Windows 特有行為仍需在原生 Windows 上驗證。

### 首次搭建

在儲存庫根目錄安裝依賴：

```sh
pnpm install
```

安裝過程還會透過 `scripts/install-lefthook.mjs` 設定 worktree 本地的 Lefthook 掛鉤。[worktree 本地掛鉤 Agent Note](../.agents/notes/implemented/process/2026-07-27-worktree-local-lefthook.zh.md) 負責掛鉤路徑的安全約定。

如果依賴是從快取恢復或 `postinstall` 被跳過而導致掛鉤缺失，請手動安裝：

```sh
node scripts/install-lefthook.mjs
```

如果包裝腳本拒絕現有 Git 設定或報告陳舊鎖，請遵循其診斷和所連結的 Agent Note，不要憑猜測編輯 worktree 中繼資料。移動檢出目錄後，請重新執行包裝腳本以重新生成自有路徑。

新克隆後請先執行一次型別檢查：

```sh
pnpm run typecheck
```

`pnpm run typecheck` 成功退出即表示搭建完成。

## 貢獻者參考

<a id="typescript-project-layout"></a>

### TypeScript 專案佈局

儲存庫使用相互隔離的 Host 與 Client aggregate。普通包只登記進其中一個 aggregate；Host 包進入 `tsconfig.host.json`，Client 包進入 `tsconfig.client.json`；`host/webserver`、`compaction/compaction` 與 `typert/registry` 三個包被兩個 aggregate 同時引用，作為共享 leaf，讓兩側對同一份原始碼做型別檢查。

| 檔案 | 角色 | 是否構成 program？ |
|---|---|---|
| `tsconfig.json` | solution 根：`extends` base、`files: []`、引用兩個 aggregate。它是 tsserver 發現入口，也是顯式執行整張 Project Reference 圖時的入口；經繼承的 `paths` 充當 tsx 執行 `scripts/` 時的解析設定。 | 否 |
| `tsconfig.host.json` | Host aggregate：Host 包、範例、測試、腳本和 website，以及 `api/remotes` 的 Host 特例 project。 | 是 |
| `tsconfig.client.json` | Client aggregate：`packages/client/*` 包及其測試、`apps/web`，以及 `api/remotes` 的 Client 特例 project。 | 是 |
| `tsconfig.base.json` | 共享 compilerOptions 與原始碼 `paths` 對映。同時是各 vitest 設定讓 vite-tsconfig-paths 指向的解析門面：它沒有 `include`，因此其 `paths` 適用於任何 importer。 | 否 |
| `tsconfig.base.client.json` | 瀏覽器編譯設定（`jsx`、DOM lib、`types: []`），由 Client aggregate 和每個 `packages/client/*` 包 extends。 | 否 |

Host 與 Client 保持兩個 aggregate program，是因為兩側在相同鍵下以不同服務對 cordis `Context` 介面做宣告合併；單一 program 同時看到兩份合併會報衝突。這種衝突只存在於 `ts.Program` 內部——模組解析永遠不會觸發它——所以 solution 可以同時引用兩個 aggregate，一個 paths 門面也可以橫跨兩側。由此推出三條紀律：

- `tsconfig.base.json` 永不新增 `include` 或 `files`：它們會洩漏進每個 extends 它的包專案，並收窄門面的全匹配範圍。
- 建構全倉 `ts.Program` 的腳本顯式以 `tsconfig.host.json` 或 `tsconfig.client.json` 為種子——根 solution 永不作為種子，因為把兩個 aggregate 展平進一個 program 會撞上 `Context` 合併衝突。
- 新包只登記進一個 aggregate；只有上述拆分包同時攜帶兩個 leaf 設定，共享 leaf 因兩側需要對同一份原始碼做型別檢查而登記進兩個 aggregate。包同時具有 Node loader 入口和 browser 入口並不構成拆分理由；普通 Client 外掛的兩份執行時產物都在 Client 建置階段生成。

拆分 Host/Client tsconfig 的包有六個：`api/remotes`、`api/gateway`、`api/session-controller`、`api/workspace-controller`、`client/connection` 與 `session-query/session-log-export`。`api/remotes` 的 Host 入口進入 Host Typert 圖，而 Client 入口匯入生成的 `/remote` 宣告；`session-log-export` 則讓 Node archive 生產程式碼不進入瀏覽器 controller。每個拆分包根 `tsconfig.json` 因此只作為 solution，兩個 aggregate 和直接消費方分別引用 `tsconfig.host.json` 或 `tsconfig.client.json`。workspace `constraints` 門禁遍歷可達的 Project Reference 圖，並按各引用 project 自身的 compiler face 檢查：只有單一設定的目標可由任一 face 引用，拆分設定的目標則必須引用匹配的 leaf，不得引用 solution 根或另一側 leaf；該門禁按「兩個 leaf 設定同時存在」自動發現拆分包，所以新拆分的包會自動納入管轄。[`api-remotes` README](../packages/api/remotes/README.zh.md) 與 [`session-log-export` README](../packages/session-query/session-log-export/README.zh.md)分別說明其拆分。

根建置按生成依賴排序：

```sh
tsc -b tsconfig.host.json
tsdown --env.DSH_BUILD_FACE host
pnpm --filter @deepseek-ai/dsh-desktop run bundle
tsc -b tsconfig.client.json
tsdown --env.DSH_BUILD_FACE client
pnpm run build:web
```

兩次 tsdown 都匹配 `vendor/*`、`packages/*/*` 與 `apps/cli`，Host 階段另外匹配 `apps/desktop-host`；兩者都不掃描建置產物來發現 Client 包，也不維護 Host/Client 包過濾表。包內 tsdown 設定根據 `DSH_BUILD_FACE` 決定目前階段的入口：普通 Client 外掛在 Client 階段同時生成 Node loader 與 browser bundle；`api-remotes` 透過 `hostPhase: true` 提前生成 Host 入口，再在 Client 階段只生成 browser bundle。tsdown 只消費 `lib/types` 中由前置 tsc 發射的 JavaScript。tsdown 並行建置匹配到的 workspace 成員；`apps/desktop` 的主程序 bundle 需要從工作區 devDependencies 的 `lib/` 產物內聯這些包，因此在 Host 階段之後單獨一步打 bundle（[Desktop README](../apps/desktop/README.zh.md#bundled-workspace-dependencies)）。

Typert 只在 Host tsdown 中以 `tsconfig.host.json` 為種子執行。它分析 Host 型別並生成 Host 反射產物及 Host-for-Client Remote 投影；Client tsdown 不啟動 Typert。`pnpm run typecheck` 因此先執行完整 Host lib 階段，再執行 Client tsc；`pnpm run build` 繼續執行 Client tsdown 和 Web 建置。

`pnpm run build` 會內聯根包版本、七位原始碼 commit，並在 Git 報告本地變化時內聯 dirty 標記；呼叫方提供的其他 `DSH_CLIENT_*` 值也會被繼承。`pnpm run build:official` 是與 CI 和 release 產物建置等價的跨平臺本地命令，並省略本地 dirty 標記。每次完整建置成功後都會寫入一份被 gitignore 的記錄，把精確公開值與 Vite 輸出及動態 client bundle 繫結；release 打包和 built Web 測試會拒絕缺少記錄或被後續區域性建置改動的產物。`pnpm run dev:web` 會先執行這次完整建置（`--skip-build` 則複用現有產物樹），再讀取一次目前版本和 Git 狀態，並在本次工作階段的所有 watcher stage 之間共享該環境；它不會驗證完整建置記錄，因為 watcher stage 會重寫記錄覆蓋的產物。

靜態分析和測試透過 base 的 `paths` 對映把工作區 import 解析到 `src`，且必須在乾淨樹上透過；消費建置產物 `lib/` 的門禁顯式宣告該依賴。生成的 Host-for-Client Remote 宣告是有意設定的例外：公共 `typecheck`、`lint` 和 `doc-typecheck` 命令會先生成這些宣告，而內部 `*:contracts-ready` 腳本假定呼叫它的公共命令或排程器門禁已經依賴 Typert 約定生成階段或完整建置。tsc-first 發射職責見 [ts-build-config Note](../.agents/notes/implemented/process/2026-06-17-ts-build-config.zh.md)，門禁準備約定見 [Typert Remote Agent Note](../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md)。

業務服務在 Host 使用 `@Remote` 或 `@RemoteScope` 宣告可呼叫方法；Host 建置生成 Host-for-Client 型別與執行時貢獻，Client 的 `api-remotes` 組合載入這些貢獻並掛到 `ctx.remote` 與作用域 `agentCtx.remote` namespace。兩側的生成產物、裝配關係、SRC 開發退回和 Web 建置順序見 [API Gateway](api-gateway.zh.md)。

如果相關的本地檢查需要使用建置後的包產物，請先建置一次：

```sh
pnpm run build
```

`pnpm run hygiene` 包含 `publint`（用建置出的 `lib/*.js` 檔案驗證包入口點）和 `verify-node-next-types`（用一個臨時的 NodeNext 消費方驗證建置出的宣告檔案）。新 worktree 在 `pnpm run build` 執行之前沒有打包的 JS 和宣告檔案；普通提交和推送無需建置，除非所選檢查會使用這些產物。

### 環境變數

真實的 DeepSeek 介面卡和需要金鑰的 agent 演示從環境變數或儲存庫根目錄一個被 gitignore 的 `.env` 檔案讀取憑證：

```sh
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://... # optional
```

`DEEPSEEK_BASE_URL` 可選，預設為公開 API。請勿提交真實憑證。未設定 `DEEPSEEK_API_KEY` 時，真實 API 的 e2e 套件會自動跳過。

### Git 整合

`.i18n.yaml` 記錄使用 Git 預設文字合併。只有當兩個分支都修改了同一標題分節中的語言特有內容時，記錄才會衝突；先解決 Markdown 衝突，再重新執行 `pnpm run verify-translation-pairing --write <pair>`。如果 `pre-merge-commit` 拒絕原本能幹淨完成的合併，Git 會把完整結果留在暫存區但不建立提交；請修復失敗後執行 `git commit`，或執行 `git merge --abort`。

lefthook 在 `lefthook.yml` 中設定，作為快速的本地檢查點：

- `pre-commit` 對照暫存的配對文件 blob 驗證暫存的配對記錄，使用不載入專案的 `.oxlintrc.staged.json` 設定驗證暫存檔案，並透過一次有界重試應用 Oxlint 修復，在暫存檔案屬於 `THIRD_PARTY_NOTICES.md` 的輸入時重新生成該檔案，然後檢查暫存 diff 中的空白錯誤，並執行 vendor manifest（中繼資料清單）守衛；
- `pre-merge-commit` 在 Git 建立自動合併提交前執行同樣以索引為準的配對檢查；
- `pre-push` 執行 `pnpm run typecheck`；該命令會先完成包含 Typert 約定生成的完整 Host lib 階段，再執行 Client TypeScript 檢查。

vendor manifest 守衛檢查 `vendor/*/src` 下的改動是否連同對應的 `vendor/README.md` manifest 更新一起暫存。請在編輯 vendor 程式碼前先閱讀 `vendor/README.md`。

除限定範圍的暫存記錄驗證外，這些掛鉤有意不執行測試、快照、文件檢查、建置或 `hygiene`。貢獻者只執行一次[與改動行為相關的檢查](../AGENTS.md#run-relevant-checks-locally)；CI 負責全量覆蓋率門禁、建置產物冒煙測試，以及 Node 22.19、24 和 26 相容性矩陣。

貢獻者可以選擇執行 `pnpm run check:all`，執行全面的本地門禁集。該命令獨立於 Git 掛鉤，也不是對 agent 的指令。

### CI 門禁

keyless [CI 工作流](../.github/workflows/ci.yml) 將獨立門禁分組到若干寬粒度 lane，並在受支援的 Node 版本上執行一組較小的相容性檢查。產物消費方在各自 lane 內等待一次 build。必需 benchmark 在標準 GitHub 託管 Linux 上獨立執行；[benchmark 執行器決策](../.agents/notes/implemented/testing/2026-09-06-standard-hosted-benchmark-runner.zh.md)擁有路由及 job 超時。單獨的真實 API 工作流按其設定的 worker 上限執行 `pnpm run test:e2e`。目前門禁和 job 清單以 [scripts/run-gates.ts](../scripts/run-gates.ts) 和工作流檔案為準。

不帶憑證的 dsh 依賴佈局檢查與 dsh/vendor 打包演練僅在 `DSH_CI_FAILOVER_LINUX=selfhosted`，且事件為受信任的 master 推送或同儲存庫、非 fork、非 Dependabot 拉取請求時使用現有 Linux 自託管池。其餘情況（包括手動觸發）均使用 `ubuntu-24.04`；手動釋出仍使用託管執行器。持久化儲存隔離與退回限制見[釋出演練執行器決策](../.agents/notes/implemented/process/2026-09-06-release-rehearsal-selfhosted.zh.md)。

### 日常命令

根目錄的[貢獻者說明](../AGENTS.md#commands)概述常用命令，[`package.json`](../package.json) 與 [scripts/run-gates.ts](../scripts/run-gates.ts) 則負責目前腳本和門禁清單。請選擇覆蓋變更表面的最小檢查集。文件變更使用 `pnpm run doc-sync`；包公開行為變更還需更新所屬 README 或 JSDoc，而基於建置產物的檢查需要先執行 `pnpm run build`。

### Profile 執行

從原始碼 checkout 執行這些演示前，請單獨執行儲存庫建置：

```sh
pnpm run build
```

單次執行的 Headless coding agent 需要環境變數或儲存庫根目錄 `.env` 中的 `DEEPSEEK_API_KEY`：

```sh
pnpm dsh --profile headless "summarize this workspace"
```

PTC mode 演示啟用程式碼式工具展示，並執行同一個 headless profile：

```sh
pnpm run demo:ptc -- "summarize this workspace"
```

### 應用命令

Web 與 Desktop 共用同一對命令。`start:*` 啟動上一次 `pnpm run build` 的產物；`dev:*` 先執行該建置再啟動。Web 還會在原始碼修改時持續重建 client bundle，因為它的 Host 從原始碼執行，而瀏覽器載入的是建置產物：

```sh
pnpm run start:web       # serve built Web artifacts through the source launcher (the same launch as pnpm dsh web)
pnpm run dev:web         # build, serve, and rebuild Web client bundles on source edits
pnpm run start:desktop   # launch built Desktop artifacts
pnpm run dev:desktop     # build, then launch Desktop
```

Web 命令後面的參數會傳給 `dsh web`，例如 `pnpm run dev:web --no-open --port 3081`；`dev:web` 還接受 `--skip-build` 複用現有產物樹，以及 `--no-serve` 只執行重建 watcher、配合別處啟動的伺服器。兩個 Web 命令使用正常的 Harness home，而 Desktop 命令使用 [Desktop README](../apps/desktop/README.zh.md) 描述的隔離開發 home。根目錄 `Makefile` 以 `make web`、`make dev-web`、`make desktop`、`make dev-desktop` 和 `make build` 命名同一套命令；`ARGS='--no-open'` 用於轉發參數。

### TODO 標記

請使用以下三種註解標籤之一標記程式碼中的已知問題，按緊急程度排序：

- `FIXME`：應當阻塞新版本釋出的問題。除非評審者明確同意該更改可以合併，否則釋出版本不應包含未解決的 `FIXME`；
- `TODO`：應當儘快修復的問題，等資源到位即可處理；
- `XXX`：也許某天會修復的問題，優先順序最低，不作承諾。

請選擇與緊急程度匹配的標籤，讓瀏覽程式碼的人一眼分清「釋出阻塞」和「有空再說」。

<a id="documenting-types-verbatim-ts-type-equiv"></a>

### 逐字記錄型別定義（`ts type-equiv`）

[子系統](subsystems/README.zh.md)頁面會把與原始碼等價的宣告及其原始 JSDoc 一併貼上，讓讀者看到確切型別定義和原始碼約定。為防止貼上內容在原始碼變化時漂移，請將其圍欄為 ` ```ts type-equiv `（而不是 ` ```ts `），並在 `scripts/type-equiv.manifest.json` 中登記它映像的原始檔和符號：

```json
{ "doc": "docs/subsystems/session.md", "symbol": "SessionEvent", "source": "packages/core/session/src/types.ts" }
```

`pnpm run verify-type-equiv`（`doc-sync` 的一環）隨後透過 TypeScript 解析器從原始碼提取該符號的宣告及其附帶的 JSDoc，並斷言程式碼塊同時匹配兩者。對於不應把實作體寫進目錄的類，請使用 ` ```ts public-api ` 並設定 `"projection": "public-api"`；門禁檢查的投影會保留公共欄位、建構函式、存取器、方法以及類和成員的原始 JSDoc，同時省略實作體和私有或受保護成員。比對會忽略空白和非 JSDoc 註解，但要求保留每條原始 JSDoc（包括成員文件），讓讀者同時看到原始碼約定和確切型別定義。該門禁按文件、符號和投影，在主塊與 manifest 條目之間強制 1:1 對應；只有當配對 `.zh.md` 塊的完整受跟蹤圍欄序列與其無字尾兄弟檔案按位元組一致且順序相同時，才會複用後者的條目。`doc-typecheck` 對可編譯圍欄應用同一派生規則，同時跳過兩種原始碼等價圍欄的編譯，並將其排除在 opt-out 比例的計算之外。當你改動一個已記錄的型別宣告或其 JSDoc 時，門禁會失敗直到你更新貼上內容；當你增刪一個主塊時，請在同一個變更裡更新 manifest。
