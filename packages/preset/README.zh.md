---
description: "本組透過普通 Cordis 宣告定義 Agent 能力，並管理工作階段選擇和執行時代際。Host 共享 Agent loop；各 Agent 使用自己選定代際的工具、提示詞和技能。"
kind: "package-group"
---

# packages/preset

[English](README.md) | 中文

## 概述

本組透過普通 Cordis 宣告定義 Agent 能力，並管理工作階段選擇和執行時代際。Host 共享 Agent loop；各 Agent 使用自己選定代際的工具、提示詞和技能。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發筆記](#dev-note)

<a id="packages"></a>
## 包

| Package | Role | ctx key |
|---|---|---|
| [agent-preset-registry](agent-preset-registry/README.zh.md) | 選擇、代際保留和 profile 編輯 | `ctx.agentPresets` |
| [agent-preset](agent-preset/README.zh.md) | 宣告式子外掛和中繼資料 | — |
| [persona](persona/README.zh.md) | 可組裝的 Agent 人設 | — |

<a id="related-documentation"></a>
## 相關文件

- [Scope](../../docs/subsystems/scope.zh.md)
- [Cordis](../../docs/cordis-primer.zh.md)
- [Agent preset](../../.agents/notes/implemented/architecture/2026-09-18-declarative-agent-presets.zh.md)

<a id="dev-note"></a>
## 開發筆記

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
