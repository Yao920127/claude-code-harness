---
description: "Web GUI Host 側的包對映：HTTP 與 SPA 伺服器、工作區目錄選擇實作、open-in-app 啟動路由、外掛清單投影和顯式產品事件上報。"
kind: "package-group"
---

# host/ — Web GUI 主機側

[English](README.md) | 中文

## 概述

`host/` 組提供 Web GUI 的普通 HTTP 伺服器、服務已建置 Web 殼的 SPA dist 伺服器、帶原生／瀏覽／自適應組合包的工作區目錄選擇 seam、open-in-app 的應用探測與啟動路由，只讀的外掛清單投影以及顯式產品事件上報。這些包都是產品包；瀏覽器傳輸位於 [`client/`](../client/README.zh.md)，組合應用是 [`apps/cli`](../../apps/cli/README.zh.md)，它啟動 [`dsh-base` 組合包](../bundle/base/cordis.patch.yml) 來提供 `apps/web/` 下的 Web 應用。選擇器後端可在共享 seam 後互相替換。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

各包分別承擔 Host 角色；各包的 README 擁有自己的約定與設定。

| 包 | 職責 | ctx 鍵 |
|---|---|---|
| [`webserver/`](webserver/README.zh.md) | 瀏覽器 HTTP 伺服器：具名路由、upgrade、index 轉換與退回席位 | `ctx.webServer` |
| [`frontend-static/`](frontend-static/README.zh.md) | 佔據 webserver 退回席位的 SPA dist 伺服器 | 消費 `ctx.webServer` |
| [`directory-picker/`](directory-picker/README.zh.md) | 工作區目錄選擇 seam：能力約定與錯誤詞彙 | `ctx.directoryPicker` |
| [`directory-picker-native/`](directory-picker-native/README.zh.md) | 面向主機螢幕前操作者的原生 OS 選擇器後端 | 註冊 `ctx.directoryPicker` |
| [`directory-picker-browse/`](directory-picker-browse/README.zh.md) | 應用內目錄瀏覽器後端，也服務於遠端用戶端 | 註冊 `ctx.directoryPicker` |
| [`directory-picker-auto/`](directory-picker-auto/README.zh.md) | 在啟動時掛載匹配後端的主機自適應選擇器 | 掛載一個後端 |
| [`open-in-app/`](open-in-app/README.zh.md) | 在已安裝應用中開啟 workspace 目錄的應用探測、圖示與啟動路由 | 消費 `ctx.webServer` |
| [`plugin-inventory/`](plugin-inventory/README.zh.md) | 目前 Loader 條目的只讀投影 | Remote `pluginInventory/list` |
| [`product-telemetry-otel/`](product-telemetry-otel/README.zh.md) | 透過 OTLP/HTTP 顯式上報產品使用事件 | `ctx.productTelemetry` |

-----

<a id="related-documentation"></a>
## 相關文件

先從傳輸與工作區記錄的子系統參考讀起，再看 Web Client 背後的分層決策。

- [HTTP 伺服器子系統](../../docs/subsystems/web-server.zh.md)——webserver 的路由、匹配順序與設定。
- [工作區子系統](../../docs/subsystems/workspace.zh.md)——目錄選擇器所餵給的工作區記錄。
- [Web 設定樹啟動與傳輸分層](../../.agents/notes/implemented/architecture/2026-07-24-web-config-tree-boot-and-transport-layering.zh.md)——Web 傳輸各層的所有權。
- [產品追蹤點](../../docs/subsystems/product-telemetry.zh.md)——顯式提交分析事件。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
