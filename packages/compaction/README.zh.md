---
description: "工作階段壓縮（compaction）功能家族的包對映：自動壓縮、按需 /compact 命令與工具輸出修剪。"
kind: "package-group"
---

# compaction/ — 壓縮能力家族

[English](README.md) | 中文

## 概述

`compaction/` 組讓長時 agent（智慧代理）工作階段在接近模型上下文上限時仍能正常工作：token 壓力上升時自動把較早歷史壓縮為摘要，可用 `/compact` 按需壓縮，超大工具輸出也可以先被修剪，從而減少需要壓縮的內容，支援圖片的路由發不出的圖片則被替換為佔位文字。隨附 `dsh` 基礎設定預設啟用該功能。顯式掛載各包即可調整壓縮發生的時機與方式。決定何時壓縮的 token 測量屬於獨立的 LLM（大語言模型）家族服務。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

以下每個包提供該功能的一個環節；開啟對應包頁面瞭解如何使用。

| 包 | 職責 | ctx key |
|---|---|---|
| [`compaction/`](compaction/README.zh.md) | 共享的壓縮約定：所有後端與觸發器使用的操作與摘要格式 | `ctx.compaction` |
| [`compaction-basic/`](compaction-basic/README.zh.md) | 隨 token 壓力上升自動把較早歷史壓縮為摘要 | 註冊 `ctx.compaction` |
| [`compaction-tool-result-pruner/`](compaction-tool-result-pruner/README.zh.md) | 修剪超大工具輸出，減少需要壓縮的歷史 | `ctx.toolResultPruner` |
| [`compaction-image-offload/`](compaction-image-offload/README.zh.md) | 支援圖片的路由拒絕請求時，把超出預算的請求圖片替換為佔位文字 | 監聽 `agent/request-error` |
| [`command-compact/`](command-compact/README.zh.md) | 按需壓縮歷史的 `/compact` 命令 | 註冊到 `ctx.commands` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考瞭解共享詞彙，再閱讀兩份 Agent Note 瞭解設計依據。

- [壓縮子系統參考](../../docs/subsystems/compaction.zh.md)——壓縮詞彙、結果與服務行為。
- [壓縮能力 seam Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.zh.md)——家族如何拆分，以及為何依賴工作階段與 LLM 詞彙。
- [排隊手動壓縮 Agent Note](../../.agents/notes/implemented/feature/2026-07-30-queued-manual-compaction.zh.md)——按需 `/compact` 如何與執行中的輪次序列化。
- [能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
