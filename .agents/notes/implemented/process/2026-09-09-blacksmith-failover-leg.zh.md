# Agent Note: Blacksmith 作為 CI 池的故障切換支路

Status: implemented

[English](2026-09-09-blacksmith-failover-leg.md) | 中文

## 問題

[故障切換手冊](2026-07-26-ci-failover-runbook.zh.md)把降級的企業池流量路由到自有的 `vm-backup` 與 `dsh-win-ci` 池——它們是經過驗證但容量有界的備用池。Blacksmith 按需出售類似 GitHub 託管的執行器，其遷移向導提議整體替換儲存庫的 `runs-on` 標籤，這會把持有憑證、基準與 spec 釘死的作業預設放到第三方基礎設施上。整體替換不適合作為預設：它會打破 workflow 契約 spec、扭曲基準與效能預算測量，並在沒有決策記錄的情況下搬動信任邊界作業。

## 決策

`DSH_CI_FAILOVER_LINUX` 與 `DSH_CI_FAILOVER_WINDOWS` 額外接受值 `blacksmith`。任何儲存庫寫者設定它時，該平臺參與切換的作業按各作業設定的 vCPU 檔位重定向到 Blacksmith 託管執行器；任何其它值（或未設定）保持今天的執行器，`selfhosted` 繼續路由到自有池。與既有取值一樣，這是寫者可管理的儲存庫狀態——無需合併，重跑受影響的作業即可——並且只在設定期間產生費用，這正是它作為明確的故障或實驗選擇、而非預設的原因。

`blacksmith` 下參與切換的作業：[ci.yml](../../../../.github/workflows/ci.yml) 中三個企業級 Linux 工作作業、`node-compat` 各腿、`all-checks-passed` 判定作業與三個 Windows 作業，使用該工作流為各作業宣告的執行器規格；`expected-filenames`；sandbox 的 bwrap 腿；以及兩個手動基準矩陣——其 4-32 vCPU 檔位對映到 Blacksmith 等價檔，64/96 核行保留自有池標籤，因為 Blacksmith 沒有對應檔位。blacksmith 分支不帶 Dependabot 排除：Blacksmith 執行器是臨時的，因此把 Dependabot 留在託管池的持久虛擬機器理由不適用。python-runtime 建置器整體保持託管：其 PR 與 master 呼叫方（`ci.yml` 與 `ci-master.yml` 的 `python-runtime` 作業）會把真實 API 憑證（`DEEPSEEK_API_KEY_EXTERNAL`）傳入該可複用工作流，其 macOS 與 arm64 單檔案分支需要 GitHub 映像，且其 wheel 產物供給 PyPI 釋出鏈。docs-pages 工作流是 tag 派發的釋出，因此同樣保持託管。

其餘作業在任何取值下都保留自己的執行器：被 workflow spec 釘死在標準託管執行器上的作業（`node-24-bench`、`python-sdk`、master 的 Wine 門禁、`release-publish` 與 `release-vendor-publish`、Cloudflare preview、weighted-approval 一對）；持有憑證的作業（真實 API 的 e2e 通道、issue App token 作業、npm 與 PyPI 釋出作業）；需要 Blacksmith 缺失的主機能力的作業（Landlock 各腿及其打包驗證、Seatbelt 腿、linux-arm64 單檔案分支）；以及釋出形態的鏈——npm 釋出、PyPI 釋出、node-addon-system 釋出鏈與 Pages 部署工作流——它們整體保持託管，因為其產物供給已釋出的 registry 輸出。`release.yml` 與 `release-vendor.yml` 中的釋出演練作業（`dependencies`、`pack`）保持改動前既有的路由不變：它們只帶既有的 `selfhosted` 分支，因此在 `blacksmith` 取值下與變數未設定時一樣回落到託管的 `ubuntu-24.04` 預設，並不新增 `blacksmith` 分支。

## 備選方案

整體採納遷移向導。否決，因為它打破 workflow 契約 spec、改變基準語義與效能預算校準，並預設把持有憑證與信任邊界的作業搬到第三方基礎設施；更早的嚮導遷移（已關閉的 PR #3053）因成本與同樣的 review 結論被否決。

只把自有池作為唯一故障切換目標。作為唯一選項被否決，因為它是容量有界的備用；Blacksmith 為「故障物件正是自有池本身」的故障與實驗情境提供彈性容量。

## 後果

blacksmith 各腿在有人設定該值前保持休眠，因此只在真實故障切換或明確實驗期間被使用。映像試執行（PR #3841，已關閉）把參與集硬編碼到 Blacksmith 標籤上跑過，確認 `blacksmith-4vcpu-ubuntu-2404`、`blacksmith-16vcpu-ubuntu-2404` 與 `blacksmith-16vcpu-windows-2025` 可排程可執行。Blacksmith 將其執行器註冊為 self-hosted，因此在 `blacksmith` 取值下 `node-compat` 各腿會真實執行 toolcache 隔離與隔離安裝驗證步驟（以 `runner.environment == 'self-hosted'` 為條件），而非全部跳過；三條腿都在試執行映像上透過（run 34322356689）。同一試執行還暴露了一個由本改動修復的環境發現：在 `**` 展開中遇到 symlink 檔案時，node 24.13 的內部 `fs.glob` 會 lstat-probe `<matched>/<下一段>` 並拋 ENOTDIR 而非跳過（run 34319926270），使 `check:ci:static` 內的 `verify-md-wrap` 在 Blacksmith 上失敗，直到 [repo-files.ts](../../../../scripts/repo-files.ts) 用 dirent walker 替換 `globSync`；修復後的 static 通道在同一映像上轉綠。觸發條件是 probe 已匹配 symlink 之下的路徑，而非籠統的「`**` 掃過含 symlink 的樹」：同一 run 中其它掃描含 symlink 樹的 `globSync` `**` 呼叫點保持綠色，無需改動。兩個基準矩陣的 8 與 32 vCPU 標籤（ubuntu-2404 與 windows-2025）不在試執行範圍內，是按已實測的 4/16 vCPU 標籤命名對稱推定的；首次使用前請用一次手動 dispatch 確認。Landlock、Seatbelt 與 linux-arm64 的排除仍基於更早遷移嘗試（已關閉的 PR #3053）的散文式 dispatch 實測，此處記錄為已知缺口；試執行按設計無法觸發這幾條腿。workflow spec 釘住了新分支——`ci-workflow.spec.ts` 斷言擴充功能後的 selector 中出現 Blacksmith 標籤，`ci-compatible-selfhosted.spec.ts` 求值 `blacksmith` 路由模式——因此未來重寫 selector 會使單元門禁變紅。預設成本姿態不變：除非變數指明，否則沒有任何東西跑在 Blacksmith 上。
