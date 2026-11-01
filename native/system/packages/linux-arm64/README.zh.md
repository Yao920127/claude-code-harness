---
description: "為 Linux arm64 提供預編譯 Landlock 啟動器和 POSIX flock addon。"
kind: "package-library"
---
# @deepseek-ai/node-addon-system-linux-arm64

[English](README.md) | 中文

此平臺包包含靜態 musl 可執行檔案 `bin/landlock-run`，以及 Node-API v8 addon `bin/glibc/system.node` 和 `bin/musl/system.node`。入口會選擇與正在執行的 Node 程序所用 libc 匹配的 addon；Landlock 可執行檔案在兩種 libc 系統上共用。

包中沒有 JavaScript 或安裝編譯腳本。平臺 prepack 檢查產物完整性、ELF 架構、Node-API 匯出和啟動器可執行權限；已安裝產物演練核對位元組並執行原生行為。參見工作區的[支援矩陣](../../docs/support-matrix.md)。
