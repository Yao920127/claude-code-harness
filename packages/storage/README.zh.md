---
description: "儲存組地圖：透過具名後端與型別化領域資料形式持久化非工作階段資料，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# packages/storage

[English](README.md) | 中文

## 概述

儲存組跨重新啟動保留非工作階段應用資料，包括工作區記錄和工作階段伴隨資料。需要人類可讀檔案時選擇 `storage-json`，需要在單個資料庫中定點更新時選擇 `storage-sqlite`；`storage-domain` 增加經過 schema 驗證的型別化記錄和變更通知，而 `storage` 選擇已設定的後端。這些包是可選項且只面向主機側：它們不會向模型暴露工具、提示詞內容或工作階段事件。當應用狀態必須在程序結束後繼續存在時使用本組；組合沒有此類資料時可以省略本組。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`storage`](storage/README.zh.md) | 把已註冊後端與已掛載的資料形式設施連線起來 | `ctx.storage` |
| [`storage-json`](storage-json/README.zh.md) | 把每個單元存為一個人類可讀的 JSON 檔案 | 註冊後端 `json` |
| [`storage-sqlite`](storage-sqlite/README.zh.md) | 把單元作為 JSON 文件存進一個 SQLite 資料庫 | 註冊後端 `sqlite` |
| [`storage-domain`](storage-domain/README.zh.md) | 在已路由後端之上提供經過 schema 驗證、發出變更事件的 KV 領域 | `ctx.storageDomain` |

-----

<a id="related-documentation"></a>
## 相關文件

- [儲存子系統](../../docs/subsystems/storage.zh.md)——權威約定：後端約定、領域宣告、變更事件與生成的 API。
- [領域 KV 儲存 Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md)——本家族的設計、workspace 消費方與被推遲的工作階段後端遷移。
- [Workspace 子系統](../../docs/subsystems/workspace.zh.md)——領域資料形式的第一個消費方。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

設計 Agent Note 仍標記為 proposed，而本家族已經發布；其範圍外事項表就是遷移階段（`log` 分面、工作階段後端複用、跨程序變更推送）的延期工作清單。決策落實後，請把結論提升為 implemented 筆記。

</details>
