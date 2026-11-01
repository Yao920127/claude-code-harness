---
description: "執行時 API 檢查、程序內 runner 與歷史 Cordis 卡片。"
kind: "package-group"
---

# packages/extensions

[English](README.md) | 中文

## 概述

extensions 組為 agent 提供只讀執行時 API 發現、供程式和瀏覽器消費者使用的程序內 runner，以及歷史生成外掛卡片。Creator 模式透過 [Plugin Manager](../boot/plugin-manager/README.zh.md) 安裝持久化外掛。按需選擇檢查、Host 執行、Client 執行或瀏覽器控制元件子包。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`tool-cordis`](tool-cordis/README.zh.md) | 兩個只讀執行時 API 發現工具 | 註冊到 `ctx.tools` |
| [`cordis-host-runner`](cordis-host-runner/README.zh.md) | host 半：定義註冊表、沙箱化的 host 半生命週期，以及用於應答瀏覽器查詢的 inspect 註冊表 | 提供 `ctx.dynamicCordisRunner` 與 `ctx.cordisInspect` |
| [`cordis-client-runner`](cordis-client-runner/README.zh.md) | 瀏覽器半：將瀏覽器半原始碼求值為執行中的外掛，並應答執行請求 | client 面；提供瀏覽器側 `ctx.dynamicCordisRunner` |
| [`ui-cordis`](ui-cordis/README.zh.md) | 瀏覽器面板與歷史生命週期工具卡片 | client 側；註冊 slot |

-----

<a id="related-documentation"></a>
## 相關文件

- [extensions 子系統](../../docs/subsystems/extensions.zh.md)——生成的 `ctx.cordisInspect` 與 `ctx.dynamicCordisRunner` 服務 API。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-cordis)——兩個只讀工具 schema。
- [生成的設定目錄](../../docs/config-catalog.zh.md#deepseek-aidsh-cordis-host-runner)——runner 的受支援設定欄位。
- [自引用 Cordis 工具集 Agent Note](../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.zh.md)——沙箱語義、生命週期與組合的設計居所。
- [用戶端外殼與動態包 Agent Note](../../.agents/notes/implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.zh.md)——瀏覽器半的包歸屬與建置面。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

兩個瀏覽器半包位於本組，而不是 `packages/client/` 下，因為它們分別是本子系統雙半包的瀏覽器半；client 面經由 client program 編譯它們，host program 只引用 host runner。

</details>
