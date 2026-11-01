# Agent Note: 將 open-anywhere 從社群外掛轉正為第一方包

Status: implemented

[English](2026-08-25-promote-open-anywhere-plugin.md) | 中文

## 問題

社群外掛 `@dsh-plugins/open-anywhere`（gitlab.deepseek.com/Ciyou/dsh-open-anywhere）在工作階段頭部增加一個 "Open In..." 分體按鈕，可在 Finder、Cursor、VS Code、Xcode、Git GUI 或終端中開啟工作階段的 workspace 目錄。它以手寫 `lib/` JavaScript 形式經 `dsh plugin add` 安裝：無型別、無測試、直接呼叫 `node:child_process`、手搓下拉選單和 style 標籤、自帶針對 rc6–rc8 的瀏覽器端 DSH 版本門禁，並靠探測 `process.argv` 猜測執行中的 dsh 版本。使用者希望該功能成為 Web profile 的內建部分，而 bundle 安裝路徑給不了這一點——且外部形態幾乎違反了儲存庫的所有約定（locale 擁有文案、逐檔案覆蓋率、wire 邊界驗證、主機命令的能力接縫）。

## 決定

第一方功能命名為 `open-in-app`：它選擇在 Harness 主機上開啟 workspace 目錄的應用，不表示另一臺機器或目的位置。

[launch-environment](../../../../packages/util/launch-environment/README.zh.md) 中共用的 `launchedThroughSsh()` 只從繼承的程序層讀取非空 `SSH_CONNECTION` 或 `SSH_TTY`。SSH 啟動時會在任何探測開始前返回空應用目錄。專案與使用者 `.env` 中的值不能作為 SSH 啟動的依據；Web 瀏覽器喚起和自適應目錄選擇器共用此判斷。即使用戶端記住了應用選擇，也會隱藏操作入口；已有的可用性檢查會拒絕圖示和啟動請求。SSH 埠轉發只改變 HTTP 可達性，不改變工作區或應用所屬的機器。

該功能的第一方歸屬是一對包：`@deepseek-ai/dsh-host-open-in-app` 位於 `packages/host/open-in-app/`（探測、目錄與啟動路由），`@deepseek-ai/dsh-client-ui-open-in-app` 位於 `packages/client/ui-open-in-app/`（分體按鈕），由 `dsh-web-app` bundle 的 `open-in-app` 與 `ui-open-in-app` 兩行掛載進 Web profile。轉正是重寫，不是 vendoring：

- **一對 host/client 包，沿用 `directory-picker-browse`/`ui-directory-picker-browse` 的配對結構**：host 包的 `src/index.ts` 在 `ctx.webServer` 上註冊三條 HTTP 路由（`GET /open-in-app/apps`、`GET /open-in-app/icon/<id>`、`POST /open-in-app/open`）；ui 包的 `src/client/index.ts` 經標準 slot/inject 通貨把分體按鈕註冊進 `conversation.session.header.utilities`，文案在型別化的 `open-in-app` locale 名稱空間中，樣式為 `--dsw-*` token 上的 CSS Modules（原外掛手工注入的 style 標籤與內聯下拉被 `Menu` 原語替代），節點半邊是讓外掛出現在主機名冊上的空 apply。路由路徑與 wire 載荷型別只有一個家：host 包瀏覽器安全的 `./shared` 子路徑（只有常數與型別）；client bundle 經 client tsdown preset 的 `INLINE_SAFE` 條目將其內聯，與 `dsh-session` 各 wire 切片同一通道。host 根入口只匯出 Loader 所需的外掛實體與型別；目錄、resolver、launcher 與圖示 helper 保持原始碼內部可見。
- **一趟解析產出已驗證的啟動器；點選絕不重新檢測。** 主機把整個目錄每程序惰性解析一次，產出目錄 id 到 `OpenInAppResolvedLaunch` 的對映——本機實際持有的啟動器，絕不是裸的安裝記錄。`GET /apps` 提供對映的 keys，`POST /open` 直接啟動其值；啟動時發現可執行檔案已消失（spawn `ENOENT`）會只作廢該條目、重解析一次，無法再證明時把它從列表移除（解除安裝自愈，新安裝等重新啟動）。
- **解析來源按平臺務實且廉價。** macOS 在已知應用目錄（`/Applications`、`~/Applications`）查條目的 bundle 拼寫，啟動 `open -a <解析出的 bundle>`；Xcode 跟隨 `xcode-select -p`。Windows 依次讀 `App Paths`、只在能證明磁碟可執行檔案時採用的 Uninstall 記錄、已知路徑，以及採用版本化安裝目錄的應用中最新的目錄——每趟每根一條批次 `reg.exe query`。GitHub Desktop 會同時解析版本化可執行檔案與隨包提供的 `cli.js`，不經命令 shell 呼叫受支援的 `github open <path>` 行為。CLI 名稱經 `ctx.subprocess.resolveExecutable()` 程序內解析（PATH/PATHEXT stat，無 shell、無 `which`/`where.exe` 子程序）；CLI 不在 PATH 上的 Linux GUI 條目退回到其 XDG desktop 條目驗證過的 `TryExec`/`Exec`，且只有主機宣告瞭 display server 時才提供 `xdg-open`。其餘主機命令（`xcode-select`、`reg.exe`、圖示提取）經 `@deepseek-ai/dsh-native-command`（argv，絕不走 shell）執行。
- **三個獨立期限取代單一 `commandTimeoutMs`**：`probeTimeoutMs`（解析命令）、`iconTimeoutMs`（圖示提取命令）、`launchWatchMs`（早期失敗看護視窗），調整一種操作的超時不再改變其他操作的回應時間——隨發行 bundle 保守地保留 10 秒命令期限（超時是失敗上界而非延遲預算），看護視窗 1 秒，它才是約束 open 路由與按鈕忙碌態掛起一次成功啟動時長的量。啟動以清理過憑證的環境（`dsh-subprocess` 的 `scrubbedParentEnv`）疊加介面卡顯式環境後 detached 派生；Windows GUI launcher 預設保持可見，只有負責另行開啟 GUI 的 CLI 介面卡會顯式隱藏自己的程序。看護視窗關閉時仍在執行的啟動器計為已啟動，絕不會被殺死或等待（kitty 與 JetBrains IDE 在整個視窗生命週期內保持前臺）。
- **有主機來源的平臺都提取圖示。** macOS 把解析出的 bundle 的 `.icns` 轉 128px PNG（`plutil` + `sips`）；Windows 用生成的 PowerShell 腳本以位置式 `-File` 參數（路徑不經命令列解析）提取解析出的可執行檔案的關聯圖示為 32px PNG；Linux 沿 spec 的 desktop 條目 `Icon=` 查 hicolor 主題與 pixmaps 目錄（PNG 或 SVG，純檔案系統）。任何失敗應答 404，瀏覽器保持通用佔點陣圖形。
- **啟動目錄是按平臺宣告條目的資料表**（`OPEN_IN_APP_CATALOG`）：每個應用 id 按平臺（`darwin`/`win32`/`linux`）宣告一條按序嘗試的啟動器來源鏈——`fixed`（隨系統內建）、`app`（已知目錄的 bundle 拼寫）、`xcode`（`xcode-select -p`）、`cli`（程序內 PATH 解析）、`file`（`${VAR}`/`~/` 展開後第一個存在的候選檔案）、`scan`（帶版本號安裝目錄取最新）、`app-paths` 與 `install-record`（Windows 註冊表兩層）、`github-desktop`（版本化可執行檔案與隨包 CLI）、`desktop`（Linux XDG desktop 條目）——加啟動器 argv 範本（`{path}` token 原位攜帶目錄，否則目錄追加在末尾）、可選環境與 Windows 可見性策略，以及可選退回啟動器（`xed` 之後的 `open -a <bundle>`）。白名單對齊 Codex 的 "Open In" 目標列表：編輯器與 IDE（VS Code、VS Code Insiders、Cursor、Windsurf、Zed、Sublime Text、Xcode、Android Studio、七個 JetBrains IDE）、轉正外掛原有的 Git GUI、終端（Terminal、iTerm2、Ghostty、Warp、kitty、Windows Terminal、Git Bash、GNOME Terminal、Konsole）與各平臺檔案管理器。檔案管理器與平臺終端使用獨立 id（`finder`/`explorer`/`filemanager`），而非一個 id 配平臺標籤，因為標籤是靜態瀏覽器詞典條目，且每臺主機只會探測到其中一個。檔案管理器條目直接經 `dsh-native-command` 的路徑開啟器啟動（`shell-open`，把目錄交給 OS shell 並攜帶完整父環境，而非 detached 的清理環境 spawn），因為 detached 且經過憑證清洗的 `explorer.exe <dir>` 派生程序不能可靠地彈出視窗；開啟器自身的 `explorer.exe` 交接可以（[Windows 開啟解析](../bug-fix/2026-09-22-windows-open-through-shell-resolution.zh.md)）。封閉 union 以 `assertNever` 收尾。
- **所有路由都執行在組合 connection 服務的信任柵欄之後**（`requestRejection`：挫敗 DNS rebinding 與跨站呼叫的 Host/Origin 柵欄，加上瀏覽器認證），與 API gateway 施加在其 WebSocket upgrade 上的守衛相同；機制的唯一出處是 `src/index.ts` 的模組註解。在該柵欄之上，open 路由在 wire 邊界驗證請求體：`application/json` 媒體型別（精確 essence，而非子串匹配）、以排空後 413 的方式把 body 限制在 64 KiB、驗證欄位型別、只接受探測為可用的目錄 id，並要求指向現存目錄的絕對路徑。
- **刪除了 DSH 版本門禁。** 它存在是因為外掛逐版本騎乘一個它不擁有的介面；第一方包與儲存庫同版本釋出，門禁、它的 `sessionStorage`/`localStorage` 信任臺帳和 argv 遍歷版本探測都失去了所指。
- **上次選擇經 `createSnapshotStore(..., { persist })` 持久化**（`dsh.open-in-app.choice`），替代手寫 `localStorage` 存取。新儲存沒有平臺特定的初始選擇；使用者首次選擇前，元件使用主機提供的第一個可用條目。

這對包放在 `packages/host/` 與 `packages/client/`，因為兩個半邊本來就是這兩種東西：探測/啟動側是主機基礎設施，與它消費的 webserver 同組；按鈕是用戶端表面，與其他 `ui-*` 包同組。評審把它從 `packages/workspace/` 的單個雙半邊包遷到這裡（見替代方案）。

## 考慮過的替代方案

**在 SSH 工作階段中提供 VS Code 的遠端 CLI。** 已安裝的可執行檔案不能證明編輯器連線可用：繼承的 IPC socket 屬於一個仍在執行的 VS Code 連線，Harness 繼續執行時它也可能消失。瀏覽器側的 SSH 目標設定與本地編輯器喚起不屬於這個主機應用功能。

**將外掛的 `lib/` 原樣 vendor 進 `packages/`。** 最快，但手寫 JavaScript 會整體不過 typecheck、覆蓋率、i18n、JSDoc 和 invariant 門禁；為其保留豁免會造出儲存庫刻意不設的包類別。

**用 Typert Remote 而非裸 webServer 路由。** apps/open 呼叫符合 Remote RPC 形態，但 icon 路由提供二進位制 PNG，JSON RPC 詞彙承載不了；把 icon 拆去裸路由而 apps/open 走 Remote 會讓一個功能有兩種傳輸。裸路由也匹配原外掛的用戶端，且 `webhook-github` 已確立帶驗證裸路由的先例。

**擴充功能 `host/apiproxy` 的 `openPath` 而非新 open 端點。** `openPath` 用系統預設應用開啟一個路徑；本功能的主體是*用哪個*應用，帶可用性探測和逐應用啟動器——是不同的契約。兩者共享 `dsh-native-command`。

**放在 `packages/workspace/` 的單個雙半邊包（最初交付的形態，沿用 `dsh-session-log-export`）。** 評審期拆成 host/client 對：workspace 組的契約是 host-side only，該功能消費的是 `webServer` 而非 `workspaceRegistry`，且單包整體註冊在 Client 編譯聚合面迫使主機路由與目錄測試偽裝成 `.client.spec.ts`。拆分讓每個半邊的測試落在自己的編譯面、依賴落在正確的區段；wire 契約經 host 包的 `./shared` 子路徑保持唯一出處。

**可設定目錄（cordis.yml 定義應用）。** 延後：每個條目耦合發現、啟動參數、程序策略與圖示行為，因此接受任意命令前需要明確的使用者設定歸屬與驗證規則。使用者提供的 label 屬於使用者資料，不與 locale 擁有的產品文案衝突。Codex 與 Orca 展示了可能的擴充功能形態：維護過的內建 preset 加可設定 custom handler。

**透過作業系統 API 列舉所有已安裝應用。** 不作為選單真源：Launch Services、Windows 註冊資訊與 XDG desktop 條目可以定位應用，但不能證明每個應用都能接收 workspace 目錄，也不能給出正確開啟目錄所需的啟動協定。OS 原生標識仍可作為維護過的 preset 的 locator 輸入；custom handler 用於覆蓋長尾，而不是猜測啟動語義。

**為 Windows/Linux 條目內建靜態圖示（Codex 為每個目標打包 PNG）。** 拒絕：圖示路由在三個平臺都提供主機真實圖示，為裝飾性收益打包第三方產品圖形會引入資產管線與商標風險面。

**重子程序檢測（最初交付的形態）：macOS 每條目一次 `open -Ra`、CLI 各一次 `which`/`where.exe`、每次啟動重新解析。** 評審期替換：一次列表解析在 macOS 上派生約 26 個子程序，按顯示名查 Launch Services 的證據弱於磁碟上的 bundle，儲存庫已有程序內 PATH 解析（`ctx.subprocess.resolveExecutable()`），且點選時重新檢測把探測期限放上了互動路徑。為挪位 macOS bundle 考慮過批次 `mdfind` 後備，依評審的 known-paths 指示未採用；漏檢記入已知限制。原生 LaunchServices/NSWorkspace 查詢需要儲存庫尚無的 addon——延後，以已知 `.app` 路徑為替身。

**公共的應用發現 Service Definition。** 按單消費者規則延後：在出現第二個 GUI 發現消費者之前，resolver 保持為包內模組。

**經 `SHDefExtractIcon` P/Invoke（`Add-Type`）腳本取 128px Windows 圖示。** 延後：`ExtractAssociatedIcon` 是不需編譯片段的 .NET 標準面，32px 在按鈕 15-18 CSS px 的尺寸上僅在高分屏略微發軟；若實際在意，P/Invoke 變體是腳本內區域性升級。同理未追使用者的 Linux 圖示主題——hicolor 是所有主題繼承的 freedesktop 後備——自定義主題桌面會看到原版圖示。

## 後果

- 非 SSH 工作階段中，只要主機在 macOS、Windows 或 Linux 上探測到至少一個已安裝的目錄應用，Web profile 就會出現頭部按鈕；其餘情況零渲染（探測目錄為空 → 元件返回 null）。
- 社群外掛的安裝路徑仍然有效但已冗餘；其原始路由與瀏覽器選擇鍵獨立於 `open-in-app`，因此使用第一方功能的安裝應移除社群外掛，避免出現重複的頭部控制元件。
- 解析與圖示每主機程序惰性執行一次，dsh 執行期間安裝的應用要重新啟動後才出現——接受；解除安裝方向經 `ENOENT` 單條目重新整理自愈。
- 目錄在編譯期固定；擴充功能它意味著同時編輯 `OPEN_IN_APP_CATALOG` 與兩份 locale 詞典（README 已知限制）。平臺覆蓋不均——若干 Git GUI 與終端僅有 macOS 條目；Windows 圖示受限於 .NET 標準介面的 32px 提取，Linux 跟隨 hicolor 而非目前主題，沒有 desktop 記錄的純 CLI 條目則保留通用圖示。
- 解析器、圖示、路由、控制器與元件測試覆蓋平臺探測、啟動結果、可用性快取和 HMR 處置。[SSH Web 快照](../../../../snapshots/web/open-in-app-ssh/snapshot.yml) 在啟用兩個 Open In 設定項並記住應用選擇的條件下渲染共享的錄製工作階段，並僅捕捉工作階段頭部；輸入框和統計欄由各自的快照負責。繼承的 SSH 標記使空應用目錄在不同平臺上保持確定。普通 Web 快照仍停用依賴主機的應用探測。
