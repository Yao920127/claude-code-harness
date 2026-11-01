# Agent Note: Wine 與原生 Windows CI

Status: implemented

[English](2026-08-08-native-windows-pull-request-ci.md) | 中文

## 問題

Wine 在 Linux 核心與區分大小寫的 ext4 之上採用 hoisted 依賴佈局檢查 win32 工具鏈。它無法證明 NTFS、DACL、ConPTY、崩潰永續性或原生程序行為。因此，拉取請求的正確性需要原生 Windows 建置和程序檢查，獨立於合併後的 Wine 結果。

覆蓋率審計發現，陳舊分支狀態恢復了針對受支援 LSP 原始碼的臨時排除項。因此，原生 Windows 需要按同一逐檔案 100% 閾值執行完整的受支援原始碼清單，而不能依賴縮小後的平臺專用分母。

## 決策

[ci-master.yml](../../../../.github/workflows/ci-master.yml) 中僅 master 觸發的 `windows` 作業在 `ubuntu-latest` 上執行 `windows node 24 / wine`。它保留經過總和檢查碼驗證的 Windows Node、Wine apt 與 pnpm 快取、僅限工作區快照的 hoisted 安裝，以及執行工作區建置與生產網站的[共享 Wine 門禁腳本](../../../../scripts/wine-windows-gates.sh)。Node 分發檔案傳輸採用有界重試；nodejs.org 的大檔案傳輸停滯時，由支援範圍請求的傳輸映像續傳相同位元組，但版本和 SHA-256 權威仍屬於 nodejs.org，歸檔透過該驗證前絕不會投入使用。根據[僅 master 平臺策略](2026-09-06-master-only-platform-ci.zh.md)，Wine 不參與 PR 聚合。[已歸檔的 Wine 實驗](../../archived/process/2026-07-27-wine-windows-gates-experiment.md)保留其實測取捨，而本文負責目前雙通道拓撲。

每個拉取請求都會啟動三個原生作業：`windows-build`、`windows-coverage` 和 `windows-native-tests`。每個作業都會為 workspace 符號連結啟用開發者模式，透過 `pnpm/action-setup` 提供儲存庫固定版本的 pnpm，在不傳輸 store 歸檔的情況下執行不可變安裝，並在原生 PowerShell 下執行自己的清單。Windows 故障切換變數（`DSH_CI_FAILOVER_WINDOWS`）預設選擇組織自有的 `dsh-windows-2025-16core` 執行器，在 `selfhosted` 下選擇公司內部執行器池，在 `blacksmith` 下選擇 Blacksmith 執行器（見 [blacksmith 故障切換支路筆記](2026-09-09-blacksmith-failover-leg.zh.md)）。Blacksmith 建置和覆蓋率作業請求 16 vCPU；逐檔案序列的原生測試請求 2 vCPU。各作業的截止時間為 60 至 120 分鐘。

`windows-build` 與 `windows-native-tests` 是 `all checks passed` 的依賴項；其工作區建置和定向原生程序結果具有阻斷性。阻斷性建置和生產網站檢查成功後，`windows-build` 在同一工作區執行 `check:ci:windows-observational-ready`。該步驟使用 `continue-on-error`、關閉 fail-fast，並設定 15 分鐘超時；失敗時會產生工作流警告，因為靜態檢查、文件、包與建置產物的阻斷性判定由 Linux 負責。必需判定會等待該步驟結束，但不要求其診斷透過。`windows-coverage` 仍在聚合流程的 `needs` 之外，因此逐檔案 100% 覆蓋率結果會保持紅燈並可見，卻不會延遲判定。

`windows-coverage` 與 Linux 覆蓋率通道一致，不先建置工作區就執行[job 內分割槽覆蓋率](2026-08-18-in-job-partitioned-coverage.zh.md)：4 個單 worker 插樁分片與一個雙 worker 的豁免重型門禁並行執行；工作區匯入透過 tsconfig paths 對映解析到 `src`，消費建置產物的套件在未建置的檢出上會自跳。兩項覆蓋率門禁都透過 `DSH_COVERAGE_TEST_TIMEOUT_MS=90000` 提高 Vitest 的單測試、expect.poll 與 hook 預算。觀測步驟複用成功的建置，保留獨立的 MPA 文件建置，一起啟動相互獨立的靜態門禁，並讓 `publint` 使用 CI worker 預設值，在共享自託管執行器上覆蓋為 8 個 worker。其 built-bin 冒煙測試只在其他所有觀測性門禁結算後啟動，包括失敗的門禁。ready 聚合要求此前已成功建置工作區；它僅從內部共用清單中移除該建置及其內部依賴邊。這可避免有界的真實應用啟動測量與 tool-catalog、NodeNext、包及文件程序爭搶資源。translation-pairing 合併套件只匯入 `scripts/` 原始碼和子程序，因此放入豁免重型套件門禁；V8 插樁不會為它貢獻任何閾值覆蓋率，卻會放大 Git 程序延遲。Lefthook 並行 fixture 保留原有結果，採用 30 秒單案例預算與 10 秒程序就緒探測；安裝器則允許被搶佔的 lock 持有者在獨佔建立後用 5 秒釋出記錄。directory-picker 組合為防抖設定寫入提供顯式的 15 秒輪詢預算；workspace-context 組合 fixture 使用測試自有、沒有無關 1 秒截止時間的訊號。LSP 原始碼與 ACL 沙箱原始碼仍計入 Windows 分母：基於 stub 的失敗路徑套件把每個程序內 ACL 沙箱檔案都帶到 100%，只有 runner 入口保持排除——它只作為 spawn 出的子程序在插樁執行之外執行，其行為由 runner 套件端到端釘住。窄範圍且帶註解的 V8 ignore 只覆蓋不可達分支（另一平臺專屬分支、生命週期內不可達的防禦守衛），其行為測試仍保留在所屬平臺。

16 核設定是這項清單經實測選定的容量規格。使用 6 個 coverage worker 的試驗分別以 6 分 27 秒和 7 分 50 秒跑出完整透過結果，而在單個插樁 Vitest 程序內使用 4 個、3 個和 2 個並行 worker 的分支頭精確試驗暴露出不穩定的 fixture 與 worker 退出。相互獨立的單 worker 子程序保留程序隔離。歷史上的 16 分片樣本把插樁覆蓋率縮短到 112.66–122.01 秒。拉取請求覆蓋率作業會在沒有前置建置的情況下排程 4 個插樁子程序和 2 個豁免 worker，而自託管完整參考流程會用 1 個 worker 序列執行未分片的覆蓋率門禁。拉取請求若採用 6 分片設定，就會產生足以違反有界測試截止時間的程序與型別感知 lint 爭用。16 個插樁分片加 2 個豁免 worker 會在計入系統開銷前就超過 16 核分配。32 核對比僅將聚合門禁時間縮短 1.47 秒，且仍在 fork worker 內觸發 CJS lexer 致命故障，因此增加核心數沒有帶來可靠的牆鍾時間改善。

首次原生執行暴露出兩項被相容性通道掩蓋的故障。文件投影測試此前只按 `/` 拆分來派生圖片 basename；現在改為使用 Node 根據平臺計算的 basename。Chokidar 消費方收到的 `%TEMP%` 以 `C:\\Users\\RUNNER~1` 這個 8.3 別名表示，而 libuv 返回的是長目錄名，導致其 Windows 事件路徑斷言失敗。共享的設定 watcher 與憑證 watcher，以及 Cordis 的模組 HMR（熱模組替換）與精確設定 HMR，現在都會在開啟 watcher 前規範化現有的原生監聽基準路徑或層級最深的現有祖先路徑，並保留尚不存在的字尾；檔案存取和診斷仍使用設定路徑。模組 HMR 會掛接監聽器並等待主 watcher 的 ready 事件，之後外掛啟動才會完成，因此啟動後立即發生的編輯無法與初始掃描形成競態。HMR 驗收透過相同的非同步原生 realpath 操作派生預期身份，避免同步 Windows 路徑寫法仍保留 8.3 別名。

可移植檔案系統 fixture（測試前置資料）透過 `node:path` 派生路徑、比較原生 realpath 標識、在 Node 啟動器邊界保留檔案 URL，只規範化由 API 負責的分隔符或行尾，並使用每個主機均允許的檔名。僅適用於 POSIX 的訊號、模式位、不可讀狀態和 writer lock 情境按平臺設門禁；可移植故障約定則透過每個主機均可建構的衝突，斷言結構化錯誤碼、復原、最後有效狀態、原子替換及不存在臨時殘留。憑證權限驗證採用無效路徑 fixture；該路徑在每個主機上都會於系統查詢前產生表示“非缺失”的 `ERR_INVALID_ARG_VALUE`，而不依賴檔案祖先究竟產生 `ENOTDIR` 還是 `ENOENT`。worker 死亡 fixture 會先觀察其協定前置條件，再由主機觸發真實終止，而不在巢狀 Windows Worker 中呼叫 `process.exit()`；這樣既保留了 worker 退出約定，也不會讓外圍 Vitest fork 暴露於 Node 程序級的原生退出斷言。壓力與整合工作負載保留原有斷言；如果 Windows 插樁或程序拆卸可能超過 Vitest 預設上限，就為其設定顯式的有界時間預算。

原生 watcher 使用 `canonicalizeWatchPath()` 對層級最深的現有祖先執行 realpath 解析；字尾缺失時，先證明該祖先是可列舉目錄，再拼回字尾。這可避免 Windows 8.3 別名與長格式 libuv 事件混用，並讓所有主機在祖先為普通檔案時都保留 `ENOTDIR`。設定、憑證、skill（技能）根與 Cordis HMR（熱模組替換）在發現和診斷時保留設定路徑；模組 HMR 則使用規範寫法作為 Node 載入快取標識、掛接監聽器並在外掛啟動完成前等待主 watcher 就緒，因此啟動後立即發生的編輯不會與初始掃描形成競態。`watchFollowSymlinks: false` 時，若 skill 根本身是符號連結，系統不會展開最後這一級連結，從而讓 Chokidar 強制執行該邊界。

Windows 的持久 JSONL 路徑會保留驅動器根目錄的原生寫法，並僅對後代路徑與暫存路徑應用擴充功能長度名稱空間。ACP（Agent Client Protocol）拆卸階梯使用真實 Node 子程序，以符合主機語義的結果證明優雅終止與強制終止兩個層級，並避免聲稱 Windows 會交付 POSIX 訊號。產品接受裸命令時，可執行 fixture 會提供 `.cmd` 包裝腳本與 `PATHEXT`。repository-cache 輔助包位於所選 Git 子路徑內，因此它們宣告的 `file:` 依賴會在 Windows 上以相同方式暴露命令包裝腳本。隨附的安裝器會匯出 pnpm 自有的 workspace-ignore 設定，保留 `PNPM_HOME` 作為 pnpm 資料設定，同時從生命週期 `PATH` 中移除該目錄，並在 `PATHEXT` 中優先選擇 `.CMD`；因此，巢狀 Git 包安裝既不會重新加入外層 workspace，也不會讓繼承的 Windows pnpm 可執行檔案搶在事務持有的 wrapper 之前。

啟動後，只有根 fiber 與 Loader 均處於活躍狀態時，系統才會繼續設定 profile watcher。只有當同一次呼叫所記錄的訊號已取得關閉流程所有權時，系統才會隔離並行設定錯誤；無關 HMR 故障仍會響亮失敗。[程序關閉控制器](../bug-fix/2026-08-03-cli-signal-shutdown-escalation.zh.md)會在根級 dispose 成功後讓單次任務的正常完成流程排空 Node 剩餘控制代碼，同時讓拆卸失敗、截止時間到期和訊號升級繼續強制退出。vendored Include 會序列化防抖寫入，只對瞬時存取或忙碌故障執行有界退避重試，並確保每個由計時器觸發的拒絕都得到觀察。持久化最終失敗後，該故障會保留在佇列中，並重新拋給拆卸責任方；成功拆卸則會排空最新寫入。

Shiki 會停用 TextMate 正則的延遲編譯，並在使用者內容進入保持不變的逐行 tokenization（詞元化）預算前預熱每種啟動語法，從而避免排程器爭用釋出不完整的高亮流。Codex 真實產品 fixture 固定使用穩定版 0.153.4 schema，並選擇實際提供的命令工具與對應參數形態；這樣既保留由提供者負責的協定，也能在每種主機上證明無人值守拒絕和整棵程序樹退出。

## 曾考慮的替代方案

**讓每項原生 Windows 結果都成為 `all checks passed` 的依賴項。** 這會為聚合流程提供保真度最高的 Windows 判定，但也會讓每次合併等待覆蓋率和重複的觀測性清單。要求建置與定向原生程序套件透過，可以保留快速的原生正確性訊號，同時繼續自動產生其他結果。

**只在拉取請求上執行 Wine。** Wine 能快速觸達阻斷性 win32 工具鏈分支，但即使真實 NT、NTFS、PowerShell、程序或原生外掛約定已經損壞，也可能報告綠燈。

**將每個非阻斷原生作業都標記為 `continue-on-error`。** 只有觀測步驟採用該設定，因為它的阻斷性判定由 Linux 負責。包含該步驟的建置作業仍必須在阻斷性建置或生產網站失敗時失敗。覆蓋率仍是聚合流程 `needs` 之外的常規作業，因此閾值失敗會保持明顯紅燈，卻不會阻斷聚合流程。

**排除看似不受支援的檔案或削弱 Windows fixture。** 不予採納，因為受影響的 LSP、watcher、持久化、用戶端與程序行為均受支援。僅適用於另一平臺的分支採用窄範圍標註；可移植結果繼續計入分母，並透過符合真實主機行為的 fixture 驗證。

**保留 GitHub 標準的 `windows-2025` 執行器。** 該可移植雙核映像能可靠完成這份完整清單，但其 32 分鐘的序列結果使自動原生訊號的實用性遠低於所選的 16 核執行器。

**使用 32 核或更大的執行器。** 32 核對比僅比 16 核將聚合門禁時間縮短 1.47 秒，且仍因 Node 的 CJS lexer 失敗；先前高並行的 32 核和 64 核試驗也以同類故障失敗。因此，增加容量只會提高資源分配成本，卻不能帶來穩定的端到端收益。

## 後果

Wine 提供合併後的工具鏈證據。`all checks passed` 變綠時，原生覆蓋率仍可能處於待處理或紅燈狀態。觀測診斷在必需的建置作業內完成。診斷失敗時，PR 檢查仍顯示成功；失敗步驟、工作流警告和執行摘要會展示該失敗。

每個拉取請求都會獲得真實 NT 核心、NTFS、PowerShell、Windows 程序、原生外掛和受支援原始碼覆蓋率訊號。觀測檢查複用成功建置的工作區，省去第二次檢出、依賴安裝和工作區建置。順序執行會延長建置作業，並可能延遲必需判定；它也讓診斷程序與編譯分開執行。ready 與 master 聚合共用一份內部診斷清單；master 保留自己的工作區建置和完整檢查。

維護者必須保留兩種有意設計的執行拓撲：Wine 快照使用 Linux 安裝加 hoisted 佈局來觸達 win32 二進位制檔案，而原生作業在組織自有的 16 核 Windows 執行器上使用相互獨立的不可變工作區。任一拓撲獨有的失敗都必須依據該邊界分類，不得削弱或靜默跳過。
