# Agent Note: 被取消的流定稿其已送達字首

Status: implemented

[English](2026-08-10-cancelled-stream-prefix-finalize.md) | 中文

## Problem

被取消的流可能留下 Client 已經渲染的瞬態 chunk，但如果沒有 `assistant/message` 記錄已送達字首，`deriveMessages()` 就會排除這部分內容。後續的「第二點展開講講」之類追問會缺少使用者已讀到的文字，在該輪次上建立的分支也會繼承這個缺口。

模型歷史必須包含取消後仍對使用者可見的 assistant 內容。

## Decision

`ReactLoopAgent.step()` 在消費模型 stream 期間捕捉取消，此時 `BlockAssembler`、緊湊 stream accumulator 與 provider route 可以確定已送達字首。loop 把該字首追加為 step 的 `assistant/message`，並設定 `interrupted: true`、`surfaceOp: 'append'` 與精確嵌入式帶時間 stream。該追加先於 committed `agent/assistant-stream` end frame、`step/end` 和記錄 aborted 的 `turn/end`。

`BlockAssembler.interruptedBlocks()` 按 stream 順序返回內容非空白的已閉合和未閉合 `text` 與 `reasoning` block。打斷先於分派，沒有真實工具結果，因此它會省略工具呼叫，也會省略空 block 和未閉合的未知 block 型別。返回結果為空時追加 `assistant/attempt`，而不是 surface message。Provider `error` 與 `aborted` finish 也會在 `agent/request-error` 前提交 `assistant/attempt`，因此其 stream 保持持久，但失敗請求內容不會進入模型歷史。

Chat 和 Trajectory Conversation Definition 從持久 message 讀取 `interrupted`。Chat 渲染 Stopped marker，Trajectory 則在 `step/end` 後把 provider request 保持在 error 生命週期，並保留持久 result seq 與 provider 資訊。工具執行期間的取消遵循工具排程器約定，因為 assistant message 已提交：已啟動的呼叫生成真實結果，未分派的呼叫獲得 `ABORTED_BEFORE_DISPATCH` 結果。

## Alternatives considered

**始終丟棄字首。** 這能避免新增持久標記，但每次取消後的追問和分支都會缺少仍對使用者可見的 assistant 內容。

**在投影時從嵌入式 attempt 組裝字首。** `deriveMessages()` 與 Client Conversation Definition 都需要實作打斷組裝規則，日誌中也沒有該字首的權威 surface message。這還會讓模型歷史超出三類 `SurfaceEventType` 事件。

**保留完整工具呼叫併合成 aborted 結果。** 這些呼叫從未分派，合成結果會聲稱一個並未發生的執行結果，還會增加使用者未收到的工具結果內容。

**追加 `[interrupted by user]` 之類模型可見的打斷訊息。** 這可以告訴模型字首並不完整，但需要獨立的來源型別、投影規則、UI 處理和在地化文案。持久的 aborted `turn/end` 保留了該後續決策所需的事實。

## Consequences

取消後的追問和分支會包含已送達字首。ACP 橋會在結算 prompt 前排空按序傳送的 assistant 輸出，因此最後一條 `agent_message_chunk` 更新先於 cancelled stop reason。

終局 provider error 會在 `assistant/attempt` 中保留其 stream，但不讓內容進入模型歷史。只有使用者的取消決策會把可見的已送達文字變成 interrupted surface message。

## Testing

`packages/core/agent-loop/tests/cancel.spec.ts` 覆蓋 content、嵌入式 stream、事件順序、下一請求的一致性、僅 reasoning 的輸出、工具呼叫省略、恢復期間的取消和空字首 attempt。`packages/llm/llm/tests/assembler.spec.ts` 覆蓋 `interruptedBlocks()`。`packages/client/ui-chat/tests/conversation-node-definitions.client.spec.ts` 與 `packages/client/ui-trajectory/tests/conversation-definitions.client.spec.ts` 覆蓋兩種 Client 投影。keyless `cancel` ACP snapshot 與 `goal-round-driver` goal snapshot 覆蓋組裝應用。
