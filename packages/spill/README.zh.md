---
description: "文字 spill 能力家族的包對映：儲存服務、本地後端與結果策略各自提供什麼。"
kind: "package-group"
---

# spill/：文字 spill 能力家族

[English](README.md) | 中文

## 概述

`spill/` 組在模型上下文之外儲存全文，並返回定位資訊與取回指引。該家族拆分為 `spill/` 中的儲存服務、`spill-local/` 中的本地檔案系統後端，以及 `spill-policy/` 中的工具結果策略。工具結果 spill 透過 `maxInlineTokens` 按需啟用，儲存失敗時保留原始結果。[工作階段引用](../context/session-reference/README.zh.md)也直接使用儲存來儲存已捕捉但被截斷的 transcript（文字記錄），並自行提供預覽和失敗通知；它不需要工具結果策略。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

三個包分別承擔 spill 相關角色；完整的詞彙定義和約定以子系統參考文件為準。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`spill/`](spill/README.zh.md) | 儲存服務：儲存超大文字並返回定位資訊與取回指引 | `ctx.spillStore` |
| [`spill-local/`](spill-local/README.zh.md) | 將 spill 文字儲存到本機的私有工作階段級檔案 | 註冊到 `ctx.spillStore` |
| [`spill-policy/`](spill-policy/README.zh.md) | 用預覽和定位資訊替換過大的純文字工具結果 | 監聽 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相關文件

先從子系統參考文件瞭解共享詞彙，再看設計決策。

- [spill 子系統](../../docs/subsystems/spill.zh.md)——`SaveTextSpill`/`SpillRef` 詞彙、歸屬與後端關係。
- [工具輸出 spill 決策](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md)——儲存、保留與工具自有輸出處理之間的能力邊界。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
