---
description: "jobs 組地圖：後臺任務控制——註冊表約定、程序本地儲存與面向模型的任務工具，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# jobs/：後臺任務能力家族

[English](README.md) | 中文

## 概述

jobs 組是後臺工作能力家族：執行長時間工作的工具把工作註冊為任務，擁有它的 agent（智慧代理）可以在不阻塞自身輪次的情況下讀取、等待、列出或取消任務。任務屬於啟動它的 agent 工作階段，因此一個 agent 永遠不會看到另一個 agent 的工作；任務完成時以工作階段內通知送達給擁有它的 agent，無需輪詢。本組拆分為註冊表約定（`jobs`）、其程序本地儲存（`jobs-local`）以及帶完成通知的模型側控制工具（`tool-jobs`）。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`jobs`](jobs/README.zh.md) | 定義後臺任務約定：id、歸屬、生命週期與完成監聽器 | `ctx.jobs` |
| [`jobs-local`](jobs-local/README.zh.md) | 在本程序中執行並儲存任務，按所有者隔離 | 註冊到 `ctx.jobs` |
| [`tool-jobs`](tool-jobs/README.zh.md) | 讓模型讀取、列出和終止任務，並投遞完成通知 | 註冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

- [後臺任務執行時子系統](../../docs/subsystems/jobs.zh.md)——任務型別、快照欄位與 `ctx.jobs` API。
- [通用長時間執行工具執行時 Agent Note](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.zh.md)——後臺任務執行時背後的設計。
- [任務註冊表 seam Agent Note](../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md)——按所有者隔離的註冊表約定及其理由。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
