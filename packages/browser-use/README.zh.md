---
description: "瀏覽器操作能力包，用於選擇與註冊一個瀏覽器後端。"
kind: "package-group"
---

# packages/browser-use

[English](README.md) | 中文

## 概述

瀏覽器操作 提供者 讓模型檢查與操作網頁。本組擁有獨佔 提供者 註冊。實驗性 提供者 提供瀏覽器工具，並管理各 Session 的瀏覽器資源。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

選擇一個 提供者 並掛載共享註冊服務。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`browser-use`](browser-use/README.zh.md) | 獨佔具名 提供者 註冊 | `ctx.browserUse` |

<a id="related-documentation"></a>
## 相關文件

- [瀏覽器操作](../../docs/subsystems/browser-use.zh.md) — 能力所有權與 提供者 選擇。
- [實驗包](../experimental/README.zh.md) — Playwright MCP、Chrome DevTools MCP 與 Stagehand 提供者。

<a id="dev-note"></a>
## 開發備註

無。
