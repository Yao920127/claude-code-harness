---
description: "回溯 dsh-v0.1.2-alpha.4 的已宣告 Session 持久化型別及相鄰版本變化。"
kind: persistence-release
---

# 持久化版本回溯: dsh-v0.1.2-alpha.4

[English](dsh-v0.1.2-alpha.4.md) | 中文

## 概述

邏輯 SessionHeader 以必需欄位 isSeeded 替代可選欄位 seedLength，但物理 JSONL 頭仍宣告 seedLength。使用者訊息來源變體 subagent-report 和 coordinator 改為 agent-message。寫入格式仍為 0。

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
| 原始碼 tag | `dsh-v0.1.2-alpha.4` |
| 原始碼日期 | 2026-09-01T15:37:26.000Z |
| 發行記錄 | 有 release 物件。 |
| 前一版本 | [dsh-v0.1.2-alpha.3](dsh-v0.1.2-alpha.3.zh.md) |
| Session 寫入版本 | 0 |
| 完整重建清單 | <!-- persistence-release-inventory:start -->54 個根型別 / 415 種型別<!-- persistence-release-inventory:end --> |
| 本條快照 | [dsh-v0.1.2-alpha.4.schema.json](dsh-v0.1.2-alpha.4.schema.json) |

寫入版本常數在該 tag 中的原始碼證據：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 宣告

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.2-alpha.4
previous: dsh-v0.1.2-alpha.3
sessionFormatVersion: 0
changes:
  - root: SessionHeader
    before: a50373168c4935222b1681223d919a56d095ce37ad45c5ba2c20d75235adf937
    after: 001ed6f66d67fac9cb9594b55f13557db94174fe5d5954789bb5a2d6d5927226
  - root: event:agent/inbox/spliced
    before: ee796690277eafbcda4437478de7a8f01d983424d6238fe472df9b3b0d97a89f
    after: 15cdff6391d58ea00d7e2fe113b663d5479cbb3fd1af26717ad933c770bca081
  - root: event:session/title-llm-request
    before: 61651f4ca07ab9ebef773d82fafbcb74d39190a255c69ecc36084046123a9cb4
    after: 2cfb71f7819bc88a6bccbffa8b7ae5664233af6f6e1dfb068db25e2e17ddd8c7
  - root: event:user/message
    before: e23368db1646a9ac10d2bd4629084fdff583a1db2c83ffaa3f2f201d0c45f3e4
    after: e950c87ba49bd8175b8a670b319a599d5ed14cde996540d5ba91a141fad68781
```

<a id="changes"></a>
## 結構變化

<!-- persistence-release-changes:start -->

檢測到 4 個根型別變化、5 項結構差異。下表的最低要求按目前規則計算，只用於比較；不表示舊版本曾遵守這些規則，也不證明遷移或執行時相容性。

| 路徑 | 變化 | 目前最低要求 |
|---|---|---|
| `SessionHeader.seedLength` | `property-removed` | `version-bump` |
| `SessionHeader.isSeeded` | `required-property-added` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.source` | `union-variants-changed` | `version-bump` |

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
