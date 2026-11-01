---
description: "審閱和維護已記錄的工作階段持久化型別變更、對應 schema 快照以及相容性決策。"
---

# 持久化型別變更記錄

[English](README.md) | 中文

## 概述

本參考文件用於檢查已確認的工作階段持久化型別變更及其前驅。每條記錄把相容性決策繫結到精確的生成 schema。本地檢查僅使用目前檢出目錄中的檔案，將目前原始碼與記錄歷史比較。修改持久化型別時，從[審閱實操手冊](../cookbook/reviewing-persistence-type-changes.zh.md)開始。

較早的 tag 參見[預發行版本歸檔](releases/README.zh.md)。它重建 alpha/RC 型別差異，供歷史閱讀和格式驗證使用；這些觀察記錄不作為目前相容性確認。

按 Session 格式檢視完整 schema 時，使用[格式參考](historical-formats/README.zh.md)。其覆蓋範圍由寫入器常數決定，包括沒有釋出 tag 的中間格式。

## 目錄

- [檔案與職責](#files-and-ownership)
- [相容性規則](#compatibility-rules)
- [歷史與限制](#history-and-limitations)
- [開發備註](#dev-note)

-----

<a id="files-and-ownership"></a>
## 檔案與職責

生成的[目錄](../persistence-catalog.zh.md)提供可讀宣告和摘要；[schema 清單](../persistence-schema.json)包含規範化型別。根覆蓋邏輯工作階段頭、物理 JSONL 頭行、事件封裝以及每個儲存庫內宣告的事件。被引用型別的變更會傳遞到每個受影響根的摘要。

每條帶日期的記錄有四個同目錄檔案：

| 檔案 | 職責 |
|---|---|
| `YYYY-MM-DD-slug.md` | 英文確認文件，包含 `kind: persistence-change`、一份機器宣告、相容性說明和驗證證據 |
| `YYYY-MM-DD-slug.zh.md` | 中文對側檔案，包含相同的機器宣告 |
| `YYYY-MM-DD-slug.i18n.yaml` | 生成的雙語一致性記錄 |
| `YYYY-MM-DD-slug.schema.json` | 生成的完整變更後 schema，覆蓋受影響且仍然存在的根 |

`finalized/vN.json` 記錄已接受相容性基線的完整根分類／摘要，以及對應已接受記錄的語義雜湊。[定稿記錄](../session-format-status.zh.md#finalization-record)要求檢查點存在。目前 V4 schema 可以相容演進；即使寫入器已推進，檢查點仍保護已接受的機器宣告和變更後 schema，而記錄雜湊不包含說明文字、別名和原始碼位置。

維護者透過 [`createPersistenceFinalizationCheckpoint`](../../scripts/persistence-finalization.ts) 捕捉已確認格式，寫入按版本命名的新檢查點而不替換舊檔案，並推進雙語 `latestFinalizedVersion`。該函式要求目前 schema 與完整確認歷史一致。提交前執行常規驗證器。

[記錄範本](../../.agents/skills/dsh-doc/templates/persistence-change.md)定義人工編寫的格式。建立記錄時可以提供雙語說明輸入，由命令生成機器宣告、快照、目錄對和一致性記錄。驗證器從英文件案讀取一次機器宣告，並檢查中文宣告是否相同。宣告列出每個受影響的根、其前驅記錄、變更後摘要和相容性決策。新根沒有前驅；刪除操作沒有變更後 schema，並保留顯式刪除標記。

<a id="compatibility-rules"></a>
## 相容性規則

每個檢測到的結構變更都需要確認。建立和更新記錄依據這些固定規則推斷最低決策；顯式 `--decision` 是受檢查的斷言。規則應用於整個變更，因此允許的變更不能掩蓋同時發生的破壞性變更。

| 檢測到的變更 | 最低決策要求 |
|---|---|
| 新增可選事件體屬性，包括其完整子樹 | `same-version` |
| 將必選事件體屬性改為可選 | `same-version` |
| 新增普通事件型別 | `same-version` |
| 為普通事件增加更高的數字 `data.version`，並原樣保留所有舊載荷分支 | `same-version` |
| 在前後 schema 均帶有相同受支援策略的 user/developer 訊息源欄位中，新增顯式宣告為歸屬資訊的 kind | `same-version` |
| 將可選屬性改為必選、新增必選屬性、更改已有型別，或刪除／重新命名屬性或事件 | `version-bump` |
| 更改工作階段頭或事件封裝 | `version-bump` |

定稿檢查點保護已接受基線，不替換這些相容性規則。在 V4 中，可選新增、普通事件及符合條件的歸屬 kind 新增可以使用新的同版本記錄。破壞性差異要求更高的寫入器版本，以及包含自身頭版本遞增的確認記錄。不能更新已接受 V4 記錄以複用其原有 3→4 轉換。

普通事件可增加具有必選、非負整數 `data.version` 的載荷分支，新版本必須高於所有已有載荷版本，且所有已有分支結構保持不變。讀取器必須保留舊載荷支援；在已有版本中增加分支、移除舊版本，以及修改 Session header 或事件封裝仍屬於破壞性變更。舊讀取器可能拒絕新載荷版本。[Catalog 確認記錄](2026-09-20-unknown-child-catalog.zh.md) 記錄了此類演進。

提取器接受核心擁有的 source 屬性上針對 user 或 developer 字面量角色的顯式 `@persistenceSource` 繫結，不會從未標記型別中推斷繫結。生產者用 `@persistenceAttribution` 標記其 `MessageSourceMap` 成員。該標記承諾：讀取器無需生產者即可保留未知 kind 及其 JSON 中繼資料，且該 kind 不引入驗證、回放或權限要求。生產者可以檢查自身 kind 來恢復去重狀態；其他讀取器必須無需該投影也能保留並派生已記錄的訊息。記錄的 schema 儲存繫結、策略版本、字面量 `kind` 判別欄位、保留承諾及符合條件的 kind 集合。Inventory format 2 儲存這些承諾；沒有繫結策略的提取仍使用 format 1。Session 格式版本獨立於此。比較雙方的快照必須帶有相容的策略狀態。已有 kind 分組仍進行常規結構比較；刪除、未標記的新增、策略更改及無關破壞性變更繼續採用嚴格規則。同一 wire kind 的多個上下文形式分支歸為一組。

同版本說明須解釋舊記錄如何保持可讀，以及舊讀取器如何處理新記錄。可選新增須說明舊讀取器為何可以忽略它而不改變回放；新增載荷版本須記錄舊讀取器的拒絕行為。對於必選改可選的變更，說明須解釋讀取器如何處理缺失值。檢查器驗證型別分類；審閱者判斷說明是否成立。升版本記錄在同一轉換中包含遞增的頭部版本，並遵循[工作階段格式流程](../cookbook/adding-a-session-format-version.zh.md)。

當讀取器按屬性名拒絕 JSON 欄位時，將該屬性宣告為可選 `never`，並新增無參數的 `@persistenceReserved` 標記。提取器保留這一禁止欄位，因此後續允許 JSON 值屬於已有欄位型別變更。必選屬性或允許 JSON 值的屬性不能攜帶該標記。未標記的可選 `never` 和 `undefined` 屬性保留現有省略行為。

<a id="history-and-limitations"></a>
## 歷史與限制

一條基線記錄完整的初始清單。後續記錄使用前驅的變更後 schema 作為變更前 schema。驗證器拒絕缺失前驅、環、同一根的重複後繼、摘要不匹配，以及目前根與最新記錄不一致的情況。獨立的根可以獨立演進。同一前驅上的兩個變更在整合後需要形成一條有序歷史。

已接受記錄描述歷史轉換；新增後繼時須保留其機器宣告和 schema 快照。尚未接受的末端記錄可以顯式重新整理；命令在生成產物前拒絕基線、被依賴的記錄和被檢查點鎖定的記錄。驗證檢查所保留檢查點的雜湊，但不證明檢查點及其真源記錄從未被一起修改。基線不依賴 Git 引用、遠端服務或已釋出版本的檢出目錄。

摘要描述宣告的持久化型別，不描述執行時驗證或行為。普通註解、原始碼位置、別名名稱和無語義變化的宣告重排不影響摘要。相容性標記是記錄的策略資料，會影響摘要。不帶標記的版本 1 快照保留原有規範化、指紋和嚴格分類；包含策略的圖使用獨立的指紋域。物件欄位、聯合型別分支、交叉型別運算元和索引簽名可以在解析型別不變時重排；元組位置和數字列舉值仍然影響摘要。目錄文字和原始碼位置仍可能變化，因此應重新生成陳舊產物，無需為未變的摘要新增確認記錄。`unknown` 等不透明型別不提供可比較的內部結構。純行為變更以及不透明值中隱藏的結構不在本機制範圍內。[決策記錄](../../.agents/notes/implemented/process/2026-09-11-persistence-type-history.zh.md)說明這些取捨。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
