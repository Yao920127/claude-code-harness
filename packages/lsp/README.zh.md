---
description: "lsp 組地圖：透過 LSP seam、其 stdio 提供者與面向模型的 lsp 工具實作的語言伺服器程式碼導航，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# lsp/：語言伺服器程式碼導航

[English](README.md) | 中文

## 概述

lsp 組讓 agent（智慧代理）透過設定好的語言伺服器導航程式碼：轉到定義、查詢引用與實作，以及閱讀懸停文件。使用 `lsp-stdio` 連線本地 stdio 語言伺服器命令和副檔名對映，使用 `tool-lsp` 向模型提供這些操作。共享的 `lsp` 包使提供者選擇和規範化結果保持一致，因此更換伺服器不會改變模型請求。部署必須自行提供並設定語言伺服器；本組不隨附任何語言伺服器。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx key |
|---|---|---|
| [`lsp/`](lsp/README.zh.md) | 定義程式碼導航服務：按副檔名選擇提供者、四種規範化的只讀操作與結構化錯誤 | `ctx.lsp` |
| [`lsp-stdio/`](lsp-stdio/README.zh.md) | 透過 `ctx.fs` 與 `ctx.subprocess` 驅動設定好的 stdio 語言伺服器命令，註冊為提供者 | 註冊到 `ctx.lsp` |
| [`tool-lsp/`](tool-lsp/README.zh.md) | 透過 `lsp` 工具向模型暴露精確的程式碼導航 | 註冊到 `ctx.tools` |

提供者註冊的是能力而非工具：`tool-lsp` 是面向模型的名稱、schema、提示詞指引與呈現的唯一 owner，因此更換提供者絕不會改變模型請求導航的方式。

-----

<a id="related-documentation"></a>
## 相關文件

- [LSP 導航子系統](../../docs/subsystems/lsp.zh.md)——操作、座標、請求與結果，以及 `LspError` 錯誤碼。
- [生成的工具目錄](../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-lsp)——模型接收的 `lsp` schema。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
