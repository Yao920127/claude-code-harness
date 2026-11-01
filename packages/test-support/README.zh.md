---
description: "test-support 組地圖：面向編寫與執行儲存庫測試的開發者，提供無金鑰測試 harness、LLM（大語言模型） mock 與回放伺服器以及 Loader 冒煙測試輔助。"
kind: "package-group"
---

# packages/test-support

[English](README.md) | 中文

## 概述

test-support 組為儲存庫測試提供確定且無須金鑰的真實產品測試方式。它包含 Loader 應用 harness、session-log 快照介面卡、回放 LLM 外掛和可透過腳本控制的 OpenAI 相容故障伺服器。每個包都是支援層基礎設施；當某個包獲得產品約定與產品消費方時，它就會移出本組。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 |
|---|---|
| [`session-snapshot`](session-snapshot/README.zh.md) | 為 profile 驅動的測試提供 session-log 快照支援與協定介面卡 |
| [`agent-loop-testkit`](agent-loop-testkit/README.zh.md) | 為執行具體 AgentLoop 的測試提供共享先決服務 |
| [`client-runtime`](client-runtime/README.zh.md) | 為瀏覽器功能測試提供 jsdom slot 測試臺 |
| [`remote-mock`](remote-mock/README.zh.md) | 為整體用戶端測試提供端點具名的 Typert Remote mock 與它們安裝的 Connection 載體面 |
| [`loader-smoke`](loader-smoke/README.zh.md) | 啟動由 Loader 組合的應用並驅動 fixture（測試前置資料）輪次以執行冒煙測試 |
| [`llm-mock-server`](llm-mock-server/README.zh.md) | 為恢復測試提供可透過腳本控制的 OpenAI 相容故障伺服器 |
| [`llm-replay`](llm-replay/README.zh.md) | 為無金鑰測試與演示回放已記錄的模型流 |

-----

<a id="related-documentation"></a>
## 相關文件

- [測試策略](../../docs/testing.zh.md)——這些 harness 所服務的無金鑰快照層，以及何時必須使用該層。
- [執行時不變式子系統](../../docs/subsystems/invariants.zh.md)——包自有執行時檢查的註冊與執行。
- [包組](../README.zh.md)——支援組與產品組的關係。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
