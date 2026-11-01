---
description: "工作階段檢索能力家族的包對映：搜尋、追蹤與讀取即時和持久工作階段歷史，以及 Web 端工作階段日誌匯出。"
kind: "package-group"
---

# session-query/：工作階段檢索能力家族

[English](README.md) | 中文

## 概述

`session-query/` 組提供對即時與持久工作階段歷史的檢索，且獨立於壓縮（compaction）：程式化呼叫方透過一個統一服務查詢精確日誌、過濾後的列表、關係追蹤與全文搜尋；SQLite 後端支撐搜尋；模型獲得五個經工作區授權的工具；Web 介面獲得下載工作階段 ZIP 的 `/export` 命令。搜尋結果與模型看到的對話歷史一致。本頁概述該組；各包的 README 分別說明各自的包級約定。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

每個包的 README 都會說明該包在此組中的用途。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`session-query/`](session-query/README.zh.md) | 統一的工作階段歷史查詢服務：精確讀取、關係追蹤與過濾 | `ctx.sessionQuery` |
| [`session-query-sqlite/`](session-query-sqlite/README.zh.md) | 基於 SQLite FTS5 索引的工作階段歷史全文搜尋 | 註冊到 `ctx.sessionQuery` |
| [`session-log-export/`](session-log-export/README.zh.md) | Web `/export` 命令與瀏覽器下載工作階段 ZIP | `ctx.sessionLogDownload`（瀏覽器） |
| [`tool-session-query/`](tool-session-query/README.zh.md) | 面向模型的搜尋、追蹤與讀取工作階段歷史工具 | 註冊到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考瞭解共享的查詢詞彙，再看追蹤與搜尋背後的設計記錄。

- [工作階段查詢子系統參考](../../docs/subsystems/session-query.zh.md)——邏輯記錄、過濾器、搜尋頁、血緣、有界讀取與事件關係。
- [工作階段查詢關係追蹤](../../.agents/notes/archived/feature/2026-07-13-session-query-tracing.md)——追蹤語義與驗證邊界。
- [SQLite FTS5 工作階段搜尋](../../.agents/notes/archived/feature/2026-07-10-sqlite-session-query-provider.md)——搜尋語義、對帳與 tokenizer 決策。

<a id="dev-note"></a>
## 開發備註

無。
