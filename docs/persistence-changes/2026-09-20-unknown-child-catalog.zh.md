---
description: "記錄持久化型別更改及其相容性確認。"
kind: persistence-change
---

# 2026-09-20-unknown-child-catalog

[English](2026-09-20-unknown-child-catalog.md) | 中文

## 概述

在 subagent/catalog 中使用 unknown 模式保留不可讀的歷史子工作階段。

## 目錄

- [宣告](#declaration)
- [相容性](#compatibility)
- [驗證](#verification)
- [開發備註](#dev-note)

<a id="declaration"></a>
## 宣告

```yaml persistence-change
schemaVersion: 1
id: 2026-09-20-unknown-child-catalog
baseline: false
changes:
  - root: "event:subagent/catalog"
    previous: "2026-09-11-initial"
    after: "3abae7324356f155cb42450c00b806d134ec93bd6439d2063b8d724162d58604"
    decision: same-version
```

<a id="compatibility"></a>
## 相容性

Catalog 載荷 v0 保持不變。載荷 v1 增加 unknown 模式，目前讀取器支援 v0 和 v1。完整事實繼續使用 v0；遷移為未知子工作階段寫入 v1。已有日誌無需改寫，Session header 保持 V4。舊讀取器拒絕 v1。分類器僅在所有舊載荷分支保持不變時允許增加更高的事件載荷版本；同版本擴充功能和移除舊版讀取支援仍屬於破壞性變更。

<a id="verification"></a>
## 驗證

遷移、恢復、投影和 Web 迴歸覆蓋未知成員保留與子工作階段區域性報錯。分類器測試接受保留前代的更高載荷版本，並拒絕同版本新增、無效版本、舊分支修改或刪除，以及 header/model-surface 變更。

<a id="dev-note"></a>
## 開發備註

無。
