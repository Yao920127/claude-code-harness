---
description: "todo 組地圖：基於工作階段日誌的模型側 todo_write 工具，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# packages/todo

[English](README.md) | 中文

## 概述

todo 組為 agent（智慧代理）提供可用於規劃的工作階段級任務列表：新增任務、標記進行中、逐項完成，同一份列表跨輪次、跨重新開啟的工作階段持續存在。它只包含一個產品包，提供 `todo_write` 工具；列表屬於建立它的 agent 工作階段，每次更新都會整體替換。互動式主機會從列表展示目前計劃，組本身不附帶任何 UI。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`tool-todo`](tool-todo/README.zh.md) | 讓 agent 維護工作階段任務列表：規劃任務、更新狀態、跟蹤進度 | 註冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

- [Todo 子系統](../../docs/subsystems/todo.zh.md)——`todo/write` 事件載荷、歸屬規則與 `TodoItem`。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-todo)——模型接收的 `todo_write` schema。
- [生成的設定目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-tool-todo)——每個受支援設定欄位。
- [todo_write 工具 Agent Note](../../.agents/notes/archived/feature/2026-06-29-todo-write-tool.md)——原始設計及其備選方案。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
