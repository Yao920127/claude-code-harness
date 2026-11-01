# Agent Note: CI 故障切換手冊 — 託管池 → 自有池

Status: implemented

[English](2026-07-26-ci-failover-runbook.md) | 中文

## 問題

[CI](../../../../.github/workflows/ci.yml) 中三個必需的 Linux 工作作業（`node 24 / static`、`node 24 / coverage`、`node 24 / snapshots and artifacts`）執行在託管的企業級 32 核池上；聚合它們的必需判定作業（`all checks passed`）執行在標準 `ubuntu-latest` 上；[原生 Windows 作業](2026-08-08-native-windows-pull-request-ci.zh.md)執行在託管的 `dsh-windows-2025-16core` 大型執行器上。當企業池發生故障——作業無限排隊或企業標籤消失——所有開啟的拉取請求都無法合併，而"合併一個修復"這一常規恢復手段本身正被那些無法執行的必需檢查死鎖。**適用範圍：兩個獨立開關，每個平臺一個。**`DSH_CI_FAILOVER_LINUX` 恢復企業級 Linux 池故障（三個必需的 Linux 工作作業加 `all checks passed` 判定作業）；`DSH_CI_FAILOVER_WINDOWS` 恢復託管 Windows 池故障（原生 Windows 作業）。Linux 池故障無需重定向 Windows 作業，反之亦然。[Node 相容性作業](2026-09-06-node-compatibility-selfhosted.zh.md)也透過隔離設定跟隨 Linux 開關；判定作業的 `node-24-bench`、`python-sdk` 和 `python-runtime` 依賴仍留在標準託管執行器上；若更大範圍的 GitHub 託管容量故障連標準池一併擊倒，這些依賴仍會阻塞 `all checks passed`。因此故障需要一個任何具備儲存庫寫權限的回應者都能在不合並任何程式碼的情況下觸發的開關。

## 決策

三個主要 Linux 作業（`node-24`、`node-24-coverage`、`node-24-consumers`）、三個 `node-compat` 矩陣條目和 `all-checks-passed` 透過 `DSH_CI_FAILOVER_LINUX` 解析；原生 Windows 作業透過 `DSH_CI_FAILOVER_WINDOWS` 解析。一個平臺的開關不會重定向另一個平臺。儲存庫寫者將變數設為 `selfhosted` 時，適用的可信作業選擇 `vm-backup` 或 `dsh-win-ci`；`blacksmith` 取值按 [blacksmith 故障切換支路筆記](2026-09-09-blacksmith-failover-leg.zh.md) 路由參與切換的作業；未設定或任何其它值保留工作流定義的託管退回。Node 相容性作業要求同儲存庫且非 fork 的頭部以及非 Dependabot 作者，使用隔離執行時設定，並在未設定與非特殊值下保留 `ubuntu-latest` 退回；blacksmith 分支不帶上述任何條件。在 `selfhosted` 取值下，Linux 故障切換會限制快照並行，並跳過託管軟體包快取恢復。判定作業跟隨工作作業，避免繼續在不可用的託管池排隊。每個開關都是寫者可管理的儲存庫狀態而非一次合併，因此在檢查失敗時仍然有效。`serial / linux (self-hosted standby)` 與 `serial / windows (self-hosted standby)` 通道在 master 推送上重新驗證完整的未分片聚合流程。

[被取代 CI 的取消策略](2026-09-09-cancel-superseded-ci.zh.md) 管理同一工作流/引用組內的 master 推送和手動執行，包括熱備演練。master 快速更新可能讓演練因反覆被取消而始終無法得出結論。判斷就緒狀態時，使用最近一次已完成的熱備結論，並核對其時間和提交；已取消或僅被排程的執行不構成就緒證據。

### 釋出演練共用 Linux 開關

`DSH_CI_FAILOVER_LINUX=selfhosted` 還會將符合條件的同儲存庫 PR 和 master 推送中的無憑證依賴佈局作業與 dsh/vendor 兩個打包作業路由到 `vm-backup`。[釋出演練決策](2026-09-06-release-rehearsal-selfhosted.zh.md) 負責更嚴格的事件准入規則及保留託管的手動觸發。這種耦合是有意的：持續設定變數來節省釋出分鐘，也會讓符合條件的主 CI Linux 作業持續使用自託管。清除變數會讓兩類負載的後續執行返回各自的託管目標；釋出操作始終保留託管。

### 自有池是什麼

`vm-backup`：一臺共享虛擬機器，執行多個常駐 systemd 管理的執行器實例。註冊實例共享 CPU、記憶體和磁碟；實例數量不代表獨立機器數量。其映像必須預裝 Playwright Chromium 和 WebKit 所需的 Linux 系統軟體包；CI 會下載鎖檔案選定的瀏覽器，但絕不在這臺持久化共享主機上執行 `apt`。切換前先看 `serial / linux (self-hosted standby)` 最近一次執行：其聚合流程包含瀏覽器回放，因此綠色熱備同時驗證常規容量和這項瀏覽器先決條件。

#### Windows 池

`dsh-win-ci`：公司內部 Windows CI 伺服器（一臺 96 核 / 580 GB 機器）上 32 個常駐執行器實例（計劃任務 `GH-Runner-01`…`GH-Runner-32`）。標籤：`[self-hosted, dsh-win-ci, windows]`。映像必須預裝 Node 24、pnpm、Git（Git Bash 在 `PATH` 上，即 `C:\Program Files\Git\bin`——`bash` 工具按名稱 spawn `bash`）、PowerShell 7，併為符號連結支援啟用開發人員模式。通用 Windows 通道的工作區與 pnpm store 必須都位於 ReFS 卷（`F:`）上：這些安裝步驟在 ReFS 上傳遞 `--package-import-method=clone`，這需要該卷佈局以及系統 corepack pnpm 攜帶的 `@reflink/reflink` 原生模組（見 [Windows ReFS store note](../../archived/process/2026-08-30-windows-refs-store-block-clone-install.md)）；沒有此佈局的重建執行器會在 Windows 建置門禁階段以 TS6231 失敗。切換前先看 `serial / windows (self-hosted standby)` 最近一次執行：綠色熱備驗證該池能端到端執行 `check:ci:windows-complete`。

### 切換步驟（任何具備寫權限的協作者，約 1 分鐘，無需合併）

兩個開關相互獨立：只切換髮生故障的那個平臺。

1. 儲存庫 **Settings → Secrets and variables → Actions → Variables → New repository variable**：名稱 `DSH_CI_FAILOVER_LINUX`（Linux 池故障）或 `DSH_CI_FAILOVER_WINDOWS`（Windows 池故障），值 `selfhosted`。
2. 重新觸發必需作業，使其重新解析執行器池。已經為託管標籤**排隊**的作業不會重定向，也無法原地 re-run，因此對於本手冊所述的無限排隊故障，應取消卡住的執行並 re-run all jobs，或推送一個新提交；“Re-run failed jobs”只有在作業真正失敗（而非仍在排隊）時才有用。
3. 切換到此完成。在 `selfhosted` 的 Linux 故障切換取值下，工作流還會把 `DSH_SNAPSHOT_MAX_CONCURRENCY` 降為 12，以限制共享虛擬機器上的爭搶，並跳過託管路徑的 pnpm 快取恢復，因為虛擬機器的持久 store 會直接提供熱安裝。自託管覆蓋率使用 4 個單 worker 插樁分割槽與 2 個豁免 worker；獨佔的託管執行器根據可用 CPU 計算預設 worker 數。Windows 開關選擇原生 Windows 執行器池，並在共享的自託管執行器上保留顯式 worker 限制。

**Dependabot 例外。**兩個開關的 `selfhosted` 腿都刻意排除 `dependabot[bot]`：自託管故障切換期間，Dependabot 拉取請求繼續在託管池排隊，而不是把依賴項提供的程式碼放到持久化虛擬機器上執行。故障期間 Dependabot PR 持續排隊是預期行為而非切換失敗；託管池恢復後它會自行完成。`blacksmith` 取值下的分支不帶此類排除，因為 Blacksmith 執行器是臨時的（見 [blacksmith 故障切換支路筆記](2026-09-09-blacksmith-failover-leg.zh.md)）。

**誰能扳動這個變數。**GitHub 的 API 允許任何具有寫權限的協作者管理儲存庫變數，因此每個開關實際是寫者級而非嚴格的管理員級。在本儲存庫的信任模型下這並不構成升權：runner group 接納本私有、禁 fork 儲存庫的全部工作流（這是讓 PR 引用的故障切換得以成立的刻意取捨），因此任何寫者本就可以透過推送分支工作流觸達這臺虛擬機器。抵禦不可信程式碼的邊界是儲存庫成員資格；變數只是為成員路由工作。

## 切換期間的容量

Linux 開關啟用期間，容量需覆蓋 master 熱備、主 CI 作業，以及每個符合條件的 PR 或 master 推送的三個釋出演練作業。每個可信 PR 還會增加三個門禁並行度為一的 Node 相容性作業，包括需要建置的 Node 22 條目和冷臨時執行時下載。釋出演練工作流依據[取消策略](2026-09-09-cancel-superseded-ci.zh.md)取消各工作流/引用組內被取代的執行；不同引用仍可能增加並行建置、打包和安裝負載。延長自託管執行前，檢查目前 CPU、記憶體、磁碟和佇列壓力；同一虛擬機器上新增註冊只增加排程槽位，不增加機器資源。不能只依據熱備負載推斷空閒容量。主機資源允許增加註冊實例時，使用組織級註冊 token（組織 Settings → Actions → Runners → New runner）。複製現有 runner 目錄時**必須排除身份檔案**——`rsync -a --exclude '.runner*' --exclude '.credentials*' --exclude '_diag' --exclude '_work' <src>/ <dst>/`（通配同時排除 `.runner_migrated`/`.credentials_migrated`——GitHub 會在遷移過的執行器上寫入這些檔案，它們同樣會觸發 already-configured 拒絕）——再跑 `config.sh`（原樣複製 `.runner`/`.credentials` 會使其以 "already configured" 拒絕），然後**啟動監聽器**：`sudo ./svc.sh install ubuntu && sudo ./svc.sh start`。僅註冊不會上線；啟動服務增加的是排程槽位，而非 CPU 或記憶體。


### 切回

刪除 `DSH_CI_FAILOVER_LINUX` 或 `DSH_CI_FAILOVER_WINDOWS` 變數（或改為 `selfhosted` 與 `blacksmith` 之外的任何值），新的執行即解析回各自的託管池。設為 `blacksmith` 會讓作業留在 Blacksmith，直到該值改變。若故障期間追加註冊過實例，將其移除。

### 信任邊界

這些變數是寫者可管理的儲存庫狀態；`pull_request` 事件本身既不能設定它們，也不能讓不同的值生效，選擇器表示式存在於工作流定義中。需要注意：故障切換期間，`pull_request` 執行執行的是 PR merge 引用自帶的工作流定義——抵禦不可信程式碼的邊界是儲存庫成員資格（私有、禁 fork、Dependabot 由 `selfhosted` 腿排除；`blacksmith` 腿不帶排除），而非該變數。關於 runner group 策略的說明：把 runner group 繫結到 master 引用的工作流與本故障切換機制**不相容**——包括 Node 相容性矩陣在內的故障切換作業是從 PR merge 引用求值的 `pull_request` 執行，master 繫結的組會讓它們持續排隊（2026-07-27 實際故障中親歷；當時將組放寬為本儲存庫全部工作流才疏通了切換）。更嚴格的執行器側策略以犧牲 PR 故障切換為代價；目前採用的形態是儲存庫範圍、全工作流的組存取。

## 曾考慮的替代方案

**透過合併一次工作流改動來切換池。** 否決，因為觸發切換的故障狀態恰恰是任何 PR 都無法合併的狀態：必需檢查正是失敗的那些。儲存庫變數是寫者可管理的狀態，重跑即生效，無需合併。

**讓自託管池長期處於必需路徑中。** 否決，因為這是拿託管池的可用性去換自有虛擬機器的可用性，只是搬移了單點故障而非增加退回。未設定變數時預設保留託管目標，開關提供由運維人員選擇、可逆的自託管路徑；按平臺拆分意味著一個平臺的故障不會重定向另一個平臺。

## 後果

從託管池故障中恢復只需切換受影響平臺的變數（任何寫者可設）加一次重跑，關鍵路徑上沒有合併。代價是每個平臺都要維護第二套執行器拓撲：master 推送會排程熱備通道，但依據[取消策略](2026-09-09-cancel-superseded-ci.zh.md)，只有已完成的結論才能證明就緒狀態；而 `ci.yml` 中的快照並行與快取恢復分支帶有一條 `selfhosted` 支路（僅 Linux），必須與託管支路保持同步。按平臺拆分開關多了一個需要管理的變數，但把每個開關的影響範圍限定在單個平臺的作業上。
