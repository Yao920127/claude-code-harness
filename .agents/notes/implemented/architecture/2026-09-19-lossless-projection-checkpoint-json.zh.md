# Agent Note: 無損投影檢查點 JSON

Status: implemented

[English](2026-09-19-lossless-projection-checkpoint-json.md) | 中文

## 問題

投影檢查點可以包含不透明擴充功能資料和訊息中繼資料。名為 `__proto__` 的 JSON 鍵是普通記錄資料。Zod JSON 解析器在重建物件時丟棄該自有鍵，因此重新開啟有效檢查點可能得到與回放 Session 日誌不同的投影狀態。

## 決策

檢查點值 schema 使用 `dsh-util-values` 中既有的 `isJsonValue` 謂詞。它執行與檢查點寫入器 `snapshotJsonValue` 相同的無損 JSON 規則，不重建有效物件。驗證仍拒絕非 JSON 和有損值。Storage-domain 表值是不可變的借用記錄；驗證器不提供防禦性複製保證。

## 備選方案

- **保留 `z.json()`。** 其物件重建會移除有效自有鍵，因此驗證成功仍可能改變檢查點值。
- **用 `snapshotJsonValue` 驗證並複製。** 這能保留鍵，但會複製已經不可變的儲存值。只讀謂詞符合 storage-domain 的借用值約定。

## 影響

Domain 讀取保留檢查點值中的每個有效自有鍵，包括巢狀的 `__proto__` 和 `constructor` 屬性。Projection 的 `stateSchema` 仍擁有其 hydration 值；不透明欄位必須使用保留其鍵的驗證器。借用值驗證器不生成獨立副本，也不投影為 JSON Schema。

儲存 JSON 表示未變，因此 domain 版本不變；本修改修正其讀取器。迴歸測試開啟真實寫入器生成的合成 fixture，再透過 `StorageDomain` 寫入、關閉並重新開啟。Session 格式版本與歷史代際不變。[前代恢復與 Session 格式繫結](2026-09-02-projcache-cross-version-read-compat.zh.md) 繼續負責快取版本與身份相容性。
