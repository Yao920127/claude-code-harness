# Agent Note: 刪除僅供 fixture 使用的 app-boot 輔助函式

Status: proposed

[English](2026-09-19-retire-app-bin-boot-helpers.md) | 中文

## 問題

[App boot](../../../../packages/boot/app-boot/src/index.ts) 匯出 `resolveConfigPath`，其中包含按檔名替換重放設定的邏輯，以及讀取單個可選 `.env` 的 `loadEnv`。受支援的 [CLI 啟動器](../../../../apps/cli/src/bin.ts) 使用 `loadLayeredEnv`；[profile boot](../../../../apps/cli/src/profile-boot.ts) 直接提供絕對路徑。這兩條生產路徑都不呼叫舊輔助函式。

在 packages、apps 和 scripts 中搜尋精確符號，可找到八個 fixture（測試前置資料）驅動器中的十次 `resolveConfigPath` 呼叫，重放模式全部傳入 `undefined`。唯一非單元測試的 `loadEnv` 呼叫方是 [Loader 冒煙 fixture](../../../../packages/test-support/loader-smoke/tests/fixtures/headless-driver.ts)。[快照啟動器](../../../../packages/test-support/session-snapshot/src/launcher.ts) 單獨擁有重放補丁選擇。因此，舊輔助函式僅為 fixture 的需要保留了兩個公共 API、生產中未使用的重放策略及專用測試。

[共享 app-bin 膠水程式碼記錄](../../archived/simplification/2026-07-04-share-app-bin-boot-glue.md) 解釋了最初的共享可執行入口用途。目前[單一啟動器決策](../../implemented/architecture/2026-08-22-single-dsh-application-launcher.zh.md) 已替代這些受支援入口。這屬於部分取代：`boot` 和明確失敗處理仍有歸屬，歸檔記錄保持凍結。

## 提案

從生產匯出中刪除 `resolveConfigPath` 和 `loadEnv`。八個 fixture 驅動器改用 Node 的 `path.resolve`。僅在需要它的 fixture 內保留讀取單目錄可選 `.env` 的處理，包括檔案缺失與警告行為；不引入替代生產包。

刪除輔助函式專用測試，並更新 app-boot 的包描述、README 配對及 `boot` JSDoc。保留 `boot`、`loadLayeredEnv`、隨產品釋出的 profile 組合和快照重放選擇。已定位可刪除 39 行生產原始碼/JSDoc 和約 73 行專用測試，需扣除少量 fixture 本地環境處理及內建模組匯入；這是估算，尚非實作 diff。

## 考慮過的替代方案

**為底層嵌入方保留公共便利函式。** 它們可能有用，但目前 fixture 僅需要路徑解析和單個可選檔案讀取。為這些用途維護第二套生產重放選擇器及過時的 app-bin 指南，成本過高。

**將所有呼叫替換為 `loadLayeredEnv`。** 否決，因為分層發現、過濾和優先順序不同於讀取單個 fixture 本地 `.env`。名稱相近不能證明行為等價。

## 驗收標準

- 精確名稱搜尋不再發現有效的輔助函式匯入或呼叫。十處路徑替換仍為絕對路徑並選擇相同檔案。
- 唯一載入環境的 fixture 保持檔案缺失、檔案存在和警告行為；刪除輔助函式專用測試時不丟失保留的 boot 覆蓋。
- 執行聚焦的 app-boot 和受影響 fixture 入口測試，包括所需的建置產物入口檢查、隨產品釋出的 profile 冒煙，以及無金鑰重放情境。
- 更新 README 配對及包/JSDoc 描述；執行 build、相關 hygiene、typecheck、doc-sync（文件同步門禁）和 lint。不新增相容別名或第二個重放選擇器。

## 風險

匯入這些穩定前輔助函式的儲存庫外呼叫方，需要改用保留的 profile API，或自行擁有底層路徑與環境策略。意外將 fixture 改為分層環境發現會改變其測試輸入；必須明確保留這一差別。
