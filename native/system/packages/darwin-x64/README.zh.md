---
description: "為 macOS x64 POSIX 鎖提供預編譯 system.node。"
kind: "package-library"
---
# @deepseek-ai/node-addon-system-darwin-x64

[English](README.md) | 中文

此平臺包提供 `bin/system.node`，這是一個供 `@deepseek-ai/node-addon-system/flock` 使用的穩定 Node-API v8 addon。它不包含 Landlock 可執行檔案、JavaScript 載入器或安裝建置腳本。Native 工作流在 macOS x64 上建置它，並負責驗證安裝後的產物。
