---
description: "回溯 dsh-v0.1.1-rc.1 的已宣告 Session 持久化型別及相鄰版本變化。"
kind: persistence-release
---

# 持久化版本回溯: dsh-v0.1.1-rc.1

[English](dsh-v0.1.1-rc.1.md) | 中文

## 概述

permission/preset 新增可選欄位 origin，可取 default、selection 或 inferred。寫入格式仍為 0。

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
| 原始碼 tag | `dsh-v0.1.1-rc.1` |
| 原始碼日期 | 2026-08-21T06:21:44.000Z |
| 發行記錄 | 有 release 物件。 |
| 前一版本 | [dsh-v0.1.0-rc.8](dsh-v0.1.0-rc.8.zh.md) |
| Session 寫入版本 | 0 |
| 完整重建清單 | <!-- persistence-release-inventory:start -->51 個根型別 / 407 種型別<!-- persistence-release-inventory:end --> |
| 本條快照 | [dsh-v0.1.1-rc.1.schema.json](dsh-v0.1.1-rc.1.schema.json) |

寫入版本常數在該 tag 中的原始碼證據：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 宣告

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.1-rc.1
previous: dsh-v0.1.0-rc.8
sessionFormatVersion: 0
changes:
  - root: event:permission/preset
    before: 5c45bf4c544a7211dcd8ba6ba7e5f1bc39b49e7a9df9d5cbdc8e87c22771b37b
    after: 7271e4b771406aaf06014c2269edd6cb68055bb8b8686571730813ce0ababc22
```

<a id="changes"></a>
## 結構變化

<!-- persistence-release-changes:start -->

檢測到 1 個根型別變化、1 項結構差異。下表的最低要求按目前規則計算，只用於比較；不表示舊版本曾遵守這些規則，也不證明遷移或執行時相容性。

| 路徑 | 變化 | 目前最低要求 |
|---|---|---|
| `event:permission/preset.data.origin` | `optional-property-added` | `same-version` |

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
