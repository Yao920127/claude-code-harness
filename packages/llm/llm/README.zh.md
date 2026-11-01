---
description: "面向使用者與維護者的提供者無關模型呼叫服務說明：流式發起請求、註冊提供者介面卡或解析模型中繼資料。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm

[English](README.md) | 中文

## 概述

使用 `@deepseek-ai/dsh-llm` 可透過已設定的提供者介面卡流式呼叫模型、發現模型，並解析模型能力與呼叫預設值。呼叫方必須確保所有模型可見輸入都可以從工作階段日誌重建。Loop 建置的請求以深度凍結狀態到達，因此擴充功能與介面卡不能改寫。每個流只嘗試呼叫提供者一次：提供者特定的轉換由對應介面卡完成，可選包 `@deepseek-ai/dsh-llm-retry` 負責重跑失敗的請求。流始終以終止結果結束，因此呼叫方可以一致地處理成功、失敗與取消。

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

`listModels` 描述目錄驅動介面提供的模型。核心解析與流式呼叫仍可接受未列出的 ID。GUI 的模型選擇與提交要求模型出現在目錄中；供 GUI 使用的介面卡必須實作 `listModels`，公佈其可用模型。基類實作返回空列表，因此不向 GUI 提供模型。

任何呼叫模型提供者的組合——agent loop（智慧代理迴圈）、工作階段標題生成器、壓縮（compaction）摘要器——都會透過本服務流式發起請求。與至少一個提供者介面卡一起掛載它；服務本身沒有任何設定，也不包含提供者協定程式碼。

### 何時選擇

當外掛或組合需要呼叫模型時選擇本包：它是進入提供者介面卡的唯一受支援路徑，並在 loop、工作階段日誌與每個消費方之間保持同一套詞彙。當需要提供者特定的協定行為（那屬於 `dsh-llm-deepseek` 或 `dsh-llm-pi-ai` 之類的介面卡）或重試執行（那屬於 `dsh-llm-retry`）時，不要選擇它。

### 最小組合

掛載服務與至少一個介面卡，然後在每個請求中按名稱選擇提供者：

```yaml
- name: '@deepseek-ai/dsh-llm'
- name: '@deepseek-ai/dsh-llm-deepseek-api-key'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
```

流會返回 token 級分片，並始終以一個終止 `finish` 分片結束。`BlockAssembler` 把分片組裝為內容塊與訊息；`AssistantStreamAccumulator` 在緊湊表示中保留其精確時間戳與 token 邊界，loop 再把它嵌入一個持久 attempt settlement：

```text
for await (const chunk of ctx.llm.stream({
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
})) {
  // chunks: block-start, text-delta, ..., usage, finish
}
```

掛載成功後，`ctx.llm.listProviders()` 會按註冊順序報告已註冊路由。

`GenerateOptions.messages` 接受持久 `Message` 值和僅供請求使用的 `RequestUserInput` 值。僅供請求使用的輸入包含 user-role 內容，不含 `id` 或 `source`；Session 寫入和 Agent 投遞仍然要求持久訊息。呼叫方必須在流結束前保持輔助輸入不變。會記錄完整請求的呼叫方（例如工作階段標題生成）必須使用持久訊息。

### 你可以做什麼

- **流式發起一次模型呼叫**——`ctx.llm.stream(options)` 為任何已註冊提供者與模型產出原始分片（token 級增量）；消費方用 `BlockAssembler` 組裝。
- **註冊提供者介面卡**——一個介面卡擁有一個或多個提供者路由，其註冊會捕捉該路由的重試策略；重複註冊同一路由會以 `DUPLICATE_ADAPTER` 失敗。
- **透過設定暴露並啟用提供者**——介面卡宣告可設定提供者路由與 settings namespace，設定介面因此可以啟用休眠提供者並編輯連線資訊，無需重新啟動。`LlmConfigurableProvider.error` 報告供修復的設定診斷；未受影響的模型仍可提供服務。
- **發現與解析模型**——列出介面卡公佈的模型、詢問端點它提供哪些模型（候選攜帶可選的 `inputModalities`；預設表示未知），並解析某個精確模型的上下文視窗、輸出預設值、推理（reasoning）強度、輸入模態與系統提示詞更新模式：當模型把任意位置最新的 `system` 訊息讀作有效系統提示詞時，`LlmResolvedModelInfo.systemPromptUpdate` 為 `'in-history'`；只讀取開頭 system 訊息時該欄位缺失；`normalizeModelInfo` 以 `INVALID_MODEL_INFO` 拒絕任何其他值。
- **驗證呼叫設定**——顯式或設定的推理強度會在任何提供者 I/O 之前對照精確模型驗證；請求省略輸出上限時，會填入介面卡設定的輸出上限。
- **不展開即讀取內嵌 Assistant 流**——`assistantStreamFirstTokenTime`（首 token）、`assistantStreamHasVisibleContent`（任一可見內容）與 `assistantStreamHasVisibleText`（任一可見文字）透過可提前退出的掃描直接從緊湊記錄得出結果；`lastAssistantStreamChunk` 反向掃描到某一型別的最後一個原始 chunk，`assistantStreamChunks` 與 `joinAssistantStreamText` 掃描整個流，`assembleAssistantStream` 向 `BlockAssembler` 每個 run 喂一段拼接 delta，blocks／usage／replayState 與逐成員展開相同。`runFirstTokenTime` 與 `runFirstVisibleTime` 對單個打包 run 做提前退出掃描，`isTokenDelta`、`isVisibleChunk` 與 `chunkHasVisibleText` 定義單個 chunk 的 token 與可見性規則。`expandAssistantStream` 仍是持久邊界讀取記錄的驗證路徑；它不被記憶化，因為保留的展開在事件生命週期內約花費緊湊流的十倍記憶體。

### 失敗與恢復

每個流都恰好以一個終止 `finish` 分片結束：失敗為 `{ kind: 'error', failure }`，取消為 `{ kind: 'aborted', failure }`。失敗攜帶穩定 code，如 `NO_ADAPTER`、`MISSING_CREDENTIAL`、`AUTH`、`RATE_LIMIT` 與 `CONTEXT_WINDOW_EXCEEDED`；消費方依據 code 路由，絕不解析訊息文字。`QUOTA` 表示提供者中立的額度耗盡，`ACCOUNT_QUOTA` 專用於目前產品能夠充值的第一方帳號餘額不足。點名未註冊提供者的請求會以 `NO_ADAPTER` 失敗，格式錯誤的憑證會以 `INVALID_CREDENTIAL` 失敗，而不是表現為不透明的 fetch 錯誤。本服務從不自行重跑請求：重試是 `dsh-llm-retry` 在 agent 失敗步驟擴充功能點上的職責。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本服務基於一項職責分離原則：**邏輯約定是提供者無關的，介面卡擁有協定。** 它一次性地定義規範訊息、內容塊與流式分片詞彙，每個提供者介面卡只把自己的協定格式翻譯為該詞彙。註冊表是拓撲的擁有者——介面卡路由、可設定提供者條目與發現 offer 都在這裡註冊，並隨其 fiber 一起 dispose（資源釋放）——而 agent loop 的請求始終是工作階段日誌的純函式：loop 建置的請求以深度凍結狀態到達，因此監聽器與介面卡只能讀取，絕不能改寫。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `LlmRuntime` 服務：介面卡註冊表、可設定提供者目錄、模型發現、呼叫準備與流式邊界 |
| [`src/types.ts`](src/types.ts) | `StreamChunk` 協定、內容塊對映、結束原因與共享詞彙 |
| [`src/message.ts`](src/message.ts) | 投遞、歷史與請求共享的不可變訊息建構函式 |
| [`src/assembler.ts`](src/assembler.ts) | `BlockAssembler`：分片到塊的增量組裝 |
| [`src/assistant-stream.ts`](src/assistant-stream.ts) | 帶時間資訊的緊湊 Assistant 流累積、嚴格驗證、精確展開與記錄級讀取器 |
| [`src/call-config.ts`](src/call-config.ts) | 呼叫設定驗證、介面卡預設值填入與請求凍結 |
| [`src/retry-policy.ts`](src/retry-policy.ts) | 提供者自有重試策略解析（normal 與 always 模式） |
| [`src/error.ts`](src/error.ts) | `HarnessError`/`LlmError` 分類體系與提供者無關失敗 code |
| [`src/content.ts`](src/content.ts) | 共享檔案與圖片輔助函式：內容遍歷、檔案投影、圖片解除安裝計數與已解除安裝圖片投影 |
| [`src/api-key.ts`](src/api-key.ts) | 每個介面卡共享的憑證格式驗證 |
| [`src/adapter-failure.ts`](src/adapter-failure.ts) | 把失敗歸一化為終止 finish 分片 |

### 主流程

請求會對照其精確模型的能力驗證，包括上下文視窗、輸出預設值、推理強度、輸入模態與 `systemPromptUpdate` 模式，並填入任何介面卡設定的預設值。執行時保留已凍結輸入的凍結狀態；手動建置請求的呼叫方負責保證輸入不可變。`prepareCall()` 把這些事實、分離的上下文與重試策略繫結到執行最終分發的精確介面卡代次，因此 HMR（熱模組替換）或動態設定無法把一個代次的圖片能力與另一代次的端點混用。支援圖片的介面卡把持久引用投影為路由專用請求版本；`resolveImageAttachmentAccess()` 會單獨把附件提供者的可選主機物件對映進目前工具執行世界，而不改變請求圖片或其 `variantId`。純文字路由接收確定性的逐圖片預留位置，包括 tool-role 結果圖片，而不會改寫僅追加工作階段歷史。持久 `FileBlock` 引用永遠不會到達任何介面卡：請求組裝把每個引用（包括 tool-role 結果中的出現）替換為確定性控制代碼文字，指出檔案與其只讀儲存路徑，路徑經由掛載的附件與檔案系統提供者解析。`ctx.llm.fileRequestText(ref)` 向請求計量公開相同的同步投影。派生後帶有 `offloaded: true` 的圖片出現位置，經 `projectOffloadedImages()` 以佔位文字到達每條路由。支援圖片的路由在保留的出現位置按精確位元組超過其 `LlmImageRequestBudget` 時，以 `IMAGE_OFFLOAD_REQUIRED` 失敗並說明還需省略多少最老的出現位置（`requiredImageOffload()`），絕不傳送未記錄的投影；`dsh-compaction-image-offload` 用一條 `image/offload` 事件記錄所選位置並重試。對視覺 token 收費的介面卡宣告按路由的 `imageRequestPricing`，`ctx.llm.imageRequestPricing(provider, model)` 為 token meter 同步解析它。分發經過 `llm/stream` waterfall（瀑布式事件），隨後分片以 token 級增量返回，每個介面卡結果都以唯一一個終止 `finish` 分片到達消費方。

檔案檢測在每次請求時讀取目前內容，包括 tool-role 結果內容，不快取訊息身份或凍結狀態。[檔案掃描決策](../../../.agents/notes/implemented/simplification/2026-09-07-file-content-scan.zh.md)記錄了實測遍歷成本。

### 不變式

- **模型可見 ⟺ 已記錄**——呼叫方必須確保每個提供者請求中的模型可見輸入都可以從工作階段日誌重建；loop 建置的請求以深度凍結狀態到達，不可改寫。
- **回放狀態只在同一介面卡內流動**——僅當同一介面卡實例同時擁有歷史路由與目標路由時，assistant 回放狀態才會隨行；否則在分發前被丟棄。
- **已準備呼叫是一次性的**——已準備呼叫只能分發一次，且其呼叫設定欄位必須與準備好的設定一致。
- **圖片投影遵循捕捉的路由**——只有支援圖片的模型會把持久 `ImageBlock` 引用轉換為路由專用請求版本；純文字模型接收穩定預留位置。
- **檔案投影無條件進行**——沒有任何提供者會收到檔案位元組；每條路由對每個 `FileBlock` 都得到一行確定性控制代碼文字，模型在需要時用檔案工具讀取儲存的副本。
- **協定順序**——`usage` 先於 `finish`，工具參數保持原始 JSON 字串，終止 `finish` 之後不再有任何內容。
- **註冊表變更具有原子性**——路由與目錄註冊會在任何變動前整體驗證候選集合，因此被拒絕的變更會讓此前狀態繼續服務。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享型別逐步進入具體介面卡、重試執行器與計量服務。

- [LLM（大語言模型）流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——訊息與塊型別、緊湊的 Assistant 流記錄、`StreamChunk` 協定與介面卡約定。
- [llm-deepseek 介面卡](../llm-deepseek/README.zh.md)——DeepSeek Messages 直連實作。
- [llm-pi-ai 介面卡](../llm-pi-ai/README.zh.md)——基於 pi-ai 的多提供者實作。
- [llm-retry](../llm-retry/README.zh.md)——重跑失敗模型請求的重試執行器。
- [Token 計量](../token-meter/README.zh.md)——具備回放感知的請求與上下文壓力測量。
- [孿生 LLM 介面卡](../../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.zh.md)——為什麼 DeepSeek 路由交付兩個結構不同的介面卡。
- [LLM 流終止失敗](../../../.agents/notes/implemented/architecture/2026-07-29-terminal-llm-stream-failures.zh.md)——模型請求結果與外掛失敗之間的服務邊界。

-----

<a id="model-experience"></a>
## 模型體驗

沒有直接影響，因為 LLM 服務不新增內容；介面卡決定何時新增本包匯出的共享圖片描述符與逐圖片預留位置。

#### KV Cache 影響

推理強度的具體化會保留已組裝請求字首。圖片身份與請求預覽文字是確定性的，可選執行世界路徑則按請求解析；路徑變化或一次省略決策可能從該圖片起阻止複用。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本服務在哪裡停止、由其他包或未來工作接續。它們是目前包約束，不是任務積壓。

- **本服務不提供重試執行、快取或速率限制**——提供者註冊會儲存重試策略，但一次流仍是一次提供者嘗試；`@deepseek-ai/dsh-llm-retry` 在持久 agent 步驟邊界上執行該策略。
- **`GenerateOptions` 取樣只包含 `temperature`／`maxTokens`／`stop`**——沒有 `tool_choice`、`top_p` 或 penalty 欄位；有產生方落實時詞彙才會增長（見[已刪除惰性旋鈕](../../../.agents/notes/archived/simplification/2026-07-04-drop-inert-request-knobs.md)）。
- **變體通常要求實際產生方**——`prefill`、逐工具 `strict`、內容塊 `cache` 提示和 `agent` 訊息來源變體都沒有產生方（見 [Agent Note](../../../.agents/notes/archived/simplification/2026-07-04-prune-producerless-vocabulary-variants.md)）。
- **`BlockAssembler` 只處理核心塊型別**——外掛新增塊型別的流若從未由 `block-end` 關閉，`blocks()` 會丟擲異常。
- **`GenerateOptions.sessionId` 是本地宣告的品牌型別**——匯入 dsh-session 的 `SessionId` 會產生依賴迴圈。
- **工具更新需要工作階段歷史** — `GenerateOptions.tools` 包含目前有效定義。`toolHistory` 提供 `Session.toolHistory()` 派生的初始宣告及已解析歷史定義的新增記錄。介面卡分發時，`projectToolUpdates` 建構延遲宣告，並在 `in-history` 模式保留已移除定義；`addition-only` 省略已移除定義和移除訊息。不支援更新的路由接收有效工具，不攜帶 developer 訊息或 `deferLoading`。缺少歷史或請求字首遺漏已記錄更新時，退回為目前宣告且不傳送 developer 訊息。 顯式延遲載入的初始工具在首個保留的新增塊出現前保持延遲狀態；宣告延遲載入工具不會使其啟用。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是不具權威性的工作上下文：開放問題與尚未決定的探索方向。已交付的行為與既定理由以上文、包程式碼和相關 Agent Note 為準。

#### 開放事項

- `GenerateOptions.sessionId` 是本地宣告的品牌型別，因為匯入 dsh-session 的 `SessionId` 會造成依賴迴圈；未來擁有 id 的包可以消除該權宜之計。
- 推理強度識別符號是由介面卡定義的不透明字串，只對照各介面卡公佈集合解析；跨介面卡共享強度詞彙尚未決定。
- `llm/adapters-updated` 事件按設計不攜帶載荷；消費方重新讀取註冊表，而不是在事件中接收新拓撲。

</details>
