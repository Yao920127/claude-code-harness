# Agent Note: 歷史內系統提示詞替換，實作快取穩定的提示詞變更

Status: implemented

[English](2026-09-02-in-history-system-prompt-replacement.md) | 中文

## Problem

每一次系統提示詞變更都要付出整個提供者字首快取的代價。迴圈在每個步驟渲染提示詞；一旦位元組不同——plan 模式片段進入或退出、某個 skill 或工具指引片段完成註冊、agent 作用域的 persona 遮蔽、`{{model}}` 變數改變——請求的訊息 0 隨之改變，DeepSeek 上下文快取從第一個 token 起失效。長時間的 agent 工作階段反覆為此付費，而[執行時上下文快照設計](../../archived/feature/2026-07-30-current-sandbox-policy-context.md)之所以存在，正是因為把會變化的事實移出提示詞是保持字首穩定的唯一辦法。

一個 DeepSeek 模型——在此按為本項工作提供的模型事實記錄——移除了這一限制：它接受對話任意位置的 `system` 訊息，並把最新一條視為完整的有效系統提示詞，替換最前面那條。工具 schema 仍屬於被快取的字首；[動態工具更新](../architecture/2026-09-20-dynamic-tool-updates.zh.md)可以延遲新增宣告，而保留定義的變化仍使複用失效。有了這樣的模型，harness 可以把新提示詞追加到已快取的歷史之後而不是重寫訊息 0，字首就能保持熱態。

因為[系統提示詞是 surface 第 0 號節點](../architecture/2026-09-02-system-prompt-as-surface-node.zh.md)，harness 擁有實作這一點的表示：提示詞變更是對 `system/message` surface 節點的操作，而「替換最新的系統節點」與「追加新節點」之間的選擇是逐路由的決定。

## Decision

對於宣告瞭該能力的模型路由，當渲染後的提示詞變化且字首本可存活時，迴圈追加一個新的 `system/message` surface 節點而不是替換最新的系統節點。[surface 節點決策](../architecture/2026-09-02-system-prompt-as-surface-node.zh.md)中的其他一切不變：事件型別、投影的擁有者、序列化器，以及第 0 號節點的頭部保護。

### 能力

`dsh-llm` 定義 `SystemPromptUpdate = 'in-history'`，並把它作為可選的並列欄位 `systemPromptUpdate` 放在 `LlmResolvedModelInfo` 與 `PreparedLlmCall` 上；`normalizeModelInfo` 用程式碼為 `INVALID_MODEL_INFO` 的 `LlmError` 拒絕任何其他值。DeepSeek 介面卡的目錄模型（`DeepSeekCatalogModel.systemPromptUpdate`，載入時由 zod 驗證）與回放提供者的 `ReplayModelConfig.systemPromptUpdate` 逐模型宣告它；預設表示該模型需要重寫訊息 0。`dsh-llm-deepseek` 僅內建 `deepseek-flash` 條目，在該條目上宣告它，同時宣告文字和圖片輸入。該精確目錄條目記錄模型能力；名稱和協定類別不能推導其他模型是否支援。部署方可以透過 `cordis.yml` 的 `models` 列表替換目錄，所有 `dsh-llm-pi-ai` 路由保持替換行為。

迴圈把該模式記錄進工作階段：`RequestContext.systemPromptUpdate` 與 provider、model、容量並列成為 `request/context` 的欄位，其中任一項與最新快照不同時就記錄一次。准入讀取 `agent/request` 之後實際準備呼叫的 `PreparedLlmCall.systemPromptUpdate`；先前快照不是准入輸入。因此首次請求、恢復的工作階段、路由變更以及同一路由的能力變更，都使用將服務該呼叫的繫結介面卡的能力。

### 決策規則

`packages/core/agent-loop/src/runtime-context.ts` 中的 `SystemPromptProjection.project(rendered, { inHistory, startsSeries })` 每次呼叫都掃描目前 surface 上存活的 `system/message` 節點。它返回有序的逐節點提交。沒有存活的系統節點時，即使渲染文字為空也預留頭節點。有效文字取自最新的非空系統節點，沒有時退回到頭節點；未生效的空尾節點既不提供有效文字，也無需再次以空內容替換。無論路由或序列狀態如何，空渲染文字都會清除每個生效的系統節點。不具備能力的路由或新請求序列面對非空渲染文字時，即使有效文字未變也執行歸併。除此之外，有效文字相同時不產生事件。具體操作如下：

| 路由能力 | 字首狀態 | 操作 |
|---|---|---|
| 無 | 非空渲染文字，任意字首狀態 | 為每個非空的後續系統節點記錄空內容替換，隨後按需用渲染文字重寫首個系統節點 |
| `in-history` | 目前請求序列延續 | 在該步驟的 `user/message` 事件之前追加新的 `system/message`；僅追加本身不需要記錄 `request/header` |
| `in-history` | 非空渲染文字，新序列開始 | 為非空的後續系統節點記錄空內容替換，再按需重寫首個系統節點，即使最新有效文字未變也執行 |
| 任意 | 渲染後的提示詞為空 | 為非空的後續系統節點記錄空內容替換，再按需清空頭節點；派生訊息中不保留任何提示詞版本 |

`startsSeries` 在以下情況為真：`agent/pre-step` 決定宣告瞭 `startsRequestSeries`、surface 的替換代數自上次請求以來發生了移動（壓縮或任何其他替換）、不支援 `toolUpdate` 的路由上可見工具 schema 集合發生了變化。受支援的工具新增可以與提示詞追加一起發生，無需開啟新序列。僅 provider 或 model 切換對本規則不算序列開始：目標路由具備能力時，變更後的提示詞被追加，這不花任何代價，因為路由變更本身已經使快取未命中。序列開始已經付出了快取代價，因此歸併讓模型歷史只保留目前提示詞。有日誌記錄的逐節點空內容替換會從派生訊息中移除後續提示詞，無需 surface 刪除操作，也不替換其間的對話節點。這也使壓縮恢復不會在失敗嘗試已接納的使用者訊息之後追加系統更新。

首次嘗試在組裝、被接納的 `agent/pre-step` 決策、`step/start`、`agent/request` waterfall 與 `prepareCall()` 之後才接納提示詞。被拒絕或為空的首次輸入不開啟步驟。兩個非同步請求階段都不提交待處理的系統提示詞與已接納使用者訊息，在任一階段取消都不會提交這兩者。每次嘗試都在各自的 `agent/request` 與 `prepareCall()` 之後同步協調同一份已渲染組裝結果、僅在首次嘗試追加已接納使用者批次、按需記錄 header/context、派生並凍結請求，再透過同一個已準備呼叫發起流式請求。重試不重複組裝、`agent/pre-step` 或使用者訊息准入。協調過程可見 pre-step 壓縮（`auto: true` 的 `compaction-basic`）與恢復壓縮，並在任一種壓縮開啟新序列時將非空提示詞文字歸併到頭部。恢復屬於序列延續——`resume` header 不是序列開始——因此跨重新啟動發生變化的提示詞被追加；提供者快取在程序邊界之後可能仍是熱的。

空頭節點且沒有生效的後續系統節點表示沒有提示詞。未生效的空尾節點不提供有效文字，因此重複清除與恢復工作階段都不會使舊提示詞重新生效。重新提供非空文字使用同一准入規則：延續中的具備能力路由可以追加它；不具備能力的路由或新序列則重新填充頭節點。清除使用普通的逐節點替換，而非 surface 刪除或初次建立空頭節點。

### 呈現與記帳

Web 在追加的歷史內節點自己的位置呈現它。`SystemPromptNode` 攜帶 `{ seq, time, turn, step, text, update }`，其中 `update` 對已載入視窗內跟在更早系統節點之後的追加 `system/message` 為真。Chat 把非空的更新渲染為一張摺疊的 `system-prompt` 卡片，標題取自 locale 鍵 `message.systemPromptUpdate`，同一 turn 與 step 內的 `request/header` 不會重複提示詞卡片；`inspectRequestPrompt` 對跟在更新之後的 header 不報告系統變更。Trajectory 把跟在已載入請求 header 之後的更新摺疊為一條合成的請求 header 事實，`promptChange.kind = 'system'`，因此之後的請求無需真實的 header 變更就能顯示有效提示詞。已載入視窗缺少更早的系統節點時，更新按初始提示詞呈現。轉錄投影像對待所有 `system/message` 一樣跳過它。

`dsh-token-meter` 把 surface 順序中最後一個非空且存活的系統節點計入 `contextBreakdown.systemTokens`；其餘可見節點（包括被取代的提示詞）計入 `messageTokens`。休眠空節點被忽略。每次替換後，兩者之和都等於固定啟發式 surface 總量，無論是否存在影子價 claim。緊湊的保留條目複用測量服務的 surface 規劃器：狀態和轉換成本為 O(目前保留 surface)，不是 O(1) 或 O(完整歷史日誌)。被替換條目和訊息正文被丟棄，狀態版本 4 拒絕標量檢查點。後續 assistant 用量中的 `cacheReadTokens` 仍是可觀察的提供者快取效果。

Trajectory 選擇前一條真實 header 與前一條合成系統 header 中較新的一個作為比較狀態。真實 header 擁有設定與工具；追加的提示詞可以在沒有另一條真實 header 時推進該狀態。只比較真實 header 會在 A → B → C 序列中把 A 而不是 B 報告為先前提示詞。

Chat 與 Trajectory 透過純操作 `uiConversation.inspectSystemPrompt` 解釋有效提示詞。每個 target 為系統事件與位置替換保留不可變的字首狀態，其中只包含存活系統節點，以及將存活替換序號對映到繼承 surface 位置的對映表。每次替換複製該表並刪除被遮蔽的條目；歷史字首對映表保持不可變。普通追加與流式更新無需摺疊提示詞。節點是否存活由 surface 順序決定，而不是事件順序或來源引用：壓縮可以在沒有另一個系統事件的情況下恢復更早的提示詞，頭部重寫的序號也可能大於更後位置的有效提示詞。空節點仍可被定位，但不會覆蓋非空提示詞。早於最早已載入相關事件的端點，其順序未知，除非已有替換位置索引。遇到這樣的端點後，直譯器會暫停公開之後的所有提示詞文字，直到向前補頁回放解析缺失的字首；事件序號順序不能確定 surface 順序。歷史卡片保留自己的字首狀態，而不是讀取最終 surface。

### 壓縮

`compaction-basic` 不變。`selectCompactableRange` 仍錨定在第一個非系統節點，因此第 0 號節點永不被遮蔽，更後的歷史內節點則可能被遮蔽；`buildSummarizationInput` 將派生的頭節點前置到 `messages`，再按 surface 順序加入每個被遮蔽節點的派生訊息，因此區域中途的系統節點在原位被回放，摘要呼叫仍是對話的真實字首。

## Alternatives considered

**只傳送變化的片段作為增量。** 模型把最新的系統訊息當作完整提示詞，因此增量會靜默丟掉每個未變化的片段。基於模型約定被否決。

**用外掛設定而不是模型能力啟用歷史內模式。** 部署標誌可能把不具備能力的模型與追加的系統訊息配對，這樣的模型最多把它們當作普通曆史。該能力屬於兌現它的路由；介面卡目錄已經承載逐模型的容量資訊。被否決。

**永遠追加，從不重新基線化。** 規則單一，但第 0 號節點會在工作階段整個生命週期內保持過時，壓縮之後的每個請求都要攜帶過時的頭部加替換訊息。在序列開始處重新基線化不花額外代價，因為快取在那裡已經丟失。被否決。

**每次恢復都重新基線化。** 為更簡單的恢復路徑接受每次程序重新啟動一次快取未命中。快取跨重新啟動持續數小時到數天，而日誌已經承載恢復所需的一切。被否決。

**把系統訊息放在該步驟的使用者訊息之後。** 兩個位置都在已快取字首之後，但模型會在讀到必須應用指令的輸入之後才讀到指令；system 在 user 之前與最前位置的順序一致。被否決。

**在 `agent/pre-step` waterfall 之前投影提示詞。** 投影將看不到在該 waterfall 內執行的壓縮，剛追加的節點可能在同一步驟內被遮蔽，請求就會把第 0 號節點的過時提示詞作為唯一的系統訊息攜帶。在 waterfall 之後投影讓規則保持為建置請求所用 surface 的純函式。被否決。

**用先前的請求上下文決定準入。** 它描述上一次呼叫，而非請求中介軟體之後繫結的介面卡。在首次呼叫、恢復之後、路由或能力變更之後，它可能選錯提示詞表示。在提交提示詞與使用者訊息之前解析，還能防止取消時接納未傳送的內容。被否決。

**把 provider 或 model 切換視為序列開始。** 它會在每次路由變更時把提示詞折回第 0 號節點，與不具備能力的路由上的工具變更情形一致。header 已經記錄了該變更，快取無論如何都會未命中，因此這條額外規則除了在迴圈中多一個特例之外沒有任何收益。被否決。

**僅清除最新系統節點。** 空節點不投影為訊息，因此更早的提示詞會重新生效。清除所有生效版本才能保留空渲染文字的含義，同時不刪除對話歷史。被否決。

**只保留標量總量或提示詞祖先鏈。** 標量影子價無法判斷最新提示詞從哪個分類消失，也無法恢復其前一個版本。僅有提示詞條目無法定位任意非提示詞替換端點；`sourceEventSeqs` 還可能引用存活提示詞，改寫後的事件序號順序也不同於 surface 順序。保留緊湊的目前 surface 條目可以複用現有規劃器，無需完整日誌存取、第二套驗證器或消費方專用持久事件。把所有存活提示詞之和歸入系統數字會改變有效提示詞的含義，而不是修復分類。

## Consequences

- 具備能力的路由上的提示詞變更保住提供者字首快取；追加的節點在該序列的每個請求上付出自身的 token 開銷，直到壓縮遮蔽它。提示詞在多數步驟都變化的部署，更適合把那個事實移入執行時上下文。
- 請求頭部不是系統提示詞唯一可能的位置：「模型看到了什麼」的讀者摺疊 surface 並取最新的系統節點，明細的系統數字遵循同一規則。
- `request/context` 快照記錄已準備的路由與宣告模式；它描述准入結果，而不決定準入。不具備能力的路由逐系統節點記錄歸併，保留其間的使用者、assistant 與工具歷史。
- 模型約定按所提供的內容記錄。若釋出的模型收窄了約定——例如只在有界視窗內兌現最新的系統訊息——規則需要序列開始之外的重新基線化觸發條件。
- 重寫或重排系統訊息的代理會靜默破壞替換語義；真實 API e2e 的快取命中斷言是探測器。

## Testing

生命週期驗證要求：提示詞未變更時不產生事件，具備能力的路由在恢復後追加變更後的提示詞。TypeScript 與 Python SDK 的期望輸出都必須包含帶型別的追加 `system/message` 事件，遵循 [SDK 快照策略](../../../../docs/testing.zh.md)。[TypeScript SDK 通知](../../../../snapshots/sdk/system-prompt-in-history/notifications.expected.jsonl)與 [Python SDK 提示詞歷史](../../../../scripts/snapshots/python-sdk-single-exe/minimal-in-history/prompt-history.json)記錄了追加的提示詞事件與保留的提示詞版本。

- `packages/core/agent-loop/tests/system-prompt-admission.spec.ts` 覆蓋文字變化或未變時從具備能力切換到不具備能力的路由、反向路由切換、恢復時的路由准入、請求中介軟體或準備階段取消，以及已準備路由保持繫結時並行選擇發生變化。重試壓縮案例覆蓋遮蔽最新提示詞後有或沒有更早更新存活的情況，並驗證複用已接納的組裝結果、使用者訊息僅接納一次，以及未變的後續重試不會多記序列 header。具備和不具備能力路由的清除案例會移除三個生效提示詞版本，驗證重複請求與帶 seed 的恢復保持為空且不多記提示詞事件，並僅恢復新文字；日誌重建與 pi 轉換器都不保留舊指令。`src/agent.ts` 與 `src/runtime-context.ts` 的聚焦覆蓋率在語句、分支、函式和行四項均達到 100%。
- `packages/core/agent-loop/tests/system-prompt-projection.spec.ts` 釘住序列延續時的追加、序列開始時無論是否存在後續存活節點、有效文字是否變化都執行的重新基線化、空提示詞對所有生效版本的清除，以及不具備能力時只做替換的行為。
- `packages/core/agent-loop/tests/request-reconstruction.spec.ts` 釘住繼承 header 下追加的節點及攜帶 `systemPromptUpdate` 的 `request/context`、序列開始時折回第 0 號節點、由壓縮驅動的重新基線化，以及在不支援 `toolUpdate` 的路由上、開啟序列的 `change` header 下由工具 schema 變更驅動的重新基線化。
- `packages/llm/llm/tests/service.spec.ts`、`packages/llm/llm-deepseek/tests/adapter.spec.ts` 與 `packages/test-support/llm-replay/tests/llm-replay.spec.ts` 釘住已解析模型資訊上宣告的模式，以及載入時對任何其他值的拒絕。
- `packages/llm/token-meter/tests/context-breakdown-projection.spec.ts` 釘住最新與中間提示詞移除、精確啟發式總量、頭部改寫後的 surface 順序、額外來源引用、休眠空節點與退回清空、不可變轉換、緊湊保留檢查點、延遲註冊、重放和版本失效。
- `packages/client/ui-conversation`、`ui-chat` 與 `ui-trajectory` 的用戶端測試釘住更新卡片、同一步驟 header 的去重、更新之後不存在系統變更，以及合成的軌跡 header。
- 無金鑰的手寫快照 `snapshots/session/system-prompt-in-history/` 在回放路由上宣告該能力，透過 fixture 片段在第一次工具呼叫之後改變提示詞，釘住追加的 `system/message`、未被觸及的第 0 號節點、唯一一條 `request/header` 以及 `request/context` 中的模式。
- `packages/llm/llm-deepseek/tests/adapter.e2e.ts` 針對 `DEEPSEEK_IN_HISTORY_MODEL` 指定的模型執行兩個步驟並夾帶一次提示詞變更，斷言回覆遵循追加的提示詞，並斷言追加後的請求比同一對話在重寫最前提示詞時讀取更多的快取 token；該變數未設定時跳過。
