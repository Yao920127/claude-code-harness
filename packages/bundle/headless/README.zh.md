---
description: "dsh 的一次性任務模式：從命令列執行單個任務並列印最終答案，供使用者腳本化或自動化 dsh。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-headless

[English](README.md) | 中文

## 概述

`dsh-headless` 從命令列執行一個 dsh 任務並列印最終答案，然後退出——沒有 GUI、沒有伺服器、沒有瀏覽器。輸入 `dsh --profile headless "run the tests"`，agent（智慧代理）會以與所有其他表層相同的模型、工具與安全預設值完成該任務。它非常適合腳本、CI 與一次性任務：程序不開啟任何埠，也不會留下任何後臺執行的東西。監督程序還可以透過按行 JSON 事件流（`--json`）驅動它，並用該事件流報告的標識（`--session-id`）在同一段對話上繼續喚醒。結束代碼告訴你結果——任務完成時為 0，中止或出錯時為 1。主要邊界：每次呼叫只執行一個任務，沒有互動式後續。

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

執行一個任務，獲得最終答案，然後退出。任務就是命令列參數，省略時則來自 stdin；整條命令就是最小的可執行範例。

### 執行一次性任務

```sh
dsh --profile headless "run the tests"
```

agent 會完成該任務，把提供者的每個非空推理（reasoning）增量流式寫入 stderr 的 `dsh: reasoning:` 段，然後把最終答案寫入 stdout 並退出。連續推理增量保持在同一段中；提供者未給尾換行時，runner 會在後續輸出前結束該段。沒有推理內容的成功執行保持 stderr 為空；失敗時結束代碼為 1，並以 `dsh: <code>: <message>` 向 stderr 寫入錯誤。任務來自位置參數，參數省略或為單獨的 `-` 時則來自 stdin；空白位置參數或空管道會在任何執行開始之前被拒絕。位置參數會原樣作為任務，stdin 不會被讀取，因此想讓管道內容進入提示詞時，請把完整提示寫進管道；管道任務會原樣傳送，包括結尾換行。

```sh
{ echo "Summarize these changes:"; git diff --stat; } | dsh --profile headless
```

任務與執行選項透過三個設定提供：

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `task` | stdin | 任務文字；省略或傳 `-` 時由 stdin 提供 |
| `sessionId` | `session-<uuid>` | 要沿用的精確 Session 標識；未知 id 會失敗 |
| `json` | `false` | 把本次執行投影為 stdout 上的按行 JSON 事件 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-headless)是所有受支援欄位及其 JSDoc 的完整真源。

### 選擇 Session 標識

每次呼叫預設使用全新的 `session-<uuid>` 標識，`--json` 會在開頭的 `session` 事件裡報告它。傳入 `--session-id <id>` 延續這段對話：runner 沿用該 id 對應的持久化 Session，而該 id 沒有持久化 Session 時會在任務執行前失敗，而不是悄悄開出一段空歷史。沿用要求已組合 `sessionPersistence` 與 `sessionQuery` 服務，因此缺少任一服務的 profile 會顯式失敗，而不會返回一個歷史隨程序消失的 id。本程序中已存在持有該 id 的存活 Agent 時會被拒絕：它的原 owner 可能仍在驅動它，runner 無法取得獨佔的執行區間。標識是不透明的，因此會原樣使用呼叫方給出的字串，包括空白字元。工作目錄透過已掛載的檔案系統提供者解析（`fs.resolve('.')` 與 `fs.processPath()`）；未掛載檔案系統服務時使用程序 cwd，新 Session 會記錄該目錄。沿用會將已記錄 cwd 與同一提供者解析出的目錄比較，並拒絕子 agent 或 fork 工作階段、未記錄工作目錄的工作階段、執行在本 profile 不組合的 agent preset 下的工作階段，以及 preset 記錄畸形的工作階段——該檢查讀取 Session 日誌目前記錄的 preset，因此在空白期切換過 preset 的工作階段同樣會被拒絕。因此監督程序無法在另一套組合下悄悄驅動他人的工作階段；任一不匹配都會在任務執行前失敗。

### 機器可讀輸出

`--json` 用按行 JSON 事件流取代 stdout 的最終文字行，stderr 僅保留 `dsh:` 診斷資訊。事件流以 `session`（攜帶本次執行使用的標識）開頭、以 `final` 結尾，其間為 `status`、`text`、`thinking`、`tool_call` 與 `tool_result` 事件。`text` 與 `thinking` 只從已提交的 assistant 訊息投影，因此被重試或丟棄的嘗試不會進入事件流；它們在步驟提交時到達，而不是逐 token 到達，預設模式的 stderr 推理仍是唯一的即時文字通道。終止 `final` 事件攜帶與預設模式相同的無損答案，不做限長；其他每個字串與物件鍵上限為 8 KiB，超出時標記 `truncated`，單條事件行（含換行）上限為 32 KiB——超長事件保留標量欄位、丟棄結構化欄位，極端情況下只剩 `type` 與 `truncated`，巢狀達到 64 層及以上的負載會在該深度被截斷。空工具參數字串會投影為 `{}`，與執行器實際執行的值一致；而 JSON 無法往返的參數——例如溢位為 `Infinity` 的數字 `1e400`——會保留原始文字，而不是 `JSON.stringify` 會報告的 `null`。runner 在輪次之外丟擲的失敗會寫出 `error` 事件並在沒有 `final` 的情況下結束事件流，同時向 stderr 寫入 `dsh:` 行；若 profile 自身的外掛載入失敗，程序會在 runner 掛載前退出，該情形只保留 loader 的 stderr 診斷。輪次內失敗的執行仍會以 `final` 事件（通常為空）結束且沒有 `error` 事件，因此格式良好的事件流也可能描述一次失敗的執行：請把結束代碼 1 與 `turn_end` 原因作為失敗訊號。

### 何時使用

在腳本化或自動化的 dsh 執行中使用 headless——CI 步驟、批處理任務、從終端快速取得答案。當需要多輪互動工作階段或 GUI 時請避免它；瀏覽器表層（[dsh-web-app](../web-app/README.zh.md)）負責這類情境。程序只為本次執行而存活，不開啟監聽埠，並且自行退出，因此適合等待程序結束的流水線。當監督程序需要進度而不只是答案時，`--json` 提供事件流，`--session-id` 則讓後續呼叫繼續同一段對話。

### 幫助與任務錯誤

`dsh --profile headless --help` 列印該命令的幫助文字並直接退出，不執行任何內容。只有空白的位置參數本身就屬於用法錯誤——什麼都不執行，程序退出 1，即使 stdin 不是終端也一樣，因此誤傳的空白參數絕不會消費管道內容。完全缺失任務時，僅在 stdin 是終端時屬於用法錯誤；stdin 不是終端時，runner 改從 stdin 讀取任務，並以同樣方式拒絕空結果。單獨的 `-` 是唯一的 stdin 標記；把它與其他任務詞混用屬於用法錯誤，而不是以連字元開頭的任務。在 `--json` 模式下，所有用法錯誤——包括 commander 自身的語法拒絕，例如未知選項或選項缺少取值——都會在程序退出前向 stdout 寫出 `error` 事件，因此按行解析的監督程序即使 runner 從未掛載也能看到格式良好的事件流；事件 `message` 中的文字不帶 commander 的 `error: ` 字首。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

runner 是核心 API 載體之上的直接驅動器：它確定 Agent 標識——預設是全新的 `session-<uuid>`，或 `--session-id` 指名的持久化 Session——並把所屬的持久化事件區間摺疊成一個程序級結果。

### 執行流程

runner 等待整個應用結算（`ctx.get('loader')?.await()`），確保已組合的工具與介面卡不會半掛載，讀取共享的 [`agentDefaultModel`](../../core/agent-default-model/README.zh.md) 選擇，從設定或 stdin 解析任務，然後確定 Agent 標識：預設是全新的 `session-<uuid>`，或是 `--session-id` 指名的持久化 Session——透過 [`sessionQuery`](../../session-query/session-query/README.zh.md) 沿用，日誌不存在時拒絕。它把任務作為普通使用者訊息提交。不帶 `--json` 時，它把該 Agent 的非空推理增量流式寫入 stderr；帶 `--json` 時改為投影本次執行。它等待完全停穩，然後對工作階段執行 flush，並把所屬區間（從 `firstSeq` 起）摺疊為最後一條非空 `assistant/message` 文字與最終 `turn/end` 原因。最後，它把最終文字寫入 stdout（或 `final` 事件）並請求退出。

### 基於 base 的 patch 內容

patch 疊加在 `dsh-base` 之上：繼承投影快取與共享 PTC 執行時，在基礎 `system-prompt` 行上設定編碼 persona 字首與獨立的 cwd 字尾，保留與 Web 表層相同的臨時程序級 PTC mode 開關（`DSH_TOOLS_MODE`），停用共享的 HMR（熱模組替換）行，並掛載啟動提供者與 runner。快取為每個已持久化的一次性工作階段寫入檢查點，供後續消費方使用；其永續性屏障會在釋出快取行前 flush 所覆蓋的日誌字首，因此可能拆分原本會合並的 JSONL 連續段。啟動提供者（[`src/startup.ts`](src/startup.ts)）注入 `ctx.cmdlineArgs`（[`dsh-cmdline`](../../boot/cmdline/README.zh.md)），讀取位置參數與 `--session-id`/`--json` 選項、列印應用自己的 `--help`，並提供 `headlessStartup`；runner 注入該服務，再從惰性設定中讀取任務與執行選項。

### 退出對映

最終 `turn/end` 完成時結束代碼為 0；任何其他結果——aborted、error，或所屬區間內沒有輪次——結束代碼為 1。結束原因為 `error` 時還會向 stderr 寫入 `dsh: <code>: <message>`。直接驅動器失敗（例如 Agent 建立失敗或不可用的 `--session-id`）向 stderr 寫入 `dsh: <message>` 並退出 1，且在 `--json` 模式下額外發出一個 `error` 事件。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `headless-runner` 外掛：執行流程、Session 解析、輸出約定、退出對映 |
| [`src/startup.ts`](src/startup.ts) | `headless-startup` 提供者：任務位置參數、`--session-id`、`--json` 與 `--help` |
| [`src/json-stream.ts`](src/json-stream.ts) | `--json` 投影：事件詞彙、提交點發射、字串限長 |
| [`cordis.patch.yml`](cordis.patch.yml) | 疊加在 `dsh-base` 之上的一次性 patch |
| — | 不釋出執行時不變式伴生入口；runner 的可觀察約定（stderr 中的提供者推理、stdout 中的最終文字、按輪次結束原因決定的結束代碼）屬於程序級，並由啟動器 e2e 負責；runner 不註冊任何內容，樹內也沒有任何可變關係可審計。 |
| [`tests/headless.spec.ts`](tests/headless.spec.ts) | 執行流程、彙總、flush、Session 沿用與退出對映 |
| [`tests/json-stream.spec.ts`](tests/json-stream.spec.ts) | 投影順序、提交點發射、限長與釋放 |
| [`tests/startup.spec.ts`](tests/startup.spec.ts) | 在真實 Loader 樹上的命令列解析 |

### 不變式歸屬

不釋出不變式伴生入口，因為 runner 的可觀察約定（stdout 的最終文字、按輪次結束原因決定的結束代碼）是程序級的、由啟動器 e2e 負責；外掛不註冊任何內容，樹內也沒有任何可變關係可審計。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當你想深入瞭解共享核心、同級 GUI 或命令列交接時，閱讀以下頁面。

- [組合包索引](../README.zh.md)——基於同一核心建置的表層。
- [dsh-base](../base/README.zh.md)——headless 執行其上的共享核心。
- [dsh-web-app](../web-app/README.zh.md)——用於多輪工作的同級互動式瀏覽器入口。
- [dsh-cmdline](../../boot/cmdline/README.zh.md)——啟動器如何把命令列交給應用。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-headless)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為 runner 把任務作為普通使用者訊息提交，提示詞與工具由組合出的 base 與 headless 行提供。

#### KV Cache 影響

runner 不向請求字首新增任何內容；它只是驅動組合出的設定樹處理一條使用者訊息。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制告訴你 headless 何時不適用、它需要 `dsh` 啟動器提供什麼。它們是目前包約束，不是通用的 CLI（命令列介面）對比或任務積壓。

- **每次執行一個任務**——任務得到回答後程序即退出；沒有互動式後續，因此多步工作請拆成多次執行。
- **透過 `dsh` 啟動器執行**——以其他方式啟動 headless profile 會在啟動時失敗，因為只有啟動器能請求程序退出。
- **首個 token 前沒有心跳**——預設模式下，提供者發出第一個非空推理增量前，stderr 保持靜默；延遲首個 token 的提供者不會更早給出進度訊號。
- **推理進入 stderr 日誌**——預設模式下，重定向與監督程序可能保留顯著更多且可能敏感的模型輸出；需要時應把 stderr 路由到受控位置。
- **預設 stdout 只承載最終答案**——沒有 assistant 訊息的執行向 stdout 列印空行並以 1 退出；中間工具輸出不會列印，除非顯式啟用 `--json`。
- **沿用受 cwd、歸屬與 preset 限制**——`--session-id` 會拒絕記錄在其他工作目錄、未記錄工作目錄、屬於子 agent 或 fork 工作階段，或執行在本 profile 不組合的 agent preset 下的 Session、preset 記錄畸形的 Session，並要求已組合的 Session 查詢與持久化服務；本程序中已存活的身份同樣會被拒絕，因為 runner 無法對它取得獨佔的執行區間。
- **事件流是投影而非日誌**——`--json` 除終止 `final` 外把每個字串與物件鍵限制在 8 KiB，並省略投影未建模的事件，因此它不是 Session 日誌的無損副本。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
