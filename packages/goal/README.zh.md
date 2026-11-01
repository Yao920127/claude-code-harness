---
description: "goal 組地圖：每工作階段一個持久的完成目標，以及模型工具、使用者命令與自動續行，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# packages/goal

[English](README.md) | 中文

## 概述

goal 組讓一個 agent（智慧代理）工作階段在重新啟動、恢復和 fork 後繼續追求一個持久的完成目標。agent 可以建立和更新該目標，使用者也可以用 `/goal` 直接檢查或控制它，而不消耗模型輪次。可選的續行包可以讓進行中的工作連續執行多個 Round。每個工作階段只有一個目前目標，該目標記錄完成狀態而不排程工作；因此，自動續行必須單獨啟用。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`goal`](goal/README.zh.md) | 每個工作階段一個持久目標：建立、編輯、暫停、恢復、完成、阻塞和清除 | `ctx.goals` |
| [`tool-goal`](tool-goal/README.zh.md) | 模型工具 `get_goal`、`create_goal`、`update_goal` | 註冊到 `ctx.tools` |
| [`command-goal`](command-goal/README.zh.md) | UI 命令平面中的使用者 `/goal` 命令 | 註冊到 `ctx.commands` |
| [`goal-round-driver`](goal-round-driver/README.zh.md) | 自動續行：把進行中的目標變成連續的 Round | 無服務鍵 |

-----

<a id="related-documentation"></a>
## 相關文件

- [目標子系統](../../docs/subsystems/goal.zh.md)——目標型別、持久的 `goal/change` 事件與生成的服務 API。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-goal)——模型接收的三個目標工具 schema。
- [生成的設定目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-goal)——目標服務的每個受支援設定欄位。
- [目標領域 Agent Note](../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.zh.md)——領域設計及其決策。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
