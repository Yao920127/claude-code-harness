---
description: "經驗證的外部事件、程式化規則與即發即棄 DSH 工作階段建立的包對映。"
kind: "package-group"
---

# webhook/ — 從已驗證外部事件到 DSH 工作階段

[English](README.md) | 中文

## 概述

Webhook 系列接收透過身份驗證的提供者事件，並執行受信任的程式化規則。規則可以在 Web Workspace 中建立普通根工作階段。分發僅存在於程序內並採用 fire-and-forget，不擁有交付資料庫、佇列、重試、去重或 agent（智慧代理）完成狀態。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 角色 | ctx key |
|---|---|---|
| [`webhook/`](webhook/README.zh.md) | 規則註冊表、回呼生命週期與基於 Workspace 的工作階段建立 | `ctx.webhookRuntime` |
| [`webhook-github/`](webhook-github/README.zh.md) | GitHub HTTP 簽名驗證介面卡 | 消費 `ctx.webhookRuntime` 與 `ctx.webServer` |

<a id="related-documentation"></a>
## 相關文件

提供者介面卡負責驗證身份並規範化交付。規則擁有任意條件和外部呼叫，隨後返回 `null` 或一個工作階段請求。[Webhook 子系統參考](../../docs/subsystems/webhook.zh.md)擁有共享型別與時序保證。

<a id="dev-note"></a>
## 開發備註

無。
