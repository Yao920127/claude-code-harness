---
description: "workspace 組地圖：持久工作區實體家族、使用者目錄的持久記錄與經工作階段頭驗證的工作階段歸屬關係，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# packages/workspace

[English](README.md) | 中文

## 概述

workspace 家族讓主機產品持久儲存命名且有序的專案列表，並按目錄歸組每個專案的工作階段。使用者可以瀏覽這些專案與工作階段、將工作階段從分組中隱藏而不刪除該工作階段，以及移除專案而不刪除其資料夾或工作階段歷史。被隱藏或從專案中移除的工作階段仍可作為未分組的歷史記錄使用。需要持久專案介面時選用此家族；它需要工作階段儲存和持久化後端，且不會向模型公開工具、提示詞或工作階段事件。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`workspace`](workspace/README.zh.md) | 提供命名且有序的專案，並按目錄歸組在其中執行的工作階段 | `ctx.workspaceRegistry` |

-----

<a id="related-documentation"></a>
## 相關文件

- [Workspace 子系統](../../docs/subsystems/workspace.zh.md)——專案及其工作階段的權威功能約定。
- [領域 KV 儲存 Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——專案記錄背後的儲存設計。
- [Workspace UI 產品流 Agent Note](../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md)——首次啟動如何從工作階段歷史建置專案，以及 GUI 如何排序。
- [刪除 Workspace 註冊記錄決策](../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.zh.md)——為什麼移除專案絕不會刪除其資料夾或工作階段。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
