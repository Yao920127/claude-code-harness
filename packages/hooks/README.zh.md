---
description: "hooks 組地圖：在 agent（智慧代理）執行期間使用現有的 Claude Code 與 Codex shell 掛鉤設定，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# packages/hooks

[English](README.md) | 中文

## 概述

hooks 組讓 agent 執行可以複用為 Claude Code 或 Codex 編寫的 shell 掛鉤。把對應整合指向現有的 `hooks.json`，即可在工作階段開始、提示詞到達、工具執行或執行停止時執行受支援的 command hook。這些掛鉤可以用模型可見訊息阻止提示詞或工具呼叫、向對話新增上下文，或要求執行繼續。當你需要保留現有掛鉤設定時，選擇本組；每項整合只支援其來源工具所記錄的 command hook 子集。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | 形態 |
|---|---|---|
| [`hook-protocol`](hook-protocol/README.zh.md) | 兩個橋接共享的掛鉤引擎；不得直接設定 | 庫 |
| [`hooks-claude-code`](hooks-claude-code/README.zh.md) | 在 agent 執行期間執行你現有的 Claude Code `hooks.json` 掛鉤 | 外掛 |
| [`hooks-codex`](hooks-codex/README.zh.md) | 在 agent 執行期間執行你現有的 Codex `hooks.json` 掛鉤 | 外掛 |

-----

<a id="related-documentation"></a>
## 相關文件

- [攔截擴充功能點 Agent Note](../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.zh.md)——橋接所面向的型別化 Decision 介面面。
- [掛鉤橋接 Agent Note](../../.agents/notes/archived/feature/2026-06-30-hook-bridges.md)——橋接設計及其決策對映。
- [掛鉤協定庫 Agent Note](../../.agents/notes/archived/feature/2026-06-30-hook-protocol-lib.md)——共享庫負責的內容及其原因。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
