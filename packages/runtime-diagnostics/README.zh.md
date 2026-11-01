---
description: "runtime-diagnostics 組地圖：針對執行中組合的包自有執行時不變式檢查，供瀏覽本組的使用者與維護者參考。"
kind: "package-group"
---

# packages/runtime-diagnostics

[English](README.md) | 中文

## 概述

runtime-diagnostics 組為 DeepSeek Harness 組合提供執行時自檢：一個包 `invariants` 在組合執行期間執行包自有檢查，驗證每個包的持久化事件與資料關係。違規會以歸因到擁有該關係的包的錯誤呈現；全域開關與包名過濾器控制執行哪些檢查。當組合需要在正常執行中驗證自身執行時約定時，請使用本組的包。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`invariants`](invariants/README.zh.md) | 執行包自有執行時檢查，並按所屬包報告每次失敗 | 註冊到 `ctx.invariants` |

-----

<a id="related-documentation"></a>
## 相關文件

- [執行時不變式子系統](../../docs/subsystems/invariants.zh.md)——生成的服務參考：選擇、installer 與配套入口約定。
- [不變式執行時約定 Agent Note](../../.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.zh.md)——執行時不變式可以斷言什麼，以及強制配套入口接線的機械門禁。
- [包約定](../AGENTS.md)——每個包都必須遵循的 `./invariant` 配套入口規則。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
