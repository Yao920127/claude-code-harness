---
description: "core 分組地圖：構成產品 API 主幹的工作階段日誌、系統提示片語裝、工具註冊表、agent（智慧代理）詞彙與預設迴圈。"
kind: "package-group"
---

# packages/core

[English](README.md) | 中文

## 概述

使用 core 包可以建置或擴充功能能夠記錄持久工作階段歷史、組裝系統提示詞、提供工具、選擇預設模型並執行模型輪次的 agent。這些包定義每個組合都會使用的共享 API，而可執行的產品組合位於 [`packages/bundle`](../bundle/README.zh.md)。開發 agent 行為或替換其中一項能力時請選擇本分組；需要預設可執行組合時，請從 [`dsh-base`](../bundle/base/README.zh.md) 開始。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`scope/`](scope/README.zh.md) | 隔離單個 agent 貢獻的作用域註冊與事件路由 | 庫，不使用 ctx key |
| [`session/`](session/README.zh.md) | 每個 agent 的歷史均派生自該僅追加工作階段事件日誌 | `ctx.sessions` |
| [`system-prompt/`](system-prompt/README.zh.md) | 由有序段、工具 schema 與變數進行的系統提示片語裝 | `ctx.systemPrompt` |
| [`tools/`](tools/README.zh.md) | 供迴圈分發使用的工具註冊表與帶防護機制的執行流水線 | `ctx.tools` |
| [`agent-tool-presentation/`](agent-tool-presentation/README.zh.md) | 為 preset 提供按 agent 的工具呈現方式選擇器 | 無 ctx key |
| [`agent/`](agent/README.zh.md) | 供外掛程式設計使用的 `Agent` 控制代碼，以及其即時註冊表與事件 | `ctx.agents` |
| [`agent-default-model/`](agent-default-model/README.zh.md) | 入口對全新 agent 應用的部署預設模型選擇 | `ctx.agentDefaultModel` |
| [`agent-loop/`](agent-loop/README.zh.md) | 預設 agent 驅動器：建立 agent 並執行輪次與步驟生命週期 | `ctx.agentLoop` |

`scope` 提供共享作用域原語；`agent` 負責公開的 `Agent` 約定，而 `agent-loop` 是其預設實作，因此擴充功能外掛依賴 `agent`，驅動器保持可替換。`agent-default-model` 負責入口在工作階段自身沒有選擇時應用的部署選擇。可執行組合位於 [`packages/bundle`](../bundle/README.zh.md)；本分組只負責可替換的主幹元件。

-----

<a id="related-documentation"></a>
## 相關文件

- [Core 子系統](../../docs/subsystems/core.zh.md)——逐包迴圈圖與 `Agent` 控制代碼約定。
- [工作階段子系統](../../docs/subsystems/session.zh.md)——工作階段事件詞彙與派生歷史。
- [系統提示詞子系統](../../docs/subsystems/system-prompt.zh.md)——提示詞段、動態上下文與工具 schema 型別。
- [工具子系統](../../docs/subsystems/tools.zh.md)——工具執行流水線與呈現詞彙。
- [作用域註冊子系統](../../docs/subsystems/scope.zh.md)——這些註冊表所依賴的作用域層原語。
- [架構](../../docs/architecture.zh.md)——輪次流與新行為歸屬。
- [基礎組合包](../bundle/base/README.zh.md)——預設產品組合。
- [SDK 最小組合包](../bundle/sdk-minimal/README.zh.md)——完整、獨立且功能集經過刻意精簡的組合。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
