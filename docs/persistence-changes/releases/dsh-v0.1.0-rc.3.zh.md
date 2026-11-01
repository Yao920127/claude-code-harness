---
description: "回溯 dsh-v0.1.0-rc.3 的已宣告 Session 持久化型別及相鄰版本變化。"
kind: persistence-release
---

# 持久化版本回溯: dsh-v0.1.0-rc.3

[English](dsh-v0.1.0-rc.3.md) | 中文

## 概述

重建的所有持久化根型別摘要均與上一個 alpha/rc 標籤一致。寫入格式仍為 0。

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
| 原始碼 tag | `dsh-v0.1.0-rc.3` |
| 原始碼日期 | 2026-08-13T10:40:08.000Z |
| 發行記錄 | 只有 tag，沒有 release 物件。 |
| 前一版本 | [dsh-v0.1.0-rc.2](dsh-v0.1.0-rc.2.zh.md) |
| Session 寫入版本 | 0 |
| 完整重建清單 | <!-- persistence-release-inventory:start -->47 個根型別 / 374 種型別<!-- persistence-release-inventory:end --> |
| 本條快照 | [dsh-v0.1.0-rc.3.schema.json](dsh-v0.1.0-rc.3.schema.json) |

寫入版本常數在該 tag 中的原始碼證據：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 宣告

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.0-rc.3
previous: dsh-v0.1.0-rc.2
sessionFormatVersion: 0
changes: []
```

<a id="changes"></a>
## 結構變化

<!-- persistence-release-changes:start -->

規範化後的根型別及其傳遞引用摘要與前一 tag 相同。

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
