---
description: "檔案系統包組：`ctx.fs` 提供者約定、本地與沙箱強制後端、編輯前讀取策略外掛，以及面向模型的檔案與搜尋工具。"
kind: "package-group"
---

# packages/fs

[English](README.md) | 中文

## 概述

`fs/` 組為 agent（智慧代理）提供持久、受策略約束的檔案存取：`fs/` 定義 `ctx.fs` 服務約定，`fs-local/` 與 `fs-sandbox/` 提供主機檔案系統與沙箱強制後端，`fs-observation-policy/` 提供編輯前讀取策略，`tool-fs/`（`read`、`read_image`、`write`、`edit`）與 `tool-fs-search/`（`glob`、`grep`）提供面向模型的工具。部署掛載一個後端，載入策略以獲得新鮮度防護的變更，並註冊模型應看到的工具包；後端可以更換，無需改動工具或策略。檔案 I/O 有意不設超時：deadline 只會殺掉作業系統仍會完成的工作，因此取消只是系統呼叫邊界的盡力而為訊號。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

七個包承擔檔案系統角色；子系統參考文件完整收錄各項約定與錯誤分類體系。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`fs/`](fs/README.zh.md) | `ctx.fs` 服務約定：執行世界路徑、有界文字 I/O，以及帶可選版本防護的原子變更 | `ctx.fs` |
| [`fs-local/`](fs-local/README.zh.md) | 主機檔案系統後端：讀取、寫入並編輯本機上的真實檔案 | 註冊到 `ctx.fs` |
| [`fs-sandbox/`](fs-sandbox/README.zh.md) | 沙箱強制後端：按每次呼叫的沙箱模式約束寫入與編輯，讀取直接透過 | 註冊到 `ctx.fs` |
| [`fs-observation-policy/`](fs-observation-policy/README.zh.md) | 編輯前讀取策略：記錄觀測到的存在或缺失，並透過 `fs/*` 事件防護寫入/編輯 | `fs/*` 監聽器 |
| [`tool-fs/`](tool-fs/README.zh.md) | 面向模型的 `read`、`read_image`、`write` 與 `edit` 工具及其執行器 | 註冊到 `ctx.tools` |
| [`tool-fs-search/`](tool-fs-search/README.zh.md) | 由打包 ripgrep 二進位制支援的面向模型 `glob` 與 `grep` 發現工具 | 註冊到 `ctx.tools` |
| [`tool-str-replace-editor/`](tool-str-replace-editor/README.zh.md) | 獨立的 `str_replace_editor` 工具：基於 `ctx.fs` 的 `view`、`create`、`str_replace` 與 `insert` | 註冊到 `ctx.tools` |

策略是外掛，不是工具注入的服務：移除它會留下裸提供者的無條件變更行為，而不會破壞工具。`fs-sandbox` 的模式圍欄與編輯前讀取門禁可以組合。`tool-fs-search` 有意不擴充功能提供者約定——搜尋是由程序支援的 ripgrep 工作流，因此檔案系統後端無需承擔通用搜尋 API。

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考文件瞭解共享詞彙與錯誤分類體系，再看塑造該家族的設計決策。

- [檔案系統子系統](../../docs/subsystems/filesystem.zh.md)——目標、結果、防護、策略事件與錯誤分類體系。
- [跨能力族 fs 沙箱決策](../../.agents/notes/implemented/feature/2026-07-14-cross-family-fs-sandbox.zh.md)——檔案系統 seam 上共享的沙箱模式圍欄。
- [可移植執行世界消費方決策](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.zh.md)——檔案系統與子程序提供者為何共享一個執行世界。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
