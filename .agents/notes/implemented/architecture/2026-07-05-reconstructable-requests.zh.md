# Agent Note: 每個 LLM 請求都可從工作階段日誌重建

Status: implemented

[English](2026-07-05-reconstructable-requests.md) | 中文

## 問題

請求流水線未能保證字首穩定性以利用提供者快取，工作階段日誌也無法重建模型實際看到的內容。日誌遺漏了模型、系統提示詞和工具 schema，同時允許逐次呼叫的請求改寫。因此快取行為和回放等價性取決於碰巧載入了哪些外掛。

快樂路徑的參考形態是 MiniCode 的 `LLMClient`：一個有狀態的對話用戶端，隨對話推進只做追加而不重建，僅在系統提示詞、工具集或壓縮（compaction）真正改變了模型需要看到的內容時才重置。本 Agent Note 回答的設計問題是：如何在不放棄事件溯源的前提下獲得這種紀律。

## 決策

### 原則

**模型可見 ⟺ 已持久引用。** 凡到達模型請求的內容都必須能從工作階段日誌及其引用的不可變內容定址物件中重建。可檢查的推論：任何人持有日誌、日誌引用的附件物件和固定程式碼版本，即可逐位元組重建迴圈的每個請求。純文字 `GenerateOptions` 仍是日誌的純函式；含圖片請求還會在介面卡序列化期間透過 `ctx.attachments` 解析 `ImageAttachmentRef` 位元組，其中對內容摘要及已記錄中繼資料的驗證使物件查詢具有確定性，並在資料缺失或損壞時明確失敗。直接的一次性呼叫（壓縮的 summarize 呼叫）記錄其信封標量（`compaction/summary.{provider, model, maxTokens}`），其輸入是對日誌區域及這些引用物件的確定性程式碼運算——由於只有迴圈會標記請求歸屬，因此它們不在不變式內。

字首快取穩定性是推論 #1，而非標題：一個僅追加的日誌經逐節點純函式投影，在 header 不變時自然產出前一請求的追加擴充功能——穩定性是湧現的，不是管理出來的。位元組精確的審計/回放是推論 #2；帶*可歸因*漂移的恢復與 fork 是推論 #3。

### 機制

**訊息。** `Session.deriveMessages()` 帶快取：每個 surface 條目在首次出現時透過公開的逐事件函式 `deriveEventMessage(event)` 精確投影一次；surface 重寫（壓縮的 `replace`，即 `SurfaceManager.replaceGeneration`）觸發重建。呼叫方每次獲得一個新陣列，底層是共享的深度凍結訊息：透過投影變異已記錄的歷史是不可表達的（會拋異常），取代了舊的逐次呼叫克隆隔離。外部重建器對日誌字首摺疊同一個公開函式，因此不可能有兩條路徑產生分歧。

`EpochHeader` 記錄請求的非歷史狀態：呼叫設定和工具 schema。寫入方省略 `tools: []` 與 `adapterDefaults: {}`；目前接納拒絕這些欄位以及任何 `header.system`，而不修復它們。僅含空白的系統訊息內容、`config.stop: []` 與巢狀擴充功能保持原樣。[V3 規範信封決策](2026-09-06-v3-canonical-session-envelopes.zh.md)負責歷史轉換。渲染後的系統提示詞是派生歷史——surface 第 0 號節點上的 `system/message` 事件，見[surface 節點 Agent Note](2026-09-02-system-prompt-as-surface-node.zh.md)——因此提示詞變更是 surface 替換而不是 header 變更。介面卡提供的推理強度與 token 預設值會保留其 `adapterDefaults` 來源資訊；Web 從日誌恢復模型選擇時會省略介面卡持有的推理強度，因此下一次解析不會把相同的有效設定重新歸類為顯式選擇併產生虛假變更。`request/header` 始終寫入完整快照：首個迴圈實例使用 reason `initial`，後續實例使用 `resume`，實例內變更使用 `change`，內容未變的封裝顯式開啟訊息序列或跟隨表層替換時使用 `series`。如果發生變化的請求同時開啟序列，`change` 快照會攜帶 `startsSeries: true`，無需重複 header 即可保留這兩個獨立事實。普通的僅追加後續 Turn、同一序列內後續的 Step 與重試沿用最新快照。`foldRequestHeader` 選擇最新快照。舊的 `request/header-delta` 事件和已移除的 `fallback` reason 在追加或載入時都會被拒絕。

每個擬議步驟先領取其 inbox 批次，組裝系統提示詞與工具，把渲染後的提示詞與存活的 `system/message` 節點比對投影，再執行 `agent/pre-step`。reject 不開啟步驟；enter 開啟 `step/start`，把變化的提示詞作為 `system/message` 追加或第 0 號節點替換提交，把最終訊息批次記錄為 `user/message` 事件，並可使用 `startsRequestSeries: true` 宣告獨立序列。`agent/request` 只能替換凍結的呼叫設定種子。迴圈記錄所需的 initial、resume、change 或 series 完整快照，從派生訊息（系統訊息在先）與該不含 `system` 欄位的 header 建置 `GenerateOptions`，凍結請求但保持 `AbortSignal` 活躍。[請求凍結證據決策](../simplification/2026-09-06-agent-request-freeze-evidence.zh.md)擁有訊息完整凍結的複用規則和每次請求的本地 header 凍結規則。首次呼叫設定從顯式的 `AgentOptions` 出發，保留 fork 覆蓋和恢復重設定；後續呼叫從摺疊後的 header 出發。

**已開啟步驟是重建邊界。** 進入步驟的 `user/message` 批次與任何新寫入的 `request/header` 都位於請求分派之前。原子領取後發生的注入加入後續請求；必須影響本次請求的監聽器則透過 `agent/pre-step` 返回訊息。header 重建選擇該步驟的 `request/header`，或在無新 header 寫入時沿用前一個快照。

**強制執行。** `dsh-agent-loop/invariant` 配套外掛向 `ctx.invariants` 註冊，並在被選用時透過一個全新的 `Session` 獨立重建每個迴圈請求，使活躍快取無法為自身背書，然後在 `llm/stream` 處比較訊息和摺疊後的 header 欄位。迴圈透過 `dsh-llm` 的 `markAgentLoopRequest()` 記錄精確的凍結請求；這一程序內標識讓配套外掛和其他請求觀察者識別對話工作，而直接的一次性呼叫無論其凍結形狀或工作階段 id 如何都保持排除。正確性依賴於序列有界的重建，而非監聽器順序。帶金鑰的 e2e 要求首次請求之後有正值的 cache-read token；逐步驟用量是生產訊號，header 變更或壓縮表現為下一步驟的 cache-read 下降。

### MiniCode 形態：採納，以事件日誌為真源

與 MiniCode 相同，對話僅追加推進，僅在模型可見狀態變更時重置。與 MiniCode 不同，事件日誌仍是真源，因為它同時擁有持久化、恢復、邊界、工具配對，並記錄派生事件到其輸入事件的關聯。`Session` 快取從日誌推導的訊息和 header 摺疊結果，使每個請求都可獨立檢查。

## 曾考慮的替代方案

- **用戶端作為真源**（照搬 MiniCode）：在日誌之外多出一個執行時真相——兩者漂移而無人察覺；見上節。
- **映像日誌的有狀態傳輸用戶端**：重複對話狀態，需要圍繞監聽器做復原，留下未記錄的編輯路徑，且仍無法重建請求 header。Session 擁有的快取加已記錄的 header 避免了這些分裂的真相。
- **逐次呼叫的請求標量**（一個可自由變異的設定傳給每次 `agent/request` 分發）：監聽器可以零記帳地逐次切換模型，悄然放棄本設計旨在保護的提供者快取。設定是逐對話的已記錄狀態；waterfall（瀑布式事件）提議，日誌記錄。
- **檢測並報告**（比較連續請求，發散時告警）：事後捕捉違規；違規請求仍可建構並行出。因違規必須在介面層面不可表達而否決。
- **事件驅動組裝**（僅在變更訊號時重新渲染）：存在漏訊號的 bug 類別——工作階段中途註冊的工具發出 `tools/change` 而非 `system-prompt/change`，第三方提供者可能什麼都不發。逐步驟渲染加值比較在零訊號紀律下即可穩健工作。
- **自定義 header-delta 編解碼器**（系統行編輯、按名稱鍵控的工具編輯、完整設定/字首替換）：減少了重複位元組，卻複製了表示及其 diff/apply/fallback 機制。完整快照只保留一種回放表示。
- **引用前一個 header 的輕量 series 標記**：減少重複的提示詞與工具位元組，但從該標記開始的視窗若不再讀取前序，就無法渲染或重建請求。自包含的完整快照讓持久化、區域性歷史和快照固定共用一種表示。
- **Header 快照上的敘事性變更欄位列表**：可以透過比較連續快照推導。`reason` 仍保留，因為實例邊界無法從快照值推導。

## 後果

- 一個日誌無法解釋的請求不可能被意外建構——無論是迴圈還是監聽器；變異已建置的請求會拋異常；每個 header 變更都是持久的、可 diff 的日誌事件。
- 模型可見上下文使用已記錄訊息通道。`agent.inject()` 與工具 `additionalContexts` 進入 inbox，等待後續領取；必須與目前已領取批次一起結算的上下文由 `agent/pre-step` 返回。每個進入步驟的值都是帶來源的持久 `user/message`，只付出一次代價並在後續成為可快取字首，代價是會在歷史中累積直至壓縮。
- 在提供者處仍需全價計算的內容是固有的且已記錄的：壓縮（其 `compaction/*` 事件和替換條目）、真正的提示詞變更（對 surface 第 0 號節點的 `system/message` 替換）、真正的工具或設定變更（reason 為 `change` 的 `request/header`），或帶漂移的程序邊界（不同的 `resume` 快照）。提供者自身的 reasoning-content 排除由伺服器端管理。
- `agent/pre-step` 是目前請求的訊息通道；直接修改 inbox 則是最終進入後續請求的通道。
- 工具結果裁剪無需新機制：一個已記錄的單條目 surface replace（`startSeq === endSeq`），攜帶同一 `callId` 下裁剪後的 `tool/result`——屬壓縮家族，回放正確，快取失效由相同的壓力邏輯批次處理。
- 無法讀取的被引用附件物件仍會讓模型請求失敗；[附件自動隔離](../../proposed/bug-fix/2026-08-20-attachment-read-quarantine.zh.md)記錄了不削弱位元組精確重建的擬議恢復方案。
- 工作階段日誌會為每個迴圈實例、真實變更和後續模型訊息序列增加一個 `request/header` 快照。重複完整工具目錄比 delta 編解碼器更大，但相對分片密集型日誌仍然很小，並保留一種自包含的回放表示。目前日誌保留這一種表示；凍結的歷史遷移邊會在建構目前 Session 前顯式拒絕舊版 delta 事件。
- 快照 fixture 包含每個重複的 series header。無金鑰 refresh 負責這些確定性日誌變化；快照 harness 只為 initial 與真實 change 修訂固定提示詞和工具 sidecar，並讓 `series` 快照複用目前修訂。寫入檔案系統的 fixture 繼續以規範化的撰寫形式儲存，工具參數使用 cwd 相對路徑，因為回放只對 cwd 無關的參數路徑做往返。
