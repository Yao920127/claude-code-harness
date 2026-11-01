---
description: "記錄持久化型別更改及其相容性確認。"
kind: persistence-change
---

# 2026-11-01-coding-cli-tool-event

[English](2026-11-01-coding-cli-tool-event.md) | 中文

## 概述

新增只記錄於日誌的 coding-cli/tool 事件，記錄 coding CLI 在自身模型回合內執行的每個工具呼叫。

## 目錄

- [宣告](#declaration)
- [相容性](#compatibility)
- [驗證](#verification)
- [開發備註](#dev-note)

<a id="declaration"></a>
## 宣告

```yaml persistence-change
schemaVersion: 1
id: 2026-11-01-coding-cli-tool-event
baseline: false
changes:
  - root: "event:coding-cli/tool"
    previous: null
    after: "563565881151791031b8f990719507bd5e4ae5f2a9d823c9a353585c1cb5c5e1"
    decision: same-version
```

<a id="compatibility"></a>
## 相容性

僅新增事件類型；既有記錄不變。此事件從不進入衍生歷史或模型請求，因此沒有 coding CLI 路由的版本重建每個 Session 的結果都相同。

<a id="verification"></a>
## 驗證

pnpm exec vitest run packages/llm/llm-coding-cli packages/client/ui-coding-cli-tools：72 個測試透過。

<a id="dev-note"></a>
## 開發備註

無。
