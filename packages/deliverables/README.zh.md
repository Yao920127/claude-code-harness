---
description: "deliverables 組導覽：記錄輪次交給使用者的內容的 Host 外掛，即顯式檔案交付與觀察到的工作區改動，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# packages/deliverables

[English](README.md) | 中文

## 概述

deliverables 系列把一輪交給使用者的內容記錄為只有用戶端讀取的持久 Session 事件：`present` 工具宣告模型交付的最終檔案，workspace-changes 記錄器用 git 快照和整檔案捕捉記錄一輪改動的檔案及其行數，並提供每個檔案的對比。Web 的[交付外掛](../client/ui-deliverables/README.zh.md)在輪次末尾渲染兩者。需要展示交付檔案和每輪改動的產品選擇本系列；`present` 需要 `ctx.tools` 與 `ctx.fs`，記錄器需要 `ctx.subprocess` 和 git 可執行檔案。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 角色 | ctx key |
|---|---|---|
| [`tool-present`](tool-present/README.zh.md) | 透過 `present` 工具把已有檔案宣告為最終交付物 | 註冊到 `ctx.tools` |
| [`workspace-changes`](workspace-changes/README.zh.md) | 用 git 工作樹快照和整檔案捕捉彙總每個頂層輪次改動的檔案，並提供其對比 | 提供 `ctx.workspaceChanges`；監聽 `session/event`，追加 `workspace/changes` |

-----

<a id="related-documentation"></a>
## 相關文件

- [產出物子系統](../../docs/subsystems/deliverables.zh.md)——`PresentedFile` 與 `WorkspaceChangesSummary` 的詞彙、兩個持久事件和摘要服務。
- [Web 產出物](../client/ui-deliverables/README.zh.md)——渲染這些事件的輪尾卡片與檔案提及。
- [present 宣告工作區原始檔](../../.agents/notes/implemented/feature/2026-09-08-present-workspace-source-files.zh.md)——交付決策。
- [本輪改動檔案卡片](../../.agents/notes/implemented/feature/2026-09-11-turn-changed-files-card.zh.md)——快照設計與覆蓋規則。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
