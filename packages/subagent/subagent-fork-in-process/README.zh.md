---
description: "面向使用者與維護者的程序內 fork subagent 後端說明，用於選擇、設定或排查以父級已完成輪次作初始內容的子 agent（智慧代理）。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-fork-in-process

[English](README.md) | 中文

## 概述

`dsh-subagent-fork-in-process` 是一個程序內 subagent 後端：它以父級已完成的對話輪次作為每個子 agent 的初始內容——子 agent 能看到所有已完成輪次，但看不到進行中的輪次，因此後續工作可以在對話基礎上繼續，而無需重複提供對話內容。委派工具以 `fork` 提供者名稱找到它，其行為與 spawn 後端一致，唯一差異是工作階段初始內容。當子任務延續目前對話時選擇它；當子 agent 必須獨立執行時選擇 spawn。初始內容是 fork 時的一次性快照：此後父級記錄的任何內容都不會到達子 agent。

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

當委派的工作必須建立在父級對話之上時，掛載此後端。常用路徑與 spawn 相同：載入 subagent 服務與本後端，再把 `dsh-tool-subagent` 之類的委派工具指向 `fork` 提供者。

### 何時選擇

當子 agent 需要對話的已完成輪次時——後續分析、審查、延續——選擇 fork。當子 agent 應全新開始時選擇 spawn；當子 agent 不能共享本程序時選擇程序外後端。初始內容只傳遞對話歷史：子 agent 仍獲得全新的工具作用域，且不繼承父級的任何權限。

### 初始內容邊界

初始內容止於父級最後一個已完成的輪次。subagent 啟動時，父級目前的工具呼叫輪次仍在進行，因此該進行中的輪次絕不會被包含；在第一個已完成輪次之前，初始內容為空，子 agent 的行為與全新 spawn 相同。

### 最小設定

先載入 subagent 服務與本後端，再設定一個委派工具。此組合暴露由 fork 支撐的 `subagent` 工具：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-fork-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: fork
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `providerName` | `fork` | 註冊到 `ctx.subagents` 的提供者名稱 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-fork-in-process)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 一次 fork 委派會做什麼

一次工具呼叫啟動一個以已完成輪次為初始內容的子 agent，並等待其結果：子 agent 能看到截至父級最後一個已完成輪次的對話，在自有工作階段中工作，父級只接收其最終輸出——取消、拒絕、token 上限截斷或啟動被拒時則收到出錯的工具結果。初始內容在啟動時只捕捉一次；此後的父級輪次絕不會到達子 agent。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋後端背後的設計決策，以及[使用本包](#use-this-package)中行為的來源。

### 設計理念

與 spawn 的差異只有一處，且以資料表達：後端計算父級日誌的已配平已完成輪次字首，並把它作為子 agent 的工作階段初始內容交給共享程序內驅動器。由於實際序號等於陣列下標，字首始終是自序號零開始的合法初始內容；驅動器記錄其長度，使結果讀取器不會把作為初始內容的父級訊息誤認為子 agent 輸出。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供者註冊：字首計算、`Config` schema、能力宣告 |
| — | 不釋出執行時不變式伴生入口；本包沒有獨立事件序列或可變資料關係，相關約定在所屬 seam 強制執行。 |

### 執行流程

`start` 時，從父級事件日誌中擷取截至最後一個 `turn/end` 的字首；共享驅動器隨後以該初始內容建立子 agent，應用相同的 persona、工具過濾器與結構化輸出設定，驅動一項任務，讀取子 agent 自身的最終輸出，並執行 dispose（資源釋放）以等待所有工作完全停穩。該提供者宣告 `agentOptions`，以及與 spawn 相同的輸出、深度、過濾與 persona 能力。`prepareContinuable` 在建立時只捕捉一次字首，因為該字首會成為子 agent 自身持久儲存的 transcript（文字記錄）的一部分。

### 生命週期繫結

base 組合包與 ACP（Agent Client Protocol）/headless 範例在委派工具上把本提供者繫結為 `backgroundMode: one-shot`，CLI（命令列介面）預設則選擇 `continuable`。兩者都保留繼承的請求字首：父級與子級獲得定義和順序相同的訊息工具，可繼續子級的父級 ID 與返回指導位於繼承歷史之後的初始使用者任務中（見[保持 fork 快取的 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.zh.md)）。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從共享 subagent 模型進入兄弟後端，以及一次性繫結的設計證據。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——啟動請求、結果、提供者約定與程序內深度和初始內容。
- [dsh-subagent-in-process-driver](../subagent-in-process-driver/README.zh.md)——本後端呼叫的共享執行驅動器。
- [dsh-subagent-spawn-in-process](../subagent-spawn-in-process/README.zh.md)——全新子級的兄弟後端。
- [dsh-tool-subagent](../tool-subagent/README.zh.md)——指向該提供者的面向模型委派工具。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-fork-in-process)——每個受支援設定欄位及其源宣告。
- [fork 保持 one-shot](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.zh.md)——隨附組合為何把 fork 繫結為 one-shot。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 歷史與包絡

#### 模型看到什麼

子 agent 先接收由父級已配平的已完成輪次構成的字首，再逐字接收新的任務內容。設定的 persona 會在子 agent 的全新作用域中遮蔽提示詞文字；工具限制會過濾其全域協定 schema、可執行工具查詢與 PTC mode SDK 繫結，但不影響獨立指導內容。父級的工具檢視與權限不會被繼承；可選的結構化輸出請求會新增僅屬於子 agent 的約定；父級目前進行中的輪次會被排除。

#### Token 影響

fork 會把保留的已完成歷史複製到子 agent 的請求中，子 agent 隨後獨立累積自己的 token。persona 會改變重複提示詞的成本；過濾會改變 schema 或生成 SDK 的成本；首輪 fork 沒有繼承歷史。

#### KV Cache 影響

在提供者與模型相同的前提下，子 agent 可以複用繼承的逐位元組相同字首。persona、工具過濾、生成 SDK 或路由變化可能在繼承歷史之前使複用失效；後續子 agent 歷史僅追加。可繼續訊息不會增加子級專屬的系統提示詞區段或工具 schema；父級 ID 與返回指導在初始使用者任務中位於繼承歷史之後（見[保持 fork 快取的 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.zh.md)）。

### 父級工具結果（間接）

#### 模型看到什麼

父級只透過 `dsh-tool-subagent` 接收子 agent 自身的最終輸出，不接收繼承的字首或中間工作。

#### Token 影響

父級輸入增加一個取決於資料的最終結果，並保留到上下文壓縮（context compaction）為止。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時選擇該後端是錯誤的；它們是目前包約束。

- **初始內容是一次性快照**——子 agent 只能看到 fork 時父級已完成的輪次，看不到父級此後記錄的任何內容；不會即時共享上下文。
- **fork 生命週期策略因組合而異**——base 組合包與 ACP/headless 範例使用一次性 fork，CLI 預設使用可繼續 fork。兩者都因父級與子級的訊息定義逐位元組相同而讓繼承字首保持可複用；顯式 persona、工具過濾、生成 SDK 或路由變化仍可破壞相等性。理由見[保持 fork 快取的 Agent Note](../../../.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.zh.md)。
- **隨附 fork 工具不公開子級 LLM（大語言模型）路由選擇**——它們繼承父級提供者與模型，使複製的歷史仍有資格複用 KV Cache。在某項改動能保留複用或公開有界重算成本前，路由選擇保持停用；[模型選擇路由 Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.zh.md)說明這項限制。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
