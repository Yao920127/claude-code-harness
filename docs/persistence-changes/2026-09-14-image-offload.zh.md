---
description: "記錄持久化型別更改及其相容性確認。"
kind: persistence-change
---

# 2026-09-14-image-offload

[English](2026-09-14-image-offload.md) | 中文

## 概述

用 image/offload 事件記錄選中的圖片出現位置，透過所屬外掛的訊息投影派生 offloaded 標記。

## 目錄

- [宣告](#declaration)
- [相容性](#compatibility)
- [驗證](#verification)
- [開發備註](#dev-note)

<a id="declaration"></a>
## 宣告

```yaml persistence-change
schemaVersion: 1
id: 2026-09-14-image-offload
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-11-initial"
    after: "646c2f1d243d3a78c5bc9305786fb340f5209c48a97e65f2a186cc5195491f3f"
    decision: same-version
  - root: "event:assistant/attempt"
    previous: "2026-09-11-initial"
    after: "c80c89da83c46db7a454f034c10f969e03cfb574859c7316e5bff683f5a14b0e"
    decision: same-version
  - root: "event:assistant/message"
    previous: "2026-09-11-initial"
    after: "1169b301aaabcd992657b93ec93750c43175dda81ada5cac086f14f2eaaeed6d"
    decision: same-version
  - root: "event:compaction/summary"
    previous: "2026-09-11-initial"
    after: "f6f3f30109e9008fccf7da2a3268a63da8646b59dd7cf7b75bcd9cf08ac08a59"
    decision: same-version
  - root: "event:image/offload"
    previous: null
    after: "b222069eea2d768065161c1147b1f2c78c1b54328c84b3586ae5c8f91b8ed35e"
    decision: same-version
  - root: "event:llm/retry"
    previous: "2026-09-11-initial"
    after: "525254db03b1d1e6b74cf55aced52817568331ac1f96c0818728910b6692e336"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-11-initial"
    after: "e0b5bf44c27bbfc6ab144239e3e4169c4d21146645e0e3121bbb359c3bc8591d"
    decision: same-version
  - root: "event:system/message"
    previous: "2026-09-11-initial"
    after: "69becfb6b2d3fd5da91518089454cae8ef33f1835637ec44dde35dd077fd4bae"
    decision: same-version
  - root: "event:team/message/queued"
    previous: "2026-09-11-initial"
    after: "443371ec07a03a82a0e93d93abca3e70b03bca55ba5b01d507030fcb66e8fbb4"
    decision: same-version
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-12-auto-review-error-metadata"
    after: "b33142af8176323ffbb20762541be81c1d51b60a60887803836e0b146e5bef0c"
    decision: same-version
  - root: "event:tool/result"
    previous: "2026-09-12-auto-review-error-metadata"
    after: "29af48b840d0cd9e48b6f50bf3b354f8f6340607c5b99220a48e74f60beac9e2"
    decision: same-version
  - root: "event:turn/end"
    previous: "2026-09-11-initial"
    after: "bab768260853e13a7cf2e22e65af572a1e76a5b2c01f3cdc2ce09d39b87fb70b"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-11-initial"
    after: "314765bdff29c7862fb6ce820f1773563ba3094a680d163ea21180a2591b8578"
    decision: same-version
```

<a id="compatibility"></a>
## 相容性

現有日誌仍可讀取。可選的圖片欄位 offloaded 使未標記的出現位置保持保留狀態。新事件在讀取時必須被識別：不認識 image/offload 的舊版本拒絕讀取這些日誌，目前讀取器需要對應的訊息投影。事件信封和結構性的 Session 格式版本不變。

<a id="verification"></a>
## 驗證

Session 和圖片省略測試覆蓋事件驗證、不可變訊息投影、缺少處理器、恢復和重試。所選的 1,144 項測試和兩項 TypeScript 圖片快照透過。Python advanced SDK 錄製已透過建置後的 dsh profile 重新整理，包含獨立的 image/offload 事件。

<a id="dev-note"></a>
## 開發備註

無。
