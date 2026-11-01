# Agent Note: 打包並更新 Electron 桌面應用

Status: implemented

[English](2026-08-25-electron-desktop-packaging-and-updates.md) | 中文

外掛管理和原生恢復遵循[共享 Web 薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)。

[Electron 執行時決策](2026-09-11-desktop-electron-node-runtime.zh.md)替代獨立上游 Node 可執行檔案的選擇；本文其他決策仍然適用。

## 問題

DeepSeek Harness 需要一個複用 Web UI 的 Electron 桌面應用。該應用無需系統 Node.js 或 pnpm 即可工作，透過應用內建 pnpm 安裝 dsh 與桌面外掛，並透過一個面向使用者的流程更新完整桌面釋出。

桌面應用與透過 npm 安裝的 dsh 共享 `.dsh` 資料根目錄，但兩者可能使用不同的 dsh 與外掛版本。它們必須共享受支援的產品資料，同時不得共享可執行包、lockfile、`node_modules`、外掛啟用狀態或包管理器設定。

目前 GUI 協定繫結 Web 用戶端與後端版本。Electron 產物與其中透過 內建 dsh 如果獨立定版本，就會產生未經驗證的殼、用戶端、後端與外掛組合，也無法明確判斷更新是否可用。

## 決策

交付小型 Electron 殼和固定版本 pnpm；[執行時決策](2026-09-11-desktop-electron-node-runtime.zh.md)持有可執行檔案選擇。[薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)負責 Host 啟動與傳輸：私有 Host 執行共享 Web profile runner，Electron 載入其認證 HTTP URL，子程序 IPC 承載生命週期訊息。

Electron 擁有 `.dsh/profiles/desktop` 保留 profile。[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)負責核心資源儲存、外部外掛依賴、共享包連結和 profile 協調。私有 Desktop Host 保持獨立於公共 CLI 包，且不會發布到 npm。

一個 Desktop 釋出號同時標識 Electron 產物及其精確的 `@deepseek-ai/dsh` 與 `@deepseek-ai/dsh-desktop-host` 依賴。釋出不能在建置或執行時選擇不同的核心版本。因此，即使殼程式碼沒有變化，更新 dsh 也必須產生新的 Electron 釋出。

Desktop Host 為保留 profile 提供共享 Web 外掛管理器，並透過啟動器資訊提供內建 pnpm。CLI 保留 `desktop` 名稱的所有大小寫變體，並拒絕針對它的啟動、設定 dump 和外掛管理請求。Electron 在 profile 恢復或 Host 啟動前取得程序生命週期單實例鎖；後續啟動只會聚焦或重建主視窗，不會接觸 profile 狀態。

## 歸屬

| Owner | 職責 |
|---|---|
| Electron 殼 | 視窗與子程序生命週期、保留 desktop profile 準備、原生恢復、更新協調 |
| Electron RunAsNode 與 pnpm | 執行 dsh 並安裝桌面專案依賴，使用 pnpm 的正常設定 |
| Desktop profile | 由內建執行時決策定義的外部外掛依賴、已啟用 bundle 順序和共享連結 |
| 私有 Desktop Host 包 | 與 dsh 一起安裝、但不進入公共 CLI 包或 npm 釋出的 Electron 專用子程序入口與組合 overlay |
| 已安裝 dsh 包 | 後端、匹配的 Web UI、啟動 manifest、用戶端包和產品行為 |
| 共享 `.dsh` owner | 工作階段、設定、憑證、工作區和儲存，由其現有鎖與格式版本保護 |
| 透過 npm 安裝的 dsh | 自己的可執行安裝和使用者管理的 profile；不能存取保留 desktop profile 或包狀態 |

渲染程序使用 `nodeIntegration: false`、`contextIsolation: true` 和 `sandbox: true`。Preload 提供啟動就緒與失敗報告、原生目錄選擇、主題同步，以及 Windows 選單和外觀適應。它不暴露原始 `ipcRenderer`、檔案系統存取、shell 命令或 pnpm 參數。Electron 選單與原生對話方塊使用型別化中英文文案，並以英文退回；Windows 跟隨主文件語言。共享 Web 外掛管理器負責自身用戶端文案。

更新確認使用 shell 靜態 origin，因為 Web Host 尚未就緒時也必須可用。其打包文件和資源保留與其他本地靜態資源相同的方法和路徑限制。

## 檔案系統佈局

```text
~/.dsh/
  profiles/
    desktop/
      package.json
      pnpm-lock.yaml
      lock
      pnpm-workspace.yaml
      node_modules/
  sessions/
  storages/
```

`.dsh/profiles/desktop` 是唯一活動桌面 profile。其可執行包歸屬及允許解析的目錄遵循[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)。pnpm 根據正常設定選擇 store 和快取。

## 安裝與解析

共享 Web 外掛管理器負責 profile 包操作。Electron 保留啟動準備和原生恢復；[Web 薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)負責這一職責劃分。

Electron 程序生命週期鎖是 Desktop 的權威所有者。profile 準備和原生恢復使用記錄 Electron PID 的排他鎖；存活的所有者阻止競爭操作，失效 PID 可被回收。Web 包操作使用共享外掛管理器的鎖。

核心物化、首次啟動、外掛安裝和共享模組解析遵循[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)。實際 Host 啟動時會組合已啟用且提供 `dsh.client` 程式碼的桌面外掛。

## 更新與恢復

Electron 更新只使用一個 `electron-updater` 釋出流和簽名 `electron-builder` 產物。該版本就是 Desktop 釋出版本；不存在獨立 dsh manifest、相容範圍或僅更新 dsh 的操作。前臺安裝會等待正在進行的後臺檢查，而不會把檢查結果複用成安裝結果。更新彈出視窗下載並安裝 Electron 產物，然後重新啟動進入新發布。

[立即顯示視窗決策](2026-09-09-desktop-immediate-window-and-direct-start.zh.md)負責本地載入頁、直接啟動 Host 和主視窗恢復。profile 協調遵循[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)。

`DSH_DESKTOP_AUTO_UPDATE_ENV` 預設為測試部署，也可以選擇生產部署，並同時決定目標專用的 generic-provider URL 與 COS 目標。釋出自動化透過 `DOWNLOAD_TEST_ORIGIN` 提供測試 HTTPS origin，並透過 `DOWNLOAD_TEST_COS_BUCKET` 或 `DOWNLOAD_PROD_COS_BUCKET` 提供各部署的 bucket；可變的測試路由與 COS 儲存身份不寫入原始碼，部署基礎設施變更時無需釋出新程式碼，而公開的生產 origin 仍固定。打包只解析公開更新 URL、禁止 electron-builder 釋出、從子程序環境中刪除每個 COS 憑證欄位，並且只有在 electron-builder 以及每個簽名或公證 hook 成功後才寫入完成記錄。目標上傳還必須提供所選 bucket，隨後會先要求完成記錄、根 dsh 版本、Desktop 版本、根據版本得出的頻道中繼資料、產物名稱、大小與 SHA-512 全部一致，再讀取所選憑證或傳送資料。它先上傳不可變且帶版本的更新載荷與所有獨立 blockmap，最後替換 electron-builder 生成的頻道中繼資料，並且不會刪除歷史物件。穩定版本使用 `latest` 中繼資料名稱，預釋出版本則使用語義化版本的第一個預釋出識別符號。NSIS 把 blockmap 嵌入已簽名的可執行檔案，macOS ZIP 則使用獨立 blockmap；兩者都讓 electron-updater 在平臺支援時只下載變化的資料塊，而應用替換與本地 pnpm 包操作仍是兩個獨立操作。

測試釋出必須從平臺 dotenv 檔案提供 `DOWNLOAD_TEST_RELEASE_ID`。清單和安裝檔共用 `dsh-desk/<release-id>/`，生產環境保留固定目錄。ID 是打包更新 URL 的一部分，因此上傳會拒絕不同的 ID。輪換後可透過內部分發提供新安裝檔，已安裝用戶端保留原清單地址。隨機目錄降低被猜中的機率，但不對持有連結者進行授權驗證。[釋出設定](../../../../apps/desktop/README.zh.md#upload-updates)定義生成與複用方式。

## 安全與釋出策略

核心 dsh 和私有 Desktop Host 只來自簽名應用的資源樹。外掛安裝把包規格交給 pnpm，包括本地和遠端來源，但不接受原始 pnpm 命令。pnpm 負責依賴解析和 profile 的 `allowBuilds` 策略；Host 載入已啟用的 bundle。

Electron 釋出產物必須簽名；macOS 產物必須公證。打包與上傳命令從 Git 忽略的目標 `.env.windows` 或 `.env.macos` 讀取釋出設定，子程序透過編排器選擇的環境欄位接收設定。目標檔案是釋出欄位的唯一來源，避免舊的 shell 或系統憑證覆蓋本地選擇；設定載入不修改父程序環境。打包在建置、下載或清理釋出記錄前驗證該模式必需的應用 ID、更新地址、簽名身份及本地檔案，macOS 還要求一套完整公證憑證。單獨的 `check:package` 執行同一驗證而不存取 Token 或 Apple；憑證真實性仍由實際簽名與公證驗證。設定載入會拒絕缺失或格式錯誤的識別符號和不完整的公證憑證，macOS 打包還會強制簽名，避免憑證發現過程靜默選擇其他已安裝身份或生成未簽名釋出。執行時準備會驗證每個內嵌 Mach-O 檔案的精確 Authority 與 Team ID，以及時間戳和 hardened-runtime 標記。簽名後掛鉤會執行 Apple 的深度嚴格應用驗證，並要求同一葉憑證 Authority 與 Team ID 完全匹配，驗證透過後才繼續生成產物。固定目標安裝檔命令使用[隔離的 App 副本並行公證](../process/2026-09-09-parallel-macos-notarization.zh.md)：ZIP 包含已釘票的 App，簽名 DMG 則攜帶覆蓋其中未釘票 App 的票據。DMG 的 artifact-completion hook 要求其使用設定的身份、具備有效票據並透過 Gatekeeper。只有兩條產物流都成功，命令才會移入其輸出並寫入釋出完成記錄；僅生成目錄的命令仍會公證 App 並釘票。macOS 更新使用簽名 ZIP，因此 DMG 不生成 blockmap；否則釘票會讓已經生成的 DMG blockmap 失效。

[固定版本的 osx-sign 補丁](../../../../patches/@electron__osx-sign@1.3.3.patch)在兩種已釋出模組建置中使用 `lstat`，因此 Framework 的檔案和目錄別名不會觸發重複簽名。選定的上游版本能夠跳過這些別名前，仍需保留該補丁。PAK 檔案由外層 bundle 簽名記錄完整性；逐個簽名會增加序列時間戳請求，但不會增加資源完整性保護。Desktop 保留全部語言檔案，只跳過其單獨簽名。可執行程式碼仍使用 Developer ID 簽名、安全時間戳和 hardened runtime。[簽名器遍歷迴歸測試](../../../../apps/desktop/tests/macos-signing-walk.spec.ts)使用真實 Framework 別名執行已安裝依賴；釋出驗收仍要求嚴格應用驗證、公證和啟動。

Windows 釋出打包透過 `/f` 向已設定且與 SafeNet 相容的 SignTool 提供 `DSH_DESKTOP_WINDOWS_CER_FILE` 指定的公開 EV 葉憑證，並透過必需的 `DSH_DESKTOP_WINDOWS_KEY_CONTAINER` 標識匹配的私鑰。憑證檔案保留在原始碼儲存庫之外，私鑰仍留在 USB Token 上。electron-builder hook 把每個產物交給採用 CRLF 的 `windows-sign.cmd`；該 CMD 只呼叫一次 SignTool，並指定 SafeNet `/kc "[{{PIN}}]=容器"` 值與 CSP、SHA-256 檔案摘要和 DigiCert SHA-256 RFC 3161 時間戳。hook 不會改用其他 SignTool，也不會重試失敗的請求。打包編排不會把任何 `DSH_DESKTOP_WINDOWS_*` 欄位傳給建置與 執行時準備子程序，只會把憑證路徑、SignTool 路徑、金鑰容器和 PIN 傳入 electron-builder。簽名器在已清理的 CMD 環境中只提供經過驗證的簽名欄位；CMD 會停用延遲展開，在 SignTool 啟動前清除這些欄位，並僅在 SignTool 必需的命令列中保留 PIN。所有對外診斷都會替換 PIN，而且只能允許專用建置帳號和管理員檢查該 runner。簽名器會在企業 Code Integrity 檢查 electron-builder 的臨時 NSIS bootstrap 前先為該可執行檔案簽名；對於生成的可執行檔案，只有憑證表條目指向檔案末尾之外時，才會在最終簽名前清除該條目。SignTool、憑證、容器、PIN、Token 或簽名不可用時，打包會在產生未簽名產物前失敗。

Windows 打包呼叫強制設定 `ELECTRON_BUILDER_7Z_FILTER=BCJ`。內建的 7-Zip 24.09 編碼器會為 ARM64 PE 檔案自動選擇 ARM64 過濾器，但 `nsis-resources-3.4.1` 中的 NSIS 解碼器會在解壓時遺漏這些條目。使用實際 NSIS 外掛的原生解壓驗證表明，自動過濾會丟失兩個 `node-pty` ARM64 二進位制檔案，而 BCJ 可以逐位元組還原二者。使用相容的過濾器能夠保留依賴內容與執行時完整性，無需刪除特定架構的檔案或削弱驗證。

本地 Windows 安裝測試使用顯式的 `--unsigned` 打包呼叫，並執行相同的建置和執行時準備。它清除憑證輸入，將產物隔離到 `unsigned-artifacts`，並省略更新器設定和釋出完成記錄。即使父程序環境請求未簽名模式，常規打包命令也會顯式選擇簽名模式。這樣既能在沒有 EV Token 時診斷安裝問題，也能防止本地測試產物透過釋出上傳驗證。

Windows 應用替換遵循[目錄安裝決策](2026-09-11-windows-directory-installation.zh.md)：使用能返回失敗狀態的命令列工具解壓到目標旁邊，再在同卷內改名替換完整目錄。安裝器在暫存期間保留舊目錄，正式替換失敗時恢復舊目錄。註冊資訊、快捷方式和簽名解除安裝器仍由 electron-builder 持有。

打包應用會忽略開發資源和專案環境變數覆蓋。只有未打包的 Electron 程序可以替換 pnpm 入口、dsh 資源 或活躍專案。

分架建置置報告實際元件級壓縮體積和安裝體積。

## 實作

| 表面 | 實作 |
|---|---|
| 殼 | `apps/desktop` 負責 Electron 視窗、受限 preload、自定義協定、子程序生命週期、profile 準備、原生恢復、更新協調和 electron-builder 設定。 |
| 已安裝執行時 | 私有 `@deepseek-ai/dsh-desktop-host` 呼叫共享 profile runner，並向 Electron 報告認證 Web URL。 |
| 包狀態 | Electron RunAsNode 執行不可變核心資源；內建 pnpm 只修改 Desktop profile 中的外部外掛依賴圖。 |
| 資格驗證 | macOS 打包要求已設定的公司身份與公證憑證可用，在生成清單前驗證每個原生執行時檔案，驗證完整應用簽名，並要求應用和 DMG 都完成公證且透過 Gatekeeper。Windows 打包要求已設定的公開憑證、SafeNet 私鑰容器、Token Password 與 SignTool，並驗證生成的每個簽名。更新託管、跨上一版本的已安裝產物測試和各平臺 GUI 錄製仍是釋出環境門檻。 |

`dev:desktop` 會建置目前 workspace，把已建置 CLI 包、私有 Desktop Host 包及其依賴連結投影為一次性專案，使用隔離的 Harness home，開啟 Main、Renderer 和 Host 偵錯程式，並在不準備釋出資源的情況下啟動未打包 Electron。開發執行時為獨立的外掛 profile 提供工作區連結；外掛管理和恢復使用與打包應用相同的流程。固定的 macOS arm64、macOS x64 與 Windows x64 打包命令會把同一目標傳給執行時準備、dsh 準備和 electron-builder；每條命令還提供未封裝安裝器的變體，用於在生成安裝器前驗證釋出路徑。

## 考慮過的替代方案

**使用 Electron 的 Node.js 執行 dsh。** 這可以減小包體積，但會讓 dsh 耦合到 Electron 的 Node 補丁、fuse、原生 ABI、TLS 行為和程序生命週期。內建上游 Node.js 可以讓 dsh 繼續使用其受支援執行時。

**透過 JSON IPC 以 Base64 承載 Fetch 訊息體。** 這會膨脹請求與回應訊息體、在兩個程序中建構大字串，並在分派前緩衝請求。原始分幀管道避免 Base64 膨脹，但仍需維護第二套傳輸；[薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)選擇已有的 Web HTTP 傳輸。

**把產品 Web UI 永久打包進 Electron。** 獨立 UI 與後端更新需要新的版本化相容計劃。從同一個 dsh 包安裝後端與 Web UI 可以保持目前釋出繫結。

**維護 Electron 專用外掛安裝器。** 獨立頁面、IPC API 和包服務會重複共享 Web 管理器的功能。共享服務使用保留 Desktop profile 和啟動器提供的 pnpm，同時繼續禁止 CLI 存取該 profile。

**讓桌面 profile 使用 CLI 管理的包或外掛。** 任一產品都可能改變另一產品的依賴圖、Cordis 版本、外掛版本或原生模組。Desktop 拒絕透過 CLI profile 退回目錄解析包。

**分離核心與外掛解析，卻不提供共享包連結。** pnpm 未安裝主機 peer 包時，外掛需要存取內建執行時。[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)透過明確連結提供 profile 缺失的包，同時保留 pnpm 安裝的包。

**從 registry 包刪除非目標 Mach-O 檔案。** 架構裁剪可以節省少量 執行時空間，但包可能有意附帶多個架構變體，呼叫方也可以觀察安裝後的檔案集。簽署每個實際攜帶的 Mach-O 物件，無需發明 Desktop 專屬包佈局就能滿足公證要求。

**把 Windows EV 私鑰匯出到 PFX 檔案。** 外部提供的公開葉憑證讓 SignTool 建構簽名，`/csp` 與 `/kc` 則定位硬體金鑰。EV 私鑰保持不可匯出，並留在 Token 上。

**把憑證寫進已跟蹤腳本或系統環境。** 本地平臺檔案把設定限制在單個 checkout，並使打包輸入明確。代價是憑證以明文寫入磁碟：建置帳號需要限制檔案存取權限，CI 必須清理臨時設定，Git 與釋出檔案對映都必須排除真實設定。已提交的範本不含憑證；Windows CMD 只包含變數引用，簽名序列執行並在首次失敗後停止，檔案格式不會免除 Token 的錯誤 PIN 計數。

**讓 electron-builder 或通用目錄同步直接釋出。** 直接釋出可能在所有引用產物就緒前暴露頻道中繼資料，可能把陳舊或其他目標的檔案混入釋出，也無法證明已完成簽名的建置仍與目前 dsh 版本一致。目標專用且經過驗證的上傳可以明確控制釋出順序與釋出身份。

## 結果

- 沒有系統 Node.js 或 pnpm 的乾淨離線機器能夠啟動內建 dsh，無需安裝核心依賴。
- 簽名應用記錄最終執行時檔案清單；每個 macOS 原生檔案都具有釋出 Developer ID、安全時間戳和 hardened runtime，每個 Windows 產物都具有設定的硬體 EV 簽名。
- `.dsh/profiles/desktop/node_modules` 保存由共享 Web 外掛管理器管理的外部外掛。
- Desktop 包操作使用啟動器提供的內建 pnpm，以及共享管理器的子程序環境與 profile 設定。
- 主應用的“外掛”頁面向共享 Host 服務傳送結構化包操作與啟用請求。
- 獨立 CLI 仍不能存取保留 Desktop profile。
- npm/CLI dsh 與 Electron 絕不從對方的 `node_modules` 解析或安裝外掛。
- 在產品 UI 載入前，活躍後端與 Web UI 報告相同 dsh 版本和相容殼 API。
- 共享外掛管理器負責包操作失敗處理；原生恢復負責 Host 致命故障。
- 一個 Desktop 版本繫結 Electron 與 dsh；每次 dsh 更新都透過一個 Electron 更新彈出視窗交付，併產生一次使用者可見的重新啟動。
- 共享 `.dsh` 資料在遷移或修改前拒絕不相容的讀取方。
- Web 應用負責 HTTP 認證與服務；沙箱渲染程序不能存取任意檔案系統或 Electron API。
- Workspace 開發無需下載釋出資源即可執行目前已建置程式碼，未封裝安裝器的應用驗證仍保留生產安裝路徑。
- Windows 釋出打包要求已驗證的 SignTool、EV Token、匹配的公開葉憑證、Token Password 和明確的金鑰容器，絕不會退回到未簽名產物或可匯出的金鑰檔案。
- 目標更新只有在已完成簽名的建置及其引用的每個產物透過釋出驗證後才能暴露新頻道中繼資料；保留的歷史產物繼續供差分更新使用。
- 每個釋出阻斷平臺上的簽名已安裝產物均能從上一個受支援版本成功更新。

## 評審決策

| 決策 | 建議 |
|---|---|
| 首次啟動 | 檢查內建釋出中繼資料並建立 profile 連結，不安裝核心依賴 |
| 桌面 profile | 一個由 Electron 擁有的保留 profile，儲存外部外掛和共享包連結 |
| 外掛管理 | 共享 Web“外掛”頁面與 Host 服務，使用啟動器提供的內建 pnpm |
| 啟用 | 啟用 HMR 時由共享管理器應用設定；否則變更需要重新啟動 |
| 初始平臺 | macOS arm64/x64 與 Windows x64；Linux 尚無受支援的釋出目標 |
| 更新行為 | 後臺檢查，差分下載與重新啟動前顯式確認，啟動時校準 dsh |

## 風險

外掛生命週期腳本會執行第三方程式碼。profile 的 `allowBuilds` 設定決定哪些建置獲准執行。

更新繫結的 dsh 可能使外掛 peer 依賴或原生模組不相容。原生恢復可以停用第三方 bundle 並重新啟動應用，之後可透過共享“外掛”頁面修復。

透過 npm 安裝的 dsh 與桌面 dsh 可能在共享持久化資料時使用不同版本。每個共享 owner 都必須在讀取、遷移或寫入前執行格式版本與程序鎖。

包操作失敗與取消遵循共享外掛管理器的還原規則。原生恢復不會重新安裝檔。

程式碼簽名、公證和更新託管需要生產釋出基礎設施。只執行儲存庫測試不能完成這些認證。

## 相關提案

[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)負責核心資源與外部外掛依賴。[薄殼決策](2026-09-10-desktop-web-wrapper.zh.md)負責共享 Web 傳輸和外掛管理。釋出身份、簽名與程序歸屬仍由本記錄負責。
