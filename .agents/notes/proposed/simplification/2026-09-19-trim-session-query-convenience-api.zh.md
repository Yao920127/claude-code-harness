# Agent Note: 精簡未使用的 SessionQuery 便利方法

Status: proposed

[English](2026-09-19-trim-session-query-convenience-api.md) | 中文

## 問題

[`SessionQueryEngine`](../../../../packages/session-query/session-query/src/index.ts) 維護了 `readSession`、`readTitle`、`readTitleSnapshot` 和 `listEvents`，但沒有執行這些方法的第一方產品呼叫方。精確名稱和呼叫點搜尋只找到內部委託、測試和生成的發現中繼資料。目前消費方使用可保留的觀測、批次標題、模型可見事件讀取和追蹤。生成的目錄向外掛作者展示這些方法，但不執行其中列出的操作。

這些入口增加了回放驗證和結果複製路徑、包裝層、公開型別及入口專屬測試。刪除它們可以減少需要維護的 API 義務，無須替換共享查詢實作。

## 提案

刪除這四個方法、不再被引用的 [`SessionLogSnapshot`](../../../../packages/session-query/session-query/src/types.ts) 結果型別和 [`eventRecords`](../../../../packages/session-query/session-query/src/tracing.ts)。刪除相關匯入及目前文件，包括兩個子系統頁面中的 `SessionLogSnapshot` 型別等價程式碼塊和說明段落。刪除[型別等價 manifest](../../../../scripts/type-equiv.manifest.json) 中手工維護的條目，以及[目錄生成器](../../../../scripts/gen-cordis-catalog.ts) 中的 `LINK_MAP` 條目，然後重新生成發現中繼資料。選定定義在清理匯入和中繼資料之前約佔八十行原始碼；無須新增替代服務。

保留 `filterEvents` 和 `_filterEvents`，以及語義提取和過濾輔助函式。保留 `observeSession`、`readTitleSnapshots`、`readSurface`、`readEvent`、列舉、搜尋和追蹤。保留共享工作階段集合解析及其現有所有權和失敗行為。

[歷史上的統一查詢決策](../../archived/architecture/2026-07-23-unified-session-query-service.md) 解釋了保留的單服務結構。本提案刪除選定的便利操作，不改變該結構。沒有活動記錄被完全取代；保持歸檔記錄凍結，並從受影響的目前文件連結到這一較窄的決策。

## 考慮過的替代方案

**為外部呼叫方保留所有已記錄的方法。** 這樣可以避免已安裝外掛遷移，但會保留四個沒有目前產品呼叫方的 API。尚未穩定的 API 策略允許在明確遷移代價後有意刪除它們。

**同時刪除 `filterEvents`。** 不採用，因為其提供者無關的字面子串掃描不同於 FTS 的 token 匹配。[SQLite 查詢文件](../../../../packages/session-query/session-query-sqlite/README.zh.md) 明確推薦該操作；刪除它會撤銷一項獨立的查詢能力。

## 驗收標準

- 從原始碼、包 README、子系統宣告和生成目錄中刪除這四個方法及失去引用的定義；保留字面子串查詢。
- 透過保留的入口維持即時來源優先、損壞拒絕、取消、結果獨立複製、冷讀取和批次標題行為。將被刪方法測試中的相關斷言遷移出去，不刪除其共享保證；明確處理 `readSession` 額外執行的回放驗證。
- 執行針對查詢、SQLite 查詢、查詢工具及受影響的工作階段引用的測試，相關無金鑰查詢錄製回放、目錄生成、型別檢查、lint 和 doc-sync（文件同步門禁）。已釋出的 Session 代際檔案保持不變。

## 風險

儲存庫搜尋無法列舉已安裝或動態編寫的外掛。這些呼叫方將失去完整日誌和輕量事件記錄的便利操作，必須按照保留 API 實際的所有權和錯誤語義遷移。若出現確實需要某個被刪操作的消費方，可以單獨重新考慮該操作。
