---
description: "ACP（Agent Client Protocol）包組：透過 JSON-RPC stdio 將全新 harness agent（智慧代理）暴露給程式化用戶端的僅面向自動化的伺服器。"
kind: "package-group"
---

# acp/：Agent Client Protocol 自動化

[English](README.md) | 中文

## 概述

acp 組提供一個包：一個伺服器，讓程式與自動化流程可以透過標準 Agent Client Protocol 執行持久 DeepSeek Harness agent。用戶端可以建立、列出、恢復與關閉工作階段，掛載標準 MCP 伺服器，選擇模型選項，傳送文字與圖片提示詞，接收語義更新，回應權限提示並取消工作——無需人類參與。從另一個 harness 啟動這種伺服器的配套用戶端位於 `subagent/subagent-acp`。本頁概述該包組；各包的具體約定由其 README 規定。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 |
|---|---|
| [`acp/`](acp/README.zh.md) | 讓程式透過 ACP 管理持久 agent、掛載 MCP 伺服器、選擇模型選項、傳送提示詞、取消工作並接收語義更新 |

-----

<a id="related-documentation"></a>
## 相關文件

- [dsh-subagent-acp](../subagent/subagent-acp/README.zh.md)——spawn 並驅動本伺服器的程序外 ACP 用戶端。
- [ACP 作為僅面向自動化的協定](../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.zh.md)——自動化約定及其協定邊界的決策記錄。
- [在單個連線上多路複用並行 ACP 工作階段](../../.agents/notes/archived/feature/2026-06-14-acp-multi-session.md)——按工作階段隔離、歸屬與清理決策。

<a id="dev-note"></a>
## 開發備註

無。
