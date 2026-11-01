---
description: "面向部署情境的自動工作階段壓縮（compaction）：用於選擇、調優或排查隨 token 壓力上升對較早歷史進行摘要的方式。"
kind: "package-reference"
---

# @deepseek-ai/dsh-compaction-basic

[English](README.md) | 中文

## 概述

本包讓長時 agent（智慧代理）工作階段在接近模型上下文上限時仍能正常工作。token 壓力上升時，它會把最舊的歷史壓縮為摘要並保留近期訊息；上下文溢位錯誤發生後，它會壓縮並重試。你也可以透過 `/compact` 按需壓縮，並選擇先修剪超大工具輸出。壓縮使用一次額外的模型請求，並且只保留該請求返回的摘要文字。它無法縮減系統提示詞、工具或工作階段字首，也無法拆分單個不可分單元（例如一次超大工具呼叫）。

## 目錄

- [使用本包](#use-this-package)
- [理解實作](#understand-the-implementation)
- [進一步探索](#further-exploration)
- [模型體驗](#model-experience)
- [已知限制與暫緩事項](#known-limitations-and-deferred-work)
- [開發備註](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已提供 LLM（大語言模型）、工作階段儲存與 token 測量的組合中掛載本包，即可獲得自動工作階段壓縮。隨附 `dsh` 基礎設定預設啟用它；需要控制壓縮發生的時機時請顯式掛載。

### 你會得到什麼

預設設定下你會獲得四種行為：工作階段向模型上下文上限增長時自動壓縮；提供者確認上下文溢位錯誤後的恢復（先壓縮再重試該請求）；透過 `/compact` 命令按需壓縮；以及——掛載修剪器時——壓縮前對超大工具輸出的修剪。

### 最小可用組合

掛載工作階段儲存、token 測量、可選修剪器、本後端，以及可選的按需命令：

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
- name: '@deepseek-ai/dsh-compaction-basic'
- name: '@deepseek-ai/dsh-command-compact'
```

你可以透過觀察工作階段越過本來會溢位的位置繼續工作、以及執行 `/compact` 立即壓縮一次來確認成功。如果組合缺少 LLM、工作階段儲存或 token 測量，外掛會載入失敗。同一個後端可以服務上下文大小不同的模型；用按模型覆蓋為每條路由設定各自的閾值與保留：

```yaml
- name: '@deepseek-ai/dsh-compaction-basic'
  config:
    thresholdRatio: 0.8
    retainRatio: 0.16
    modelPolicies:
      - provider: local
        model: small-context
        thresholdRatio: 0.7
        retainTokens: 2048
```

### 調整壓縮開始的時機

所有設定都可選。設上下文視窗為 `W`、生效請求輸出上限為 `O`、餘量為 `B`，預設觸發閾值為 `floor(min(W × 0.8, W − O − B))`，其中 `B = 65,536` tokens。逐字保留的近期歷史預算仍為 `W − O` 的 16%。下表列出全部設定；生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-compaction-basic)還包含欄位型別。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `thresholdRatio` | `0.8` | 用於 `floor(min(W × thresholdRatio, W − O − headroomTokens))` 的視窗比例。 |
| `headroomTokens` | `65536` | 路由請求輸出預留之外的額外壓力餘量；必須為非負整數。 |
| `retainRatio` | `0.16` | 以 `W − O` 的一部分表示逐字保留的近期對話；與 `retainTokens` 互斥。 |
| `retainTokens` | — | 逐字保留的近期對話絕對預算；與 `retainRatio` 互斥，並且必須低於已解析閾值。 |
| `summarizationProvider` | `''` | 與 `summarizationModel` 一起設定；空對使用最新已路由請求目標，再退回到 `AgentOptions` 對。 |
| `summarizationModel` | `''` | 與 `summarizationProvider` 一起設定；空對使用最新已路由請求目標，再退回到 `AgentOptions` 對。 |
| `maxTokens` | `headroomTokens`（`65536`） | 正數摘要輸出上限，包含提供者計入的推理 token。顯式模型上限覆蓋顯式全域上限；否則跟隨解析後的餘量。 |
| `compactionRetries` | `1` | 壓力仍高於閾值時，在首次壓縮後進行的額外嘗試次數。 |
| `maxOverflowRetries` | `1` | 已確認上下文視窗溢位後的最大重試次數；`0` 只停用恢復。 |
| `modelPolicies` | `[]` | 針對個別模型路由的精確 `{ provider, model, ...partialPolicy }` 覆蓋。 |
| `auto` | `true` | 啟用自動壓縮與溢位恢復；設為 `false` 則僅手動執行。 |

設定錯誤會快速失敗：未知設定、重複的按模型覆蓋、無效 token 數、兩種保留形式同時出現，或保留比例不小於閾值比例，都會在載入時拒絕外掛。模型首次使用時，`W − O − B` 必須為正，且解析出的保留預算必須低於觸發閾值。餘量為零時，必須在全域或對應模型策略中顯式設定正數 `maxTokens`。小視窗部署必須設定適合其容量的餘量；降低 `thresholdRatio` 可以提早壓縮。

### 壓縮執行時會發生什麼

最舊的平衡範圍會被替換為一條摘要訊息，近期尾部保持逐字不變；對話從摘要繼續。操作會報告壓縮了多少歷史項以及估算釋放的 token 數。如果沒有任何內容可以安全壓縮——例如整個對話就是一個不可分單元——則不會有任何改變，也不會向工作階段日誌寫入任何內容。如果沒有模型可以撰寫摘要（既未設定目標，也還沒有已路由請求），壓縮會失敗並給出清晰錯誤，提示你設定摘要提供者與模型，或先路由一次請求。

### 透過 /compact 按需壓縮

掛載 `dsh-command-compact` 後，在聊天 UI 中輸入 `/compact` 即可立即壓縮，即使未達到壓力閾值。命令會報告壓縮了多少歷史項以及估算節省的 token 數。當 agent 正在輪次中或壓縮已在執行時，`/compact` 會報告壓縮暫不可用；執行期間你傳送的提示詞會被接受，並在壓縮結束後才開始。

### 修剪超大工具輸出

在本包之前掛載 `dsh-compaction-tool-result-pruner`，即可在壓縮過程中修剪超大工具結果。修剪不發起模型呼叫，並可能完全省去摘要：當修剪後的對話在閾值之內時，壓縮會跳過摘要。修剪只在壓縮觸發條件滿足後執行——低於壓力的對話絕不會被觸碰。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋後端背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該後端建立在四項承諾之上：

- **一個測量服務為每個決策定價。** 單例 `ctx.tokenMeter` 會在同一個已消費日誌 revision 上測量最新規範已記錄 envelope 與目前表層。路由介面卡宣告請求圖片定價時，meter 會將其應用於圖片歷史。壓力、近期尾部保留、範圍選擇與縮減驗證使用同一套路由定價的節點數值；已記錄的替換影子價仍使用與路由無關的啟發式規則，使純投影 fold 保持一致。
- **日誌記錄的標記對就是事務。** 所有入口點共享一個先記錄標記的區域事務：驗證範圍與活動鎖，同步追加 `compaction/start`，準備並等待摘要，重新驗證，再追加 `compaction/summary` 與替換，最後恰好進行一次閉合嘗試。自動呼叫與顯式範圍呼叫要求數字標識的開放輪次歸屬與整個表層穩定；`compactNow()` 會預留空閒接納，使用 `turn: null`，允許所選 span 之外追加僅追加上下文，flush 每次已閉合嘗試，並在 `finally` 中釋放接納預留。
- **摘要複用提供者的熱字首。** 逐字回放 surface 節點 0 處 `system/message` 所承載的系統提示詞、上次已路由請求的工具與已遮蔽區域訊息，使輔助呼叫成為工作階段的真正字首，因此只有尾隨指令與摘要輸出未快取。
- **`summarize()` 是唯一的子類掛鉤。** 基於範本或遠端摘要器的子類可以覆蓋它，同時壓力、保留、被引用的源事件、縮減驗證與已遮蔽 token 計量仍由 token meter 負責。

### 自動觸發與溢位恢復

當 `auto: true` 時，序列 `agent/pre-step` listener 會在請求派生前檢查壓力：它透過 `ctx.tokenMeter` 為最新持久路由請求 envelope 定價，當壓力越過路由模型的閾值時，先剪枝，再在保留已定價近期尾部的同時摘要最舊的平衡範圍。每個選定範圍都從第一個不是 `system/message` 的 surface 節點開始，因此位於 surface 節點 0 的系統提示詞永不會被遮蔽；由歷史內提示詞更新追加的後續 `system/message` 是普通曆史，範圍可以遮蔽它，agent loop（智慧代理迴圈）的投影隨後會在二者文字不同時用目前提示詞替換節點 0（[決策規則](../../core/agent-loop/README.zh.md#understand-the-implementation)）。`agent/request-error` listener 回應提供者確認的 `CONTEXT_WINDOW_EXCEEDED`：它繞過常規閾值與保留策略，嘗試一次最大平衡頭部縮減，並且只在表層替換 generation 前進後才授權重試。取消全程保持最終決定權。

壓力策略從擁有持久路由的介面卡解析容量。容量缺失、輸出預留與餘量耗盡視窗，或保留預算不小於閾值時，手動壓力路徑會丟擲目標特定設定錯誤。自動 listener 會對該精確目標警告一次，並在設定修正前跳過主動壓縮；提供者確認溢位後的恢復仍然可用。

### 摘要機制

直接 `ctx.llm.stream()` 呼叫使用已設定的提供者／模型對與上限，退回到最新已記錄請求目標，然後再退回到 `AgentOptions` 對，而不執行僅用於 agent loop 的 `agent/request` 擴充功能點。該呼叫將 surface 節點 0 處派生的 `system/message` 作為 `messages` 的首項回放，後接已遮蔽區域訊息（包括位於其 surface 位置的被遮蔽歷史內 `system/message`），並提供 header 的有效工具供路由特定投影使用。所選介面卡必須解析回放訊息中的圖片引用或明確拒絕它們。呼叫將壓縮指令作為最後一條 user 訊息追加，在投影允許時保留提供者的熱字首 cache。空內容系統頭節點不貢獻訊息，但仍處於壓縮範圍之外。最終指令是凍結的 `RequestUserInput`，不含持久身份或來源；回放歷史和持久化檢查點仍然使用持久訊息。呼叫將 `GenerateOptions.purpose` 設為 `compaction`；只有返回文字進入檢查點，推理與工具呼叫都會被排除。圖片輸出會以 `UNSUPPORTED_CONTENT` 失敗，而不是消失。替換 user 訊息用 `<compacted-summary>` 標籤框定摘要；原始摘要保留在 `compaction/summary` 事件上。 呼叫還攜帶 `Session.toolHistory()`，供執行時投影延遲和保留定義；若字首缺少更新訊息，則使用有效宣告且不傳送 developer 更新。

### 區域事務

摘要請求失敗後，後端先檢查取消和選區穩定性，再觸發同步的 `compaction/summary-error`。恢復監聽器必須先記錄持久的輸入變更，才能請求重試。後端重新派生所選訊息，更新 token 價格及判斷摘要是否縮短輸入的基準。圖片省略外掛負責選圖；後續摘要失敗或取消後，已經記錄的省略仍然有效。

事務驗證表層範圍與持久鎖，追加 `compaction/start`，透過掛鉤生成摘要，重新驗證穩定性（自動呼叫要求整個表層、手動呼叫只要求所選範圍），拒絕不縮小源內容的摘要，追加 `compaction/summary` 與替換 `user/message`，並恰好進行一次 `compaction/end` 嘗試。活動的未匹配 start 是持久鎖：位於較新 `session/end-seed` 之前的未匹配標記是先前生命週期留下的陳舊證據，不會阻塞；位於該邊界之後的標記報告 `busy`。閉合失敗會有意留下阻塞性的未匹配標記。完成清理與持久化後，取消仍具有最終決定權。

### 設定解析

`resolveConfig` 驗證並分離預設值，`resolveTargetPolicy` 合併精確的提供者／模型覆蓋，`resolveCompactSpec` 要求顯式傳入介面卡容量與路由請求的輸出預留，以解析觸發閾值和保留預算。預留取自生效信封的 `maxTokens`，否則退回到介面卡預設值，再退回到零。策略解析絕不諮詢模型發現（`listModels()`）；只有持久路由的容量才重要。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`BasicCompactionEngine`、自動 listener、入口點分發 |
| [`src/region.ts`](src/region.ts) | 保留選擇與共享的先記錄標記壓縮事務 |
| [`src/summarizer.ts`](src/summarizer.ts) | 預設 `ctx.llm.stream()` 摘要、檢查點框定、安全摘要投影 |
| [`src/config.ts`](src/config.ts) | 載入時驗證與路由模型策略解析 |
| [`src/types.ts`](src/types.ts) | `BasicCompactionConfig` 與已解析策略詞彙 |
| — | 不釋出執行時不變式配套條目；除所屬 seam 強制執行的約定外，本包不公開獨立事件序列或可變資料關係。持久標記對仍可在工作階段日誌中觀察。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面；它們從共享 seam 逐步進入可選配套工具與決策證據。

- [壓縮 seam](../compaction/README.zh.md)——本後端實作的壓縮約定。
- [壓縮子系統參考](../../../docs/subsystems/compaction.zh.md)——壓縮詞彙、結果與服務行為。
- [工具結果修剪器](../compaction-tool-result-pruner/README.zh.md)——先修剪超大工具輸出的可選配套工具。
- [人類 /compact 命令](../command-compact/README.zh.md)——無需等待壓力的按需壓縮。
- [Token meter](../../llm/token-meter/README.zh.md)——決定何時壓縮的測量服務。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-compaction-basic)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 工作階段歷史

#### 模型看到的內容

成功步驟越過閾值後，如果已載入可選修剪器，超大工具結果會先被改寫。如果仍需摘要，下一個請求會收到下方檢查點前導、一個空行、`<compacted-summary>`、根據資料生成的摘要以及 `</compacted-summary>`。溢位恢復會根據使表層前進的任何替換重建立即重試。檢查點會替換已選較早範圍，後面跟隨已保留的近期單元。

##### 工作階段檢查點前導

```markdown
This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.
```

#### Token 影響

不依賴模型的剪枝可以完全避免輔助呼叫；否則它會在摘要替換較早範圍之前縮減該呼叫的 transcript（文字記錄）。替換會縮減未來輸入歷史，而非追加第二份副本。摘要會保留到後續壓縮將其替換，但不可分的非工具單元仍可能超出預算。

#### KV Cache 影響

它是替換，而非僅追加。每個檢查點都會使從第一個已替換歷史 token 起的複用失效；該範圍之前未更改的請求字首仍可複用。

### 輔助摘要器請求

#### 模型看到的內容

摘要模型接收系統提示詞與已遮蔽區域的歷史，其中工具宣告和 developer 更新按其路由投影，後面跟隨一條最終 user 訊息，即下方壓縮指令。工作階段模型絕不會看到該私有請求或其推理；只有返回文字會被儲存。

##### 壓縮指令（最終 user 訊息）

```markdown
You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.

Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.

## Primary Request and Intent
- [the user's original and evolving goals; quote verbatim where the exact wording matters]

## Key Technical Concepts
- [technologies, frameworks, patterns, and conventions in play]

## Files and Code
- [exact path: why it matters, key changes or snippets]

## Errors and Fixes
- [error: how it was resolved, plus any related user feedback]

## Pending Jobs
- [explicitly requested work not yet completed]

## Current Work
- [precisely what was in progress at this checkpoint]

## Next Step
- [the single next action, directly in line with the most recent request, or "(none)"]

## Critical Context
- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]

Rules:
- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.
- Capture user feedback and explicit instructions faithfully, especially corrections.
- Do NOT mention this summarization request or that the context was compacted.
- Output only the checkpoint text: do not call any tool or take any other action.
- If the conversation already contains a <compacted-summary> block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.
```

#### Token 影響

這是一次獨立模型呼叫：輸入是已回放工作階段字首加固定指令，輸出受 `maxTokens` 限制。收斂重試可能多次支付這項成本。

#### KV Cache 影響

已回放系統提示詞、工具與已遮蔽區域訊息與工作階段最後一個已路由請求逐字匹配，因此提供者的熱字首 cache 可複用至尾隨指令之前；只有該指令與摘要輸出未快取。將摘要器路由到不同提供者／模型，或壓縮非頭部範圍，都會放棄該複用。

## 已知限制與暫緩事項

<a id="known-limitations-and-deferred-work"></a>


這些限制說明自動壓縮何時不合適，或何時需要特別注意；它們是目前包約束。

- **計量準確度取決於固定啟發式規則**——可複用提供者用量缺失時，會退回到字元數加結構開銷，而非精確的 token 化；只有在介面卡宣告瞭請求圖片定價的路由上，圖片出現處才攜帶提供者精確的視覺 token。
- **溢位分類由介面卡維護**——提供者措辭可能改變；兩個 DeepSeek 介面卡將可識別的上下文限制失敗規範化為 `CONTEXT_WINDOW_EXCEEDED`。
- **部分不可分單元與僅 envelope 溢位仍不在表層壓縮範圍內**——恢復無法縮減系統／工具／字首、拆分不可分的非工具節點，或修復不可剪枝剩餘部分仍超出視窗的工具單元。可選 pruner 可以縮減原本不可分工具對內的文字型工具結果主體。
- **`compactRegion` 要求存在未結束的輪次**——在完全關閉的工作階段上手動呼叫會丟擲異常（「no open turn」），而不是執行壓縮。
- **摘要失敗會保留最新持久表層**——任何替換前，自動路徑會記錄警告，並攜帶完整超預算曆史繼續。如果剪枝已落實，後續摘要失敗會從該持久剪枝表層繼續。因達到 `maxTokens` 而發生的摘要截斷（隱藏推理 token 可能會耗盡該額度）遵循同一規則。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性；已交付行為以上文、包程式碼與所連結的 Agent Note 為準。

- **預設比例，尚未決定**——`thresholdRatio: 0.8` 與 `retainRatio: 0.16` 是固定預設值；存在透過 `modelPolicies` 進行的按模型調優，但沒有基於語料的理想值指引記錄。
- **tokenizer 精確測量，暫緩**——token meter 每 token 四字元的啟發式對 CJK 文字與 JSON Schema 定價偏低；精確 token 化仍是測量服務的開放方向。
- **規範錯誤之外的溢位恢復，尚未決定**——恢復僅針對 `CONTEXT_WINDOW_EXCEEDED` 觸發；其他提供者側上下文失敗不參與分類。

</details>
