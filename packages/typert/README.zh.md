---
description: "Typert 組地圖：建置時型別圖生成器、執行時註冊表、Loader 整合與共享 Remote 協定，它們共同支撐型別化的 Host 到 Client 呼叫。"
kind: "package-group"
---

# packages/typert

[English](README.md) | 中文

## 概述

藉助 Typert 組，Client 環境能以型別化方法呼叫 Host 能力，並在無需手寫協定程式碼的情況下共享生成的 schema 與反射資訊。建置時生成器把原始碼型別宣告轉換為與編譯器無關的模型與執行時產物，執行時註冊表儲存這些產物，Loader 整合則在 Loader 組合中自動註冊它們。共享的協定包提供 Remote 呼叫宣告——裝飾器、wire 描述符、編解碼器與提供者約定——供業務包、生成產物、Host Gateway 與 Client API 共同消費。本頁是四個包的索引；每個包的 README 負責各自的設定、用法與限制。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`generator/`](generator/README.zh.md) | 在建置時分析原始碼型別，並生成執行時載入所需的反射、schema 與 Remote 描述符 | — |
| [`loader/`](loader/README.zh.md) | 把 Loader 組合中已生成的 Typert 產物自動註冊到執行時註冊表 | 消費 `ctx.loader` 與 `ctx.typert` |
| [`protocol/`](protocol/README.zh.md) | 宣告 Host 與 Client 共享的 Remote 裝飾器、wire 描述符、編解碼器與提供者約定 | — |
| [`registry/`](registry/README.zh.md) | 在執行時儲存生成的包反射與即時 Zod schema，並提供 lookup 與 Context 提供者註冊表 | `ctx.typert` |

-----

<a id="related-documentation"></a>
## 相關文件

- [Typert 子系統參考](../../docs/subsystems/typert.zh.md)——從協定與註冊表型別中原樣記錄的公共約定。
- [API Gateway 參考](../../docs/api-gateway.zh.md)——生成的 Remote 描述符如何成為實際的 Host 到 Client 呼叫。
- [Remote 呼叫 Agent Note](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.zh.md)——Remote 呼叫背後的架構與傳輸決策。
- [包工作區地圖](../README.zh.md)——工作區中的每個組及其職責。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
