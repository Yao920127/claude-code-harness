# Agent Note: profile 外掛組合包取代固定的表層 overlay

Status: implemented

[English](2026-08-05-profile-plugin-bundles.md) | 中文

## Problem

`dsh` 啟動器硬編碼了自己的組合：`base.cordis.yml` + `web.cordis.yml` 隨 `apps/cli` 一起交付，三種各自定製的入口模式（`--config`、`web`、`-p`）各帶一套層棧，外加一個全域的個人 overlay（`$DSH_HOME/config.yaml`）。想把樹外外掛（一個 TUI、一個提供者擴充功能包）裝進已交付的表層，只能修改儲存庫；第三方包也沒有任何位置可以貢獻預設組合。

## Decision

一切都變成 **profile**：即目錄 `$DSH_HOME/profiles/<name>`，其中包含一個 `package.json`（pnpm 管理的樹外外掛 `dependencies`，加上 profile manifest `dsh.profile` 及其有序的 `bundles` 層列表）和一份使用者 `cordis.patch.yml`。**組合包**（bundle）是宣告瞭 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 的 npm 包；兩種 manifest 分別位於互不相同的 `dsh.profile` / `dsh.bundle` 鍵下，因此一份 package.json 能說明自己扮演哪種角色。設定樹在空的根之上組合：按 `dsh.profile.bundles` 順序應用每個組合包的 patch，然後是使用者層與 `--patch` overlay——啟動與 `--dump-config` 共享同一條 `applyEntryPatches` 路徑。隨後，[應用持有命令列的決策](../../archived/architecture/2026-08-06-app-owned-command-line.md)又把呼叫期取值從啟動器派生的 patch 遷移到了啟動服務。

預設 Profile 範本為 `web`、`headless`、`sdk` 與 `acp` 使用 `@deepseek-ai/dsh-base` 作為共享核心，並在其上疊加一個模式組合包。[獨立 `sdk-minimal` profile](../../../../packages/bundle/sdk-minimal/README.zh.md)則只列出一個擁有完整顯式設定樹的組合包。通用的 `dsh --profile <name>` 把剩餘參數交給該 profile 的命令列啟動行：Web 持有自己的 flag 家族，headless 持有任務位置參數，協定 profile 不接受應用選項。patch overlay 使用啟動器持有的 `--patch`。新的非內建目標可以使用 `--from-default-profile <template>`，在啟動或設定 dump 之前複製一個預設範本的 bundle 列表與 patch 過載策略。這會建立依賴為空、使用者 patch 為空的獨立 profile：它既不讀取與範本同名的本地 profile，也不記錄繼承關係。launcher 會以獨佔方式領取完整的目標目錄，因此既有狀態和並行建立者都會在不作修改的情況下失敗。`dsh plugin --profile <name> <args...>` 是一層薄薄的 pnpm 轉發器，負責初始化一個以 base 為基礎的 profile，並依據已安裝檔的組合包宣告調和 `dsh.profile.bundles`；沒有組合包宣告的包保持為普通依賴。[Headless 作為直接 core 入口](../../archived/architecture/2026-08-09-headless-direct-core-entry-point.md)負責 headless 組合約定。

解析在建構上就是雙錨點的：`dsh.profile.bundles` 中的名稱先從 dsh 安裝目錄解析，再從 profile 目錄解析，因此內建組合包始終來自與執行中 `dsh` 相同的安裝，pnpm 從不管理它們。patch 行中的裸外掛名稱使用[不可變 runtime resolution](2026-09-09-profile-resolution-generations.zh.md)，在記憶體中應用安裝優先與有序 bundle 規則，並從包的真實目錄展開依賴。

兩項配套重構：webserver 內建的靜態 dist 服務改為單一所有者的**退回席位**（`registerFallback`／`applyIndexTaps`），SPA 伺服器提取到 `@deepseek-ai/dsh-host-frontend-static`，使 web 組合包以組合的方式持有自己的 dist，而不是靠啟動器程式碼；[dsh CLI 個人設定決策](../../archived/feature/2026-07-20-dsh-cli-personal-config.md)的個人 overlay 機制（`loadPersonalPatches`、`$DSH_HOME/config.yaml`）改為面向逐 profile 與 home 級的 `cordis.patch.yml` 層（`loadOptionalPatches`、接受檔名的 `watchUserPatches`），取代該筆記的各入口模式與檔案位置，同時保留其 Harness home 根目錄、patch 語義與響亮失敗的解析。

## Alternatives considered

- **依賴掃描加部分 `patchOrder`**（最初的草案）：掃描 `dependencies` 找出組合包、未列出者按字母序排列，會產生兩個真源和一條隱式決勝規則；一份顯式有序的 `dsh.profile.bundles` 列表更小、完全確定。在 profile 內直接 `pnpm add` 只會安裝一個庫，不啟用任何 patch——行為顯式，沒有暗中掃描。
- **內建組合包使用 `link:` 條目**：pnpm 無法對指向安裝目錄的 `link:` 做版本管理、安裝或更新，它會把機器路徑嵌進使用者檔案，並且在安裝目錄移動後失效。雙錨點解析加執行時 fallback 可以讓組合包保持由安裝持有，無需持久化這些連結。
- **在組合包 manifest 中放一個啟動前 `context` 模組**承載啟動期取值（dist 路徑、flag 事實）：否決，改用純外掛——粘合邏輯就是普通設定行和由應用持有的啟動服務，因此組合始終可完整 dump，manifest 保持純資料。啟動器提供的主機 slot（`ctx.cmdlineArgs`、`ctx.appExit` 與環境快照）在任何設定樹條目掛載之前，於 `boot()` 的 `prepare` 掛鉤中提供。
- **組合包的傳遞式自動應用**：只有直接列在 `dsh.profile.bundles` 中的條目才貢獻層；想重新匯出另一個組合包 patch 的元組合包，必須在自己的 patch 檔案中顯式完成。
- **動態範本繼承或克隆本地 profile**：記錄父級會要求為 bundle 成員關係、依賴和使用者 patch 制定合併與升級規則，而複製本地狀態會重複機器特定選擇。基於範本的建立只會一次性複製安裝自有的預設值。

## Consequences

- 新的組合表層（TUI、提供者擴充功能包）以普通 npm 包形式交付，可按 profile 安裝，無需在儲存庫中為每種部署形態各留一行。
- 使用者可以從任意隨附應用範本啟動一個獨立的自定義 profile，而不會複製機器本地的 profile 狀態。
- `apps/cli` 收縮為 argv 解析、profile 機制的消費方和 pnpm 轉發器；`AppCLIEntry` 與各表層專屬的啟動路徑全部移除。
- 無金鑰 web e2e 腳手架以與生產相同的空根形態啟動相同的組合包層，並執行相同的 profile 包選擇規則，因此測試與產品之間的組合漂移會響亮失敗。
- 按釋出前姿態，後端不攜帶舊磁碟設定的相容行為；`$DSH_HOME/config.yaml` 會被忽略。
