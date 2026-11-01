---
description: "持久終端能力家族的包對映：限定所有者範圍的 ctx.terminals 服務、啟動互動式 bash 或 pwsh 的 shell 後端，以及 6 個面向模型的工具。"
kind: "package-group"
---

# terminal/：持久 PTY 能力家族

[English](README.md) | 中文

## 概述

`terminal/` 家族讓 agent（智慧代理）的互動式 shell 和 REPL 工作階段跨工具呼叫持續存在，包括工作目錄、環境變數和執行中的子程序。使用 `terminal/` 管理所有者隔離的工作階段，使用 `terminal-bash/` 啟動受沙箱約束的互動式 bash 或 pwsh 工作階段，使用 `tool-terminal/` 獲得 6 個結果有界的面向模型終端操作。任務需要互動式輸入或需要保留單次 bash 命令無法儲存的狀態時，選擇這個家族。工作階段僅存在於一個 harness 程序中，重新啟動後不會恢復。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

該家族包含一個工作階段服務、一個 shell 後端與一組面向模型的工具。完整約定由各子級 README 負責；共享詞彙與生成的服務介面面由子系統參考負責。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`terminal/`](terminal/README.zh.md) | 工作階段服務：限定所有者範圍的工作階段、不透明 id、精確到所有者的限制與等待完成的清理 | `ctx.terminals` |
| [`terminal-bash/`](terminal-bash/README.zh.md) | shell 後端：在共享沙箱策略下啟動互動式 bash 或 pwsh，帶就緒檢測與有界輸出 | 註冊後端到 `ctx.terminals` |
| [`tool-terminal/`](tool-terminal/README.zh.md) | 6 個面向模型的工具，帶所有者隔離與可選後臺傳送 | 註冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考瞭解共享型別與服務介面面，再從 Agent Note 瞭解設計理由與暫緩邊界。

- [終端子系統參考](../../docs/subsystems/terminal.zh.md)——id、後端與工作階段約定、傳送就緒、有界讀取，以及生成的 `ctx.terminals` API。
- [持久 PTY Agent Note](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.zh.md)——設計決策、備選方案與延期工作。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
