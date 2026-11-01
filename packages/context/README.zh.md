---
description: "context 組概覽：不定義工具、為每次請求新增持久且模型可見上下文的外掛，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# context/ — 請求上下文外掛

[English](README.md) | 中文

## 概述

context 組提供不定義任何工具、為每次請求新增模型可見上下文的外掛：工作區指令檔案成為指引，`@file` 提及提供路徑補全，其他工作階段可以作為有界快照被引用，模型還能看到目前時間與 agent（智慧代理）的 tmux 位置。預設只包含 `agent-instructions`（`dsh-base`）與 `time-context`（`dsh-web-app`）；其餘全部需主動啟用。上下文是持久的：注入的指令與引用以使用者角色訊息的形式進入工作階段歷史，因此與其他對話內容一樣持久保留、可回放、可壓縮。本頁概述本組；包級約定由各包 README 負責。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`agent-instructions/`](agent-instructions/README.zh.md) | 將 `AGENTS.md`、`CLAUDE.md` 工作區指令載入到上下文，並在檔案編輯後重新整理 | — |
| [`session-reference/`](session-reference/README.zh.md) | 引用其他工作階段：提及一個工作階段，其有界只讀快照即成為上下文 | `ctx.sessionReferenceResolver` |
| [`file-reference/`](file-reference/README.zh.md) | 發現 `@file` 提及，並提供由主機支援的 UI 共用的提及語法 | `ctx.fileReferences` |
| [`file-reference-local/`](file-reference-local/README.zh.md) | `@file` 提及的本地工作區補全提供者 | — |
| [`time-context/`](time-context/README.zh.md) | 每個步驟的目前時間、瀏覽器時區與經過時長 | — |
| [`tmux-context/`](tmux-context/README.zh.md) | agent 所在的 tmux 工作階段、視窗與窗格位置 | — |

-----

<a id="related-documentation"></a>
## 相關文件

- [工作階段引用子系統](../../docs/subsystems/session-reference.zh.md)——規範的提及 URI、快照語義與穩定的錯誤分類體系。
- [工作區上下文決策記錄](../../.agents/notes/archived/feature/2026-06-24-workspace-context.md)——指令上下文為何按 agent 和工作階段兩個維度隔離並持久記錄。
- [生成的設定目錄](../../docs/config-catalog.zh.md)——本組各包接受的全部設定欄位。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
