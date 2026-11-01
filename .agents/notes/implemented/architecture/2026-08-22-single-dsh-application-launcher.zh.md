# Agent Note: 由一個 dsh 啟動應用 profile

Status: implemented

[English](2026-08-22-single-dsh-application-launcher.md) | 中文

## Problem

DeepSeek Harness 應用程序需要由同一個機制負責組合、外掛解析、環境發現、關閉和使用者自定義。帶完整 `cordis.yml` 的專用應用 bin 會在 profile 啟動之外形成第二套生命週期：安裝到 profile 的外掛無法到達它，行為會與 `dsh-base` 偏離，SDK 呼叫方還需要學習任意程序 argv，而不是產品的組合模型。

Python SDK 透過四個平臺 wheel 包分發原生可執行檔案。其打包程序使用同一 profile 啟動器，同時保留封閉的 VFS 依賴樹、原生伴隨檔案與 installed-wheel 證據。

## Decision

### 啟動範圍

所有受支援的 Node 應用都透過 `dsh` CLI 與一個具名 profile 啟動。隨附 profile 為 `web`、`headless`、`sdk`、`sdk-minimal` 和 `acp`，可透過 `dsh --profile <name>` 或 `dsh <name>` 選擇。`plugin` 表示管理命令；同名 profile 必須用 `--profile plugin` 選擇。

Vendor CLI、僅用於建置和測試的可執行檔案、程序內直接掛載外掛以及私有瀏覽器 WebWorker 預覽都不屬於應用啟動清單。包應用 bin 或直接啟動包入口的根 demo 都不是可接受的擴充功能點。

### Profile 應用

`@deepseek-ai/dsh-sdk-app` 與 `@deepseek-ai/dsh-acp-app` 在 `@deepseek-ai/dsh-base` 之上組合完整協定應用。SDK 組合包增加 JSON-RPC 伺服器、應用自有幫助和 stdio 生命週期；ACP 組合包增加僅用於自動化的 ACP 伺服器與相同的應用職責。兩者都採用 base 層的模型、工具、持久化、settings、credentials、策略和環境行為。[獨立 sdk-minimal profile](../../archived/architecture/2026-08-24-standalone-sdk-minimal-profile.md)複用 SDK 啟動與 JSON-RPC 服務，但刻意擁有不含 `dsh-base` 的完整顯式設定樹。

Profile manifest 負責 patch 過載：

| Profile | `patchReload` |
|---|---|
| `web` | `live` |
| `headless` | `startup` |
| `sdk` | `startup` |
| `sdk-minimal` | `startup` |
| `acp` | `startup` |

自定義 profile 預設為 `live`。`startup` profile 仍會應用組合包、profile、home 級與呼叫時 `--patch` 各層，但啟動後不會監視這些檔案。`dsh-base` 插入的模組 HMR（熱模組替換）設定項預設停用；具有經過驗證的原始碼模組過載生命週期的 profile 必須顯式啟用它。隨附 profile 均不啟用伺服器模組 HMR：`patchReload: live` 使用啟動器的僅設定 watcher，`startup` profile 則不安裝 watcher。SDK 與 ACP 無法在一個自有 stdio 連線內安全替換其伺服器、agent、持久化或工具註冊表。

隨附協定 profile 將 stdout 保留給協定幀，顯示幫助時不啟動 transport，並透過有界根節點 dispose（資源釋放）處理 stdin EOF 與訊號。ACP 繼續僅用於自動化。SDK JSON-RPC 方法、通知欄位與 `initialize.serverInfo.name` 保持穩定。完整 profile 的模型可見工具與持久化預設值來自 `dsh-base`，包括其[預設編輯器選擇](../simplification/2026-09-05-base-default-file-editor.zh.md)；`sdk-minimal` 擁有自己的顯式預設值。可執行快照負責固定已組裝的應用輸出。

### TypeScript SDK 自定義

`@deepseek-ai/dsh-sdk-client` 依賴同版本的 `@deepseek-ai/dsh` 包，解析其已安裝 CLI 模組，透過目前 Node 可執行檔案執行該模組，並預設選擇 `sdk`。兩層用戶端都暴露 `dshBin`、`profile`、有序 `patches`、`dshHome`、程序 cwd、環境和超時；任意 command/argv 啟動只保留為 fake-runtime 測試的內部介面卡。

SDK 使用者透過 profile 自定義外掛。`dsh plugin --profile <name> ...` 管理持久依賴與組合包順序，profile 的 `cordis.patch.yml` 負責持久設定項變更，啟動時 `patches` 提供有序臨時覆蓋。自定義 profile 必須保留 `@deepseek-ai/dsh-sdk-app` 或另一個 SDK 伺服器設定項。相對 CLI 模組、patch、顯式 home 與程序 cwd 路徑會在 spawn 前變為絕對路徑；初始化具有有限時限，診斷會寫明所選 profile。

直接使用 SDK 時遵循普通 Harness home 解析：顯式 `dshHome`、繼承的 `DSH_HOME`，最後是 `~/.dsh`。`subagent-dsh-sdk` 則要求顯式絕對 home，因此巢狀執行時不會透過作業系統 home 發現個人 profile、已安裝外掛、憑證或工作階段。DSH 專用 ACP 子程序範例同樣傳入隔離 home；ACP 後端自身繼續適用於非 DSH agent。

### Python 執行時

Python 執行時 wheel 將 [`python/sdk-runtime/runtime-bootstrap.mjs`](../../../../python/sdk-runtime/runtime-bootstrap.mjs) 暫存為 `dsh-python-runtime-closure` 入口。其普通分支呼叫公開 CLI export；提供者私有選擇會在 CLI 解析前分派到內部子程序 runner，而不是應用入口。[原生 containment 決策](2026-08-28-subprocess-native-containment.zh.md)負責該私有分派。Python 用戶端預設選擇 `dsh --profile sdk`、有序 patch 檔案與顯式 Harness home；`python/sdk/examples` 下的可執行範例選擇 `sdk-minimal`。安裝的 `dsh` 控制檯命令暴露相同的 profile 語法，包括 `web` profile。

可執行檔案族是 `deepseek-harness-sdk-runtime-<platform>-<arch>`。SDK 協定格式、wheel 與 import 分發名稱、伴隨檔名稱，以及協定 identity `deepseek-harness-sdk-runtime` 保持穩定。SDK 包族是 `@deepseek-ai/dsh-sdk-client`、`@deepseek-ai/dsh-sdk-protocol` 與 `@deepseek-ai/dsh-sdk-jsonrpc-server`；`@deepseek-ai/dsh-acp` 繼續作為 ACP 協定外掛。儲存庫不保留 Python 專用 Node 應用、檢入的完整設定、相容包、轉發可執行檔案、後備解析器或 SDK／ACP 啟動別名。[docs/architecture.md](../../../../docs/architecture.zh.md)負責該啟動方式，[`python/sdk-runtime` README](../../../../python/sdk-runtime/README.zh.md)負責 Windows 載體。

### 強制驗證

`verify-application-entrypoints` 掃描應用／包 manifest、可執行原始碼和根 demo 腳本。允許清單對 `dsh` 產品 bin、排除的 vendor 範圍、私有 WebWorker 建置工具和測試支援進行分類。未分類的 shebang、新包 bin 或繞過 `apps/cli/src/bin.ts` 的 demo wrapper 都會使 hygiene 與 primary／static CI 聚合失敗。

## 既有決策與取代關係

[Profile 命令簡寫](../feature/2026-09-15-profile-command-shorthand.zh.md)取代本 Note 中僅為 Web 提供簡寫的機制；本 Note 繼續負責應用組合與生命週期的所有權。

本決策取代 [profile 外掛組合包](2026-08-05-profile-plugin-bundles.zh.md)、[TypeScript SDK 用戶端與 SDK subagent 後端](../../archived/feature/2026-07-27-typescript-sdk-and-sdk-subagent-backend.md)、[移除 SDK 專案工具鏈](../../archived/simplification/2026-08-11-remove-sdk-project-toolchain.md)和[單檔案 Python SDK 執行時分發](2026-07-10-single-file-executable-sdk-runtime-distribution.zh.md)中的應用啟動與包名事實。這些 Note 對 profile 分層、用戶端／協定語義、已刪除的專案工具鏈與原生打包仍分別具有獨立權威。

[ACP 僅自動化協定](../simplification/2026-07-23-acp-automation-only-protocol.zh.md)繼續負責 ACP 協定格式與互動範圍。[新增包實操手冊](../../../../docs/cookbook/adding-a-package.zh.md)負責基於角色的包名。[獨立 sdk-minimal profile](../../archived/architecture/2026-08-24-standalone-sdk-minimal-profile.md)部分取代本 Note 的 base 優先規則與完整設定樹替代方案，同時保留本 Note 對 launcher 所有權的決策。沒有任何活躍 Note 被完全取代，也沒有 Note 符合歸檔條件。

## 考慮過的替代方案

**保留直啟 bin，只宣告推薦 profile。** 拒絕：只要受支援的可執行檔案仍然繞過 profile，文件就無法讓 profile 真正負責外掛安裝、環境載入、關閉和測試。

**保留轉發相容 bin。** 拒絕：轉發可執行檔案仍然形成另一個公開啟動名稱與相容承諾。預釋出儲存庫可以讓呼叫方直接遷移到 profile。

**把呼叫方提供的完整 Cordis 樹放到 profile wrapper 後面。** 拒絕：這隻集中 argv，沒有集中應用組合。完整 profile 使用 `dsh-base` 加輕量應用組合包，使共享策略只有一個歸屬。只有當顯式清單本身屬於產品行為時，才允許儲存庫自有且有版本的獨立組合包，具體見 [sdk-minimal](../../archived/architecture/2026-08-24-standalone-sdk-minimal-profile.md)。

**在 TypeScript 建構函式中接受內聯外掛或完整 `cordis.yml`。** 拒絕：SDK 會因此成為另一個包安裝器和應用組合器。具名 profile 與 patch 檔案已透過統一解析模型提供持久與逐次啟動自定義。

**只從 `PATH` 解析 `dsh`。** 拒絕：普通 Node 程序不一定繼承專案本地 `.bin` 路徑。同版本包依賴可以提供確定的執行時。

**在 `dsh-base` 中啟用模組 HMR，再由不安全的 profile 逐一停用。** 拒絕：共享 base 同樣承載自定義 profile；預設啟用會要求每個新應用都記得退出原始碼模組替換。base 預設停用會讓模組 HMR 成為顯式的 profile 能力，同時保留 `patchReload: live` 設定監視。

**熱過載協定 profile。** 拒絕：替換協定伺服器或其依賴可能破壞待處理協定幀與 SDK 自有 agent。程序重新啟動是 SDK 與 ACP 設定變更的採用邊界。

**不做獨立打包證明就把 Python 可執行檔案遷移到 profile。** 拒絕：原生 VFS 閉包、四個平臺 wheel 包、profile 資源、ripgrep 與 spawn-helper 伴隨檔案和乾淨安裝行為都需要自己的遷移證據。

## 驗證

- 原始碼與建置後 CLI 驗收覆蓋 `sdk`、`sdk-minimal` 和 `acp` 的幫助、transport 啟動、stdout 純淨性、EOF、訊號與根節點 dispose。
- 組合包設定測試釘住 `dsh-base` 預設停用模組 HMR，隨附模式覆蓋層不含該策略；自定義 live profile 的 e2e 釘住啟動器僅監視 fallback 提供的設定過載。
- 聚焦單元套件覆蓋 profile 啟動解析、初始化時限、SDK 重試、伺服器就緒和巢狀隔離 home，並對變更後的執行時原始碼實作 100% 覆蓋率。
- 免金鑰 ACP 與 SDK 快照啟動真實 `dsh` profile，並釘住協定輸出與持久化日誌；巢狀 SDK 組合會啟動第二個真實 profile 執行時。
- 真實 API 工作流把檔案並行度限制為 4，因為一個 profile e2e 檔案可能擁有多個完整 `dsh` 子程序樹；工作流測試會釘住該資源上限。
- Python 套件同時測試 exe 與 node 載體；打包執行時情境、原生 macOS 可執行檔案建置、兩個 wheel 包以及乾淨 wheel 預設／MCP 冒煙測試會釘住 `deepseek-harness-sdk-runtime-*` 產物與 profile 啟動。
- `verify-application-entrypoints` 包含包 bin、可執行原始碼、直啟包的 demo wrapper 與未分類 demo 等非法 fixture（測試前置資料）。

## 影響

- 使用者透過具名 profile 與有序 patch 更改 SDK 應用的外掛組合，使用與其他所有 dsh 應用相同的安裝與解析模型。
- 自定義 profile 可以在不啟用伺服器模組 HMR 的情況下獲得即時設定監視，只有顯式覆蓋設定項才會啟用原始碼模組替換。
- 完整 SDK 與 ACP profile 共享完整 base 應用和同一份策略與工具；`sdk-minimal` 擁有自己的顯式獨立清單，快照會呈現這些刻意採用的組裝差異。
- 增加 `@deepseek-ai/dsh` 會擴大 TypeScript 用戶端的安裝體積，換來確定的同版本執行時。
- 受信任使用者 patch 可以增加寫入 stdout 的外掛並破壞自己的協定流；隨附 profile 保證純淨，不為任意第三方組合提供保證。
- Python 打包普通 `dsh` profile 啟動器，同時保留封閉原生執行時，wheel 使用者無需系統 Node。
