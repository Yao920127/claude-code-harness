---
description: "面向使用者與維護者的程序內 spawn subagent 後端說明，用於選擇、設定或排查全新子級委派。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-spawn-in-process

[English](README.md) | 中文

## 概述

`dsh-subagent-spawn-in-process` 是一個程序內 subagent 後端：它在目前程序中執行每個委派任務，子 agent（智慧代理）是一個全新子 `Agent`，複用主機的 agent 工廠及 LLM（大語言模型）/工具服務。子 agent 以空對話開始，因此任務提示詞必須自足；除非 `request.agentOptions` 覆蓋，否則它繼承父 agent 的工作目錄、工作階段譜系、提供者、模型、推理強度與輸出 token 上限。委派工具或 API 呼叫以 `spawn` 提供者名稱找到它。需要成本最低的委派傳輸時選擇它；需要子 agent 建立在父級已完成對話輪次之上時，請選擇 fork 後端。

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

在需要把工作委派給全新程序內子 agent 的組合中掛載此後端。常用設定路徑很明確：載入 subagent 服務與本後端，再把 `dsh-tool-subagent` 之類的委派工具指向 `spawn` 提供者。

### 何時選擇

當子 agent 不需要父級對話、且可以接受在本程序內執行時，選擇 spawn 後端。當子 agent 必須建立在已完成父級輪次之上時——fork 後端會提供這些歷史——或必須在本程序之外執行時（程序外後端提供此能力），請避免使用它。由於子 agent 預設繼承父級的工作目錄與 LLM 選擇，自足的提示詞會按原樣生效。

### 最小設定

先載入 subagent 服務與本後端，再為每個目標設定一個委派工具。這是暴露由 spawn 支撐的 `subagent` 工具的最小組合：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `providerName` | `spawn` | 註冊到 `ctx.subagents` 的提供者名稱 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-spawn-in-process)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 一次委派會做什麼

一次工具呼叫啟動一個子 agent 並等待其結果：子 agent 在自有工作階段中工作，父級只接收其最終輸出；若執行被取消、拒絕、被 token 上限截斷或在啟動時被拒，則收到出錯的工具結果。被拒絕的啟動不會留下已釋出的子 agent；完成的執行在結果收集後即被 dispose（資源釋放）。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋後端的建置方式以及[使用本包](#use-this-package)中行為的來源；共享機制屬於程序內驅動器。

### 設計理念

職責劃分如下：本後端只貢獻提供者註冊與「全新開始」的決定，其餘全部執行機制——深度檢查、子 agent 建立、按子 agent 定製、結構化輸出、取消、結果讀取與 dispose——都在 `dsh-subagent-in-process-driver` 中。agent 工廠的建立事務擁有未釋出設定視窗及其復原；釋出之後，呼叫方擁有該執行。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 提供者註冊：`Config` schema、能力宣告、`start()` |
| — | 不釋出執行時不變式伴生入口；本包沒有獨立事件序列或可變資料關係，相關約定在所屬 seam 強制執行。 |

### 執行流程

啟動請求先由 subagent 服務解析，然後共享驅動器驗證深度、生成子工作階段 id、透過主機 agent 工廠以呼叫方訊號建立子 agent、在建立視窗內應用 persona、工具過濾器與結構化輸出、釋出子 agent、驅動一項任務、讀取子 agent 自身的最終輸出，最後完全停穩地 dispose 控制代碼。

### 所有權與作用域

子 agent 獲得全新的扁平註冊作用域：父級工具限制與權限絕不會被匯入，工具所施加的過濾屬於組合而非父級派生授權。後端宣告包括 `agentOptions` 在內的全部五項啟動時能力，因為它控制子 agent 的建立視窗，可以逐一強制執行。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從共享 subagent 模型進入兄弟後端與窮盡式設定。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——啟動請求、結果、即時執行與提供者約定。
- [dsh-subagent-in-process-driver](../subagent-in-process-driver/README.zh.md)——本後端呼叫的共享執行驅動器。
- [dsh-subagent-fork-in-process](../subagent-fork-in-process/README.zh.md)——以已完成父級輪次作初始內容的兄弟後端。
- [dsh-tool-subagent](../tool-subagent/README.zh.md)——指向該提供者的面向模型委派工具。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-subagent-spawn-in-process)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 請求

#### 模型看到什麼

全新子 agent 逐字接收任務內容，作為新空對話中的唯一使用者訊息，預設使用父級提供者、模型、推理強度、輸出 token 上限與工作目錄。設定的 persona 會在子 agent 作用域中遮蔽全域提示詞文字；工具過濾器會從其 schema、可執行工具查詢與 PTC mode SDK 繫結中移除指定的全域工具，但保留獨立註冊的指導內容。不包含任何父級對話訊息；過濾屬於組合，而非繼承的權限授予。

#### Token 影響

子 agent 會為全新的獨立上下文與歷史消耗 token，不複製任何父級歷史 token。persona 會改變該子 agent 反覆使用的提示詞成本；工具過濾器會改變其 schema 或生成 SDK 的成本。

#### KV Cache 影響

子 agent 的請求快取與父級相互獨立。子 agent 歷史僅追加；persona、工具過濾、生成 SDK、提供者或模型變化會建立不同的子 agent 字首。

### 父級工具結果（間接）

#### 模型看到什麼

透過 `dsh-tool-subagent`，父級只接收子 agent 的最終輸出，或非完成終止原因對應的出錯結果；子 agent 的中間工作絕不會到達父級。

#### Token 影響

父級輸入增加一個取決於資料的結果，並保留到上下文壓縮（context compaction）為止。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時選擇該後端是錯誤的；它們是目前包約束。

- **全新表示不含父級 transcript（文字記錄）**——子 agent 繼承 cwd、譜系、提供者、模型、推理強度、輸出 token 上限及顯式設定的 persona/工具限制，但不繼承父級的任何對話；需要已完成輪次上下文時，請使用 fork 後端。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
