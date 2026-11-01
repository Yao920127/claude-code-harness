---
description: "記錄持久化型別更改及其相容性確認。"
kind: persistence-change
---

# 2026-09-18-schedule-optional-title

[English](2026-09-18-schedule-optional-title.md) | 中文

## 概述

將持久化的 schedule/change create 記錄中 after、at、every 三個變體的已存 title 改為可選。

## 目錄

- [宣告](#declaration)
- [相容性](#compatibility)
- [驗證](#verification)
- [開發備註](#dev-note)

<a id="declaration"></a>
## 宣告

```yaml persistence-change
schemaVersion: 1
id: 2026-09-18-schedule-optional-title
baseline: false
changes:
  - root: "event:schedule/change"
    previous: "2026-09-11-initial"
    after: "a0a2e5c42e1c929445ecd1cd70f49be6b66441894ec72c08e8ae332821d4a3cb"
    decision: same-version
```

<a id="compatibility"></a>
## 相容性

在 title 出現之前寫入的版本 1 Session 事件沒有 title 成員，因此這些日誌可以在沒有該成員的情況下解碼與摺疊，而不會被拒絕。需要名稱的讀取方將缺失的 title 視為未命名任務。主機任務記錄仍然要求該成員：儲存解碼器拒絕沒有它的已存任務，建立、更新與 schedule 工具也仍然要求它。

<a id="verification"></a>
## 驗證

pnpm exec vitest run packages/schedule/schedule/tests：18 個檔案、789 個測試透過。

<a id="dev-note"></a>
## 開發備註

無。
