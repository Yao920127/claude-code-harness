---
description: "plan 組的包對映：引導 agent（智慧代理）先探索和設計再執行的計劃模式功能，供使用者和維護者瀏覽該組。"
kind: "package-group"
---

# plan/：plan 協作狀態

[English](README.md) | 中文

## 概述

`plan/` 組提供計劃模式：啟用期間，agent 先探索和設計再執行，遵循部署寫入的指令，並在執行前提交完成的計劃供你批准。你可以用 `/plan` 命令進入和離開計劃模式，批准計劃，或讓 agent 回去繼續規劃。計劃模式是引導而非限制：每個工具仍然可用，沙箱模式與審批提示等限制需另行設定。該組只包含一個包 `plan-mode`。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

一個包提供完整的計劃模式功能；完整約定以子系統參考為準。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`plan-mode/`](plan-mode/README.zh.md) | 提供計劃模式：`/plan` 進入和離開，部署寫入的指令在規劃期間引導 agent，`exit_plan_mode` 把完成的計劃呈交你評審 | `ctx.planMode` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考瞭解共享詞彙，再閱讀設計說明了解決策。

- [計劃模式子系統參考](../../docs/subsystems/plan.zh.md)——計劃模式如何工作、其設定與退出工具的行為。
- [plan 專用協作狀態](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.zh.md)——計劃模式背後的設計決策。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
