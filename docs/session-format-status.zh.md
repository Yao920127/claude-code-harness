# Session 格式版本與釋出狀態

[English](session-format-status.md) | 中文

## 概述

本參考區分工作區寫入器、已接受相容性基線與最新已釋出的 Session 格式。程式碼常數擁有寫入器版本；下方定稿記錄和釋出記錄分別標識已接受歷史與釋出證據。其他文件連結到這裡，不重複這些值。

## 目錄

- [單一真源](#sources-of-truth)
- [定稿記錄](#finalization-record)
- [釋出記錄](#release-record)
- [更新記錄](#updating-the-record)
- [開發備註](#dev-note)

<a id="sources-of-truth"></a>
## 單一真源

- **工作區寫入器：**[核心 Session 型別](../packages/core/session/src/types.ts)中的 `SESSION_FORMAT_VERSION` 是程式碼中唯一手工維護的目前寫入器版本號。[目錄生成器](../scripts/gen-session-format-catalog.ts)推導 codec 順序，並檢查相鄰遷移是否到達該版本。包版本、codec 匯出名稱、fixture（測試前置資料）檔名或投影快取版本都不是寫入器版本的權威來源。
- **最新已釋出格式：**下方記錄中的 `latestReleasedVersion` 標識已釋出的 Session 格式。`evidenceTag` 指定一個已釋出的產品版本，其標籤對應的寫入器具有該值；它不必是首次攜帶該格式的釋出。雙語副本按同一記錄驗證，不作為獨立決策維護。
- **釋出狀態：**比較寫入器常數與已核實的釋出記錄。相等表示寫入器格式已經發布。寫入器版本更高表示釋出記錄尚未收錄它；獨立的定稿記錄標識已接受的相容性基線。用較新分支中已核實的記錄對比舊工作區時，較低的寫入器版本表示較舊的寫入器格式；本地一致性門禁會拒絕同一工作區內的這種大小關係。不另行維護 released 布林值。在宣告更高版本尚未釋出前，必須核實是否已有產品釋出推進了記錄。

產品的 alpha、beta 或 release-candidate 釋出都會確立已釋出 Session 格式的義務。GitHub 的 prerelease 標記不會讓持久化使用者資料成為可丟棄資料。缺少釋出記錄不代表尚未釋出。[版本與真源決策](../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.zh.md)擁有相容性決策；[已釋出格式遷移](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)擁有不可變代際與相鄰轉換規則。

[格式參考](persistence-changes/historical-formats/README.zh.md)記錄從零到工作區寫入器的每個整數版本，提供歷史 schema 並引用現有的目前目錄。

<a id="finalization-record"></a>
## 定稿記錄

```yaml session-format-finalization
latestFinalizedVersion: 4
```

V4 的已接受相容性基線儲存在[檢查點](persistence-changes/finalized/v4.json)中。向後相容的 schema 變更可以透過新的確認記錄保留 V4。破壞性變更要求更高的寫入器版本及自身的頭版本轉換，不能複用已接受的 3→4 轉換。已接受的機器記錄與變更後 schema 保持不可變。[檢查點規則](persistence-changes/README.zh.md#compatibility-rules)規定比較方法。

定稿不凍結 V4 之後的每項新增，也不表示已釋出。下方釋出記錄保留獨立驗證的已釋出版本。普通註解、別名、原始碼位置，以及保留已接受含義的實作修復，不改變該基線。

首次釋出 V4 前，每次整合仍寫入 V3 的較新 master 都必須對已記錄的本地源提交執行[顯式 V3 詞彙驗證](cookbook/adding-a-session-format-version.zh.md#final-v3-vocabulary)。更新遷移所有的集合前，要核驗源 pin 的新鮮度並審查新事件 payload 的轉換。釋出後，最終 V3 詞彙保持為歷史定義，與目前 V4 新增事件無關。

<a id="release-record"></a>
## 釋出記錄

```yaml session-format-release
latestReleasedVersion: 3
evidenceTag: dsh-v0.1.5-alpha.1
```

證據：已釋出產品標籤 `dsh-v0.1.5-alpha.1`；該標籤的寫入器路徑：`packages/core/session/src/types.ts`。

<a id="updating-the-record"></a>
## 更新記錄

實作結構性寫入器變更時，一起更新程式碼常數與相鄰遷移目錄；不要在產品釋出前推進此釋出記錄。當產品首次釋出更高的 Session 格式時，確認釋出事實及對應標籤的寫入器，然後在同一次雙語更新中推進本記錄與證據標籤及該標籤的寫入器路徑。後續攜帶相同格式的產品釋出無需改變此記錄。開發主幹上的記錄絕不降低。

[文件標準測試](../scripts/doc-standard.spec.ts)檢查記錄結構、雙語一致性、證據標籤及寫入器路徑一致性，以及文件中的已釋出版本不高於工作區寫入器。這個無金鑰檢查不會查詢 GitHub，也不能證明記錄是最新的；核實釋出事實仍屬於釋出更新的一部分。

一般行為使用“目前格式”和“下一條相鄰版本”等表述。固定遷移的輸入與輸出、協定 schema、歷史證據及針對特定版本的測試保留明確版本號。[格式版本實操手冊](cookbook/adding-a-session-format-version.zh.md)用 N 表示最新已定稿或已釋出格式，用 N+1 表示其後繼版本。

<a id="dev-note"></a>
## 開發備註

無。
