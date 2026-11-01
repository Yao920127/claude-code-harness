---
description: "瀏覽全部已捕捉 DSH alpha/RC tag 之間的 Session 持久化型別變化，並離線驗證歷史快照。"
---

# DSH 預發行版本的持久化變化

[English](README.md) | 中文

## 概述

本歸檔提供 26 個 DSH alpha/RC tag 及其 25 次相鄰轉換的近似歷史檢視。每個版本包含簡要說明、原始碼 tag、before/after 摘要以及變化型別的完整快照，供閱讀和格式驗證使用。它不確認歷史執行時相容性，也不替代[目前原始碼的確認記錄](../README.zh.md)。

## 目錄

- [已歸檔版本](#releases)
- [檔案與範圍](#files)
- [提取與限制](#extraction)
- [驗證](#verification)
- [開發備註](#dev-note)

-----

<a id="releases"></a>
## 已歸檔版本

[清單](manifest.json)記錄了 2026-09-12 捕捉的全部 DSH alpha/RC tag：16 個有發行記錄，最早的 10 個只有 tag。版本按語義版本順序排列；不存在的 tag 不補造。首條記錄是歷史起點，變化數包含其所有根。

<!-- persistence-release-index:start -->

| Tag | 原始碼日期（UTC） | Session 版本 | 根 / 型別 | 變化根 |
|---|---|---|---|---|
| [dsh-v0.0.1-rc.1](dsh-v0.0.1-rc.1.zh.md) | 2026-08-10 | 0 | 42 / 341 | 42 |
| [dsh-v0.0.1-rc.2](dsh-v0.0.1-rc.2.zh.md) | 2026-08-11 | 0 | 47 / 374 | 45 |
| [dsh-v0.0.1-rc.3](dsh-v0.0.1-rc.3.zh.md) | 2026-08-12 | 0 | 47 / 374 | 12 |
| [dsh-v0.0.1-rc.4](dsh-v0.0.1-rc.4.zh.md) | 2026-08-12 | 0 | 47 / 374 | 0 |
| [dsh-v0.0.1-rc.5](dsh-v0.0.1-rc.5.zh.md) | 2026-08-12 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.1](dsh-v0.1.0-rc.1.zh.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.2](dsh-v0.1.0-rc.2.zh.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.3](dsh-v0.1.0-rc.3.zh.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.5](dsh-v0.1.0-rc.5.zh.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.6](dsh-v0.1.0-rc.6.zh.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.7](dsh-v0.1.0-rc.7.zh.md) | 2026-08-17 | 0 | 47 / 376 | 1 |
| [dsh-v0.1.0-rc.8](dsh-v0.1.0-rc.8.zh.md) | 2026-08-19 | 0 | 51 / 403 | 8 |
| [dsh-v0.1.1-rc.1](dsh-v0.1.1-rc.1.zh.md) | 2026-08-21 | 0 | 51 / 407 | 1 |
| [dsh-v0.1.1-rc.2](dsh-v0.1.1-rc.2.zh.md) | 2026-08-21 | 0 | 51 / 404 | 10 |
| [dsh-v0.1.2-alpha.1](dsh-v0.1.2-alpha.1.zh.md) | 2026-08-27 | 0 | 54 / 417 | 52 |
| [dsh-v0.1.2-alpha.2](dsh-v0.1.2-alpha.2.zh.md) | 2026-08-30 | 0 | 54 / 417 | 52 |
| [dsh-v0.1.2-alpha.3](dsh-v0.1.2-alpha.3.zh.md) | 2026-08-31 | 0 | 54 / 417 | 0 |
| [dsh-v0.1.2-alpha.4](dsh-v0.1.2-alpha.4.zh.md) | 2026-09-01 | 0 | 54 / 415 | 4 |
| [dsh-v0.1.2-alpha.5](dsh-v0.1.2-alpha.5.zh.md) | 2026-09-02 | 0 | 54 / 415 | 0 |
| [dsh-v0.1.2-rc.1](dsh-v0.1.2-rc.1.zh.md) | 2026-09-03 | 0 | 54 / 415 | 0 |
| [dsh-v0.1.3-alpha.1](dsh-v0.1.3-alpha.1.zh.md) | 2026-09-04 | 2 | 54 / 425 | 17 |
| [dsh-v0.1.3-alpha.2](dsh-v0.1.3-alpha.2.zh.md) | 2026-09-07 | 2 | 56 / 435 | 2 |
| [dsh-v0.1.5-alpha.1](dsh-v0.1.5-alpha.1.zh.md) | 2026-09-08 | 3 | 57 / 443 | 12 |
| [dsh-v0.1.5-alpha.2](dsh-v0.1.5-alpha.2.zh.md) | 2026-09-09 | 3 | 59 / 462 | 4 |
| [dsh-v0.1.5-rc.1](dsh-v0.1.5-rc.1.zh.md) | 2026-09-10 | 3 | 59 / 462 | 0 |
| [dsh-v0.1.5-rc.2](dsh-v0.1.5-rc.2.zh.md) | 2026-09-10 | 3 | 59 / 462 | 0 |

<!-- persistence-release-index:end -->

<a id="files"></a>
## 檔案與範圍

每個 tag 對應 `kind: persistence-release` 的中英記錄、配對 sidecar 和 `.schema.json`。機器宣告包含 tag、直接前驅、實際寫入版本以及每個變化根的 before/after 摘要。首條快照包含全部根；後續快照只儲存仍然存在的變化根及其所有可達型別。刪除使用空 after，未變的版本保留空變化和空快照。

快照覆蓋邏輯 Session header、物理 JSONL header、事件信封以及該 tag 的所有第一方事件及傳遞引用。型別數僅統計規範化後仍可達的定義。歷史原始碼引用僅保留檔案路徑，不包含行號。

這些回溯記錄與上層目錄的目前確認鏈分開驗證。目前規則對舊變化的分類只是閱讀提示：歷史上的 version 0 確實出現過不升版本的結構變化。不得把回填記錄作為目前 PR 省略確認或版本提升的依據。

<a id="extraction"></a>
## 提取與限制

重建使用各 tag 中的原始碼、TypeScript 6.0.3 和已合入的 [schema 提取器](../../../scripts/persistence-schema.ts)。唯一提取適應是省略早期具體事件記錄交叉型別中冗餘的 `object` 成員。原有 `any` / `unknown` 保持不透明；沒有為缺失引用額外替換不透明型別。發行快照 JSON 保留歷史識別符號；術語檢查仍適用於人工記錄和目前 schema。

前 22 個 tag 的 surface 事件合法地帶有可選 `surfaceOp`。歷史解析保留此可選性；目前原始碼解析仍要求該欄位必需。舊版 `SessionHeader.version: number` 也按原宣告保留，實際寫入版本常數另行記錄。不能從寬泛的 `number` 宣告推導它。

本批 tag 的寫入版本為 0、2 和 3，沒有寫入版本 1 的 tag。

摘要對應規範化後的重建型別，不是原始原始碼文字或當時工具鏈的逐字重現。說明僅提供結構變化的粗略理解；未重放舊應用、驗證完整編解碼行為或證明遷移安全。摘要未變也不能證明行為未變。

<a id="verification"></a>
## 驗證

全部 26 個快照已透過規範圖、根摘要和可達型別摘要驗證。發行歸檔檢查只讀取本樹中的清單、記錄和快照，不存取 Git、網路或舊版本 checkout；它驗證清單覆蓋、前驅、before/after、快照型別完整性和雙語機器宣告。

```sh
pnpm run verify-persistence-releases
pnpm run doc-sync
```

標記區間內的索引、清單單元格和結構變化事實由快照生成。預設驗證會拒絕陳舊事實。執行 `pnpm run verify-persistence-releases --write` 可在全部機器資料驗證透過後重新整理這些區間和配對記錄；人工概述、原始碼證據、機器宣告和 schema 檔案保持不變。

tag 的完整性以清單的捕捉範圍為準；離線檢查不會自動發現後續新 tag。配對記錄及 Markdown 連結由常規文件檢查驗證。[格式範本](../../../.agents/skills/dsh-doc/templates/persistence-release.md)規定單條記錄的欄位。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
