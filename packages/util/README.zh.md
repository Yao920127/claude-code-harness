---
description: "共享工具家族的包對映：原子檔案寫入、品牌化 id、雙端佇列、JSON 值、harness 主目錄路徑、啟動環境、原生命令、輸出保留、時區與超時。"
kind: "package-group"
---

# util/：共享工具

[English](README.md) | 中文

## 概述

`util/` 組為能力包提供共享的機制原語，避免重複實作。它涵蓋原子寫入、品牌化 id、雙端佇列、無損 JSON 值、UUID、Harness home 路徑、啟動環境、出站代理策略、原生命令、輸出保留、時區規範化和超時處理。這裡的每個根入口都是庫：它不註冊產品服務或事件，業務語義仍由消費它的能力負責。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

每個包提供一個原語；開啟對應包頁面瞭解如何使用。

| 包 | 職責 |
|---|---|
| [`brand/`](brand/README.zh.md) | 提供名義字串型別及其無狀態建構函式 |
| [`package-manifest/`](package-manifest/README.zh.md) | 包 manifest（中繼資料清單）的共享 TypeScript 宣告 |
| [`crypto/`](crypto/README.zh.md) | 基於跨執行時 `crypto.getRandomValues` 原語生成 RFC 9562 v4 UUID |
| [`deque/`](deque/README.zh.md) | 提供攤銷常數時間的佇列操作和有界空閒儲存 |
| [`chunked-list/`](chunked-list/README.zh.md) | 透過有界追加複製和檢查點驗證保留不可變列表版本 |
| [`values/`](values/README.zh.md) | 驗證、建立快照、比較和凍結無損 JSON 相容值 |
| [`home-paths/`](home-paths/README.zh.md) | 解析統一的 Harness 主目錄並拼接共享的使用者資料路徑 |
| [`http-proxy/`](http-proxy/README.zh.md) | 解析出唯一的出站代理策略，併為 `fetch`、SDK agent（智慧代理）與 spawn 的子程序安裝它 |
| [`launch-environment/`](launch-environment/README.zh.md) | 凍結的啟動環境，記住每個值來自哪一層 |
| [`atomic-write/`](atomic-write/README.zh.md) | 原子檔案替換與跨程序寫鎖 |
| [`lazy-require/`](lazy-require/README.zh.md) | 在首次使用時按呼叫方位置載入相容 CommonJS 的 Host 依賴 |
| [`native-command/`](native-command/README.zh.md) | 直接執行主機原生命令，絕不拼 shell 字串 |
| [`workspace-path/`](workspace-path/README.zh.md) | 提供瀏覽器安全的 Workspace 路徑與顯示輔助函式 |
| [`code-language/`](code-language/README.zh.md) | 把檔名字尾對映為 Code 預覽、diff 審閱與 read 卡片所渲染的語法高亮語言 |
| [`output-retention/`](output-retention/README.zh.md) | 限制面向模型的輸出並報告精確的省略中繼資料 |
| [`time/`](time/README.zh.md) | 驗證並規範化呼叫方所報的 IANA 時區 |
| [`timeout/`](timeout/README.zh.md) | 截止時間運算、訊號融合與超時和取消分類 |

-----

<a id="related-documentation"></a>
## 相關文件

- [根包對映](../README.zh.md)——`util/` 在所有包組中的位置。
- [生成設定目錄](../../docs/config-catalog.zh.md)——本組所屬的庫包索引。
- [新增包實操手冊](../../docs/cookbook/adding-a-package.zh.md)——新的共享原語如何落入本組。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
