---
description: "workflow 組地圖：由模型編寫的、可扇出 subagent 的編排腳本，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# packages/workflow

[English](README.md) | 中文

## 概述

workflow 組讓 agent（智慧代理）可以執行編排腳本，將工作委派給 subagent 並返回最終值。`workflow` 工具支援腳本化扇出；需顯式啟用的 `ralph` 工具執行固定的全新 agent 序列。腳本使用共享 PTC Node 程序執行時，遵守呼叫 Session 的檔案策略。工作流掛鉤和子 agent 生命週期仍由工作流引擎負責。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`workflow`](workflow/README.zh.md) | 執行由模型編寫的、扇出 subagent 的編排腳本 | `ctx.workflowEngine` |
| [`workflow-ptc`](workflow-ptc/README.zh.md) | 透過共享的沙箱化 PTC Node 程序執行時執行工作流腳本 | 註冊到 `ctx.workflowEngine` |
| [`tool-workflow`](tool-workflow/README.zh.md) | 把 `workflow` 工具交給模型，用於腳本化多 agent 編排 | 註冊到 `ctx.tools` |
| [`tool-ralph`](tool-ralph/README.zh.md) | 把 `ralph` 工具交給模型，用於全新 agent 迭代迴圈 | 註冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

- [工作流子系統](../../docs/subsystems/workflow.zh.md)——seam 的型別、啟動請求與 `workflow/*` 事件。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-workflow)——模型接收的 `workflow` 工具 schema。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ralph)——模型接收的 `ralph` 工具 schema。
- [生成的設定目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-workflow-ptc)——每個受支援的引擎設定欄位。
- [動態工作流 Agent Note](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.zh.md)——seam 設計及其決策。
- [Harness 層目標式執行 Agent Note](../../.agents/notes/implemented/feature/2026-07-16-harness-level-loop.zh.md)——固定全新 agent 迴圈的設計與暫緩事項。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
