---
description: "記錄持久化型別更改及其相容性確認。"
kind: persistence-change
---

# 2026-09-14-workspace-changes-event

[English](2026-09-14-workspace-changes-event.md) | 中文

## 概述

新增僅寫日誌的 workspace/changes 事件，記錄頂層輪次改動的檔案。

## 目錄

- [宣告](#declaration)
- [相容性](#compatibility)
- [驗證](#verification)
- [開發備註](#dev-note)

<a id="declaration"></a>
## 宣告

```yaml persistence-change
schemaVersion: 1
id: 2026-09-14-workspace-changes-event
baseline: false
changes:
  - root: "event:workspace/changes"
    previous: null
    after: "e308ccf867a5398e316e0af8cb6ce238a8d33a63b9b384c8250a686786285f72"
    decision: same-version
```

<a id="compatibility"></a>
## 相容性

同一 Session 格式版本內的新根型別。已有日誌沒有該事件，保持有效；早於它的讀取方遇到它會拒絕該日誌，與所有讀取時必需的事件一致。該事件只由 Web bundle 的 workspace-changes 外掛追加，模型永遠看不到；Web 的改動檔案卡片是唯一消費者，讀取每輪最新的一條。

<a id="verification"></a>
## 驗證

pnpm exec vitest run packages/deliverables/workspace-changes packages/client/ui-deliverables：165 個測試透過；snapshots/web/changed-files-turn 透過 Web profile 回放了記錄的事件。

<a id="dev-note"></a>
## 開發備註

無。
