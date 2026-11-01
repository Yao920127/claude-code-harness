---
description: "工作階段頭部後臺任務列表：可展開的流式輸出面板、進行中/已結束分組，以及無保留輸出的已結束任務的靜態行。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-jobs

[English](README.md) | 中文

## 概述

`dsh-client-ui-jobs` 在一個頭部控制元件中展示本工作階段的後臺任務，包括生命週期、耗時、進度與終態詳情。進行中的任務和保留了輸出的已結束任務提供可展開的輸出面板；收起即停流。進行中的行以持續更新的時長為主行，隨後展示型別與狀態。已結束的行摺疊在分組標題下；沒有保留輸出的任務保持靜態，包括回答已交給模型的 subagent。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與延期工作](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

透過 web-app 清單載入本外掛；在工作階段看得到至少一個 job 之前它不渲染任何東西，因此普通對話不會為未使用的能力長出控制元件。

### 一 job 一行

`ctx.jobs` 映像的 `job.list` 流是唯一名冊：每個 `JobView` 行攜帶生命週期、時長、即時 `progress` 行或終態 `detail`，以及其保留位元組數——進行中的 job，或留有保留輸出的已結束 job，就是行可展開的依據。不存在需要 join 的第二份名冊。

執行中的 job 行還帶一個兩擊式停止控制元件：首擊武裝，三秒內的確認擊呼叫 `ctx.jobs.kill`，行狀態經名冊流收斂（先 `stopping`，再入已結束分組，其 detail 攜帶 `cancelled by the user`）。該 kill 不在模型的播報臺帳裡認領任何東西，任務的 owner agent 因此照常收到標準完成通知——模型被明確告知使用者停止了它的任務，而不是留給它去猜（[決策](../../../.agents/notes/implemented/feature/2026-08-26-human-job-kill.zh.md)）。已結束分組在有進行中工作時摺疊在其計數之後，並可在用戶端清空。

### 展開的面板

展開可觀察的行會從 `ctx.jobs`（由 `dsh-api-job-controller` 安裝）開啟該 job 的輸出觀測流，注入內嵌終端面板。面板複製的是命令（不是輸出），命令與輸出行完整換行，輸出在固定高度內滾動而非摺疊，且不繪製自己的執行狀態點——上方的行承載狀態。保留缺口與流中斷在面板上方渲染為提示。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作內幕——點選展開</summary>

頭部操作帶裡的一個 slot 條目（preset 標籤之後）渲染觸發器與彈出層；彈出層透過測量錨點把自己收進視口。所有資料經 `ctx.jobs` 到達——元件不持有任何傳輸狀態。名冊跟隨掛載：一個 `useEffect` 在控制元件存活期間保持工作階段的 `job.list` 流開啟。觀測跟隨可見性：另一個 `useEffect` 為展開行的 job 開啟流，並在收起、解除安裝或彈出層關閉時關閉它。

| 檔案 | 角色 |
|---|---|
| [`src/client/JobListAction.tsx`](src/client/JobListAction.tsx) | 任務列表：分組、時長、面板 |
| [`src/client/index.ts`](src/client/index.ts) | slot 註冊與詞典 |
| [`src/client/locales.ts`](src/client/locales.ts) | `job` 名稱空間文案（zh 為事實源） |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

- [`dsh-api-job-controller`](../../api/job-controller/README.zh.md) —— 行、面板與停止控制元件背後的 `job.list`、`job.follow` 流、`job.kill` Remote 與 `ctx.jobs` 服務。
- [`dsh-jobs`](../../jobs/jobs/README.zh.md) —— 擁有環與投影語義的註冊表契約。
- [`dsh-client-ui-primitives`](../ui-primitives/README.zh.md) —— 面板所設定的 `TerminalBlock` 表面。

-----

<a id="model-experience"></a>
## 模型體驗

無。本包為人類渲染主機觀測到的狀態與即時輸出，不觸碰任何提示詞、訊息、schema、流或工具結果。模型對同一工作的檢視仍在 [`dsh-tool-jobs`](../../jobs/tool-jobs/README.zh.md)。

#### KV 快取影響

無；本包從不組裝或傳送 provider 請求。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>

這些限制界定目前包約束，不是任務清單。

- **不渲染 channel 標籤**——stdout 與 stderr 塊拼接為一條流；按 channel 著色是展示層的後續工作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者工作語境——點選展開</summary>

無。

</details>

**執行時不變式：** 不釋出伴生入口。本包只把 `ctx.jobs` 的名冊與檢視只讀投影到一個 header slot，不發出 Cordis 事件，也不持有跨外掛可變狀態；其唯一的 slot 註冊透過 HMR（熱模組替換）安全性規範驗證了資源釋放行為。
