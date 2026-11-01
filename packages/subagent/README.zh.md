---
description: "subagent 包組：委派 seam、其程序內與程序外後端，以及面向模型的委派工具。"
kind: "package-group"
---

# subagent/：subagent 能力家族

[English](README.md) | 中文

## 概述

subagent 包家族讓 agent（智慧代理）將任務委派給子 agent、繼續其工作，並發現自己建立的每個子級。隔離工作可選擇全新的程序內子級；需要既有對話時可選擇帶父級歷史的程序內子級；也可選擇由 ACP（Agent Client Protocol）、Codex、Claude Code 或另一 Harness 執行時支援的程序外子級。面向模型的工具還讓 agent 能夠向相鄰 agent 傳送訊息、中斷工作並列出子級狀態。無論子級正在執行還是已儲存，父級都能看到它；各包 README 說明各提供者特定的設定與限制。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`subagent/`](subagent/README.zh.md) | 定義委派服務：提供者註冊表、一次性執行、可繼續子級與發現 | `ctx.subagents` |
| [`subagent-in-process-driver/`](subagent-in-process-driver/README.zh.md) | 提供共享的程序內執行驅動器 | 無 |
| [`subagent-spawn-in-process/`](subagent-spawn-in-process/README.zh.md) | 執行全新的程序內子 agent | 註冊到 `ctx.subagents` |
| [`subagent-fork-in-process/`](subagent-fork-in-process/README.zh.md) | 執行從父級已完成歷史派生的程序內子 agent | 註冊到 `ctx.subagents` |
| [`subagent-acp/`](subagent-acp/README.zh.md) | 經 Agent Client Protocol 執行程序外子 agent | 註冊到 `ctx.subagents` |
| [`subagent-codex/`](subagent-codex/README.zh.md) | 經官方 app-server 協定執行真實 Codex 子 agent | 註冊到 `ctx.subagents` |
| [`subagent-claude-code/`](subagent-claude-code/README.zh.md) | 經官方 Agent SDK 執行真實 Claude Code 子 agent | 註冊到 `ctx.subagents` |
| [`subagent-dsh-sdk/`](subagent-dsh-sdk/README.zh.md) | 經 TypeScript SDK 執行程序外 Harness 子 agent | 註冊到 `ctx.subagents` |
| [`tool-subagent/`](tool-subagent/README.zh.md) | 向模型公開委派 | 註冊到 `ctx.tools` |
| [`tool-subagent-control/`](tool-subagent-control/README.zh.md) | 向模型提供向相鄰 agent 傳送訊息、中斷工作和列出子級狀態的操作 | 註冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

- [Subagent 子系統](../../docs/subsystems/subagent.zh.md)——服務約定、提供者約定與終態結果語義。
- [Subagent 能力 seam](../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.zh.md)——委派能力家族的設計記錄。
- [可繼續的 subagent](../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.zh.md)——接受後續輪次的持久子級。
- [tool-subagent-control README](tool-subagent-control/README.zh.md)——後續訊息、中斷與列舉介面。

<a id="dev-note"></a>
## 開發備註

無。
