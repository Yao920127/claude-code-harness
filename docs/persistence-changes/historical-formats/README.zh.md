---
description: "查詢從 V0 到工作區寫入器版本的每個 Session 格式的完整持久化型別宣告。"
---

# Session 持久化格式

[English](README.md) | 中文

## 概述

本參考用於查閱已儲存 Session 代際的 header、事件信封與載荷型別。低於工作區寫入器版本的每個格式都有雙語文件與完整 schema 快照。目前格式使用生成的持久化目錄。[版本真源](../../session-format-status.zh.md)負責寫入器常數與釋出狀態。

## 目錄

- [格式參考](#formats)
- [範圍與證據](#scope)
- [維護覆蓋](#maintenance)
- [開發備註](#dev-note)

-----

<a id="formats"></a>
## 格式參考

索引由已驗證的快照與目前寫入器常數生成。每個歷史參考標明其來源檢查點；Session 格式編號不能標識該格式內的每次事件載荷修訂。

<!-- persistence-format-index:start -->

| 格式 | 來源 | 參考文件 | 機器 schema | 根型別 / 型別 |
|---|---|---|---|---|
| 0 | `dsh-v0.1.2-rc.1` | [V0](v0.zh.md) | [JSON](v0.schema.json) | 54 / 415 |
| 1 | PR #3349 | [V1](v1.zh.md) | [JSON](v1.schema.json) | 54 / 415 |
| 2 | `dsh-v0.1.3-alpha.2` | [V2](v2.zh.md) | [JSON](v2.schema.json) | 56 / 435 |
| 3 | PR #4320 | [V3](v3.zh.md) | [JSON](v3.schema.json) | 60 / 467 |
| 4 | 目前工作樹 | [目前目錄](../../persistence-catalog.zh.md) | [JSON](../../persistence-schema.json) | 62 / 587 |

<!-- persistence-format-index:end -->

<a id="scope"></a>
## 範圍與證據

每組 `vN.md` / `vN.zh.md` 文件包含 `kind: persistence-format`、將每個根型別鍵繫結到已記錄摘要的相同 `yaml persistence-format` 宣告、配對記錄及完整的 `vN.schema.json`。[範本](../../../.agents/skills/dsh-doc/templates/persistence-format.md)定義這些記錄。根型別覆蓋所選檢查點的邏輯 Session header、物理 JSONL header、事件信封與所有第一方事件；每個根包含所有可達的宣告型別。打包的物理 body 記錄由每頁連結的獨立 codec 負責。

V0 與 V2 使用[已收錄預釋出歸檔](../releases/README.zh.md)中最後一個對應 tag。由於收錄的 tag 沒有 V1 寫入器，V1 使用其參考文件中標識的中間原始碼樹。V3 捕捉 PR #4320 中 V4 寫入器變更前已驗證的目錄。歷史來源保留檔案路徑，不包含行號。快照保留歷史可選欄位與不透明值，不會將目前型別替換到舊格式中。歷史識別符號僅在 schema JSON 與已驗證的生成 schema 區間中原樣保留；人工說明遵循目前術語規則。

這些參考描述選定的 schema，不表示歷史應用回放結果或遷移安全性。同版本內新增事件與可選載荷變更可以產生其他有效目錄。預釋出歸檔保留逐 tag 差異；[變更記錄](../README.zh.md)保留目前相容性確認。這些格式快照不替代任何一種歷史。

<a id="maintenance"></a>
## 維護覆蓋

`verify-persistence-formats` 從 `SESSION_FORMAT_VERSION` 推導所需的整數範圍。每個更早的整數都需要獨立的完整記錄。目前目錄與 schema 必須存在且匹配寫入器版本。檢查會拒絕缺失、多餘、編號錯誤、不完整或不一致的記錄及過期生成區間，無需取得 Git 歷史或查詢服務。

推進寫入器之前，驗證目前目錄並歸檔原格式。對於 V3 到 V4 的變更，在寫入器與目前 schema 仍描述 V3 時執行以下命令：

```sh
pnpm run verify-persistence-catalog
pnpm run verify-persistence-formats --archive 3
```

對於其他轉換，將 `3` 替換為原寫入器版本。`--archive N` 從目前目錄建立 `vN.schema.json`，只保留從根型別可達的型別，並移除原始碼行號。它拒絕已存在的目標、與目前寫入器不同的版本、無效或不完整的 schema，以及與 `--write` 的組合。使用[範本](../../../.agents/skills/dsh-doc/templates/persistence-format.md)新增該快照的雙語記錄與來源證據。保留所有更早的記錄。後繼格式使用目前目錄；複製新的目前目錄不能滿足歸檔前驅的要求。執行時變更遵循[格式版本實操手冊](../../cookbook/adding-a-session-format-version.zh.md)。

註解標記內的 schema 定義與索引由工具生成。推進寫入器並完成機器資料與人工證據後，重新整理其表格和配對記錄，再執行驗證：

```sh
pnpm run verify-persistence-formats --write
pnpm run verify-persistence-formats
pnpm run doc-sync
```

`--write` 先驗證機器資料，再更新生成的 Markdown 與配對記錄。它保留人工說明、機器宣告和 schema。預設驗證也會拒絕過期的配對記錄；標準文件檢查驗證翻譯與本地連結。目前目錄的新鮮度仍由 `verify-persistence-catalog` 負責。

<a id="dev-note"></a>
## 開發備註

無。
