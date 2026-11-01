---
description: "subprocess 組地圖：共享的子程序服務及其本地主機提供者，供瀏覽本組的使用者與維護者閱讀。"
kind: "package-group"
---

# subprocess/：子程序能力家族

[English](README.md) | 中文

## 概述

harness 執行的每個子程序與終端工作階段——bash 命令、語言伺服器、持久 shell 與程序外 subagent 後端——都經由一個共享服務（`ctx.subprocess`）啟動、觀察與終止，並由一個本地提供者在主機器上執行。它不是獨立的產品功能：消費方能力 seam 決定每個程序的含義，命令語義、時限與面向模型的呈現仍歸它們所有。本組提供可執行檔案查詢、帶 spill 恢復的有界輸出捕捉、由提供者管理且明確披露較弱 fallback 的程序範圍，以及每個子程序起步時所用的清理後環境。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`subprocess`](subprocess/README.zh.md) | 定義子程序服務：可執行檔案查詢、受管程序 spawn 與真實終端工作階段 | `ctx.subprocess` |
| [`subprocess-local`](subprocess-local/README.zh.md) | 在支援的平臺上以原生受管範圍執行主機程序與終端，其他平臺使用明確披露的較弱 fallback | 註冊到 `ctx.subprocess` |
| [`win32-process`](win32-process/README.zh.md) | 負責維護 sandbox 與普通程序建立、stdio、Job 分配、輪詢、等待與控制代碼清理所用的共享 Win32 繫結 | 庫，不使用 ctx key |

即使消費方過載，程序生命週期仍由服務負責管理；消費方負責定義程序的含義（一條 bash 命令、一個語言伺服器），以及決定塑造該程序的每一項預設值。

-----

<a id="related-documentation"></a>
## 相關文件

- [子程序子系統](../../docs/subsystems/subprocess.zh.md)——spawn spec、輸出讀取器、結果與受管的 `DSH_*` 環境。
- [subprocess seam Agent Note](../../.agents/notes/archived/architecture/2026-07-26-subprocess-seam.md)——bash 執行器的程序部分為何成為獨立的 seam。

-----

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
