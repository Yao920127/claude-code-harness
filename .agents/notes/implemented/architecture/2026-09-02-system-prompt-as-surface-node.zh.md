# Agent Note: 系統提示詞是 surface 的第 0 號節點

Status: implemented

[English](2026-09-02-system-prompt-as-surface-node.md) | 中文

## Problem

放在 surface 之外的系統提示詞，其持久化表示與模型讀到的其他所有訊息都不同。對話訊息是 surface 事件（`user/message`、`assistant/message`、`tool/result`），由 `Session.deriveMessages()` 按 seq 順序摺疊；而存放在僅記日誌的 `request/header` 快照 `system` 欄位中的提示詞，必須由每個序列化器前置為協定訊息 0。[可重建請求 Agent Note](2026-07-05-reconstructable-requests.zh.md) 讓兩半都成為持久資料，但這種佈局讓一個模型可見的事實擁有兩個歸屬：surface 擁有訊息，header 擁有排在這些訊息之前的那條訊息。

這種拆分迫使每個想知道「模型看到了什麼」的讀取方都要合併兩個來源：壓縮（compaction）摘要器把 header 中的提示詞複製到區域派生訊息之前，`dsh-token-meter` 從 header 估算系統提示詞卻從 surface 為其他每條訊息計價，Web 請求提示詞卡片、軌跡檢視和快照歸一化器的 `{{system}}` 預留位置各自單獨讀取 header。變更檢測同樣被拆開：在 `config` 和 `tools` 旁邊逐位元組比較 `system` 的 `headerEquals`，讓提示詞變更與工具變更在日誌中無法區分（`request/header` 的 reason 都是 `change`），儘管它們是對對話的兩種不同操作。

這種拆分還阻塞了下一步。一個把對話中途的 `system` 訊息當作提示詞替換來接受的模型，需要 harness 向歷史追加一條 system 角色訊息；當提示詞住在 header 裡時，沒有可追加的 surface 表示，header 也只能靠特例被凍結。[歷史內替換決定](../feature/2026-09-02-in-history-system-prompt-replacement.zh.md) 依賴本 Agent Note。

## Decision

系統提示詞住在 surface 上。它是一個普通的 surface 事件 `system/message`，提示詞生命週期中的每個操作都是對該事件型別施加現有兩種 `SurfaceOp` 變體之一。協定請求不變：surface 摺疊產出的就是序列化器傳送的訊息列表，系統訊息在最前面。

### 事件

`system/message` 是 `SurfaceEventType` 的成員，與 `user/message`、`assistant/message`、`tool/result` 並列（`packages/core/session/src/types.ts`）。它的載荷與 `tool/result` 對稱：`{ turn, step, message }`，其中 `message` 是 `role: 'system'` 的 `SystemMessage`，一個文字塊承載渲染後的提示詞，source 為 `{ kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' }`。空的 `content` 記錄「沒有系統提示詞」：該節點保持其 surface 位置，`deriveEventMessage` 把它投影為 `null`，因此不貢獻任何協定訊息。非空節點逐字投影，因此 `deriveMessages()` 在其 surface 位置返回系統訊息，而原樣直接傳遞 `role: 'system'` 歷史訊息的 DeepSeek 序列化器把它作為協定訊息 0 發出。`EpochHeader` 是 `{ config, adapterDefaults?, tools? }`；`packages/core/session/src/request-header.ts` 中的 `canonicalHeader` 與 `headerEquals` 只比較 config、介面卡預設值和工具。

### 操作

| 情形 | surface 操作 |
|---|---|
| surface 上沒有存活的 `system/message`（包括渲染後的提示詞為空時） | 追加 `system/message`；在工作階段的首個步驟中它是 surface 第 0 號節點，位於該步驟首條 `user/message` 之前 |
| 有存活的 `system/message` 且渲染後的提示詞與其文字不同（包括提示詞變為空） | 恰好替換該節點：`surfaceOp: { op: 'replace', startSeq: <該節點的 seq>, endSeq: <同一值> }`，`sourceEventSeqs: [<該節點的 seq>]`；空提示詞產生一個投影為無訊息的空內容節點 |
| 渲染後的提示詞與存活節點的文字相同 | 無操作 |

當初始渲染的提示詞為空時，迴圈在初始接納的使用者訊息之前預留空系統頭部，使稍後首次變為非空的提示詞仍替換第 0 號節點。省略該空節點會讓後來的提示詞追加在使用者歷史之後，pi-ai 會將其轉換為使用者訊息，而不是 `systemPrompt`。替換第 0 號節點是頭部重寫在 surface 上的表達：提供者字首從第一個 token 起改變，日誌透過 `sourceEventSeqs` 記錄被遮蔽的節點，`replaceGeneration` 與壓縮替換時一樣推進。因此迴圈的 `startsSeries` 檢測（`requestSurfaceGeneration !== surfaceGeneration`）無需在 `headerEquals` 中比較 `system` 即可覆蓋提示詞變更。`request/header` 保留 `initial`、`resume`、`change`、`series` 四種 reason；`change` 表示 config 或 tools 變更，提示詞替換之後跟隨的未變 header 記為 `series`。

`packages/core/session/src/surface.ts` 在 `assertSystemHeadRewrite` 中強制頭部不變數：當第 0 號節點是 `system/message` 時，範圍覆蓋第 0 號節點的替換會被拒絕，除非替換事件本身是恰好覆蓋該節點的 `system/message`。位於更後位置的系統節點沒有此類保護；壓縮範圍可以遮蔽它們。

### 迴圈中的歸屬

`dsh-agent-loop` 在 `packages/core/agent-loop/src/runtime-context.ts` 中與 `RuntimeContextProjection` 並列擁有 `SystemPromptProjection`。它在每次投影時從目前 surface 讀取存活的 `system/message` 節點，因此同一步驟中更早執行的壓縮或替換已經反映在內。`project(rendered, { inHistory, startsSeries })` 返回 `{ message, intent }`——沒有系統節點存活或[歷史內規則](../feature/2026-09-02-in-history-system-prompt-replacement.zh.md)適用時 `intent` 為 `{ surfaceOp: 'append' }`，否則是對最新存活系統節點的精確替換——最新節點已持有渲染文字時返回 `undefined`。

在 `packages/core/agent-loop/src/agent.ts` 中，`preStep` 用 `renderPrompt(assembly)` 渲染提示詞，並在 `agent/pre-step` waterfall 之後投影它，因此壓縮提供者在該 waterfall 內做出的替換對決定可見；`turn()` 緊接在 `step/start` 之後、該步驟的 `user/message` 事件之前提交 `system/message`，因此日誌順序即協定順序。`buildRequest` 不在請求上設定 `system`：請求由 `header.config`、`session.deriveMessages()`（系統訊息在先）和 `header.tools` 構成。迴圈步驟順序為：領取收件箱 → `systemPrompt.assemble()` → 投影執行時上下文 → `agent/pre-step` waterfall → 投影系統提示詞 → `step/start` → 提交 `system/message`（有變化時） → 提交各條 `user/message` → `agent/request` waterfall → `request/header` → `request/context` → 流式請求。`dsh-agent-loop/invariant` 伴隨元件（`packages/core/agent-loop/src/invariant.ts`）斷言迴圈建置的請求滿足 `system === undefined` 且 `messages` 等於 `deriveMessages()`。

`dsh-token-meter` 把用量錨定到成功的 `assistant/message` 之前的已計價 surface，而不是 `step/start`。迴圈在步驟開始之後接納系統提示詞與使用者訊息，重試恢復還可能在重建請求之前替換節點。捕捉目前 surface 會讓每個已接納輸入恰好計入一次；內嵌的提供者輸出仍單獨計價，因此持久 assistant 改寫保留其帶符號增量。開放步驟只儲存 turn 與 step 以驗證生命週期，不儲存第二份節點快照。

### 消費方

| 消費方 | 讀取內容 |
|---|---|
| DeepSeek 序列化器（`serializeRequest`、`serializeRequestWithImages`） | `options.messages`，把 `role: 'system'` 的歷史訊息作為協定訊息 0 直接傳遞；`GenerateOptions.system` 為標題提供者等直接單次呼叫方保留 |
| `dsh-llm-pi-ai` | 開頭的 system 歷史訊息對映為 pi-ai 的 `systemPrompt` |
| `compaction-basic` 的 `buildSummarizationInput` | 第 0 號節點的派生訊息前置於 `SummarizationInput.messages` 中的區域訊息，無單獨的 `system` 欄位；空內容頭節點不投影為訊息，但仍受保護而不能被壓縮 |
| `compaction-basic` 的 `selectCompactableRange` | 錨定在首個非系統節點；第 0 號節點永不落入壓縮範圍 |
| `dsh-token-meter` | 系統節點作為 surface 節點計價，歸入 `systemTokens` 明細 |
| Web 請求提示詞卡片、軌跡請求節點、請求檢視 | `system/message` 節點；被替換的第 0 號節點顯示為提示詞變更，追加的歷史內節點顯示為提示詞更新，各自以摺疊可檢視的卡片呈現，永不作為聊天氣泡 |
| 快照歸一化器的 `{{system}}` 預留位置、plan-mode 測試 | 系統節點的文字 |
| TypeScript 與 Python SDK 預期輸出 | 包含 `system/message` 事件 |
| 人類 transcript（文字記錄）投影 | 跳過 `system/message`；它是模型歷史，不是對話 |

`RuntimeContextProjection` 與 `SystemPromptProjection` 都把一條未提交的訊息交給迴圈由 `turn()` 提交。兩者在觀察 surface 的方式與操作集上不同：執行時上下文跟隨 `session/event` 觀察自己擁有的 user 角色快照且只做追加，而系統提示詞在每次投影時掃描目前 surface 上的系統節點，因為它的決定取決於有多少節點存活，並按路由追加或替換。

### V2-to-V3 結構轉換

[V2 到 V3 規範](../../../../packages/session/session-format-v2-to-v3/README.zh.md#system-head)負責系統頭節點轉換與訊息身份；其[引用規則](../../../../packages/session/session-format-v2-to-v3/README.zh.md#sequence-references)和[源拒絕](../../../../packages/session/session-format-v2-to-v3/README.zh.md#source-audit)定義保留內容與不支援的輸入。遷移佈局與原生請求語義等價，而非與原生錄製逐位元組相同。有效 V2 源在目前步驟不變數下可能沒有保持順序的轉換方式；拒絕它優於移動歷史或放寬歸屬。歷史接收座標不得變為對轉換後日誌的確認。

[已釋出格式策略](2026-08-31-released-session-format-migrations.zh.md)保留每條已釋出轉換的語義；已有目標格式代際不會重跑其入邊。投影快取版本獨立於 Session 格式版本。

[規範信封規範](../../../../packages/session/session-format-v2-to-v3/README.zh.md#canonical-envelopes)定義與結構轉換的組合；[規範信封決策](2026-09-06-v3-canonical-session-envelopes.zh.md)負責嚴格准入的依據。

## Alternatives considered

**保留 `header.system`，只為更新新增 `system/message`。** 一個事實兩個歸屬：上述每個消費方都要從 header 讀訊息 0、從 surface 讀後續訊息，迴圈還需要一個在 surface 存在系統節點時讓 `headerEquals` 忽略 `system` 的特例。被否決，因為本次變更的目的就是單一表示。

**用專門的僅記日誌事件 `system-prompt/change` 重寫 header。** 保留 header 作為提示詞歸屬，並把變更記錄為獨立事件種類，但仍無法表達歷史內部的系統訊息，歷史內替換提案還是需要第二套機制。被否決。

**在介面卡內根據相鄰 header 合成系統訊息。** 介面卡逐請求無狀態且從不接觸日誌；依賴介面卡狀態的協定歷史無法從 surface 摺疊重建。被否決。

**像執行時上下文那樣用 `user/message` 快照表達提示詞。** 複用了現有事件型別，卻傳送了錯誤的角色，因此把系統訊息視為權威的模型不會這樣對待它。被否決。

## Consequences

- 單一表示：每個想知道「模型看到了什麼」的讀取方都摺疊 surface；沒有消費方需要把 header 與訊息列表合併。`EpochHeader` 沒有 `system` 欄位，因此期望該欄位的讀取方在編譯期失敗。
- 提示詞變更與工具或 config 變更在日誌中可以區分：前者是對第 0 號節點的 `system/message` 替換加隨後的 `series` header，後者是 reason 為 `change` 的 `request/header`。
- 壓縮帶有一條不變數：第 0 號節點永不被壓縮。`dsh-session` 的 surface 管理器在替換操作本身中強制它，因此除 `compaction-basic` 以外的壓縮提供者無法透過錨定在 `surfaceNodes[0]` 來遮蔽提示詞。更後位置的系統節點按設計不受保護。
- `replaceGeneration` 在提示詞替換時和壓縮時一樣推進；需要區分兩者的讀取方檢查替換事件的型別。
- 歷史中途的系統節點擁有 surface 表示，這正是[歷史內替換決定](../feature/2026-09-02-in-history-system-prompt-replacement.zh.md)所依賴的基礎。
- 初始空提示詞佔據受保護的頭部，但不貢獻協定訊息；在替換模式下，後來的非空提示詞替換它，並保持為開頭的系統訊息。
- 錄製的快照 fixture 攜帶 `system/message` 事件而非 header 的 `system` 欄位。快照歸一化器把該事件的文字標記化為 `{{system}}`，提示詞伴隨檔案從 `system/message` 序列採集（每個提示詞版本一節，以 `header.promptChanges` 宣告），`request/header` 的 pin 只比較 config 與 tools。

## Testing

- `packages/compaction/compaction-basic/tests/compaction-loop-repro.spec.ts` 釘住提供者用量下呼叫後的表面增量為零，覆蓋初始、增長、縮短與空提示詞、同一步驟中的重試替換、請求中介軟體和全新回放。
- `packages/core/session/tests/surface.spec.ts`（`system/message surface node` 塊）釘住開頭 system 角色的投影、空內容的 `null` 投影、`assertSystemHeadRewrite` 的接受與拒絕路徑、更後位置系統節點不受保護，以及對 seed 中非 system 角色或非外掛 source 的 `system/message` 的拒絕。
- `packages/core/agent-loop/tests/system-prompt-projection.spec.ts` 釘住首次渲染時的追加（包括空提示詞）、替換模式下後來非空提示詞位於派生歷史頭部、提示詞未變時的無操作、變更時對最新存活節點的替換、替換遮蔽了非頭部系統節點之後的尾部追加，以及歷史內追加與重新基線規則。
- `packages/core/agent-loop/tests/request-reconstruction.spec.ts`（`a system-prompt change replaces surface node 0 and starts a new series under the same header`）釘住提示詞替換之後跟隨的 `series` header。
- `packages/core/agent-loop/tests/invariant.spec.ts` 釘住伴隨元件對攜帶 `system` 欄位的迴圈請求的拒絕，以及其 `messages` 與邊界派生結果的相等性檢查。
- `packages/llm/llm-deepseek/tests/serialize.spec.ts`（`serializes a leading system message byte-for-byte like the same prompt passed as options.system`）釘住協定一致性。 `packages/llm/llm-pi-ai/tests/context.spec.ts` 在文字與圖片路徑上比較兩種系統提示詞來源。`packages/compaction/compaction-basic/tests/compaction-basic.spec.ts` 透過區域事務與預設摘要器釘住派生字首、已路由工具、不攜帶單獨 `system` 選項，以及非空或空頭節點的保護。
- `snapshots/` 下的錄製快照釘住每個隨發 profile 的模型可見協定請求；渲染了提示詞的錄製工作階段在其 `session.jsonl` 中於 surface 第 0 號節點攜帶 `system/message` 事件，工作階段中途發生提示詞變更的工作階段則攜帶對第 0 號節點的替換，或在歷史內路由上攜帶追加的節點。
