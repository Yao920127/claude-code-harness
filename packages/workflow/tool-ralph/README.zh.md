---
description: "面向模型的 ralph 工具：固定前臺 agent loop（智慧代理迴圈），讓全新 agent 圍繞一個不可變目標迭代，供選擇或設定此類迭代的使用者與維護者閱讀。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-ralph

[English](README.md) | 中文

## 概述

`ralph` 針對一個不可變目標執行由多個全新子 agent 組成的前臺序列，每個 Round 只接收上一份有界報告與共享工作區狀態。它會在 worker 報告完成或具體阻塞，或達到設定的 Round 上限時返回；這些報告不會得到獨立驗證。父級對話與先前子 agent 工作階段絕不會複製到新的 Round。僅當直接使用者明確要求 Ralph 式全新 agent 迭代時使用它；普通的長期工作請使用 goal 工具，有界委派請使用 subagent 或工作流。

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

`ralph` 工具執行固定的前臺迴圈：每個 Round 一個全新子 agent 在共享工作區中處理不可變目標，只有一份有界的結構化報告跨越 Round。僅當直接使用者明確要求 Ralph 迴圈或全新 agent 迭代執行時使用它。普通的長期同工作階段工作請使用 goal 工具；有界委派與扇出請使用普通 subagent 或 `workflow` 工具。

### 呼叫工具

模型提交 `{ objective, maxRounds? }`，呼叫會阻塞到整個執行結算。部署設定中的 `maxRounds` 既是預設值，也是呼叫覆蓋值的上限。終態結果為 `complete`、`blocked` 或 `budget-limited`，攜帶最後一份有界報告與已啟動的 Round 數量；普通子 agent 失敗會返回錯誤，其中標明失敗的 Round，並在存在時保留上一次成功交接。

### 每個 Round 看到什麼

每個子 agent 只接收不可變目標、目前 Round 及其上限、一條「共享工作區是權威狀態」指令與上一份結構化交接；父級對話與先前子 agent 工作階段絕不會作為種子。工作區是跨 Round 的長期記憶。報告攜帶狀態（`continue`、`complete` 或 `blocked`）、非空摘要、證據、後續步驟與阻塞文字；無效或過大的報告會使工作流失敗，而不會被截斷或誤認為上限耗盡。

### 設定

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `subagentProvider` | `spawn` | 每個 Round 使用的全新結構化輸出提供者。 |
| `maxRounds` | `256` | 一次 Ralph 執行的預設值和部署上限。 |
| `maxHandoffChars` | `16384` | 一份 Round 報告序列化後的最大字元數。 |
| `maxResultChars` | `16384` | 返回給父級的完整成功結果最大字元數。 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-ralph)是每個受支援欄位的窮盡式真源。設定的提供者必須存在、支援結構化輸出，並報告 `inheritsParentContext: false`；針對違反此要求的提供者發起呼叫時，會在任何 Round 開始前直接報錯。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋固定腳本設計以及驗證與生命週期機制；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

迴圈是部署方擁有的固定腳本：模型只提供資料，無法改變迴圈、提供者路由、schema 或交接驗證。該工具是基於 `ctx.workflowEngine` 與 `ctx.subagents` 的普通外掛——不會向 `agent-loop` 新增 Ralph 模式或全新 agent loop，同工作階段的 goal 領域也保持獨立。[Harness 層目標式執行 Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-harness-level-loop.zh.md)擁有策略與暫緩事項。

### 固定腳本與路由

設定的提供者以 `WorkflowStartRequest.subagentProvider` 傳遞，因此固定腳本無法檢查或更改路由，普通的模型編寫 `workflow` 工具也不會因此獲得提供者選擇器。解析後的 Round 上限以 `WorkflowStartRequest.maxTotalAgents` 傳遞，使固定迴圈與引擎的子 agent 總數後備上限協同；上限超過引擎部署上限時，引擎會在釋出執行前拒絕。

### 報告驗證

特定狀態的語義與序列化後的 `maxHandoffChars` 上限會在固定工作流內部及消費方邊界各驗證一次：繼續報告需要後續步驟與空阻塞，完成報告需要證據且沒有後續步驟，阻塞報告需要具體阻塞。無效、缺失或過大的報告會使工作流失敗。

### 生命週期與取消

呼叫方 agent 是每個全新子 agent 的父級，因此會保留 cwd 與譜系，但不會複製其對話。`exec.signal` 進入工作流引擎，同時也橋接到 `run.cancel()`，以便不依賴具體實作。工具等待 `run.result` 並在 `finally` 中呼叫 `run.dispose()`，因此被取消的父級步驟會等到程序與子 agent 清理完成後才返回。PTC 引擎不設整體工作流經過時間截止；呼叫方取消仍然生效。

### 渲染意圖

待處理呼叫使用 `generic` 卡片，標題為 `ralph`，不可變目標作為其 `rawInput`；結果繼續使用 generic 卡片。兩個呈現函式都只依賴工具參數與已結算的工具包絡，完成與阻塞標籤會說明結果由 worker 報告，而非獨立認證。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：固定腳本、提供者路由、報告驗證、工具註冊 |
| — | 不釋出執行時不變式伴生入口；該面向模型的編排介面卡不擁有獨立事件流；工作流與 subagent 歸屬方會驗證該介面卡啟動的執行及其子 agent 生命週期。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當工具級契約不夠用時閱讀以下頁面。它們從共享工作流模型逐步進入引擎、subagent seam 與相鄰的 goal 領域。

- [工作流子系統](../../../docs/subsystems/workflow.zh.md)——固定迴圈背後的 seam 約定。
- [工作流 seam](../workflow/README.zh.md)——執行與結果詞彙。
- [PTC 工作流引擎](../workflow-ptc/README.zh.md)——執行固定腳本的引擎。
- [subagent seam](../../subagent/subagent/README.zh.md)——全新子 agent 的提供者約定。
- [goal 組](../../goal/goal/README.zh.md)——面向普通長期目標的同工作階段 goal 工具。
- [Harness 層目標式執行 Agent Note](../../../.agents/notes/implemented/feature/2026-07-16-harness-level-loop.zh.md)——策略、提供者要求與暫緩事項。

-----

<a id="model-experience"></a>
## 模型體驗

### 系統提示詞

#### 模型看到什麼

在該外掛的註冊作用域內，每個父級請求都會收到下方固定的路由指導。

##### Ralph 指導

```markdown
Use the ralph tool ONLY when the direct human explicitly asks for a Ralph loop or fresh-agent iterative execution. Each Ralph round starts a fresh child with no conversation seed and uses the shared workspace as durable memory. Completion and blockers are worker reports, not independent evaluation. Use same-session goal tools for ordinary long-running objectives, and plain subagents or workflows for bounded delegation and fan-out.
```

#### Token 影響

外掛啟用期間，每個請求都會產生少量固定的指導 token 開銷。

#### KV Cache 影響

只要外掛作用域與指導文字不變，字首就保持穩定。啟用或 dispose（資源釋放）可能會使從該提示詞段起的快取複用失效。

### 工具 schema

#### 模型看到什麼

已生成的 [`ralph` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-ralph) 公開一個必填 `objective` 字串與一個可選 `maxRounds` 數字。提供者選擇、交接大小、報告 schema、工作流腳本與編排行為均由部署側控制，不在呼叫 schema 中。

#### Token 影響

工具可見時，每個請求都會產生少量固定的 schema token 開銷。

#### KV Cache 影響

只要定義與可見性不變，字首就保持穩定。

### 子 agent 請求與父級結果

#### 模型看到什麼

每個子 agent 都會看到獨立的固定 Round 提示詞與結構化輸出捕捉約定。父級只看到原始呼叫與一個終態結果，其中包含 worker 報告的狀態、Round 數量與美化列印的最終報告；中間子 agent 訊息與報告不會進入父級對話。普通子 agent 失敗時改為產生錯誤，其中包含對應 Round 編號；從第二個 Round 起，還會包含上一次成功交接。

#### Token 影響

每個 Round 都會支付全新子 agent 上下文的成本。`maxHandoffChars` 限制跨 Round 狀態，`maxResultChars` 獨立限制完整的父級成功文字；子 agent 工作留在父級上下文之外。

#### KV Cache 影響

每個全新子 agent 都有獨立的請求快取。父級結果追加在可複用請求字首之後。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該工具尚未支援什麼。它們是目前約束，不是任務積壓。

- **完成由 worker 自行宣告**——沒有獨立評估器或驗證器判斷目標是否完成；評估器策略與評估器驅動的延續均暫緩。
- **僅支援前臺**——沒有 job id、後臺收集、程序恢復檢查點、排程器或基於掛鐘時間的啟動策略。
- **工作區是唯一的跨 Round 長期記憶**——一份有界報告作為顯式交接，每個子 agent 結束後，未提交的對話推理都會消失。
- **一個 Round 對應一個全新子 agent**——Round 內沒有扇出、模型或提供者切換、fork 上下文或由模型呼叫選擇的提供者。
- **普通子 agent 失敗會終止執行**——固定腳本報告失敗的 Round 與上一次成功交接，但不會重試；致命的工作流基礎設施失敗可能在該狀態返回前結束。
- **聚合工作量僅受 Round 數量限制**——token、價格與耗時預算均暫緩。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：尚未決定的開放方向。它明確不具權威性——已交付的行為、限制與既定理由以上文、包程式碼與相關 Agent Note 為準。

開放方向：帶評估器驅動延續的獨立評估器；Round 內扇出與提供者選擇；以及 Round 上限之外的 token、價格與耗時預算。

</details>
