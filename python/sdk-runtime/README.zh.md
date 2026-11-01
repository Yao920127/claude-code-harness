# deepseek-harness-runtime-bin

[English](README.md) | 中文

DeepSeek Harness Python SDK 的平臺執行時 wheel 包。它把普通 `dsh` CLI（命令列介面）及其封閉的 Node 依賴樹打包成原生可執行程式，因此使用 SDK 不需要系統 Node.js。本包只發布 wheel 包。

## 安裝命令與產物

wheel 包會安裝 `dsh` 控制檯命令和 `deepseek_harness_runtime` Python 模組。`dsh` 將參數轉發給內建可執行程式，並要求非空 `DSH_HOME`；它不會退回到 `~/.dsh`。

生產可執行程式位於模組的 `runtime/` 目錄，命名為 `deepseek-harness-sdk-runtime-<platform>-<arch>`；Windows 使用 `.exe` 字尾。Linux 與 macOS wheel 包含目標平臺原生的 `-rg` 伴隨程式，Windows 包含 `-rg.exe`，macOS 還包含 `node-pty` 使用的 `-spawn-helper`。已釋出目標是 Linux x64、Linux arm64、macOS arm64、macOS x64 與 Windows x64。wheel 包標籤必須與載荷嚴格匹配；不釋出 Windows arm64 wheel 包。

每個目標還要求 `<executable-stem>-office/`，其中 stem 不含 `.exe`。該目錄包含完整的已安裝 Office 包及其依賴，保留引擎資源、清單、許可證、原始碼清單與輔助程式權限。複製可執行檔案時必須一併複製此目錄。缺少目標引擎會使 sidecar 建置失敗，錯誤會指出其 npm 包名與目標平臺／架構。

每個 wheel 還包含 `<platform>-<arch>/primary-runtime/`（CPython、鎖定版本的 Office Python 庫、獨立 Node 和 pnpm）及同級 `office-skills/`（三個預設工作流與共用檢查腳本）。它們是可重定位的普通檔案，不嵌入可執行檔案。共享建置器為全部五個 wheel 目標選擇原生歸檔，並在對應建置主機上執行冒煙檢查。打包與已安裝執行時定位會拒絕缺失資源、平臺不符的中繼資料及 Python 或 Node 執行權限丟失。 較短的平臺目錄避免在 Windows Python DLL 路徑中重複可執行檔名稱。

打包啟動器透過 `DSH_BUNDLED_PRIMARY_RUNTIME` 提供載體預設路徑。`sdk` profile 在未設定 `DSH_PRIMARY_RUNTIME` 時使用該路徑；顯式路徑覆蓋它，空字串停用查詢與 Office 提供者。外部 payload 保持 `primary-runtime/` 與同級 `office-skills/` 佈局。載入後的技能給出內建 Node 與伴隨 Office CLI 的絕對路徑；自定義的純 Python payload 必須設定 `skill-office.config.cli: false` 或提供 `skill-office.config.node`。SDK 原位讀取 Python，不複製到 `DSH_HOME`。原始碼與僅供開發的 Node 載體沒有隨包預設路徑，需顯式設定 `DSH_PRIMARY_RUNTIME`。

選擇 skills 與交付資源相互獨立：專案、自定義目錄和使用者檔案系統 skills 優先於同名隨包 skills。SDK patch 可以僅停用 Office 提供者，同時保留 Python 查詢：

```yaml
- id: skill-office
  disabled: true
```

要成套替換三個 Office 工作流與共用檢查腳本，可將 `skill-office.config.assetRoot` 設定為另一個絕對資源目錄。任意 skill 集合透過檔案系統 skill 提供者載入。設定 patch 在程序啟動時生效；切換 skills 無需重建 runtime wheel 或 Python 環境。

儲存庫建置還會物化僅限開發的 `runtime/node/` 載體。它在系統 Node 22.19 或更高版本上執行 `node runtime/node/node_modules/@deepseek-ai/dsh/lib/bin.js`。系統不會自動選擇它，而且 wheel 包與 sdist 均不包含它。

兩種載體執行相同的 `dsh` 語法與隨附 profile，包括獨立的 `sdk-minimal` 設定樹，以及包含前端產物的完整 `web` profile。私有 `dsh-python-runtime-closure` manifest（中繼資料清單）定義打包依賴閉包；不存在 Python 專用 Node 應用或檢入的預設 `cordis.yml`。

## Python 模組 API

- `bundled_package_dir() -> Path` 返回已安裝模組資料根目錄，並驗證釋出中繼資料。
- `bundled_runtime_path() -> Path` 返回目前平臺可執行程式，並驗證必需伴隨檔案。
- `resolve_bundled_launch_args(mode=None) -> tuple[str, ...]` 預設返回可執行程式 argv。顯式 `mode="node"` 或 `DSH_RUNTIME_MODE=node` 會選擇僅限儲存庫使用的 Node 載體。
- `main()` 實作已安裝的 `dsh` 控制檯命令，並拒絕缺失或空白的 `DSH_HOME`。在 Windows 上，它讓打包程序繼承標準流，等待其結束並轉發退出狀態；在 POSIX 上，它替換 Python 程序。

不支援的平臺以及缺失的可執行程式或伴隨檔案會丟擲 `FileNotFoundError`，並指出建置與安裝路徑。未知執行時模式會丟擲 `ValueError`。

## 打包後的 profile 解析

`dsh` 在顯式指定的主目錄下初始化隨附 profile、組合其 bundle patch，並從可執行程式的虛擬檔案系統載入內建外掛。執行時解析使用記憶體中的 generation，不建立磁碟符號連結或代理包。fallback 匯入使用記錄的宣告包路徑，包括可執行程式虛擬檔案系統內的路徑，因此內建設定項與外部外掛 peer 共享內建的 Cordis／模組實例。原生共享庫與 Windows ConPTY addon 會同其他原生 addon 一起打包；ripgrep 與 macOS PTY helper 仍是可執行伴隨程式。

Python bootstrap 從相鄰目錄解析 Office kit，讓原生輔助程式與 URL Worker 使用真實檔案系統路徑。kit 負責引擎選擇與驗證；Python bootstrap 不增加執行時下載或編譯。Office smoke 還從已載入技能取得 CLI 路徑，並在空 PATH 下執行 capabilities 和 DOCX 轉換。

外部 profile 管理使用 `dsh plugin --profile <name> ...`。該命令要求 `PATH` 中存在 `pnpm`；普通 SDK／profile 執行不需要它。

## 建置與分發

生產部署允許工作區中不屬於執行時閉包的補丁保持未使用；閉包內包的補丁仍必須成功應用。此例外僅用於部署命令，儲存庫安裝仍拒絕未使用的補丁。

在儲存庫根目錄執行 `pnpm exec tsx scripts/build-exe-for-python-sdk.ts`，會驗證閉包、建置包、部署無符號連結的檔案樹、打包所選目標，並把可執行程式及伴隨檔案同步到本模組。`scripts/build-python-release.py` 按儲存庫根版本暫存釋出形態的 wheel 包，並將 `deepseek-harness-sdk` 固定到完全相同的執行時版本。

已安裝 wheel 包冒煙測試會在檢出目錄外建立乾淨的虛擬環境，驗證分發物與可執行程式的來源，然後覆蓋預設及自定義 SDK profile、外部外掛、MCP、原生工具、直接 JSON-RPC、檢入快照，以及可信執行中的真實提供者。Office 情境會遷移完整的目標載荷目錄，並使用所需的平臺引擎轉換 DOCX：使用目標已宣告的原生引擎，未宣告原生引擎時使用 WASM。另見 [Python 貢獻者工作流](../development.zh.md) 與 [installed-wheel 測試決策](../../.agents/notes/implemented/testing/2026-08-23-installed-python-wheel-black-box-ci.zh.md)。
