# Agent Note: LLM 暫時性請求失敗的有界恢復

Status: implemented

[English](2026-06-21-bounded-llm-request-recovery.md) | 中文

[按提供者設定的請求重試策略](../../archived/feature/2026-07-24-provider-retry-policies.md)在此基礎上增加了確切提供者設定與顯式無界 mode。本說明繼續負責結構化失敗事實、失敗嘗試的恢復邊界、normal mode 的暫時性預設值、可見的單次嘗試和持久重試狀態。[LLM（大語言模型）流的終止失敗](2026-07-29-terminal-llm-stream-failures.zh.md)取代了其中關於丟擲錯誤身份和流 sidecar 的機制。

## 問題

提供者介面卡可能在分發或迭代時丟擲異常，也可能以 `finish { kind: 'error' | 'aborted' }` 結束。最終介面卡邊界會在 `dsh-agent-loop` 接收前把丟擲值規範化為該終止 finish 協定；middleware 與結果處理缺陷仍會丟擲。loop 會將終止模型請求失敗交給 `agent/request-error`。未被處理的失敗是終態；處理失敗的監聽器修復策略自有狀態，返回 `{ kind: 'retry' }`，並停止 waterfall（瀑布式事件）委託。[重試動作決策](../simplification/2026-07-27-request-error-retry-action.zh.md)規定這一返回約定。

該邊界已能安全地再次發起請求。每個失敗 stream 會提交一個包含精確緊湊 stream 的僅日誌 `assistant/attempt`，message derivation 會忽略它；系統只會在 terminal finish 成功並組裝 `assistant/message` 後分派工具呼叫，重試則從持久 surface 重建下一次 attempt。因此，harness 無需引入第二套回應生命週期或暫定輸出協定，即可分隔兩次 attempt。

此前的邊界還留有三個較窄的缺口。

- 提供者失敗只保留訊息，通常還會保留一個 code。HTTP 狀態、重試延遲和提供者請求 id 會被丟棄，或者只能透過提供者專用錯誤物件恢復，因此通用恢復機制如果不解析文字，便無法作出決策或解釋決策。
- 重試的歸屬因介面卡而異。手寫 DeepSeek 介面卡只嘗試一次，pi-ai profile 則可以啟用庫內部的不透明重試。如果把隱藏的傳輸重試與 `agent/request-error` 監聽器結合，嘗試次數會成倍增加，中間失敗也不會記入工作階段日誌。
- 恢復後的失敗沒有持久狀態事實。失敗的步驟和分片仍可重建，但觀察者無法得知 agent（智慧代理）是否在有意退避、將等待多久，以及等待原因。長時間的靜默等待看起來與迴圈停滯無異。

預設策略的目標是從同一個顯式提供者／模型請求的暫時性失敗中進行有界恢復。提供者或模型故障轉移、回應拼接和語義輸出修復都屬於其他問題，目前沒有消費方。

## 決策

### 保留失敗事實，不嵌入策略

`@deepseek-ai/dsh-llm` 匯出唯一的可 JSON 序列化 `LlmFailure` 載荷：

```ts ignore-check
type ProviderRequestId = Branded<'ProviderRequestId'>

interface LlmFailure {
  message: string
  code: string
  status?: number
  providerRetryAfterMs?: number
  requestId?: ProviderRequestId
}
```

`code` 仍是 `HarnessError` 建立的 provider-neutral 機器路由分類；新欄位是在 provider 邊界觀測到的事實。`ProviderRequestId` 由 `dsh-llm` 擁有並建構，序列化後是 provider 發放的字串。該 payload 有意不包含 `retryable`、`failover`、`partialOutput`、provider、model、phase 或 route id。是否可重試屬於 policy，provider/model 已位於持久 request header 中，部分輸出由失敗 attempt 的嵌入式 stream 保留。

`LlmError` 攜帶 `failure: LlmFailure`，並保持 `failure.code === error.code`。`FinishReasonMap.error` 和 `FinishReasonMap.aborted` 攜帶同一載荷，而不是並行的失敗形狀。最終介面卡邊界會從介面卡丟擲值中分離這些事實，並行出相應的終止 finish；未知 SDK 異常會獲得 `UNKNOWN` 載荷。精確的丟擲物件身份不會跨越 LLM 流 seam。

agent loop（智慧代理迴圈）會將終止 finish 的 `LlmFailure` 傳給 `agent/request-error`，並在記錄未恢復的 `turn/end.reason` 時使用同一載荷。

介面卡會先提取結構化事實，再退回到訊息檢查。它們會驗證 HTTP 狀態，將 `Retry-After` 的秒數或日期解析為正的有限毫秒延遲，在提供者公開請求 id 時將其品牌化，並區分自身超時與呼叫方中止。提供者專用 code 和訊息可以細化對映，但恢復監聽器不會解析它們。

共享的暫時性 code 集有意保持很小：介面卡針對 `RATE_LIMIT` 和 `SERVER` 的對映，遠端失敗使用的顯式 `TIMEOUT` 和 `TRANSPORT` code，以及提供者回應已完成卻沒有內容塊時使用的 `EMPTY_RESPONSE`。兩個介面卡都會把最後一種情況歸類為錯誤 finish；詳見[空模型回應可重試](../../archived/bug-fix/2026-07-24-empty-model-response-is-retryable.md)。身份驗證、配額、無效請求、上下文溢位、協定、中止和未知失敗都保留不同的穩定 code，且預設不屬於暫時性失敗。新增 code 需要介面卡 fixture（測試前置資料）和已記錄的策略決策；無需擴充功能第二個失敗類列舉。

### 將重試策略放在現有失敗步驟擴充功能點上

`@deepseek-ai/dsh-llm-retry` 是監聽 `agent/request-error` 的函式外掛。它不引入服務或新的迴圈分支；agent-loop 包僅會更改透過現有失敗步驟恢復控制流攜帶的資料。

`agent/request-error` waterfall 攜帶目前 `LlmFailure`、在連續恢復序列中授權重試的不可變先前失敗列表，以及提供服務的註冊項所攜帶的不可變重試策略。迴圈只傳遞而不解釋該策略；它擁有連續失敗歷史，並在模型請求成功後清除。`dsh-llm-retry` 的 normal 策略統計由同一項確切提供者策略安排的持久重試記錄，`dsh-compaction-basic` 則維護自己的上下文溢位預算。因此，暫時性失敗與上下文溢位交替出現時，會各自獨立消耗其有限預算；最大請求數等於 1 加上所有已載入有限預算之和。

目前設定形狀見 [llm-retry README](../../../../packages/llm/llm-retry/README.zh.md)。提供者介面卡會註冊巢狀的 `retryPolicy`；省略時使用 normal 預設值：兩次暫時性重試、500 毫秒初始延遲、10 秒延遲上限、10% 抖動，以及上述五個暫時性 code。計數與延遲邊界參考了所調查實作中較保守的一端：[OpenCode 使用兩次請求重試，延遲邊界為 500 毫秒／10 秒](https://github.com/anomalyco/opencode/blob/9976269ab1accfc9f9dc98a4a688c516934de422/%70ackages/llm/src/route/executor.ts#L36-L39)；[Pi 將三次 agent 級重試與提供者重試分開，且提供者重試預設為零](https://github.com/earendil-works/pi/blob/3da591ab74ab9ab407e72ed882600b2c851fae21/%70ackages/coding-agent/docs/settings.md#L139-L147)；[Codex 使用有限請求／流預算以及五分鐘空閒超時](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/model-provider-info/src/lib.rs#L25-L33)。10% 抖動參考 [Codex 的有界抖動](https://github.com/openai/codex/blob/0fb559f0f6e231a88ac02ea002d3ecd248e2b515/codex-rs/codex-client/src/retry.rs#L40-L47)。

對於預算未耗盡的合格失敗，從 1 開始的暫時性重試計數使用有界指數退避。有效的 `providerRetryAfterMs` 只有在不超過 `maxDelayMs` 時才會取代指數退避；提供者延遲更長時，系統會委託給下一監聽器，而不會違反提供者指令提前重試。本地退避乘以 `[1 - jitterRatio, 1 + jitterRatio]` 內的注入隨機因子，並將最終值限制到 `maxDelayMs`；提供者延遲不加抖動。

外掛擁有一個覆蓋其整個生命週期的 `AbortController`，並跟蹤每個活躍的恢復回呼，包括委託的 waterfall 工作與退避。effect 的 dispose（資源釋放）會先登出監聽器，再中止並等待活躍回呼；中止會勝過較晚到達的委託重試決策，被捕捉的回呼在外掛 dispose 後既不能重試，也不能進入其 waterfall 的剩餘部分。儘管 Cordis 已捕捉該監聽器，此設計仍能使 HMR（熱模組替換）的 dispose 達到完全停穩。

休眠前，`dsh-llm-retry` 會追加一條不進入表層的 `llm/retry` 工作階段事件，其中包含輪次、失敗步驟、提供者、策略 mode、完整的解析後策略 key、提供者策略重試編號、特定於 mode 的有限上限（如有）、計劃延遲和 `LlmFailure`。該 key 會對 code 集排序，並在提供者路由被行為不同但 mode 相同的策略替換時分隔重試歷史。該外掛擁有 `SessionEventMap` 宣告合併，並透過其瀏覽器安全的 `./types` 子路徑匯出載荷；`dsh-session` 繼續負責通用持久化，不會吸收可選策略的詞彙。事件記錄已安排的內容，而不是下一個請求已完成；延遲期間取消隨後會在 `turn/end` 中可見。因為該事件的目的是表示執行狀態，而不是收集跟蹤資料，所以它會與生產渲染器及回放／快照覆蓋一起交付。

對非暫時性 code、耗盡的策略預算或超出上限的提供者延遲，監聽器會呼叫 `next()`。這保留了與上下文溢位恢復及後續策略外掛的組合能力。對自身處理的失敗，它會記錄並等待延遲，然後在不委託的情況下返回 `{ kind: 'retry' }`。輪次取消和外掛 dispose 會結束等待且不返回重試動作，此後仍以迴圈的取消／dispose 檢查為準。

`dsh-base` 與 `dsh-sdk-minimal` patch 將該外掛作為顯式設定行載入，因此基於 base 的 profile 與獨立 SDK profile 使用同一套按提供者路由的策略。庫消費方仍需顯式組合外掛：省略該外掛時，請求失敗保持終態。

### 由單一層負責可見的嘗試

介面卡每次呼叫 `stream()` 只執行一次提供者請求。pi-ai 介面卡移除公開的 `maxRetries` 和 `maxRetryDelayMs` profile 欄位，並停用庫內部重試；手寫介面卡保持現有的單次嘗試行為。這樣既避免 SDK 預算成倍放大 agent 預算，又能確保每次暫時性重試都由其記錄在案的失敗嘗試加 `llm/retry` 表示。

`ctx.llm.stream()` 仍是原始的單次嘗試 waterfall。壓縮（compaction）摘要等直接呼叫方會收到結構化失敗，但不會自動獲得重試，因為它們沒有 agent 步驟邊界，也沒有可供分隔嘗試的通用持久位置。未來的直接呼叫消費方可能會需要一個緩衝輔助函式，僅在尚未發出任何分片時重試；本決策不增加此類輔助函式。

### 在能夠終止停滯流的位置施加邊界

每個介面卡都公開一個經過驗證的 `streamIdleTimeoutMs` 設定欄位，預設值採用上文引用的五分鐘先例。該間隔不超過 Node 的最大定時器延遲，因此不會被鉗制為 1 毫秒。它覆蓋每個尚未完成的迭代器 `next()`：從消費方請求下一項開始，到介面卡識別到提供者活動為止；消費方在兩次 `next()` 呼叫之間花費的時間不屬於提供者空閒時間。DeepSeek SSE（Server-Sent Events）註解計為傳輸活動，但絕不會成為 `StreamChunk` 值或工作階段日誌事件。

`@deepseek-ai/dsh-timeout` 公開一個可重新佈防的空閒看門狗原語。一個穩定的區域性 `AbortController` 會與呼叫方訊號融合，並在整個介面卡呼叫期間傳給傳輸層；每個尚未完成的 `next()` 都會佈防看門狗，該呼叫完成時解除佈防，下一次請求資料時再重新佈防。帶外傳輸活動會呼叫 `pulse()`，在不產生值的情況下為尚未完成的需求重新佈防。超時會使用能力自身擁有的 `TimeoutReason` 中止這個穩定控制器，`finally` 則會清除定時器。介面卡將自身看門狗歸類為 `TIMEOUT`，將更早發生的上游中止歸類為 `ABORTED`。現有的一次性 `deadline()` 不會被描述為滑動計時器。

邊界測試證明兩個實際傳輸層都能終止。手寫介面卡會中止其 fetch／reader，pi-ai 介面卡會把穩定訊號對映到 SDK，並證明 SDK 會關閉回應。如果定時器只拒絕消費方 promise，卻讓請求繼續執行，就不滿足此約定。

### 在現有日誌中分隔嘗試

失敗 attempt 會追加帶嵌入式 stream 的 `assistant/attempt`，但絕不追加 surface `assistant/message` 或分派工具。重試在失敗 turn 與 step 內繼續，從持久 surface 重建請求，併產生自己的 settlement；只有最終結果才會關閉 turn。step 開啟時，UI 可以渲染瞬態 `assistant/live-chunk` update；當 `llm/retry` 標識失敗 attempt 或 `turn/end` 記錄失敗時，UI 再結算它。Web 會驗證完整 retry payload contract，把每條 producer-correlated `retryId` chain 投影為穩定一行並更新到最新 attempt，再從 `llm/retry-started` 與所屬 turn、step boundary 的關閉派生 scheduled、started 或 cancelled 狀態。倒計時以瀏覽器收到 event 的時刻為計劃延遲起點，而不是 Host event clock；它按向上取整且不低於 1 秒的秒數顯示，只在未結算時動畫，並把最新失敗詳情摺疊在該行後。即使失敗 attempt 沒有 surface Assistant node，retry node 也會錨定自己的 trajectory turn。Message derivation 會忽略 `assistant/attempt`，Web 在歷史重建時應用同一投影，因此重新整理不會把失敗 partial 提升進模型歷史，也不會生成重複 retry row。

如果恢復預算耗盡，最終失敗會連同結構化事實在 `turn/end.reason` 中儲存一次。Web 會在該序列位置派生一個 `turn-error` 節點，並內聯渲染適合展示的訊息與可選錯誤碼；AUTH 投影會把可能回顯憑證片段的提供者文案替換為 `API key is invalid`，原始診斷仍保留在工作階段日誌中。即時事件和歷史回放使用同一套摺疊邏輯。暫時性恢復繼續期間，`llm/retry` 是每次中間失敗與延遲的持久歸屬位置；終態錯誤行只在 `turn/end` 記錄錯誤後才存在，而由於耗盡的恢復與失敗共享同一輪次，該輪次的重試歷史絕不會抑制這一行——定格的重試鏈與終態錯誤並列渲染。本決策不增加獨立的最終錯誤事件或回應 id 詞彙。

## 不在範圍內

- 自動提供者或模型故障轉移。請求已顯式選擇一個提供者和模型，提供者註冊表也有意規定每個提供者只由一個介面卡負責。
- 在成功的終止性 finish 後重試或繼續，或將兩次嘗試的分片拼接成一條 assistant 訊息。
- 修復格式錯誤的工具參數、拒答、內容過濾或其他語義模型輸出。
- 斷路器、共享提供者健康狀態或跨 agent 重試預算。
- 在沒有生產消費方的情況下，把 `llm/stream` 改造成回應生命週期或增加便利的生成 API。

## 考慮過的替代方案

- **在 `llm/stream` 或提供者 SDK 內部重試**：拒絕採用，因為原始流一旦發出分片便沒有持久嘗試邊界，隱藏的 SDK 重試會成倍放大預算，而且兩條路徑都無法一致地記錄每次失敗嘗試。
- **向 `dsh-llm` 增加回應開始、中斷、丟棄、失敗和提交事件**：拒絕採用，因為 agent 日誌已經分隔原始分片、成功訊息和編號嘗試。第二套狀態機會重複歸屬關係，又不能支援有界的同路由重試。
- **增加邏輯路由、能力矩陣和故障轉移選擇**：拒絕採用，因為目前請求已經顯式指定提供者和模型，每個提供者由一個介面卡負責，而且沒有目前消費方要求自動退回或能夠證明語義相容性。
- **把 `retryable` 或 `failover` 放在 `LlmFailure` 上**：拒絕採用，因為介面卡報告事實，部署策略決定動作。同一個 429 可以在互動式組合包中重試，也可以在成本受限的批處理中被拒絕。
- **只要呼叫方仍處於活躍狀態就無限重試**：[按提供者設定的策略](../../archived/feature/2026-07-24-provider-retry-policies.md)對顯式 `always` 設定項推翻了這項拒絕，同時保留有界的 normal mode 作為預設值。
- **只透過程序 logger 記錄重試狀態**：拒絕採用，因為程序日誌無法重建工作階段行為，也不能驅動回放後的 UI 狀態。
- **只保留扁平 code**：拒絕採用，因為重試延遲和提供者請求 id 是結構化的提供者事實，而當不同協定失敗共用一個穩定 code 時，診斷還需要 HTTP 狀態。

## 驗證

- `LlmFailure` 是介面卡丟擲、錯誤 finish 和中止 finish 使用的唯一可序列化載荷；在可用時，規範化保留穩定 code、狀態、重試延遲、品牌化的提供者請求 id，以及呼叫方中止與介面卡超時之間的分類。
- 介面卡丟擲值會在抵達消費方前成為終止失敗分片；middleware 與消費方異常仍在模型請求恢復之外丟擲。
- DeepSeek 和 pi-ai 介面卡測試覆蓋具有代表性的 400、401/403、429、5xx、連線、格式錯誤／截斷流、超時、中止、Retry-After 秒數／日期、請求 id 和未知 SDK 錯誤路徑，恢復策略無需解析訊息文字。
- pi-ai 將 SDK 選項固定為零次重試，並針對可重試的提供者回應執行一次可觀測的線路請求嘗試；獨立測試確保移除任一邊界都會失敗。
- `agent/request-error` 攜帶目前失敗事實、不可變的先前已重試失敗事實，以及提供服務的註冊項所攜帶的不可變重試策略；成功會清除歷史，暫時性失敗／上下文溢位交替發生的整合測試證明兩種策略只消耗各自的有限預算。
- 每個提供者介面卡都在 Loader 啟動時驗證其巢狀重試策略，`ctx.llm` 則將該策略與路由一同捕捉；normal mode 會委託不合格路徑，而且在沒有其他策略時最多發起 `maxRetries + 1` 次提供者請求。
- 退避期間執行 HMR 的測試證明：dispose 過程會登出監聽器、中止並等待其捕捉的回呼，dispose 後不發出重試決策，也不留下存活的定時器或 promise。
- 純單元測試覆蓋暫時性 code 選擇、指數退避和抖動邊界、有效及超出上限的 `Retry-After`、耗盡的預算、確定性定時器／隨機數掛鉤，以及退避期間中止。
- 真實 agent-loop 測試覆蓋分片前失敗、部分分片後失敗、丟擲及帶內失敗、在同一輪次內重試至成功、耗盡後寫入結構化 `turn/end.reason`，以及與 `dsh-compaction-basic` 上下文溢位恢復的組合。
- 部分分片整合測試證明：失敗分片仍歸屬於失敗步驟，該步驟不會提交 assistant 訊息或工具副作用，成功的重試會記錄自己的分片 seq 和提供者／模型路由。
- 外掛擁有的不進入表層的 `llm/retry` 事件可在 JSONL 往返後保留，被訊息派生忽略，並驅動 TUI 和 Web 撤回及計劃重試渲染。用戶端測試覆蓋完整的 wire 驗證、獨立於時鐘的倒計時、已取消與已完成重試標籤的區別以及軌跡歸屬；無金鑰 UI 快照覆蓋 Web 的排程與成功，真實 Web 組合測試覆蓋部分傳輸失敗直至恢復，以及耗盡後終態錯誤行與定格重試鏈並列的畫面，ACP 自動化快照確認，被丟棄的嘗試不會透過協定發出，而恢復後的回覆會正常發出。
- 空閒看門狗測試證明：只有 `next()` 尚未完成時才會重新佈防穩定訊號；在消費方思考期間及 `finally` 中會解除佈防；它與總呼叫 deadline 以及更早發生的呼叫方中止分開分類。介面卡測試證明該訊號會終止底層請求，而不只是與其脫離。
- `ctx.llm.stream()` 的直接呼叫方仍只嘗試一次，並收到相同的結構化失敗事實。

## 後果

- 每次重試嘗試都在其所屬輪次內以失敗嘗試的分片加 `llm/retry` 的形式可見，介面卡級的單次嘗試行為會防止隱藏的 SDK 重試成倍增加策略決策。即使沒有分片到達，重試仍可能造成提供者重複計費；normal mode 會限制此風險，而顯式 always mode 會接受它，直至取消或成功。
- 提供者 SDK 可能隱藏狀態或重試標頭。介面卡會保留 SDK 公開的穩定事實，否則使用粗粒度 code，而不會讓恢復策略解析脆弱的文字。
- 持久重試事件擴充功能了工作階段協定和 UI 狀態機。事件與其消費方一同交付，可避免產生無人使用的遙測詞彙；但以後更改 schema 仍需要同步完成持久化和回放工作。
- 清除失敗步驟的即時分片可能會明顯撤回輸出。與把丟棄的文字或不完整工具 JSON 呈現為已提交歷史相比，這是更好的選擇；快照固定這一轉換。
- 介面卡區域性的空閒強制機制可以終止停滯的傳輸，而不會計入消費方思考時間。每個傳輸邊界的約定測試會防止 SDK 漂移。
- 多個 normal 恢復外掛會疊加各自的有限預算。always mode 會先委託，再提供無界退回；重疊的分類器仍會形成依賴註冊順序的策略，必須由引入它們的外掛記錄並測試。

## 相關資料

- [結構化錯誤分類體系](../../archived/architecture/2026-06-11-structured-error-taxonomy.md)負責穩定、可供機器路由的 code 與 cause chaining。
- [可重建請求](../../implemented/architecture/2026-07-05-reconstructable-requests.zh.md)使提供者／模型和完整請求輸入在分發前持久化。
- [超時 deadline 庫](../../implemented/architecture/2026-07-06-timeout-deadline-library.zh.md)將共享的 deadline 分類與能力自身擁有的終止操作分開。
- [呼叫後壓縮壓力與上下文溢位恢復](../../implemented/architecture/2026-07-10-after-call-compaction-pressure-and-overflow-recovery.zh.md)負責目前已關閉步驟的請求恢復擴充功能點與有界溢位重試。
- [提供者路由的 LLM 介面卡](../../implemented/architecture/2026-07-14-provider-routed-llm-adapters.zh.md)負責顯式提供者／模型路由與每個提供者僅有一個介面卡的不變數。
- [Terminal turn errors survive same-turn retry history](../../archived/bug-fix/2026-08-20-turn-error-survives-same-turn-retry-history.md)負責移除曾藏掉耗盡恢復終態錯誤行的 Web 重試歷史抑制。
