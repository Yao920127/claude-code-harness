# Agent Note: Desktop 與 SDK 共享 Office 執行時

Status: implemented

[English](2026-09-17-shared-office-runtime.md) | 中文

## 問題

SDK 部署需要與 Desktop 相同的 Office 創作庫，同時將直譯器 payload 儲存在只讀容器映像層中。由 Desktop 持有查詢工具和建置器，會要求下游載體重複維護依賴鎖與路徑約定。

## 決策

[`tool-workspace-dependencies`](../../../../packages/skill/tool-workspace-dependencies/README.zh.md) 持有清單驗證、直譯器路徑、安裝邏輯和模型查詢。它保留在 skill 組中，與 Office 工作流消費者相鄰：payload 服務於這些工作流，本包不提供 workspace 實體服務。Desktop 引用本包並保留首次使用時複製安裝。打包的 SDK profile 透過載體預設路徑啟用查詢和 Office skills；`DSH_PRIMARY_RUNTIME` 覆蓋該路徑，空字串表示停用。它原位讀取 payload。公共 base 與 `sdk-minimal` 不會隱式啟用 Office。

[共享建置入口](../../../../scripts/primary-runtime/prepare.ts) 持有 Desktop 目標與 GNU/Linux x64/ARM64 的下載鎖、解壓和本機冒煙檢查。Desktop 提供輸出路徑和釋出版本，要求包含 Node.js 與 pnpm，並應用簽名專用子程序環境。其他載體選擇自己的輸出目錄，也可建置 Python-only payload。現有 `desktopVersion` 清單欄位保留名字並記錄載體釋出版本；`payloadDigest` 區分鎖定輸入與元件選擇。

[Desktop 第一方執行時決策](../feature/2026-09-14-desktop-primary-runtime.zh.md)繼續持有 Desktop 安裝與平臺簽名規則。本決策僅替代其中由 Desktop 獨佔建置器和查詢實作的部分；兩份記錄均保持有效。

`runtime.json` 在頂層儲存 Python、Node.js 和 pnpm 版本，並在 `pythonPackages` 中儲存全部 Python 分發包版本。建置中繼資料不單獨列出 numpy 或 pandas。共享解析器接受舊 `components` 檔案而不改寫它們，保留舊格式的一致性驗證，並僅返回統一的扁平欄位。混合格式會被拒絕。建置摘要包含組裝格式，因此清單位元組變化會使舊產物身份失效。

Python runtime wheel 將目標平臺的 CPython、Office 庫和外部 skills 放在可執行檔案同級的 `<platform>-<arch>/` 資源目錄中。較短的平臺目錄名為 Windows 安裝後的 Python 擴充功能與依賴 DLL 路徑保留長度空間。打包提供預設資源；skill 註冊表仍允許專案、自定義目錄和使用者 skills 覆蓋同名隨包條目，profile patch 可在保留 Python 的同時停用或替換 Office skills。這樣既保留工作流設定能力，又省去單獨安裝環境的步驟。真實檔案系統資源允許 Python 載入原生擴充功能，並讓 skills 呼叫共用檢查腳本，無需啟動時解包。wheel 體積增加一個壓縮 payload；釋出流程仍執行公開索引的大小限制檢查。

## 考慮過的替代方案

**將實作保留在 Desktop。** SDK 和容器建置器只需要直譯器、Office 資源和查詢，卻仍會依賴應用打包及簽名程式碼。

**在公共 base 中啟用 Office。** base 部署不保證提供內建直譯器或資源。顯式 SDK 載體設定可以讓該要求可見，並保持其他 profile 的行為。

**總是複製到 Harness home。** 複製會重複映像層內容、要求目標可寫，也無法滿足預期的不可變載體部署。

**為每個 Python 庫增加元件欄位。** 這會重複分發包版本表，並使新增庫要求修改 schema。完整版本表將鎖定包集合與直譯器、包管理器欄位分開記錄。

## 影響

同一外掛生命週期內的並行呼叫共享成功的工具準備結果。準備失敗後可重試；解除安裝移除工具註冊並等待未完成的檔案系統工作。複製模式驗證暫存替換內容，並在釋出失敗後恢復原安裝。原位模式不寫入 payload。路徑為絕對路徑，返回結果前會檢查執行時中繼資料和所宣告的條目。

SDK 設定變更需要重新啟動。缺少 Office 資源會產生啟動警告，並使可選的 skill 提供者保持未啟用；執行時中繼資料和直譯器是否存在在首次工具呼叫時驗證。musl 建置仍不在鎖檔案範圍內。跨目標組裝驗證歸檔雜湊，但需要在目標主機執行；Linux 產物 CI 負責本機 Linux 檢查。單元覆蓋固定清單、安裝與生命週期行為；SDK profile 測試觀察可選工具、skill 發現與結果，workspace-dependencies 錄製情境固定模型可見的驗證錯誤。
