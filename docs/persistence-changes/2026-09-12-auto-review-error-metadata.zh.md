---
description: "記錄持久化型別更改及其相容性確認。"
kind: persistence-change
---

# 2026-09-12-auto-review-error-metadata

[English](2026-09-12-auto-review-error-metadata.md) | 中文

## 概述

為持久化的 PTC dispatch 增加可選的結構化錯誤中繼資料，併為持久化的原生工具錯誤增加可選的使用者可見理由。兩項新增欄位均保持 Session 格式版本。

## 目錄

- [宣告](#declaration)
- [相容性](#compatibility)
- [驗證](#verification)
- [開發備註](#dev-note)

<a id="declaration"></a>
## 宣告

```yaml persistence-change
schemaVersion: 1
id: 2026-09-12-auto-review-error-metadata
baseline: false
changes:
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-11-initial"
    after: "b5d66eaebed4da391b13498623b11142222149fbf5e025975dbc6d94f0d06796"
    decision: same-version
  - root: "event:tool/result"
    previous: "2026-09-11-initial"
    after: "3a803805bdeb805f32b229e399fb7258be8e32a89f89063a7c99957cfea942f7"
    decision: same-version
```

<a id="compatibility"></a>
## 相容性

已有 tool/ptc-dispatch 事件可以省略 error，已有 tool/result 錯誤可以省略 reason。PTC dispatch 事件不進入模型歷史；原生工具結果回放只投影 data.message，不包含錯誤中繼資料。舊讀取方可以忽略新增欄位，不改變模型回放。目前 Web 讀取方接受缺失的理由，並且只有記錄中的錯誤標識匹配時才顯示 Auto review 拒絕詳情。權限模式在已有事件中仍為字串；選擇 auto 不引入已宣告持久化型別的變更。Session header、事件信封和已有值型別均未改變，無需相鄰遷移。

<a id="verification"></a>
## 驗證

pnpm exec vitest run scripts/persistence-changes.spec.ts scripts/persistence-schema.spec.ts 透過 64 個測試。權限、Auto review、工具執行、agent loop（智慧代理迴圈）、subagent 繼承和 TypeScript SDK 的定向測試共 10 個檔案、390 個測試透過，覆蓋原生與 PTC 拒絕中繼資料。uv run --python 3.10 --group test --project python/sdk pytest python/sdk/tests/test_client.py -k preserves_auto_review_errors 透過 1 個測試。持久化預覽僅識別出這兩項可選欄位新增，均無需提升版本。

<a id="dev-note"></a>
## 開發備註

無。
