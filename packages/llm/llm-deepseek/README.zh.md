---
description: "設定 DeepSeek Messages、推理與圖片輸入。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-deepseek

[English](README.md) | 中文

## 概述

提供共享的 DeepSeek Messages 傳輸、請求設定和模型能力。組合 [API key](../llm-deepseek-api-key/README.zh.md) 或[帳號](../llm-deepseek-account/README.zh.md)外掛以提供授權驗證、模型發現與 provider 註冊。有效的設定更改在後續請求生效，進行中的請求保留原設定。本包可與 [pi-ai 介面卡](../llm-pi-ai/README.zh.md)並用。

`resolveAuth(connection)` 返回提供者持有的授權驗證請求頭，以及繫結本次請求憑證的可選失敗回呼。Messages 和 Files 直接使用這些請求頭，不判斷憑證型別。上傳複用按端點和授權驗證請求頭的雜湊隔離，不持久化原始憑證。

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

本包匯出傳輸庫；provider 外掛向 harness LLM 服務註冊路由。它在每次操作開始時從 Config 引用捕捉連線選項。

介面卡接受 LLM 服務的[僅供請求使用的 user 輸入](../llm/README.zh.md#use-this-package)，並可將其與持久歷史混用；省略請求輸入的身份與來源不會改變提供者內容。

### 何時選擇

面向 DeepSeek 官方 API，或透過 `baseURL` 連線相容 Messages 的閘道時，選擇本介面卡。當同一組合還要透過 pi-ai 目錄路由其他提供者或手工宣告的閘道時，選擇 `dsh-llm-pi-ai`；兩個介面卡可以同時掛載，因為它們的路由名不衝突。為 `deepseek-official` 註冊任何其他介面卡會以 `DUPLICATE_ADAPTER` 失敗。

### 最小設定

```yaml
- name: '@deepseek-ai/dsh-llm-deepseek-api-key'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY  # credential reference, resolved per request
    reasoningEffort: high        # optional; off | low | high | max
    maxTokens: 256000            # optional per-request output cap
    maxRequestFilesBytes: 134217728
    maxInlineRequestImageBytes: 20971520
    maxImagesPerRequest: 600
    filesApiTimeoutMs: 60000
```

請求用 `provider: deepseek-official` 選擇路由；模型 id 原樣傳到協定，因此新增 DeepSeek 模型無需重新註冊。省略 `models` 時公佈支援文字和影象的 `deepseek-flash`，以及僅支援文字的 `deepseek-v4-pro`，各自的上下文視窗均為 1,000,000 token。顯式列表會替換這些預設值，核心呼叫中未列出的模型 id 仍作為純文字路由原樣透過。GUI 選擇要求模型具有目錄條目；條目消失後，已儲存的選擇仍可提交請求。包括模型發現工具在內的用戶端可透過 `ctx.llm.listModels('deepseek-official')` 讀取這些建議性條目。支援圖片的條目可把 `imagePixelBudget` 設定為正整數或 `low`，也可以設定 `imageMaxBytes`。當端點把 `messages` 中任意位置最新的 `system` 訊息讀作完整的有效系統提示詞時，條目可以宣告 `systemPromptUpdate: in-history`；介面卡會在已解析模型與已準備呼叫上報告該模式，agent loop（智慧代理迴圈）隨後把變化後的提示詞追加到已快取歷史之後，而不是改寫開頭的 system 訊息（[決策規則](../../core/agent-loop/README.zh.md#understand-the-implementation)）。預設的 `deepseek-flash` 條目宣告該模式；其他模型需透過 `models` 顯式宣告，`in-history` 以外的任何值都會在載入時以 `llm-deepseek: catalog model "<id>" systemPromptUpdate must be "in-history" when present` 失敗。

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `baseURL` | `https://api.deepseek.com/anthropic` | 顯式值優先，其次為 `$DEEPSEEK_BASE_URL`，最後為官方根地址 |
| `thinking` | `enabled` | 部署策略；`disabled` 把所有請求鎖定為 `off` |
| `reasoningEffort` | `high` | 預設強度：`off`、`low`、`high` 或 `max` |
| `maxTokens` | `256,000` | 單次請求輸出上限；模型自身上限與顯式請求值優先 |
| `defaultContextWindow` | `1,000,000` | 無精確值模型的容量退回 |
| `models` | V41 Flash + V4 Pro | 供發現消費方檢視的建議性目錄 |
| `streamIdleTimeoutMs` | `300,000` | 單次流讀取未完成的最大提供者空閒時間 |
| `maxRequestFilesBytes` | `128 MiB` | file 模式請求圖片位元組預算，保留圖片超過時請求以 `IMAGE_OFFLOAD_REQUIRED` 失敗 |
| `maxInlineRequestImageBytes` | `20 MiB` | 獨立的 base64 退回高水位 |
| `maxImagesPerRequest` | `600` | 保留請求圖片數量的高水位 |
| `imageOffloadByteQuantum` | `64 MiB` | Files 模式最舊字首移除量子 |
| `inlineImageOffloadByteQuantum` | `10 MiB` | 內聯模式最舊字首移除量子 |
| `imageOffloadCountQuantum` | `20` | 數量超限移除量子 |
| `filesApiTimeoutMs` | `60,000` | 每張圖片 Files 解析截止時間 |
| `fileExpiresAfterSeconds` | `604,800` | 請求的上傳圖片生存期與本地複用期限 |
| `fileRefreshMarginSeconds` | `3,600` | 低於此剩餘複用期時替換 id |
| `fileQuotaCleanupBatch` | `100` | 配額重試前刪除的、歸 harness 所有的最舊檔案數 |
| `retryPolicy` | normal，5 次重試 | 由 `dsh-llm-retry` 執行的提供者自有重試策略 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-deepseek-api-key)是每個受支援欄位及其 JSDoc 的窮盡式真源。

啟用[主動壓縮](../../compaction/compaction-basic/README.zh.md#use-this-package)時，`models[].contextWindow`（未宣告時使用 `defaultContextWindow`）必須大於生效請求的 `maxTokens` 與壓縮策略 `headroomTokens` 之和。請求未覆蓋輸出上限時，使用模型的 `maxTokens` 或介面卡預設值。小視窗部署應在容量範圍內設定餘量；降低 `thresholdRatio` 可以提早壓縮。

<a id="endpoint-and-wire-format"></a>
### 端點與協定格式

官方根地址為 `https://api.deepseek.com/anthropic`。顯式 `baseURL` 或 `$DEEPSEEK_BASE_URL` 提供相容 Messages 的根地址。模型與 Files 請求分別追加 `/v1/messages` 和 `/v1/files`，但末尾嚴格匹配的 `/v1` 路徑段會直接複用。末尾斜線不改變這些結果。基址必須使用 HTTP(S)，且不含憑證、查詢或片段。

Messages 以內容塊傳送文字、思考、工具呼叫和工具結果，以 `output_config.effort` 傳送推理強度，並以 Files 引用或內聯 base64 傳送圖片。宣告 `systemPromptUpdate: in-history` 的模型保留初始頂層 system，在對應 user/tool-result 輪次之後傳送新的 system 快照；未宣告能力時，使用最新快照作為頂層 system。回放中繼資料保留模型與思考簽名。無效的回放中繼資料產生警告並省略簽名，不丟棄文字或工具歷史。 模型條目可宣告 `toolUpdate: addition-only` 或 `in-history`；預設 `deepseek-flash` 條目宣告 `addition-only`。投影后的 developer 工具更新轉換為 system 角色的 `tool_addition` 和 `tool_removal` 塊，引用已宣告名稱，延遲宣告攜帶 `defer_loading`。包含這些塊的請求傳送 `mid-conversation-tool-changes-2026-07-01` beta 請求頭。

### 帳號憑證

`deepseek-official` 僅解析設定的 API Key 引用。`deepseek-account` 僅解析[帳號提供者](../../credentials/deepseek-account-platform/README.zh.md)儲存的授權，其允許的 `inferenceOrigin` 預設為 `https://api.deepseek.com`。兩條路由均不退回到另一憑證。退出登入刪除帳號授權，保留 API Key。

Messages 和 Files 請求透過 `x-dsh-auth-token` 傳送帳號 token，不加 Bearer 字首；API Key 使用 `x-api-key`。兩種憑證模式均拒絕重定向。帳號 provider 負責 HTTP 401 分類和憑證失效處理；傳輸層將錯誤交給其回呼。

### 帶 thinking 與圖片的流式呼叫

支援圖片的路由為每個持久引用選定請求目標，再把它解析為確定性請求版本。省略 `imagePixelBudget` 時按官方公佈的視覺 token 網格定目標，即 14 px patch、3:1 降取樣、單圖最多 1024 token，因此正方形圖片最多保留 1302×1302 畫素，16:9 圖片以 1708×961 傳送、對應提供者 1708×966 的網格；正整數會用總畫素預算取代網格，`low` 使用總計 512×512 畫素。每張請求圖片單邊最多 4096 畫素，這是提供者對包含 15 張及以上圖片的請求的限制；`imageMaxBytes` 預設為 2 MiB。帶 alpha 的圖片使用 effort 0 的 WebP，不透明圖片使用 JPEG，並採用 85/75/60 品質階梯；全部候選都超過目標時保留最小輸出。每張保留圖片前都有文字，註明完整附件 id 與實際請求尺寸。目前檔案系統可以對映附件提供者的主機物件時，該文字還攜帶只讀執行世界路徑與可寫副本使用的副檔名。純文字與未列出路由接收穩定附件預留位置，而持久歷史繼續保留圖片引用。

介面卡通常透過 `/v1/files` 上傳這些確切請求位元組，併傳送 file-id 引用。Files 請求與包含 file id 的模型請求均攜帶 `anthropic-beta: files-api-2025-04-14`。全部請求拒絕重定向，確保憑證僅傳送到設定的源。檔案解析失敗或超時會按內聯預算，用內聯 base64 重建整份模型請求；一次請求絕不混用 file id 與內聯圖片。呼叫方取消會停止請求。

快取 id 按端點與憑證限定作用域，在到期前重新整理，根據提供者的陳舊檔案錯誤失效，並透過帶等待方區域性取消的 singleflight 解析。上傳透過 `expires_after[anchor]=created_at` 與 `expires_after[seconds]` 請求過期。Messages 檔案中繼資料不含遠端過期時間，因此本地複用期限使用原始上傳時間加 `fileExpiresAfterSeconds`；這不保證遠端檔案刪除。配額失敗會先刪除一批設定數量的最舊 harness 檔案，再重試一次上傳。

Files 模式透過 `maxRequestFilesBytes` 與 `maxImagesPerRequest` 限制保留請求版本；內聯退回有獨立 base64 預算。兩種模式都按設定的位元組或數量量子移除最舊字首。每張省略圖片都有自己的模型可見預留位置，包含顯示名或附件 id，以及可用時的規範化尺寸、媒體型別與目前只讀路徑。分階高水位策略避免每新增一張圖片都改寫舊請求字首。

`reasoningEffort` 選擇公佈的預設值。當部署策略允許 thinking 時，確切模型中繼資料會按順序公開 `off`、`low`、`high` 與 `max` 強度及選擇指引。`low`、`high` 與 `max` 啟用 thinking，並以 `output_config.effort` 序列化，介面卡自有的 `off` 則傳送 `thinking.type: disabled`。不支援的取值會在網路 I/O 前以 `UNSUPPORTED_REASONING_EFFORT` 失敗；`thinking: disabled` 會在外掛載入時拒絕任何非 `off` 強度。`purpose: 'session-title'` 的請求會強制關閉 thinking，把有界輸出留給可見標題文字。介面卡轉發顯式 `temperature`；DeepSeek 在啟用 thinking 時接受該參數，但忽略其值。

### 動態設定

連線選項在每次操作開始時從 volatile Config 引用捕捉。Config 驗證在表單持久化前拒絕無效候選值。憑證使用與端點、影象及 Files 策略、空閒預算相同的快照解析。附件服務在請求時解析。

### 提供者專用請求欄位

存在 `ctx.deepseekLlmApiExtensions` 時，介面卡會在 `fetch` 前根據確切序列化基礎請求準備已註冊頂層欄位。準備或欄位衝突在 HTTP 前失敗；2xx 回應後，介面卡會在消費 SSE（Server-Sent Events）前接受每項已捕捉貢獻。傳輸與非 2xx 失敗不會接受它們。基礎請求連同擴充功能欄位無法序列化時，介面卡只傳送基礎請求並跳過接受，讓貢獻方在之後的請求中重發自身狀態，同時記錄一條列出被省略欄位的告警。隨產品交付的組合用它提供預設啟用的增量 `dsh_session_log` 欄位和預設啟用的活躍 `dsh_plugin_packages` 清單；兩者都留在模型輸入之外。

### 失敗與恢復

設定僅接受 Messages，不提供 `protocol` 欄位。若解析報告 `protocol is not configurable`，請從 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 中 `llm-deepseek` 條目的 `config` 以及覆蓋它的 home patch 或命令列 overlay 中刪除 `protocol`，保留需要的 `baseURL`、`apiKeyEnv` 和 `models` 欄位。已儲存的設定若被介面卡驗證拒絕，後續請求會持續失敗，直到設定修正；在模型設定卡中儲存其他欄位不會移除未知屬性。請編輯設定檔，等待 profile 透過 HMR（熱模組替換）重新載入；若未啟用 HMR，則重新啟動 profile。

成功的 Files 回應必須包含有效 JSON。上傳、列舉、取得和刪除操作的 JSON 解碼失敗丟擲 `INVALID_RESPONSE`，訊息包含操作名稱與 HTTP 狀態，`LlmError.failure` 保留該狀態，`cause` 保留原始解析錯誤。讀取回應體時的傳輸和取消錯誤保留其原有身份。

非 2xx 回應以穩定 code 失敗：`AUTH`（401/403）、`QUOTA`、`RATE_LIMIT`、`CONTEXT_WINDOW_EXCEEDED`、`INVALID_REQUEST`、`SERVER` 以及其他情況的 `HTTP_<status>`；回應前傳輸失敗丟擲 `TRANSPORT`，呼叫方中止丟擲 `ABORTED`，流空閒超時丟擲 `TIMEOUT`。請求擴充功能準備、欄位衝突或 2xx 後接受失敗使用 `REQUEST_EXTENSION`。當提供者未指出 file id 時，規範化圖片拒絕會列出所有可能附件及其持久位置。陳舊檔案拒絕會使點名對映（或該次嘗試使用的全部對映）失效，並允許一次替換模型請求。協定違規丟擲 `STREAM_CLOSED` 或 `MALFORMED_RESPONSE`；不帶內容塊的終止 `stop` 變成 `EMPTY_RESPONSE`，預設重試策略會重試它。官方路由缺少 API Key 的請求以 `MISSING_CREDENTIAL` 失敗；格式錯誤的憑證以 `INVALID_CREDENTIAL` 失敗，並點名需要修復的引用——絕不包含金鑰的任何部分。

提供者外掛負責目錄可用性；僅帳號路由要求存有憑證才能發現模型。兩者的目錄獨立設定；傳輸層提供共享的預設模型中繼資料和能力解析。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋介面卡背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

外掛建立在一個顯式解析步驟與一條註冊事實之上。`resolveAdapterOptions()` 是從原始設定到已驗證連線事實的唯一路徑，介面卡透過 thunk 每次操作重新讀取這些事實——基址、目錄、請求預設值、圖片與 Files 策略及空閒預算都會作用於下一個請求，而進行中的流保持其啟動時的事實。註冊時捕捉的唯一事實是重試策略：解析值變化時，外掛會在一個同步區段內原位重新註冊路由，因此任何請求都觀察不到空檔。

### 原始碼導航

[`src/index.ts`](src/index.ts) 匯出協定庫；[`src/host.ts`](src/host.ts) 為 provider 外掛繫結共享 Host 服務。[`src/adapter.ts`](src/adapter.ts) 管理請求生命週期；[`src/serialize.ts`](src/serialize.ts) 和 [`src/translate.ts`](src/translate.ts) 對映模型輸入與流式輸出。[`src/file-store.ts`](src/file-store.ts) 透過 [`src/files-api.ts`](src/files-api.ts) 管理上傳複用與恢復。

### 協定流程

一次 `stream()` 呼叫通常發一條模型請求：解析確定性請求圖片、優先使用 Files id、準備所有已註冊頂層請求擴充功能、向解析後的 `baseURL` 發起 fetch、在 HTTP 2xx 後接受擴充功能事務，並把 SSE 流翻譯為 harness 協定。檔案解析失敗會讓首條請求使用內聯模式；提供者的陳舊檔案回應允許一次替換嘗試，且替換解析失敗時也使用內聯模式。每條模型與 Files 呼叫都攜帶共享歸因。模型請求還在模型輸入之外攜帶穩定匿名使用者 id，並在存在 session id 時攜帶該值。推理歷史會按需序列化回請求，快取計量則把 DeepSeek 的快取命中指標對映進 harness 用量桶。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從服務約定逐步進入孿生介面卡、重試執行器與共享型別。

- [dsh-llm 服務](../llm/README.zh.md)——本介面卡註冊其上的提供者無關服務。
- [llm-pi-ai 介面卡](../llm-pi-ai/README.zh.md)——服務其他提供者與閘道的庫實作孿生。
- [LLM 流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——`StreamChunk` 協定與介面卡約定。
- [llm-retry](../llm-retry/README.zh.md)——應用本介面卡 `retryPolicy` 的重試執行器。
- [DeepSeek 請求擴充功能](../deepseek-llm-api-extensions/README.zh.md)——提供者專用頂層欄位的生命週期與接受語義。
- [工作階段日誌上傳](../../session/session-log-deepseek/README.zh.md)——預設啟用的增量 `dsh_session_log` 貢獻。
- [外掛包清單](../plugin-package-inventory-deepseek/README.zh.md)——預設啟用的 `dsh_plugin_packages` 貢獻。
- [孿生 LLM 介面卡](../../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.zh.md)——為什麼 DeepSeek 交付兩個結構不同的介面卡。
- [強制應用歸因標頭](../../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.zh.md)——每個提供者請求攜帶的身份。

-----

<a id="model-experience"></a>
## 模型體驗

### DeepSeek 請求

#### 模型看到什麼

所選 DeepSeek 模型會收到 harness 系統提示詞、訊息歷史、工具 schema、停止序列與呼叫設定（`maxTokens`、`reasoningEffort`、`temperature`），不包含介面卡撰寫的提示詞散文。提供者專用請求擴充功能欄位留在模型輸入之外。視覺模型通常接收 Files API 引用形式的使用者與工具結果圖片，其旁帶附件控制代碼和請求預覽尺寸。目前執行檔案系統可以對映附件提供者的主機物件時，它還會收到規範化物件路徑；描述符會把該副本標記為只讀，並警告規範化可能縮放或重新編碼上傳內容。Files 解析失敗時，全部保留圖片改用內聯 base64；超出預算的較舊圖片則在佔位文字中保留目前請求已解析的存取方式。此前 assistant 輪次的推理內容會原樣傳回，無論該輪次是否呼叫了工具。 對於非法 JSON 或非物件的歷史工具參數，Messages 傳送 `{}`。此參數後備保留呼叫 ID、工具名和工具結果；原始參數仍保留在 Session 日誌中。新生成的 Messages 工具參數仍須是有效 JSON 物件。 Messages 會省略使用者訊息和工具結果中的 `reasoning` 與 `tool-call` 塊。這也允許回放包含助手輸出的已儲存子 Agent 通知；原始 Session 內容保持完整。轉換後的空使用者訊息會被跳過，空工具結果則保留呼叫 id 和錯誤標記。其他不支援的輸入塊仍會以 `UNSUPPORTED_CONTENT` 失敗。

#### Token 影響

提供者分詞決定精確的文字與圖片 token 輸入。介面卡宣告按路由的 `imageRequestPricing`：把日誌中的圖片省略決策選中的每個出現位置按其佔位文字計價，並按投影后的尺寸使用公開的視覺計量規則（14 px patch 網格、3:1 降取樣、544×544 放大下限、單圖 1024 token 上限）為每張保留圖片計價。這使 token 計量服務可以在請求發出前為圖片壓力定價；上報的 usage 仍是權威值。推理回傳會把每個推理輪次的思維鏈帶進後續請求，而已省略的圖片不再消耗視覺 token。保留的出現位置按精確請求版本位元組超過 file 模式或內聯退回預算（`maxRequestFilesBytes`、`maxImagesPerRequest` 與兩個量子）的請求，以 `IMAGE_OFFLOAD_REQUIRED` 失敗並說明還需省略多少最老的出現位置，由 `dsh-compaction-image-offload` 用 `image/offload` 事件記錄所選位置並重試。可用時報告快取讀取用量。Messages 的 token 總數包含未快取輸入、輸出、快取讀取與快取寫入 token。

#### KV Cache 影響

未改變的已組裝字首有資格獲得 DeepSeek 快取複用，本介面卡會在用量中報告。確定性的請求圖片位元組並不意味著完整字首固定不變：執行世界路徑變化會改寫歷史描述符文字，重新整理上傳會替換 `file_id`，Files 到 base64 的退回也會改變圖片表示。這些變化以及模型路由、提示詞、schema、歷史或圖片預算變化，都可能從首個受影響 token 起阻止複用；推理回傳在每個推理輪次上追加內容。在宣告瞭 `systemPromptUpdate: in-history` 的目錄條目上，同一請求序列延續期間的系統提示詞變化會追加到已快取歷史之後，因此直到該歷史末尾的字首仍可複用；工具 schema 變化仍會從第一個改變的 token 起阻止複用。

### DeepSeek 回應

#### 模型看到什麼

推理、文字與原始字串工具參數會被翻譯為 harness 分片，供 loop 記錄並組裝。

#### Token 影響

生成的 token 遵循請求中記錄的推理強度與 `maxTokens`；只有 loop 保留的塊會影響後續輸入。

#### KV Cache 影響

loop 保留的回應塊會追加到下一個請求，並保留其更早的可複用字首；被丟棄的塊不再有後續快取影響。更換提供者或模型會選中不同的快取域。

## 已知限制與延期工作


<a id="known-limitations-and-deferred-work"></a>


這些限制說明介面卡在哪裡停止、由未來工作接續。它們是目前包約束，不是通用 DeepSeek 對比或任務積壓。

- **替換 `models` 會替換完整目錄列表**——修改單個模型條目時使用路徑編輯。
- **不對映 `tool_choice`**——不屬於核心詞彙（與 pi-ai 孿生共享）。
- **請求使用原始 `fetch`，而非 `@cordisjs/plugin-http`**——沒有共享代理或攔截設定。
- **Messages 歷史內 system 更新需要保留使用者或工具結果輪次**——若更新後的全部使用者輸入都被省略，且前一個協定輪次是 assistant，序列化會在下一個 assistant 之前或請求結束處以 `UNSUPPORTED_CONTENT` 失敗。文字或空工具結果可以保留該輪次。不支援將更新移到更早的輪次；[輸入歷史決策](../../../.agents/notes/implemented/bug-fix/2026-09-18-messages-input-history-compatibility.zh.md)記錄了排序約束。
- **圖片是僅用於輸入的持久附件**——不支援直接外部 URL 與 assistant 圖片輸出；DeepSeek 輸入通常使用 Files API，僅在單次請求恢復時使用內聯 base64。
- 預設目錄公佈 `deepseek-flash` 及其文字、圖片和歷史內更新能力，不探測閘道可用性。閘道開放該 ID 前，請求可能以 `INVALID_REQUEST` 失敗。
- [adapter.e2e.ts](tests/adapter.e2e.ts) 與 [runtime.e2e.ts](tests/runtime.e2e.ts) 中的真實 API 檢查需要 `DEEPSEEK_API_KEY`。將 `DEEPSEEK_IN_HISTORY_MODEL` 設為受支援的非空模型 ID 可執行 system 更新檢查：介面卡套件使用 `high` 思考強度，執行時套件則在關閉思考時比較快取複用，可能受到指令遵循不穩定的影響。執行時圖片案例還需要 `DEEPSEEK_FLASH_E2E=1` 或 `DEEPSEEK_VISION_E2E=1`。

<a id="dev-note"></a>
### 開發備註

無。

**執行時不變式：** 不釋出伴生入口。本包沒有獨立事件序列或可變資料關係，相關約定在所屬 seam 強制執行。

`deepseek-official` 僅使用設定的 API Key 引用；`deepseek-account` 僅在帳號提供者允許的推理來源使用已儲存的 DSH 授權。兩條路由共享 Messages 傳輸，模型與檔案設定獨立設定。帳號憑證缺失或不適用於目標時拒絕請求並提示登入；兩條路由均不退回到另一憑證。Chat 和 Files 請求拒絕重定向。帳號提供者根據執行中 Agent 已記錄的請求上下文負責退登取消，包括工具執行階段；傳輸層接收現有請求的中止訊號。
