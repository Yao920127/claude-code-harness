---
description: "面向使用者與維護者的具備回放感知的 token 與上下文壓力計量說明：評估提示詞規模或建置壓縮（compaction）與佔用顯示。"
kind: "package-reference"
---

# @deepseek-ai/dsh-token-meter

[English](README.md) | 中文

## 概述

使用 `ctx.tokenMeter` 估算工作階段目前的請求與上下文壓力，或為單條訊息計價。測量會回放持久工作階段日誌，結果確定且不進行模型呼叫，因此壓縮、佔用顯示與遙測可以共享同一結果。工作階段投影可用時，消費方可以讀取 `tokenUsage`、`contextPressure` 與 `contextBreakdown`；文字和沒有圖片定價的路由採用近似的固定啟發式規則，存在宣告時應用視覺 token 定價，檔案則按模型可見的控制代碼文字計價。只有請求 envelope 完全相同時才複用提供者報告的用量；本包不新增模型可見內容，也不在 loop 中做決策。

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

當消費方需要為壓縮決策、佔用顯示或遙測取得 token 或上下文壓力時掛載本外掛。估算器沒有任何設定，也不新增模型可見表面；模型容量屬於擁有精確提供者／模型路由的介面卡，可透過 `ctx.llm.resolveModelInfo().context` 取得。

### 何時選擇

當多個外掛應該就同一種基於回放的測量達成一致時選擇它——壓縮規劃、佔用 UI 與壓力檢查都讀取同一個 fold。測量回放持久工作階段日誌，因此確定、無需模型呼叫，並精確反映已記錄內容。文字和未宣告圖片定價的路由使用固定啟發式規則；當部署需要精確到計費級別的計數時，使用提供者分詞器。

### 測量壓力

`ctx.tokenMeter` 暴露兩個操作。`measure(session, requestHeader?)` 在同一個已消費日誌 revision 上返回獨立、深度不可變的快照：`totalTokens` 是請求與回應壓力，`surfaceTokens` 是僅表面的路由定價總量，等於 `nodes[].tokens` 之和。可選 `requestHeader` 覆蓋會選擇計價路由與壓力欄位；節點集合仍描述目前工作階段。`estimateMessage(message)` 用固定啟發式規則為一條訊息計價。每次呼叫都會克隆帶位置的表面節點，因此測量是 O(surface)。

```text
const { totalTokens, surfaceTokens, nodes } = ctx.tokenMeter.measure(session)
const price = ctx.tokenMeter.estimateMessage(message)
```

每次測量都會透過可選的 `llm` 服務解析生效 envelope 的提供者／模型。介面卡宣告圖片定價時，圖片出現處使用路由請求的視覺 token 價格加模型可見文字，`image/offload` 事件選中的出現位置則按路由的佔位文字計價，與表層實際傳送的一致；其他路由保持固定啟發式規則。檔案出現處使用同一個 `llm` 服務為介面卡分發解析的確切、與路由無關的 控制代碼文字，其中包含目前執行世界路徑或明確的無路徑說明。每個節點還攜帶與路由無關的 `heuristicTokens`，供替換影子價使用。只有當最新成功呼叫的規範請求 envelope 與已測量 envelope 匹配、且其總量不低於該呼叫完整路由定價錨點時，才複用提供者用量；否則會對完整目前 envelope 與表面做估算。表面變更保持相對於按同一路由重新定價的匹配錨點的帶符號值，包括縮減替換後的負 delta。

測量錨點包含成功的 `assistant/message` 之前的已計價表面，包括 `step/start` 之後接納的系統與使用者訊息，以及重試之前執行的替換。持久輸出未變時，完成呼叫的表面增量為零：其提示詞已包含在提供者用量中。後續表面變更仍是相對於該錨點的帶符號增量。

### 工作階段投影

當組合提供 `ctx.sessionProjections` 時，token-meter 註冊三個投影單元。`tokenUsage` 攜帶完整持久日誌中的 `uncachedInputTokens`、`outputTokens`、`cacheReadTokens` 與 `cacheWriteTokens`。最終 assistant 訊息樣本會替換同一次嘗試的流式用量；`llm/retry-started` 會結束該替換範圍，因此同一步驟中的重試會貢獻另一次計費用量。`contextPressure` 攜帶可選 `pressureTokens`（提供者報告的最新提示詞規模）、可選 `projectedTokens`（下一個請求的提示詞將花費多少）與來自最新一條 `request/context` 記錄的可選 `contextWindow`。`contextBreakdown` 攜帶啟發式 `systemTokens`、`toolsTokens` 與 `messageTokens`——上下文的構成，而非提供者計費規模。解除安裝外掛會移除全部三個鍵。

圖片省略重新計算現有節點的價格，同時保留此前的用量錨點。固定引用啟發式規則不計入 `offloaded` 中繼資料，因此一次省略決定不改變 `contextBreakdown` 或標量啟發式總量，按路由的測量則把所選圖片的視覺價格換成佔位文字價格。

`contextBreakdown` 把 surface 順序中最後一個非空且存活的 `system/message` 歸入 `systemTokens`；休眠的空節點不貢獻 token，沒有非空系統訊息時為零。`messageTokens` 包含其餘所有可見節點，包括被取代的提示詞。兩者之和始終等於 `measure().nodes[].heuristicTokens`，未計量替換、壓縮和逐節點清空提示詞之後也成立。`toolsTokens` 跟隨最新 `request/header`。三個數字都使用固定啟發式規則，而非路由圖片定價或檔案控制代碼投影；它們是近似構成，不是計費資料或 `projectedTokens`。

`deriveTurnTokenUsage(events)` 為瀏覽器消費方把一個完整輪次摺疊為精確的逐次嘗試與整輪用量。生命週期證據缺失、計數不安全或精確總量矛盾時不返回結果；只有每次參與的嘗試都報告可選快取、推理或路由值時，相應彙總才會出現。

### 組合

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-basic'
```

兩個外掛都有可用預設值。meter 只消費可選的 `llm` 服務，且僅用於解析路由宣告的請求圖片定價；壓縮保持可選。部署會在 LLM（大語言模型）介面卡上設定容量與圖片定價，並在 `dsh-compaction-basic` 上設定壓縮策略。

### 解讀數字

佔用是參考數字，不是計費記錄：harness 中沒有任何機制依據它做決定，壓縮讀取的是 `measure()`。UI 用測量壓力除以所選模型獨立解析的容量來計算佔用。`contextBreakdown` 數字是估算值，其總和不會等於 `projectedTokens`；後者的提供者錨點恰好攜帶啟發式誤差——CJK 文字與 JSON schema 在每 token 四字元下嚴重低估。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

服務建立在一個 fold 與一個錨點之上。每個工作階段都有隔離的回放狀態——已消費事件遊標、規範請求標頭、已計價表面、步驟邊界與測量錨點——透過摺疊持久日誌推進。只有當提供者用量的規範 envelope 匹配、且其總量不低於同一次呼叫的完整路由定價時，才用它錨定測量；否則會估算完整 envelope 與表面。與路由無關的 `heuristicTokens` 欄位使替換影子價投影保持確定性。fold 是整體且分配全新的：格式錯誤事件會在任何變更前丟擲，因此同一份日誌每次重試都以相同方式失敗。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `TokenMeter` 服務：回放狀態、fold、`measure()` 與 `estimateMessage()` |
| [`src/estimate.ts`](src/estimate.ts) | 固定啟發式規則：每 token 四字元加塊與角色開銷 |
| [`src/surface-fold.ts`](src/surface-fold.ts) | 與 `measure()` 共享的位置表面 fold |
| [`src/surface-projection.ts`](src/surface-projection.ts) | O(1) 投影單元的影價協定 |
| [`src/usage-projection.ts`](src/usage-projection.ts) | `tokenUsage` 與 `contextPressure` 投影定義 |
| [`src/breakdown-projection.ts`](src/breakdown-projection.ts) | `contextBreakdown` 投影定義 |
| [`src/client.ts`](src/client.ts) | 面向投影消費方、可安全用於瀏覽器的用戶端介面 |
| [`src/turn-usage.ts`](src/turn-usage.ts) | 精確逐次嘗試與逐 Turn 用量的純 fold |

### Fold 流程

每次 `measure()` 呼叫都把 fold 同步到目前持久尾部，然後讀取一份連貫快照。fold 跟蹤完整請求標頭快照、步驟邊界、表面追加與替換、成功 assistant 訊息及提供者用量。用量錨點的提供者輸出從 assistant 訊息的精確內嵌流重新組裝，與監聽器對持久內容的改寫相互獨立；空的重組內容計價為零。

### 投影語義

`contextBreakdown` 按 surface 順序保留純 JSON 的 `{ seq, heuristicTokens, system }` 條目，並複用測量服務的 plan/commit fold。其狀態與 surface 轉換成本為 O(目前保留 surface)，不是 O(1)，也不是 O(完整歷史日誌)；被替換條目和訊息正文不保留。狀態版本 5 使計入省略中繼資料的檢查點失效。`contextPressure` 仍是標量影子價消費方：沒有相鄰 claim 的替換貢獻零增量。用量 fold 保留一個最後樣本槽，因為合法日誌不會在更晚步驟報告用量後再次報告更早步驟的用量。

`./estimate` 匯出無服務狀態的文字與內容估算函式，供工具結果保留複用。圖片的實際請求成本由模型介面卡的 `imageRequestPricing` 提供。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從計量服務逐步進入壓縮消費方與共享型別。

- [Token 計量子系統](../../../docs/subsystems/token-meter.zh.md)——`ctx.tokenMeter` 背後的測量語義。
- [dsh-llm 服務](../llm/README.zh.md)——其容量中繼資料由 `resolveModelInfo()` 提供的模型呼叫服務。
- [壓縮能力](../../../docs/subsystems/compaction.zh.md)——讀取 `measure()` 的壓力敏感消費方。
- [投影 token 用量](../../../.agents/notes/implemented/architecture/2026-07-29-projected-token-usage-and-request-context.zh.md)——`projectedTokens` 背後的設計與被否決的原子配對比較。
- [LLM 流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——本服務計價的訊息與塊型別。

-----

<a id="model-experience"></a>
## 模型體驗

間接地，透過 `dsh-compaction-basic` 等消費方；服務本身不新增任何提示詞、訊息、schema、工具或模型呼叫。

#### KV Cache 影響

不直接失效；任何請求字首變更都由點名的消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明計量在哪裡停止、由未來工作接續。它們是目前包約束，不是通用 token 計量對比或任務積壓。

- **固定啟發式規則是近似值**——沒有可複用提供者用量的文字按字元數加結構開銷計價，而非精確提供者分詞器或請求序列化器；只有宣告瞭定價的路由上的圖片出現處攜帶提供者精確的視覺 token。
- **每次測量都克隆目前表面**——連貫不可變快照讓讀取為 O(surface)，包括低於閾值的壓力檢查。
- **提供者用量只在規範 envelope 完全相同時可複用**——工具、提供者、模型或呼叫設定變化會刻意退回到完整啟發式估算；系統提示詞變更在下一次成功呼叫之前按帶符號的表面增量計量。
- **系統提示詞改寫不帶影子價**——迴圈替換 system 節點時沒有緊鄰的計量事件，因此 `contextPressure.projectedTokens` 以零增量摺疊該替換，直到下一個用量樣本；`contextBreakdown.systemTokens` 與 `measure()` 會立即按新提示詞重新計價。
- **構成檢查點保留目前 surface**——精確的 system/message 分類需要位置條目；檢查點大小和 surface 事件摺疊成本為 O(目前保留 surface)。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是不具權威性的工作上下文：維護者備註與開放問題。已交付的行為與既定理由以上文、包程式碼和相關 Agent Note 為準。

- 固定每 token 四字元啟發式規則會低估 CJK 文字與 JSON schema；複用用量時提供者錨點恰好攜帶該誤差，請把構成行呈現為近似構成，絕不呈現為總量。
- 按提供者的精確分詞器尚未決定；保持單一確定性啟發式規則，正是讓每個消費方的測量一致且回放穩定的原因。

</details>

**執行時不變式：** 不釋出伴生入口。用量 fold 在每次嘗試內替換樣本，總量不必單調。構成和測量共享位置替換規劃器與固定估算器，因此啟發式 surface 總量按建構一致，而非需要比較的獨立可變觀測。路由定價總量有意與之不同。
