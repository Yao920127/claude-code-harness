---
description: "面向以子程序方式啟動 DeepSeek Harness 執行時、並透過 stdio JSON-RPC 驅動 agent（智慧代理）輪次的呼叫方的 TypeScript SDK 用戶端：DeepSeekHarness 執行 API 與低層 HarnessClient。"
kind: "package-library"
---

# @deepseek-ai/dsh-sdk-client

[English](README.md) | 中文

## 概述

`dsh-sdk-client` 讓 TypeScript 程式透過 stdio JSON-RPC 啟動並驅動完整的 DeepSeek Harness 執行時。使用 `DeepSeekHarness` 可開啟工作階段、傳送文字或影象提示詞、收集事件與通知流，並在執行時進入 idle 後取得最後提交的助手回應；使用 `HarnessClient` 可直接傳送協定請求和訂閱通知。呼叫方可以提供 `dshBin`；否則用戶端解析同版本的 `@deepseek-ai/dsh` 可執行檔案。用戶端跨多次執行持有子程序，公開型別化的傳輸與協定錯誤，並在 `close()` 或 `await using` 時回收程序。它適用於呼叫方能夠選擇執行時 profile 和啟動設定的情境。

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

當 TypeScript 程式碼需要從另一程序驅動完整 Harness 執行時、且你能顯式指名執行時可執行檔案時，使用本用戶端。常用路徑極簡：用啟動規格建構 `DeepSeekHarness`，執行提示詞，然後關閉它，使子程序總能被回收。

### 用 DeepSeekHarness 執行 agent 輪次

```ts
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'

await using harness = new DeepSeekHarness({
  profile: 'sdk',
  patches: ['./automation.cordis.yml'],
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  reasoningEffort: ReasoningEffortId('max'),
  maxTokens: 49_152,
})
const result = await harness.run('say hi')
console.log(result.finalResponse)
```

子程序在首次使用時惰性啟動，並在多次 `run()` 呼叫之間持續歸實例所有；請呼叫 `close()`（或使用 `await using`），子程序才總能被回收。`start()` 會記憶化有界的 `initialize` 握手，其中包含工作區 cwd、提供者／模型路由、可選且由介面卡持有的 `reasoningEffort`，以及可選的正整數 `maxTokens` 輸出上限。伺服器會在接受提示詞前驗證該確切路由；省略推理強度時保留模型自身的預設值。`initializeTimeoutMs` 預設 10 秒，診斷會寫明所選 profile 並附帶保留的 stderr 尾部。`run(input, { sessionId?, onNotification? })` 接受文字或 `SdkPromptContentBlock[]`；內聯柵格影象塊攜帶規範 base64 與 `mimeType`，並在執行時內變成持久附件。該呼叫擁有一個活動區間：它將提示詞排入佇列，等待其訊息 id 出現在持久入隊回執中，然後持續收集到整個 agent 下一次進入 `idle`。它返回 `RunResult { sessionId, finalResponse, events, notifications }`，其中 `finalResponse` 是該區間內根工作階段最後提交的助手文字——並非因果上歸屬於該提示詞的回應，因為 steering（中途引導）、注入的上下文和其他排隊工作都可能在 idle 前參與其中。`session(id?)` 開啟具名或全新的工作階段控制代碼。握手失敗且清理成功時，實例會換入全新用戶端，使後續呼叫用新程序重試，直到終結性的 `close()`；如果初始化和清理均失敗，`start()` 會返回保留兩個原因的有序 `AggregateError`，並繼續保留失敗的用戶端，避免在原程序退出尚未得到證明時啟動另一個程序。`maxTokens` 限制每個根 agent 請求的輸出量，並由程序內後代繼承；壓縮（compaction）外掛單獨持有摘要上限。

### 用 HarnessClient 做低層控制

`HarnessClient` 是執行 API 之下的協定用戶端：顯式 `start()`、`initialize()`、`prompt()`、`request()` 與 `close()`，外加通知訂閱。`prompt()` 在執行時接受排隊訊息後立即返回該訊息的 id，絕不等待 agent 活動。`subscribe(filter?)` 返回 `NotificationSubscription`（可等待的 `next()`、非阻塞 `tryNext()`、非同步迭代）；`subscribeSessionTree(id)` 把範圍限定到一個工作階段及從 `subagent.started` 血緣邊發現的後代——執行時對上下文內每個工作階段都發通知，範圍限定在用戶端完成，與 Python SDK 完全一致。

本用戶端為每種失敗模式匯出型別化錯誤：`JsonRpcResponseError`（協定錯誤回應，保留 code 與 data）、`RequestTimeoutError`（設定的時限已到）、`SdkProtocolError`（回應超出文件化協定）、`TransportClosedError`（執行時已消失——訊息攜帶結束代碼與有界 stderr 尾部）。`close()` 先請求協定 `shutdown`（受 `shutdownTimeoutMs` 約束，預設 1000 毫秒），然後走 stdin-EOF → SIGTERM → SIGKILL 階梯直到程序退出；冪等，已關閉的用戶端拒絕複用。`HarnessClientOptions.env` 給定時整體替換子程序環境（`undefined` 原樣繼承父程序環境）；憑證策略歸呼叫方——`dsh-subprocess` 的 `scrubbedParentEnv` 是面向隔離啟動的共享擦除基底。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋用戶端背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

用戶端是同一協定上的兩層：`DeepSeekHarness`（自有執行）疊加在 `HarnessClient`（協定用戶端）之上，與 Python SDK 的分層一致。它執行在任何 harness 上下文之外，因此直接 spawn 執行時而非經由 `dsh-subprocess` 服務——即該 seam 記錄的 SDK 託管傳輸例外——其關閉階梯也位於本包。執行時對上下文內每個工作階段都發通知；工作階段樹範圍限定是用戶端對 `subagent.started` 血緣邊的過濾。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/api.ts`](src/api.ts) | `DeepSeekHarness` + `HarnessSession`：自有執行、從回執到 idle 的收集、`finalResponse` |
| [`src/client.ts`](src/client.ts) | `HarnessClient`：spawn、握手、請求、訂閱扇出、型別化錯誤 |
| [`src/dispose.ts`](src/dispose.ts) | 私有關閉階梯：stdin EOF → SIGTERM → SIGKILL 直到真正退出 |
| [`src/types.ts`](src/types.ts) | 啟動與超時選項、通知結構、`RunResult` |
| [`src/index.ts`](src/index.ts) | 消費方介面：兩層用戶端與面向呼叫方的型別 |
| — | 不釋出執行時不變式伴生入口；本用戶端庫執行在任何 harness 上下文之外（其對端是獨立執行時程序）；執行時自身的包負責維護事件流關係。 |

### 自有活動流程

一次執行會訂閱工作階段樹、把提示詞排入佇列，等待提示詞的訊息 id 出現在持久的 `agent/inbox/spliced` 回執中，然後持續收集通知，直到整個 agent 報告 `idle`。`finalResponse` 從收集到的事件中最後一條 `assistant/message` 派生。傳輸丟失、超時與協定違例會使本次執行被拒絕；模型結果仍可在事件流中觀察，但不會歸屬於某一輸入。

### 錯誤與關閉

每種失敗模式都對映到一個匯出的錯誤類——協定錯誤回應、請求時限已到、回應超出文件化協定、執行時死亡——呼叫方可以按失敗型別分支處理；這四個類從 [src/index.ts](src/index.ts) 匯出。關閉採用私有的冪等階梯（stdin EOF → SIGTERM → SIGKILL），位於 [src/dispose.ts](src/dispose.ts)，只在程序真正退出時結束。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當用戶端約定不夠用時閱讀以下頁面。它們從協定格式進入服務外掛與使用本用戶端的應用。

- [SDK 協定格式](../protocol/README.zh.md)——本用戶端使用的 JSON-RPC 方法與載荷結構。
- [JSON-RPC 服務外掛](../server/README.zh.md)——服務本用戶端的執行時外掛。
- [Python SDK](../../../python/README.zh.md) — 共享同一執行時對端與協定的設計孿生。
- [SDK subagent 後端](../../subagent/subagent-dsh-sdk/README.zh.md) — harness 內部消費本用戶端的例子。
- [SDK 應用組合包](../../bundle/sdk-app/README.zh.md) — 本用戶端啟動的 `dsh --profile sdk` 執行時應用。

-----

<a id="model-experience"></a>
## 模型體驗

無，因為這是用戶端程序庫；模型可見行為存在於所 spawn 執行時組合的外掛中。

#### KV Cache 影響

用戶端程序中無影響。子程序的 profile、patch、提供者、模型與歷史決定快取複用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本用戶端何時不合適或需要特別注意。它們是目前包約束，不是與其他 SDK 用戶端的對比或任務積壓。

- **無捆綁執行時解析**——用戶端解析同版本 `@deepseek-ai/dsh` 包（或呼叫方提供的 `dshBin`）；打包可執行檔案的發現留在 Python 側，直到出現 TypeScript 發行版消費方。
- **無輪次中取消**——協定層沒有提示詞取消方法；放棄輪次意味著關閉執行時（見[協定限制](../protocol/README.zh.md#known-limitations-and-deferred-work)）。
- **沒有逐提示詞結果**——低層 `prompt()` 只返回入隊回執；高層 `run()` 負責從回執到 idle 的收集，放棄該過程意味著關閉執行時。
- **用戶端→伺服器端通知與伺服器端→用戶端請求**在協定兩端都未實作；傳輸層為未來審批流程保留了承載能力。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性——已交付的行為與限制見上文各節與程式碼。啟動規格有意保持完全顯式：在出現 TypeScript 發行版消費方之前，不計劃做捆綁執行時解析。請讓關閉階梯與錯誤詞彙與驅動同一執行時的 Python 用戶端保持同步。沒有記錄其他未解決的開放設計問題。

</details>
