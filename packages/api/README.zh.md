---
description: "應用 Remote 層的包對映：型別化的 Client 到 Host 能力呼叫、結果與轉發事件，供使用者與維護者瀏覽該組。"
kind: "package-group"
---

# api/ — Remote API 層

[English](README.md) | 中文

## 概述

`api/` 組提供應用的 Remote 層：Client 環境可以呼叫執行在 Host 上的業務能力——管理目標、執行命令、檢視外掛清單、發現檔案與工作階段引用——呼叫方式是型別化方法，可接收結果或流、在已開啟的流上傳送上行項，並觀察轉發的 Host 事件。`remotes` 決定暴露哪些能力、以及每次呼叫如何到達正確工作階段的 agent；`gateway` 在 Client 與 Host 之間承載呼叫及其結果。技術棧執行在應用共享的 Connection 之上；流式工作階段資料刻意不在其中。

## 目錄

- [包](#packages)
- [相關文件](#related-documentation)
- [開發備註](#dev-note)

-----

<a id="packages"></a>
## 包

下面這些包共同提供 Remote 層；完整約定以各包 README 為準。

| 包 | 職責 | ctx key |
|---|---|---|
| [`remotes/`](remotes/README.zh.md) | 決定 Client 可以消費哪些 Host 能力與事件。 | — |
| [`gateway/`](gateway/README.zh.md) | 承載型別化一元呼叫、帶 Client 上行的多路複用流，以及轉發的 Host 事件。 | `ctx.typertGateway` / `ctx.remote` |
| [`job-controller/`](job-controller/README.zh.md) | 把一個後臺任務的觀測 record 流式送到 Client。 | `ctx.jobController` / `ctx.remote.job` |
| [`session-controller/`](session-controller/README.zh.md) | 擁有工作階段命令、歷史記錄流、即時控制狀態與 Agent/Session 身份策略。 | `ctx.sessionController` / `ctx.remote.session` |
| [`settings-controller/`](settings-controller/README.zh.md) | 擁有 settings 域各 seam 之上的設定介面讀寫。 | `ctx.settingsController`、`ctx.credentialsController` / `ctx.remote.settings`、`ctx.remote.credentials` |
| [`workspace-controller/`](workspace-controller/README.zh.md) | 擁有 Workspace 變更與完整 Client Workspace 投影。 | `ctx.workspaceController` / `ctx.remote.workspace` |
| [`terminal-controller/`](terminal-controller/README.zh.md) | Session 擁有的互動式 shell、螢幕恢復和瀏覽器終端控制。 | `ctx.terminalController` / `ctx.remote.terminal` |
| [`workspace-files/`](workspace-files/README.zh.md) | 擁有有界的工作區檔案存取——`stat`、分頁 `read`、`list` 與已追蹤點操作的 `changes` 流——以及其上的 Client `file` 資源提供者。 | `ctx.workspaceFiles` / `ctx.remote.workspaceFiles` |

Remote 呼叫沿 Client → Host 方向執行在應用共享的 Connection 之上；流項沿 Host → Client 方向經 Gateway mux 傳輸，流的上行項則沿 Client → Host 方向走同一條邏輯流。API Gateway 擁有 Remote 傳輸，各控制器包分別擁有 Session、設定介面與 Workspace 行為。流式下載等不適合 Remote 呼叫的回應由功能包註冊精確的 Connection Fetch 路由。

-----

<a id="related-documentation"></a>
## 相關文件

先讀 API Gateway 參考以端到端了解 Remote 模型，再讀 Typert 子系統頁瞭解共享定義，並透過 Connection 瞭解物理載體。

- [API Gateway 參考](../../docs/api-gateway.zh.md)——Typert API Gateway 的現狀參考：程式設計模型、生成流水線與執行時呼叫。
- [Typert 子系統參考](../../docs/subsystems/typert.zh.md)——protocol、Gateway 與消費方裝配共享的公共約定。
- [Connection](../client/connection/README.zh.md)——每次 Remote 呼叫背後的 RPC 載體、`/api` 信任圍欄與回應封裝。

<a id="dev-note"></a>
## 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
