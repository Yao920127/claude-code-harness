# Agent Note: 內嵌 Assistant 流的消費方直接讀取緊湊記錄

Status: implemented

[English](2026-09-06-embedded-stream-record-readers.md) | 中文

## 問題

Session 格式 v2 將每次模型嘗試的緊湊流（`AssistantStreamRecord[]`：打包的 `text-chunks`、`reasoning-chunks`、`tool-call-chunks` run 加上帶時間戳的原始 `chunk` 記錄）嵌入 `assistant/message` 與 `assistant/attempt`。摺疊這些 settlement 的消費方會先呼叫 `expandAssistantStream()`；它會物化完整的逐成員陣列，因此只需一個事實的消費方（find 首個 token、最後一個 usage chunk、拼接文字、一個 block-end）也要付出 O(members) 的分配與時間：在緊湊形式之上每個成員約兩個物件。

在 v2 內嵌流 settlement 隨訊息內容擴充功能、Chat 與 Trajectory 區塊直接由內容結算之後，剩餘的 expand 消費方是 Host 與用戶端摺疊：Session Stats 讀取每個 `assistant/attempt` 與 `assistant/message` 的首 token 時間（每次開啟 Session 的 projection 階段）、token 計量重建提供商內容並掃描每個流到最後一個 usage chunk（projection 單元仍掃描到末尾）、子代理輸出摺疊拼接純文字、Session Controller 映像查詢掃描 block-end chunk。

## 決策

`@deepseek-ai/dsh-llm` 直接從緊湊記錄回答消費方問題；剩餘消費方對記錄做一次帶提前退出的摺疊。

`packages/llm/llm/src/assistant-stream.ts` 在累加器與 `expandAssistantStream` 之外匯出記錄級讀取器：

- Chunk 規則：`isTokenDelta`（非空文字、reasoning 或 Tool-call 參數片段，或任何帶名稱的 Tool-call delta）、`isVisibleChunk`（非空白文字或 reasoning，或 text/reasoning/Tool call 之外的任意塊開始或結束）、`chunkHasVisibleText`（非空白文字 delta 或完成的文字塊）。
- Run 讀取器：`runFirstTokenTime` 與 `runFirstVisibleTime` 從 `time0` 與 `dt` 間隔重建首個合格成員的時間並停止掃描；帶名稱的 Tool-call run 直接產出 `time0`，不讀片段。
- 流讀取器：`assistantStreamFirstTokenTime`、`assistantStreamHasVisibleContent`、`assistantStreamHasVisibleText`、`lastAssistantStreamChunk(stream, type)`（逆向掃描）、`assistantStreamChunks(stream, type)`、`joinAssistantStreamText` 與 `assembleAssistantStream`（每個 run 向 `BlockAssembler` 喂入一個拼接後的 delta；組裝只做拼接，因此 blocks、usage、finish 與 replay state 與逐成員結果一致）。`RawStreamChunkType` 排除 delta 型別，因此原始 chunk 查詢不可能靜默跳過打包成員。

Session Stats 與 Trajectory 從 `assistant/attempt` 和 `assistant/message` 讀取 `assistantStreamFirstTokenTime`，跨重試保留步驟的首個 token。Trajectory 從組裝後的訊息結算內容，並獨立讀取計時，因此重新開啟歷史時無需展開流便能保留 TTFT 與解碼指標。Chat 遵循[已結算回覆的計時策略](../bug-fix/2026-09-14-chat-presentation-defaults.zh.md)。token 計量讀取 `lastAssistantStreamChunk(stream, 'usage')` 並透過 `assembleAssistantStream` 組裝提供商輸出；子代理輸出摺疊追加 `joinAssistantStreamText`；Session Controller 用 `assistantStreamChunks(stream, 'block-end')` 掃描映像。

`expandAssistantStream` 保留其嚴格驗證與其餘呼叫方（需要每個成員或在持久邊界驗證流）：Session 恢復驗證、v1-to-v2 遷移驗證器與釋出 Worker 重放、重連基線、測試支撐。

### 測量

儲存庫的合成 first-open 基準（200 迴圈、127,400 個 released-v0 事件、1,600 條緊湊記錄中的 500,000 個流式 delta；五次取樣取中位數）：

| 階段 | 之前 | 之後 |
|---|---|---|
| first-open projection | 28.0 ms | 5.9 ms |
| first-open 總計 | 76.9 ms | 53.8 ms |
| first-open 峰值 RSS | 137.2 MB | 94.6 MB |
| reopen projection | 17.8 ms | 6.5 ms |

Open、read、restore 階段不變；讀取器按建構保持相同的首 token 時間（首個合格成員即首條記錄的首個合格片段，且 delta 保持有序）。

## 備選方案

**按輸入陣列記憶化 `expandAssistantStream`。** 展開全部流只需幾十毫秒，但保留展開結果在事件生命週期內約花費緊湊流的十倍記憶體——這是本變更移除的瞬時分配的永久版本。讀取器完全消除了對保留展開的需求。

**保留逐成員摺疊。** 提前退出的 `.find` 仍然先物化整個陣列，因此分配與 O(members) 時間仍在。

## 後果

Host 與用戶端摺疊一次內嵌結算的代價為 O(records) 加每個 run 一次拼接，且除非在持久邊界驗證或需要每個成員，消費方不再物化成員。token、可見性與可見文字規則在 `dsh-llm` 中只有一處，因此記錄讀取器與累加器的打包規則不可能漂移。

釋出驗證（`assertCurrentAssistantStreams`）仍在釋出時重放每個 settlement；因為它必須按 chunk 證明內容一致，將其轉為不入成員的 run 感知組裝仍是未完成工作。
