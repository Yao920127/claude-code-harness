---
description: "共享程序內 subagent 執行驅動器，供維護者與後端作者理解或擴充功能 spawn 與 fork 的執行生命週期。"
kind: "package-library"
---

# @deepseek-ai/dsh-subagent-in-process-driver

[English](README.md) | 中文

## 概述

`dsh-subagent-in-process-driver` 是兩個程序內 subagent 後端共用的執行驅動器：它透過主機的 agent（智慧代理）工廠建立一個子 agent，應用按子 agent 的定製，把一項任務驅動到完成，並以單一完全停穩的 dispose（資源釋放）路徑返回子 agent 自身的最終輸出。spawn 呼叫它時不傳入工作階段初始內容；fork 呼叫它時傳入父級已完成輪次的字首。它是庫而非獨立功能：提供者後端呼叫 `startInProcessRun`，組合中沒有任何東西設定它。閱讀本頁可理解兩個程序內後端共享的執行生命週期。

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

你透過提供者後端而非組合到達本包：`dsh-subagent-spawn-in-process` 與 `dsh-subagent-fork-in-process` 各自呼叫 `startInProcessRun(request, options)` 並擁有其外圍的一切。本頁記錄兩者共享的生命週期，使你讀懂一個後端的行為後即可推斷另一個。

### 一次執行提供什麼

一次呼叫啟動並驅動一個一次性子 agent。呼叫兌現意味著子 agent 已釋出到 `ctx.agents`，呼叫方擁有返回的執行；啟動被拒絕時，未釋出的建立已經完全停穩，因此不會有建立到一半的子 agent 存活。執行暴露子 agent 的 id 與線上 agent、一個 `result` promise，以及一個 `dispose()`——它會停止迴圈、移除 agent 與工作階段，並撤銷作用域內的註冊。

### 唯一輸入

`InProcessRunOptions` 的形態為 `{ seed?: SessionEvent[] }`——fork 的已配平父級事件初始內容。spawn 省略該值；fork 提供已完成輪次字首並記錄其長度，使結果讀取器不會把作為初始內容的父級訊息誤認為子 agent 輸出。

### 子 agent 獲得什麼

子 agent 獲得父級的工作目錄／工作階段譜系，除非 `request.agentOptions` 覆蓋，否則繼承父級的提供者、模型、推理強度與輸出 token 上限。它獲得全新的扁平註冊作用域：父級工具限制與權限不會被匯入。一次執行會把父級顯式的沙箱覆蓋項與 `'never'` 審批釘定帶入子 agent，並在子 agent 的初始輪次內追加一份每次執行的描述符。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋驅動器的生命週期約定與結構化輸出執行時；可觀察行為已在[使用本包](#use-this-package)中說明。

### 啟動約定

驅動器按以下順序執行：

1. 驗證父級深度與可選的絕對 `maxDepth`，然後把子級深度推導為父級深度加一，並持久化到子級工作階段 header。
2. 透過主機 agent 工廠建立子 agent，並把呼叫方必需的訊號傳入建立事務。
3. 在該事務未釋出的設定視窗內，安裝請求的 persona、工具限制與結構化輸出執行時。
4. 釋出子 agent，保留返回的控制代碼，並驅動一項任務。
5. 從完整的自有執行中讀取子 agent 自身的輸出——最後一條非空 assistant 訊息，若無則取其累積的 assistant 文字——以及最終持久化的輪次原因，並排除任何 fork 初始內容。

### 取消與所有權

必需的請求訊號同時覆蓋啟動階段與即時執行。釋出前，建立事務會觀察它、復原並拒絕；驅動器在釋出後再檢查一次以消除交接競態，然後安裝最小化的即時執行監聽器。兌現後，呼叫方擁有該執行：提供者外掛解除安裝不會撤銷它；`dispose()` 會移除中止監聽器、記錄取消，並委託給控制代碼經記憶化的完全停穩事務——後者停止迴圈、移除 agent 與工作階段，並撤銷作用域內的註冊。取消流程會接管所有尚未完成的進行中結果，並將其報告為 `aborted`；已經完成的輪次仍保持完成狀態。

### 結構化輸出

`attachStructuredRuntime(childCtx, schema)` 會在子 agent 作用域中安裝完整約定：`structured_output` 工具按請求的 schema 驗證並暫存模型值；位於末尾、順序為 9900 的 first-party 系統提示詞段告訴子 agent 該工具呼叫就是終態答案；`tools/result` 觀察器只在該次執行的權威最終工具結果成功後提交暫存值，包括 PTC mode 子分派外層的 `run_code` 結果；單調工具防護會在捕捉後阻止後續呼叫。正常結束卻始終未提交必需值的輪次會報告 `error`；驅動器不會重新提示。所有註冊都附著於子 agent fiber，並隨其一同消失。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 執行驅動器：建立、單輪驅動、結果讀取、dispose |
| [`src/structured.ts`](src/structured.ts) | 結構化輸出執行時：捕捉工具、提示詞段、防護、提交 |
| — | 不釋出執行時不變式伴生入口；本包沒有獨立事件序列或可變資料關係，相關約定在所屬 seam 強制執行。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從共享 subagent 模型進入建置於本驅動器之上的後端，以及委派策略決策。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——啟動請求、結果、提供者約定與程序內深度和初始內容。
- [dsh-subagent-spawn-in-process](../subagent-spawn-in-process/README.zh.md)——建置於本驅動器之上的全新子 agent 後端。
- [dsh-subagent-fork-in-process](../subagent-fork-in-process/README.zh.md)——建置於本驅動器之上的帶初始內容的子 agent 後端。
- [委派策略決策](../../../.agents/notes/implemented/feature/2026-07-25-subagent-policy-inheritance.zh.md)——父級沙箱與審批策略如何到達子 agent。

-----

<a id="model-experience"></a>
## 模型體驗

### 子 agent 請求

#### 模型看到什麼

共享驅動器把任務逐字作為子 agent 的使用者訊息傳送；若有請求，還會在未釋出子 agent 的全新作用域中遮蔽 persona，並限制全域工具 schema、查詢、執行與 PTC mode SDK 繫結。父級限制不會被繼承。工具指導外掛可以使用組裝 scope 省略不可用工具的指導；驅動器不會改寫任意靜態段落。spawn 不提供歷史；fork 提供其已配平的初始內容。

#### Token 影響

子 agent 輸入與父級隔離，並隨子 agent 自身的步驟增長。persona 會改變重複提示詞文字；過濾會改變 schema 或生成 SDK 的成本，使用 scope 的指導內容也會隨可見能力變化。

#### KV Cache 影響

與父級請求快取相互獨立。子 agent 後續歷史僅追加，而 persona、工具過濾、生成 SDK、提供者或模型變化會建立不同的子 agent 字首。

### 結構化輸出系統提示詞、schema 與結果

#### 模型看到什麼

結構化執行會新增下方的結構化輸出指令，並新增子 agent 作用域的 `structured_output` 定義，其參數使用請求的 schema，精確描述為 `Report your final structured result. Call this exactly once, when your answer is complete; the arguments must match this tool's parameter schema exactly.` 該僅執行時存在的定義不在已生成並隨產品釋出的[工具包索引](../../../docs/tool-catalog.zh.md#tool-package-map)中。其規範確認值是 `{ recorded: true }`，渲染為 `Structured output recorded.`；後續呼叫會變為 ``Error: structured output already recorded: the run is complete, so `<tool>` is not executed``。

##### 結構化輸出指令

```markdown
When you have your final answer, you MUST report it by calling the `structured_output` tool with arguments matching its parameter schema exactly. Do not finish with a plain text answer: only the tool call counts as your result.
```

#### Token 影響

固定指令與能力產生的 token 僅由該子 agent 承擔。結果文字進入子 agent 歷史，而只有捕捉的值會成為父級結果。

#### KV Cache 影響

只要結構化輸出指令與 schema 不變，子 agent 內部的字首就保持穩定。更改 schema 或能力可能從該早期片段開始使子 agent 快取失效；結果會分別追加到子 agent 與父級歷史中。

### 父級啟動錯誤（間接）

#### 模型看到什麼

透過 `dsh-tool-subagent`，無效深度狀態會精確變為 `Error: agent subagentDepth must be a non-negative safe integer`、`Error: subagent child depth exceeds the safe-integer range` 或 `Error: subagent depth <attempted> exceeds maxDepth <max>`。釋出前取消的中止原因會透過註冊表的 `Error: <message>` 包裝傳遞。

#### Token 影響

啟動成功時為零 token；只有失敗的父級工具呼叫會保留這段文字。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

### 父級結果（間接）

#### 模型看到什麼

驅動器只提取子 agent 自身最後的 assistant 輸出或捕捉的結構化值；作為初始內容的父級訊息與子 agent 中間工作不會成為結果。

#### Token 影響

父級透過消費方接收一個依賴資料的結果；其他所有子 agent token 都留在子 agent 工作階段中。

#### KV Cache 影響

僅追加；新增可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明程序內一次性執行不能做什麼；它們是目前包約束。

- **執行不公開 `sendMessage`/`resume`**——程序內一次性執行不具備這些可選執行時能力。
- **結構化捕捉只接受 `defineTool` schema 子集**——不支援的 JSON Schema 建構會在子 agent 建立前失敗；需要更廣 schema 詞彙的提供者必須採用不同的執行時。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
