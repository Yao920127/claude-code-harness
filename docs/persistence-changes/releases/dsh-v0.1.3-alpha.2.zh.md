---
description: "回溯 dsh-v0.1.3-alpha.2 的已宣告 Session 持久化型別及相鄰版本變化。"
kind: persistence-release
---

# 持久化版本回溯: dsh-v0.1.3-alpha.2

[English](dsh-v0.1.3-alpha.2.md) | 中文

## 概述

新增 feedback/message-put 和 feedback/message-delete，已有持久化根型別的摘要保持不變。寫入格式仍為 2。

## 目錄

- [發行來源](#evidence)
- [宣告](#declaration)
- [結構變化](#changes)
- [驗證](#verification)
- [開發備註](#dev-note)

-----

<a id="evidence"></a>
## 發行來源

這是供閱讀和格式驗證的近似回填，不是當時的相容性確認。提取方法和覆蓋限制見[歸檔說明](README.zh.md)。

| 專案 | 記錄值 |
|---|---|
| 原始碼 tag | `dsh-v0.1.3-alpha.2` |
| 原始碼日期 | 2026-09-07T11:45:35.000Z |
| 發行記錄 | 有 release 物件。 |
| 前一版本 | [dsh-v0.1.3-alpha.1](dsh-v0.1.3-alpha.1.zh.md) |
| Session 寫入版本 | 2 |
| 完整重建清單 | <!-- persistence-release-inventory:start -->56 個根型別 / 435 種型別<!-- persistence-release-inventory:end --> |
| 本條快照 | [dsh-v0.1.3-alpha.2.schema.json](dsh-v0.1.3-alpha.2.schema.json) |

寫入版本常數在該 tag 中的原始碼證據：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 2`

<a id="declaration"></a>
## 宣告

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.3-alpha.2
previous: dsh-v0.1.3-alpha.1
sessionFormatVersion: 2
changes:
  - root: event:feedback/message-delete
    before: null
    after: 3ee93b06f3a125850337602bcdf155d2538c43a5c944ec55b1b3c365152d6796
  - root: event:feedback/message-put
    before: null
    after: 3b04fde0dc763cf84fbde7b6611b3194dd56d95d0c0bf0204311640468d586e1
```

<a id="changes"></a>
## 結構變化

<!-- persistence-release-changes:start -->

檢測到 2 個根型別變化、2 項結構差異。下表的最低要求按目前規則計算，只用於比較；不表示舊版本曾遵守這些規則，也不證明遷移或執行時相容性。

| 路徑 | 變化 | 目前最低要求 |
|---|---|---|
| `event:feedback/message-delete` | `root-added` | `same-version` |
| `event:feedback/message-put` | `root-added` | `same-version` |

<!-- persistence-release-changes:end -->

<a id="verification"></a>
## 驗證

提取結果已透過規範圖、根摘要和全部可達型別摘要驗證；僅對歷史 surface 事件允許原始碼原有的可選 `surfaceOp`。儲存庫內檢查從前驅重建每個 tag，核對 before/after、快照覆蓋和雙語機器宣告。

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## 開發備註

無。
