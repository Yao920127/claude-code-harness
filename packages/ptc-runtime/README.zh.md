---
description: "PTC 執行能力族的包對映：程式執行能為你做什麼，以及每個部分由哪個包負責。"
kind: "package-group"
---

# ptc-runtime/——PTC 執行能力族

[English](README.md) | 中文

## 概述

`ptc-runtime/` 組讓模型編寫一個程式，以普通非同步呼叫的方式呼叫主機提供的函式，然後只返回程式的列印輸出和回傳值。如需在全新 Node 程序中按所配沙箱策略執行，請選擇 TypeScript 後端；如需 CPython 程序，請選擇實驗性 Python 後端。每次執行都不會保留之前程式的狀態。失敗會作為結果返回，供呼叫方診斷或提供給模型。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

這三個包共同提供程式執行能力；每個 README 描述其各自部分做什麼。

| 包 | 角色 | ctx 鍵 |
|---|---|---|
| [`ptc-runtime/`](ptc-runtime/README.zh.md) | 定義 PTC 執行時做什麼：針對主機提供的繫結執行一個程式，並報告其列印和返回的內容 | `ctx.ptcRuntime` |
| [`ptc-runtime-node/`](ptc-runtime-node/README.zh.md) | 在全新受管 Node 程序中按已解析沙箱策略執行 TypeScript | 註冊 `ctx.ptcRuntime` |
| [`experimental/ptc-runtime-python/`](../experimental/ptc-runtime-python/README.zh.md) | 實驗性 Python 後端：負責 Node 主機與 CPython 子程序之間的 fd-3 協定，以及 CPython 執行時實作 | — |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考瞭解服務約定，再看消費此能力的 PTC mode 設計，以及它所遵循的能力 seam 模型。

- [PTC 執行時子系統參考](../../docs/subsystems/ptc-runtime.zh.md)——請求／結果詞彙、繫結與 `ctx.ptcRuntime` 的 Cordis 介面面。
- [PTC mode Agent Note](../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md)——工具註冊表如何把 `run_code` 呈現給模型。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
