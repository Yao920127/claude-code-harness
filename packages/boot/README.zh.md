---
description: "boot 包組：dsh app bin 如何啟動——環境載入、profile 與 patch 層、清晰的啟動失敗資訊，以及由應用持有的命令列。"
kind: "package-group"
---

# boot/：共享的 app bin 啟動粘合層

[English](README.md) | 中文

## 概述

boot 組負責啟動 profile 應用並管理其已安裝組合。`app-boot` 解析設定並啟動 Loader，`cmdline` 提供應用參數，`plugin-manager` 提供與 CLI 共享的目前 profile 操作。各包 README 負責各自的細節。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

<a id="packages"></a>
## 包

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`app-boot`](app-boot/README.zh.md) | 從 `cordis.yml` 啟動 dsh 應用：載入 `.env`、應用 profile 與 patch 層，並清晰報告啟動失敗 | （供各 bin 使用的庫） |
| [`cmdline`](cmdline/README.zh.md) | 讓應用持有自己的 flag、`--help` 與結束代碼；啟動器自身 flag 之後的一切原樣傳入 | `cmdlineArgs`、`appExit` |
| [`hmr`](hmr/README.zh.md) | 協調模組與設定過載，並與包修改互斥執行 | `hmr` |
| [`config-editor`](config-editor/README.zh.md) | 透過 Loader 應用並持久化目前 profile 設定 | `configEditor` |
| [`plugin-manager`](plugin-manager/README.zh.md) | 透過共享 CLI 操作管理目前 profile 外掛與組合包 | `pluginManager` |

<a id="related-documentation"></a>
## 相關文件

- [dsh 應用](../../apps/cli/README.zh.md)——在其啟動序列中使用這些 helper 的 `dsh` bin。
- [Profile 組合包](../bundle/README.zh.md)——可由 `dsh --profile` 組合掛載的可安裝 patch 層。
- [dsh-home-paths](../util/home-paths/README.zh.md)——兩個包都依賴的 harness home 解析器。
- [dsh-cmdline](cmdline/README.zh.md)——flag 家族如何由應用持有而非啟動器。

- [Profile 管理](../../docs/subsystems/boot.zh.md)——服務方法與結果記錄。

<a id="dev-note"></a>
## 開發備註

無。
