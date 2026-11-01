# Agent Note: 內建 Desktop 執行時並保留外部外掛

Status: implemented

[English](2026-09-08-desktop-bundled-runtime-and-external-plugins.md) | 中文

外掛管理和原生恢復遵循[共享 Web 薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)。

[Electron 執行時決策](2026-09-11-desktop-electron-node-runtime.zh.md)替代獨立上游 Node 可執行檔案的選擇；本文其他決策仍然適用。

## 問題

Desktop 初始化時安裝核心依賴圖，會重複釋出建置器已經完成的工作。離線 store 消除了下載，但仍有解壓、包管理器啟動和安裝成本。使用者需要應用在生產依賴已就緒時啟動，同時保留普通 npm 外掛安裝能力，以及跨應用升級的外掛狀態。

分離的包目錄可能載入重複的 Cordis 或服務模組。僅保留外掛檔案也不能證明它與新的主機 API 或 Node 執行時相容。

## 決策

[執行時準備](../../../../apps/desktop/scripts/prepare-dsh.ts)在建置時物化一次生產依賴圖，並透過 `extraResources/dsh` 分發。Electron 殼保留在 ASAR 中。Electron RunAsNode 程序從資源啟動私有 Desktop Host，並從 `$DSH_HOME/profiles/desktop` 載入已啟用外掛。

本記錄負責核心資源儲存與外部外掛依賴。[打包決策](2026-08-25-electron-desktop-packaging-and-updates.zh.md)保留髮布身份、簽名、程序歸屬和僅限 Electron 的外掛授權。[薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)負責共享 Web 啟動與 HTTP 傳輸。

## 包歸屬

資源描述檔案記錄精確釋出版本、Node 版本、平臺、架構、共享包版本和最終檔案雜湊。執行時樹包含普通檔案和目錄，不包含指回 pnpm 建置 store 的連結。原生 Mach-O 檔案先簽名再雜湊；應用簽名器保留其位元組，並在簽名後檢查清單。明確的 `dsh/node_modules` 資源對映繞過 electron-builder 對根 `node_modules` 的排除，並在任何簽名或公證前驗證複製後的依賴樹。

[桌面檔案規則](../../../../apps/desktop/scripts/runtime-file-policy.ts)在生產 npm 依賴安裝之後、原生簽名或描述檔案生成之前執行。npm 釋出列表服務於庫的使用者，可以包含宣告、map、測試和原生建置輸入，不能直接表示桌面程序需要哪些檔案。桌面副本排除宣告和已識別的 source map，因為 Host 執行 JavaScript 和生成的 Typert 產物。Host 繼承使用者環境。已釋出的 npm 包和外部外掛目錄保留各自的檔案。原始碼除錯導航由開發包提供。

包專用排除項包括 Domino 測試、fs-ext 編譯產物、Koffi 的 Windows 匯入庫，以及非目標平臺的 node-pty 預建置檔案和除錯符號。規則保留原生可執行依賴、node-pty 的 ConPTY 源分發內容、許可證和未知資源；寬泛排除 `src`、`test`、`.ts` 或 `.map` 可能移除可執行程式碼或執行時資料。複製測試保留哨兵資源並封存過濾後的清單；Electron 的[產物 smoke](../../../../apps/desktop/tests/fixtures/runtime-payload-smoke.mjs)驗證 PTY 輸出、原生檔案定位、FFI、影象轉換和 HTML 解析。執行時準備仍會驗證每個保留位元組，並攜帶外部外掛啟動完整 Host。

共享 profile runner 透過 runtime resolution 補全安裝檔與選中 bundle 缺失的依賴。pnpm 安裝的包優先。執行時解析委託給所選包路徑，因此 Host 與外掛匯入同一匯出時共享其模組實例。不同的 ESM 與 CommonJS 條件匯出仍是不同入口；執行時解析不會合幷包的雙重實作。

外部外掛使用正常 Node 包解析。Desktop 不遞迴檢查 peer 版本、重複包、連結包或上級目錄依賴解析。這些檢查重複包管理器及載入器的職責，並拒絕 pnpm 支援的安裝來源。runtime resolution 提供缺失的包，但外掛可以解析到另一份已安裝副本；不相容外掛可能在 Host 啟動時失敗，需要透過獨立殼 UI 恢復。

profile manifest 分別記錄 pnpm 安裝的依賴及已啟用 bundle 列表。停用外掛保留其包、鎖檔案條目及使用者設定。[薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)將初始化、bundle 協調和執行時模組解析交給共享 app-boot helper；Desktop 不儲存獨立連結帳本或執行時狀態身份。

## 事務與升級

首次啟動建立 profile 中繼資料，不執行 pnpm，並保留無關檔案。每次啟動都從目前安裝計算 runtime resolution，包括相容的釋出變化或應用移動之後。Node 版本、平臺或架構變化時保留已安裝外掛；安裝和相容性錯誤由 pnpm 與載入器報告。

共享包目錄使用原生規範路徑識別。Windows 啟動器可能改變路徑大小寫而不移動應用；字串相等判斷會觸發不必要的 profile 準備。

共享[外掛管理器](../../../../packages/boot/plugin-manager/README.zh.md)負責支援的包規格、bundle 驗證、啟用和安裝失敗處理。內建 pnpm 讀取正常的使用者和 profile 設定。開發模式使用相同的 Web 管理器操作獨立 Desktop profile，工作區包由開發執行時提供。

共享 Web 外掛管理器負責包變更和啟用；Electron 保留 profile 準備和原生恢復。[Web 薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)負責這些職責。

[立即顯示視窗決策](2026-09-09-desktop-immediate-window-and-direct-start.zh.md)負責直接啟動 Host。Web 應用無法啟動時，原生恢復對話方塊可停用第三方 bundle 並備份 profile patch。已安裝外掛檔案保留以供修復。

## 考慮過的替代方案

完整執行時驗證屬於打包流程。啟動讀取資源描述檔案，並檢查共享包記錄及必要的 Host 入口。[釋出驗證決策](2026-09-09-desktop-build-release-validation.zh.md)將釋出與目標相容性檢查交給打包流程。啟動既不列舉已安裝執行時檔案，也不計算其雜湊。後端載入前讀取每個檔案會增加與分發體積成正比的 I/O；不可用模組改由載入時失敗暴露。建置時驗證按記錄清單拒絕內容變化、缺失、多餘或連結檔案。

- **啟動時安裝內建離線 seed。** 這保留普通 pnpm 安裝流程，但會在每臺受影響機器上重複核心解壓與安裝。物化資源消除了這部分工作，代價是更多應用檔案和釋出建置器責任。
- **強制外掛使用 Host 依賴版本。** 這會讓普通外掛依賴不必要地耦合於 Host。runtime resolution 提供缺失的包，pnpm 擁有的條目保留獨立版本。
- **使用硬連結。** 它不能表示目錄，可能無法跨卷，共享可寫位元組，並在應用替換後保留舊 inode。執行時解析不需要檔案系統投影。
- **使用 `NODE_PATH` 或保留軟連結路徑。** 它們不能提供統一的 ESM 解析或共享模組身份。runtime resolution 為 ESM 與 CommonJS 提供相同的選包結果。
- **把核心包留在 ASAR。** 普通 `extraResources` 保留原生載入和子程序路徑。ASAR 需要單獨驗證包解析。

## 影響

首次啟動和相容升級不安裝核心包。中繼資料檢查和後端載入仍需要啟動時間；沒有測量前，不聲稱釋出啟動延遲或下載體積改善。外掛保留以主機 API 和原生執行時相容為條件，條件不滿足時提供可見的恢復入口。

[Desktop README](../../../../apps/desktop/README.zh.md)負責操作說明。定向測試覆蓋真實 pnpm 安裝與已批准建置、共享 ESM 實例身份、私有依賴版本、應用移動、停用外掛、執行時變化時保留外掛、啟用失敗和事務鎖。簽名安裝產物升級、macOS 公證、Windows junction 與原生行為、釋出體積與啟動基準，以及真實模型 GUI 錄製仍是釋出環境驗收要求；單元夾具不能替代這些驗證。
