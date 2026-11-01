---
description: "用於選擇並註冊一個桌面提供者的計算機操作能力包。"
kind: "package-group"
---

# packages/computer-use

[English](README.md) | 中文

## 概述

計算機操作提供者讓模型觀察並操作桌面。本組負責提供者的獨佔註冊。各提供者擁有自己的操作、工具和平臺要求；實驗性 Cua Driver 提供者位於 experimental 組。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

選擇一個提供者並掛載共享註冊服務。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`computer-use`](computer-use/README.zh.md) | 按名稱獨佔註冊提供者 | `ctx.computerUse` |

<a id="related-documentation"></a>
## 相關文件

- [計算機操作](../../docs/subsystems/computer-use.zh.md) — 能力歸屬和提供者選擇。
- [實驗性包](../experimental/README.zh.md) — Cua Driver MCP 和原生提供者。

<a id="dev-note"></a>
## 開發備註

無。
