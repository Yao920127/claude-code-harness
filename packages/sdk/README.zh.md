---
description: "SDK 家族的包對映：JSON-RPC 協定，以及供程序外 SDK 使用的 TypeScript 用戶端與伺服器。"
kind: "package-group"
---

# sdk/：從另一程序驅動 Harness 執行時

[English](README.md) | 中文

## 概述

SDK 家族讓另一程序透過按換行分幀的 JSON-RPC 驅動完整的 DeepSeek Harness 執行時。協定包定義公開訊息，TypeScript 用戶端用具名 profile 和有序 patch 啟動 `dsh`，伺服器則透過 stdio 接受 SDK 請求。用戶端可以開啟工作階段、傳送提示詞，並觀察工作階段事件、agent（智慧代理）狀態變化與 subagent 完成事件。TypeScript 用戶端與 [Python SDK](../../python/README.zh.md) 使用同一種協定，而這些包不會建立開發者專案，也不定義其他應用。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

每個包的 README 都介紹了其所對應棧元件的用途。

| 包 | 職責 |
|---|---|
| [`protocol/`](protocol/README.zh.md) | 協定格式（wire format）：按換行分幀的 JSON-RPC 傳輸，以及具名的請求、結果與通知型別 |
| [`client/`](client/README.zh.md) | TypeScript 用戶端：啟動執行時子程序，透過高層與協定層 API 驅動 agent 輪次 |
| [`server/`](server/README.zh.md) | `jsonrpc` 外掛：透過 stdio 為程序外 SDK 用戶端提供服務 |

-----

<a id="related-documentation"></a>
## 相關文件

先從 Python SDK（用戶端約定的姊妹實作）開始，再看可執行應用與組邊界背後的決策記錄。

- [Python SDK](../../python/README.zh.md)——採用同一種協定並附帶打包執行時的 Python 對應實作。
- [SDK 應用組合包](../bundle/sdk-app/README.zh.md)——啟動 JSON-RPC 伺服器的 `dsh --profile sdk` 應用。
- [架構](../../docs/architecture.zh.md) — 打包後的 Python 用戶端為何啟動相同的具名 profile。
- [SDK 專案工具鏈移除](../../.agents/notes/archived/simplification/2026-08-11-remove-sdk-project-toolchain.md) — 本組為何從不建立、設定或建置開發者專案。
- [SDK subagent 提供者](../subagent/subagent-dsh-sdk/README.zh.md) — harness 內部使用 TypeScript 用戶端的提供者。

<a id="dev-note"></a>
## 開發備註

無。
