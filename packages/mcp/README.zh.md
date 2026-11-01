---
description: "MCP 包組：連線外部 Model Context Protocol 伺服器，呼叫其工具並讀取其資源。"
kind: "package-group"
---

# MCP — 模型上下文協定

[English](README.md) | 中文

## 概述

`mcp/` 組讓模型呼叫外部 Model Context Protocol（MCP）工具並讀取伺服器資源。只需設定 `mcp-client` 條目；隨附 profile 已統一掛載 `mcp-resources` 一次。只有作用域中存在已設定伺服器的呼叫方才會看到 MCP 工具與提示詞文字。連線還會提供伺服器指令。設定與限制由各包的 README 說明。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

用戶端擁有每個已設定連線；共享資源包為這些連線提供資源工具。

| 包 | 提供的能力 |
|---|---|
| [`mcp-client/`](mcp-client/README.zh.md) | 連線一臺 MCP 伺服器，暴露其工具與指令，並提供其資源操作 |
| [`mcp-resources/`](mcp-resources/README.zh.md) | 透過顯式選擇伺服器的共享工具發現和讀取資源 |

-----

<a id="related-documentation"></a>
## 相關文件

先用可執行的範例設定體驗外掛，再閱讀 Agent Note 瞭解其背後的行為決策。

- [MCP 用戶端外掛 Agent Note](../../.agents/notes/implemented/feature/2026-07-07-mcp-client-plugin.zh.md)——橋接的設計：伺服器限定命名、發現、執行與環境清洗。
- [資源與指令 Agent Note](../../.agents/notes/implemented/feature/2026-09-12-mcp-resources-and-instructions.zh.md)——按需資源存取與作用域伺服器指引。
- [第三方記憶 MCP 指南](../../docs/user/guide/mcp-memory.zh.md)——可執行的 overlay 設定行與設定說明。
- [工具子系統參考](../../docs/subsystems/tools.zh.md)——接收已註冊工具的 `ToolRuntime`。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
