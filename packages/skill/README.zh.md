---
description: "skill（技能）組地圖：由提供者發現並經工作階段目錄與 skill 工具載入的可複用 agent（智慧代理）指令，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# skill/ — skill 能力家族

[English](README.md) | 中文

## 概述

skill 家族讓 agent 和使用者僅在需要時發現並載入可複用的任務指令。使用 `skill/` 合併目錄併為每個名稱提供一組指令；需要從專案、自定義或使用者目錄發現 skill 時選擇 `skill-filesystem`，需要可選的官方徽章時選擇 `skill-badge`，需要 Word、PowerPoint 和 Excel 工作流時選擇 `skill-office`。需要讓模型獲得排序且持久的工作階段目錄、透過 `skill` 工具載入完整指令，或接受 `/name` 直接呼叫時，請新增 `tool-skill`。不同來源生成相同的模型可見格式，啟用模型存取前必須設定至少一個來源。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`skill/`](skill/README.zh.md) | 合併任意提供者的 skill 目錄、並按名稱解析出勝出 skill 的註冊表 | `ctx.skills` |
| [`skill-filesystem/`](skill-filesystem/README.zh.md) | 從專案、自定義與使用者目錄發現 skill，並監視其變更 | 註冊到 `ctx.skills` |
| [`skill-badge/`](skill-badge/README.zh.md) | 隨包附帶官方「powered by dsh」徽章 skill，預設停用 | 註冊到 `ctx.skills` |
| [`skill-office/`](skill-office/README.zh.md) | 隨包提供 Word、PowerPoint 和 Excel 工作流及檔案結構檢查 | 註冊到 `ctx.skills` |
| [`tool-skill/`](tool-skill/README.zh.md) | 釋出工作階段 skill 目錄與面向模型的 `skill` 載入工具 | 註冊到 `ctx.tools` |
| [`tool-workspace-dependencies/`](tool-workspace-dependencies/README.zh.md) | 為 Desktop 與 SDK 載體報告內建 Office 直譯器路徑和版本 | 註冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考瞭解共享詞彙，再閱讀 Agent Note 瞭解設計依據。

- [skill 子系統參考](../../docs/subsystems/skills.zh.md)——註冊表、提供者約定、本地發現優先順序，以及目錄與工具。
- [skill 呼叫策略 Agent Note](../../.agents/notes/implemented/feature/2026-07-28-skill-invocation-policy.zh.md)——模型與使用者呼叫控制。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
