---
description: "Host Office 轉換和可複用 PDF 結果的包索引。"
kind: "package-group"
---

# document/ — Office 轉換

[English](README.md) | 中文

## 摘要

在主機上將已授權的 Office 檔案轉換為可複用的 PDF。共享服務使用 LibreOffice kit 執行轉換。宣告瞭原生引擎的目標使用原生引擎，其餘目標使用 Node WASM。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

每個包負責自身設定和生命週期規則；子系統參考描述共享轉換操作。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [office-to-pdf](office-to-pdf/README.zh.md) | 將已授權 Office 位元組轉換為完整 PDF，並提供有界佇列和快取 | `ctx.officeToPdf` |

-----

<a id="related-documentation"></a>
## 相關文件

消費者負責原始檔授權與展示。

- [文件轉換](../../docs/subsystems/office-to-pdf.zh.md) — 共享操作和生成的服務參考。
- [獨立 kit 所有權](../../.agents/notes/implemented/architecture/2026-09-14-independent-libreoffice-kit.zh.md) — 引擎分發與應用整合。
- [工作區檔案](../api/workspace-files/README.zh.md) — 已授權的有界原始檔讀取。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者工作上下文 — 點選展開</summary>

無。

</details>
