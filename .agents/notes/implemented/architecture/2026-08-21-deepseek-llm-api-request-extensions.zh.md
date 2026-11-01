# Agent Note: DeepSeek LLM API 工作階段日誌與外掛包請求擴充功能

Status: implemented

[English](2026-08-21-deepseek-llm-api-request-extensions.md) | 中文

## 問題

權威工作階段日誌包含請求邊界、原始回應分片、組裝後訊息、工具活動、外掛事件與失敗事實，模型訊息列表無法保留全部內容。OTel 工作階段遙測路徑獨立於模型請求投影和批處理該日誌，使用部署方選擇的共享模式，並刻意丟棄大多數 assistant 分片。因此，DeepSeek 官方 API 無法從普通請求訊息或遙測流重建完整 harness 軌跡。

提供者側診斷還需要產生目前請求的確切存活外掛包版本。現有面向瀏覽器的外掛清單會報告已設定 Loader 設定項與生命週期階段，但既不擁有包 manifest（中繼資料清單）解析，也不擁有請求 Agent 的 standing preset 組合。

兩個值都只屬於 DeepSeek 官方介面卡路徑。把它們加入 `GenerateOptions` 或提供者無關的 LLM seam，會讓 pi-ai 與未來每個介面卡接觸 DeepSeek 協定概念。

## 決策

`@deepseek-ai/dsh-deepseek-llm-api-extensions` 註冊 `ctx.deepseekLlmApiExtensions`，即 `deepseek-official` 請求正文頂層欄位的增量註冊表。貢獻方透過 `register()` 認領一個經宣告合併的欄位。介面卡在序列化確切協定訊息後呼叫 `prepare()`、傳入請求取消訊號，在 HTTP 前拒絕準備失敗或基礎欄位衝突，合併分離欄位，並在 HTTP 2xx 後呼叫捕捉的 `accept()` 事務。合併後的正文無法序列化時，按[有上限上傳決策](2026-09-24-bounded-session-log-upload.zh.md)不帶擴充功能欄位傳送，也不執行接受。即使貢獻方忽略訊號，註冊表也會在取消後停止等待準備。接受失敗仍以 `REQUEST_EXTENSION` 使請求失敗；傳輸失敗與非 2xx 失敗絕不會接受貢獻。未掛載註冊表的組合會保留可複用基礎介面卡。隨附組合會掛載註冊表與兩個貢獻方：外掛包中繼資料和工作階段日誌上傳均預設開啟；按[預設上傳決策](2026-09-14-session-log-upload-default.zh.md)，設定 `session-log-deepseek.enabled: false` 可關閉日誌上傳。無金鑰 `deepseek-official` 回放會使用合成的空基礎正文執行準備，並在第一個已記錄分片前呼叫同一接受事務；它保持的是 2xx 後擴充功能副作用，而非欄位位元組。

提供者無關的 `llm` 包與 `llm-pi-ai` 不包含任何擴充功能型別、服務查詢、欄位合併或接受呼叫。

## 增量工作階段日誌欄位

`@deepseek-ai/dsh-session-log-deepseek` 擁有預設開啟的 `dsh_session_log` 欄位。啟用後，每個攜帶存活工作階段 id 的請求都會傳送該確切工作階段身份最大持久 `session-log-deepseek/delivery-accepted` 水位之後、能放進[有上限上傳決策](2026-09-24-bounded-session-log-upload.zh.md)中 `maxBytes` 上限的最長連續權威事件段。該欄位包含不可變工作階段 header 與完整事件信封。2xx 會為已傳送的 `throughSeq` 追加新水位；該事件會進入下一次請求的字尾。Fork 日誌會保留父級水位 id，因此子工作階段會在自己的身份下從序列零開始。並行接受可能亂序到達，最大水位仍保持權威。程序內 fold 會讓每條工作階段事件只被掃描一次，並增量消費後續追加；新的工作階段物件或 HMR generation 會從持久歷史重建該 fold。

失敗方向為至少一次。傳輸失敗或提供者拒絕不會記錄水位。遠端接受後、水位持久化前發生崩潰，會在恢復後觸發重放，絕不會跳過序列。現有工作階段檢查點會持久化該事件；上傳外掛不擁有第二份儲存。

`events` 陣列會直接包含完整的權威 `SessionEvent` 物件。傳送方會複製事件的每個已有成員，不執行投影或脫敏；該欄位自包含，無需根據 `messages` 重建內容。

## 外掛包欄位

`@deepseek-ai/dsh-plugin-package-inventory-deepseek` 從 `llm` 包家族中擁有預設開啟的 `dsh_plugin_packages` 欄位。它會讀取主機 Loader 樹的存活非 group 設定項，併為存活請求 Agent 讀取其 standing preset 樹。Node 包解析會定位所屬 manifest，無需匯出 `./package.json`。普通設定項從其所屬樹解析；standing preset 根會復現 Loader 對主機基址的顯式覆寫，巢狀 include 則保留自身基址。最近的匿名 manifest 會標記鬆散模組；具名 manifest 必須帶有版本。系統以確定性順序按確切名稱／版本對去重，同時存活的不同版本仍會分開保留。

停用、pending、failed、unloading、disposed、結構性、鬆散非包、普通依賴、程式設計式子 fiber 與記憶體動態外掛設定項都不屬於該包清單。這個定義會報告執行時可以證明的包支撐組合事實，而不會為任意回呼發明來源。

## 暫緩的清單 cache

目前實作會為每個請求重新計算存活包集合，同時在程序生命週期內 cache manifest 身份。一項僅含主機樹的合成基準測試使用 Node v24.16.0 與 macOS arm64，測試物件為各不相同的存活相對外掛包；測試先預熱 20 個請求，再對 25 項和 100 項情境分別測量 500 個請求，對 500 項情境測量 250 個請求。「首次請求」包含未 cache 的 manifest 讀取；「已 cache 提供者中位數」透過同一註冊表返回預建置欄位，因此仍包含 `structuredClone()` 與凍結開銷，但不包含介面卡 JSON 序列化和網路時間。

| 存活設定項 | 首次請求 | 目前穩態中位數 | 目前穩態 p95 | 已 cache 提供者中位數 |
|---:|---:|---:|---:|---:|
| 25 | 1.23 ms | 0.05 ms | 0.07 ms | 0.02 ms |
| 100 | 2.23 ms | 0.14 ms | 0.24 ms | 0.04 ms |
| 500 | 10.22 ms | 0.60 ms | 0.79 ms | 0.18 ms |

這些測量結果支援繼續暫緩 cache：即使存在 500 個設定項，穩態耗時仍低於 1 毫秒；在不可避免的 JSON 序列化之前，預計節省約 0.42 毫秒。加入 cache 的觸發條件是真實 profile 顯示 `prepare()` 延遲達到實質水平，而不是固定的設定項數量閾值。

暫緩設計使用一個單調遞增的清單 epoch。全域 `internal/status` listener 會在 Loader 設定項的根 fiber 跨越 `FiberState.ACTIVE` 邊界時推進該值，從而覆蓋依賴啟用、停用、解除安裝與 HMR，且不會產生基於時間的陳舊視窗。貢獻方按 epoch cache 主機快照，在 `WeakMap` 中 cache 每個 standing preset `EntryTree`，並按樹與 epoch cache 主機加 preset 的合併結果。系統以線性時間合併已經排序的快照，並對確切 `(name, version)` 對去重。計算完成前 epoch 發生變化時，系統會重試而非釋出陳舊快照；已 dispose 的 preset 樹仍可透過 `WeakMap` 被回收。

程序生命週期內的 manifest 身份 cache 保持獨立，因為系統不支援在程序內替換包版本。

## 驗證

註冊表測試固定重複所有權、effect 作用域 dispose（資源釋放）、分離欄位值、並行且可取消的準備、保留接收者的接受操作、單次接受結算與失敗聚合。工作階段測試固定預設開啟與顯式關閉策略、首次完整／後續字尾交付、與基礎正文訊息無關的直接完整事件信封、增量水位 fold、持久化重新啟動恢復、fork 身份圍欄、亂序接受與 invariant 延遲載入。外掛包清單測試固定預設開啟與顯式關閉策略、主機與 standing preset 發現、衝突的 Loader 解析基址、manifest 解析、生命週期過濾及確切名稱／版本排序。直接介面卡 mock 測試證明 HTTP 前準備失敗、取消、非 2xx 不接受、2xx 在後續流失敗前接受，以及欄位衝突。無金鑰回放會固定 2xx 後擴充功能接受，TypeScript JSON-RPC 與 Python 打包執行時快照則透過兩套 SDK 投影接受事件。真實 Loader 組合會固定預設包中繼資料、預設工作階段上傳與顯式關閉上傳，一個真實 API 請求會掛載兩個隨附擴充功能並證明官方端點接受它們；pi-ai 測試保持其協定請求不變。

## 考慮過的替代方案

**向 `GenerateOptions` 或 `ctx.llm` 新增通用中繼資料。** 已否決，因為這些值與接受時點屬於 DeepSeek 協定語義；提供者無關請求會迫使每個介面卡理解或忽略外來欄位。

**把兩個提供者硬編碼進 `llm-deepseek`。** 已否決，因為介面卡將匯入工作階段、Loader、preset、包 manifest 與遊標邏輯。註冊表讓傳輸只負責欄位合併與 HTTP 接受。

### 為什麼不使用請求相對訊息引用？

一種遞迴的帶標籤表示可以用所屬請求 `messages` 中的路徑與 UTF-8 位元組偏移，替換事件字串的確切範圍。測量使用 Node v24.16.0、macOS arm64 與可用的三份最大本地 Zstandard 工作階段產物；其壓縮產物大小分別為 2,437,052、572,602 與 118,811 位元組。延遲啟用回放使用各工作階段最後一個已完成請求邊界；穩態回放覆蓋 411 個已完成邊界。位元組數覆蓋完整且最小化的 DeepSeek 請求。

| 回放方式 | 原始 JSON | 引用 JSON | 節省比例 | 同步編碼器耗時 |
|---|---:|---:|---:|---:|
| 延遲啟用 | 29,668,725 B | 27,645,825 B | 6.82% | 合計 500.1 s |
| 穩態 | 389,295,815 B | 387,180,848 B | 0.54% | 合計 285.0 s |

三次延遲啟用呼叫分別耗時 470.5、29.4 與 0.158 秒。115,071 個事件中只有 701 個（0.61%）選擇引用。一項假設採用 level-6 整請求 gzip 的對照，使原始請求位元組在延遲啟用情境減少 89.38%，在穩態情境減少 73.42%；加入訊息引用後，gzip 結果分別額外減少 21.68% 與 0.59%。

接收方還需要遍歷帶標籤樹、解析通向確切請求訊息的路徑、驗證 UTF-8 範圍，並重建每個引用事件。即使把接收方成本視為零，穩態位元組節省、傳送方同步成本以及對另一請求欄位的依賴，也不足以支撐帶版本的協定格式。

### 為什麼不省略 assistant 分片或重疊事件資料？

實測 v1 真實 Session event 中約 98% 為 `assistant/chunk`。在引用編碼後省略它們，會讓完整 identity JSON 在延遲啟用情境進一步減少 84.79%，在穩態情境進一步減少 6.49%，但會阻止無損重建並讓 message source-event reference 懸空。V2 把緊湊 stream 嵌入 attempt settlement；`dsh_session_log` 仍會完整傳送每個目前規範 event，且不會省略這些嵌入式 record。模糊或規範化替換也有相同重建缺陷。

**只在記憶體中保留上傳遊標。** 已否決，因為普通程序重新啟動會重發完整工作階段。權威接受事件讓重新啟動恢復獲得盡力而為的永續性，無需另一儲存後端；剩餘崩潰視窗只會產生允許的重複。

**清點每個存活 Cordis fiber。** 已否決，因為程式設計式與記憶體 fiber 沒有權威 NPM 包來源。Loader 支撐的主機與 preset 設定項能提供可精確解析的包身份。

**cache 一份全程序清單，或按 TTL 使其過期。** 已否決，因為單份不可變清單無法正確反映 Loader 生命週期與逐工作階段 preset，TTL 則允許中繼資料在過期邊界之間保持陳舊。暫緩的 epoch 設計會根據權威存活狀態轉換執行失效。

**用內容 hash 或伺服器端清單引用替換完整欄位。** 已否決，因為它會改變獨立請求的重建方式，需要端點狀態與後續協定版本。這屬於請求位元組協定變更，而不是計算 cache 最佳化。

## 後果

DeepSeek 官方請求會把存活包版本傳送到解析後的 `baseURL`，包括已設定 gateway。除非關閉工作階段日誌上傳，否則符合條件的請求還會攜帶新的未接受工作階段事件，每次最多 `maxBytes`。這些欄位對模型不可見，不增加提示詞 token，也不改變 KV Cache，但可能顯著增大 HTTP 正文。Manifest 解析、欄位衝突、接受記錄或提供者 schema 拒絕會使模型請求失敗，而不會靜默丟棄中繼資料。合併後的正文無法序列化是例外：請求不帶擴充功能欄位繼續傳送，並記錄一條告警。

`delivery-accepted` 事件會成為權威日誌的一部分，並在後續請求中自行交付。崩潰恢復可能重複字尾，但不會根據 assistant 輸出推斷接受，也不會建立第二份本地遊標儲存。缺少存活工作階段的直接呼叫會省略工作階段欄位；主機包清單仍然可用。

[DeepSeek 請求身份決策](../feature/2026-08-11-deepseek-request-user-id-header.zh.md)繼續擁有 user／session header，且這些 header 仍位於正文之外。[工作階段遙測決策](../feature/2026-07-23-session-telemetry-otel-revival.zh.md)在另一項變更刪除該 seam 與後端之前仍保持目前有效；本請求路徑不改變 OTel 捕捉或共享模式。
