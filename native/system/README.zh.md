---
description: "為 Linux 程序隔離與 POSIX 工作階段寫鎖提供預編譯系統原語。"
kind: "package-library"
---
# @deepseek-ai/node-addon-system

[English](README.md) | 中文

## Summary

使用 Linux `landlock-run` 可執行檔案限制子程序，或透過 `./flock` 入口取得 POSIX 寫鎖。平臺包包含預編譯二進位制；消費方安裝時不會建置原生程式碼。Landlock 策略與工作階段生命週期仍由呼叫方負責。

## Table of Contents

- [使用](#use)
- [支援範圍](#support)
- [開發](#development)

## Use

`@deepseek-ai/node-addon-system/landlock-run` 為 Landlock 匯出 `launcherPath`、`probe` 和 `grantArgs`。其可執行檔名、參數和失敗語義由 [CLI 約定](docs/cli-contract.md) 定義。

[flock 行為約定](docs/flock-contract.md) 將描述符、程序和諮詢式鎖語義對應到獨立原生測試。

`@deepseek-ai/node-addon-system/flock` 匯出 `tryLockExclusive(fd): Promise<void>`。在呼叫完成前保持描述符開啟。取得操作使用非阻塞獨佔 flock；發生競爭時，返回的 Promise 會以 `EAGAIN` 或 `EWOULDBLOCK` 拒絕，關閉該開啟檔案描述的最後一個描述符即釋放鎖。參見[入口 README](packages/entry/README.zh.md)。

匯入任一入口都不會載入 addon。Landlock 可執行檔案缺失時探測為不可用；flock 繫結缺失時拒絕取得。兩條路徑都不會進行編譯，也不會靜默允許不受支援的行為。

## Support

Linux x64/arm64 包包含靜態 Landlock 可執行檔案，以及分別用於 glibc/musl 的 `system.node` 檔案。macOS x64/arm64 包僅包含 `system.node`。Landlock 還需要支援強制執行的 Linux 核心；Windows 使用 Harness 既有鎖實作。[支援矩陣](docs/support-matrix.md) 指定建置者與驗證負責人。

## Development

在本目錄執行 `pnpm build:ts` 建置入口、`pnpm build:native` 建置目前主機宣告的原生產物、`pnpm build:test-oracle` 建置獨立的 flock 系統呼叫 fixture（測試前置資料）。隨後用 `pnpm test` 驗證入口、鎖、打包及可用的核心行為。Linux 完整建置需要 musl-gcc；macOS 使用 cc。根目錄 `pnpm run build:native-system` 只建置原始碼測試所需的目前主機 addon。

[架構](docs/architecture.md)、[打包](docs/packaging.md)和[釋出流程](docs/release.md)分別負責實作與釋出細節。

### Dev Note

無。
