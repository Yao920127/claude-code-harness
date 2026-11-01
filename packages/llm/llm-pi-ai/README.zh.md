---
description: "面向使用者與維護者的 pi-ai 多提供者介面卡說明：透過 pi-ai 目錄與手工宣告閘道路由 harness LLM（大語言模型）服務。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-pi-ai

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-llm-pi-ai` 透過一份設定把模型請求路由到多個 pi-ai 提供者、OpenAI 相容閘道或自託管伺服器。已安裝的 pi-ai 提供者會提供端點、協定和模型目錄預設值；自定義路由可以直接宣告這些值，無需修改程式碼。profile 與憑證按請求解析，因此設定變更會在下一個請求生效，無需重新啟動。受支援的提供者可以使用已儲存的 OAuth 或互動式金鑰登入，並透過跨程序鎖重新整理憑證。本包可以在沒有路由時啟動，並在使用者設定新增路由後將其啟用。

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

當組合需要透過 pi-ai 的提供者目錄、或透過 pi-ai 已安裝目錄未描述的閘道路由模型請求時掛載本外掛。`providers` 字典就是整個設定面：每個鍵都是請求用 `GenerateOptions.provider` 選擇的提供者路由名。

介面卡接受 LLM 服務的[僅供請求使用的 user 輸入](../llm/README.zh.md#use-this-package)，並可將其與持久歷史混用。user 身份與來源不會進入 pi-ai 內容；assistant 回放中繼資料和工具呼叫關聯仍由持久訊息攜帶。

### 何時選擇

當同一組合服務多個提供者、某條路由需要 pi-ai 目錄預設值並修正少數欄位、或必須透過自有端點與協定到達手工宣告閘道時，選擇本介面卡。當部署不需要其他提供者時，選擇 `dsh-llm-deepseek` 直連 DeepSeek 路由。兩個介面卡可以同時掛載，因為它們的路由名不衝突；註冊其他介面卡已擁有的路由會導致外掛載入失敗。

### 設定提供者路由

每個 profile 都可以設定 `retryPolicy`；省略時使用 normal mode、最多重試五次。`apiKeyEnv` 是按請求經 harness 憑證 seam 解析的憑證引用，因此設定檔絕不包含金鑰；解析為空的引用會讓請求以 `MISSING_CREDENTIAL` 失敗。省略它會讓路由保持已設定但無金鑰（configured-but-keyless）狀態，對已安裝目錄路由而言即交由 pi-ai 提供者原生的環境發現。

```yaml
- name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY
        baseURL: https://proxy.example.com:8443
        reasoning: high
        requestImagePixelBudget: 4194304 # total pixels; 2048 by 2048 default
        requestImageMaxBytes: 1048576    # raw bytes before base64 expansion
        maxRequestImageBytes: 20971520   # accumulated base64 payload
        retryPolicy:
          mode: normal
          maxRetries: 3
      anthropic:
        apiKeyEnv: ANTHROPIC_API_KEY
        models:
          - id: claude-sonnet-4-5
            contextWindow: 200000
      acme-gateway:
        displayName: Acme Gateway
        apiKeyEnv: ACME_GATEWAY_API_KEY
        api: openai-completions
        baseURL: https://gateway.acme.example/v1
        compat:
          thinkingFormat: deepseek
        models:
          - id: acme-think
            name: Acme Think
            contextWindow: 262144
            reasoningEfforts:
              off:
              high: high
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `apiKeyEnv` | 無 | 按請求解析的憑證引用；省略時交由 pi-ai 環境發現 |
| `displayName` | 提供者名 | 選擇器介面顯示的標籤 |
| `api` | 目錄協定 | 協定格式；僅目錄不提供的路由需要 |
| `baseURL` | 目錄端點 | 路由上所有模型的端點 |
| `models` | 已安裝目錄 | 整體替換路由目錄；每個條目從已安裝模型取預設值 |
| `modelOverrides` | 無 | 重塑個別已安裝目錄模型，而不替換其餘模型 |
| `compat` | 目錄檢測 | 無法識別端點的協定相容開關 |
| `defaultContextWindow` | `262,144` | 未描述模型的容量退回 |
| `defaultMaxTokens` | `32,768` | 未描述模型的輸出上限退回 |
| `requestImagePixelBudget` | `4,194,304` | 每張確定性請求圖片的總畫素預算 |
| `requestImageMaxBytes` | `1 MiB` | 每張請求圖片在 base64 擴充功能前的編碼位元組目標 |
| `maxRequestImageBytes` | `20 MiB` | base64 圖片載荷總上限，保留圖片超過時請求以 `IMAGE_OFFLOAD_REQUIRED` 失敗 |
| `retryPolicy` | normal，5 次重試 | 由 `dsh-llm-retry` 執行的提供者自有重試策略 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-pi-ai)是每個受支援欄位及其 JSDoc 的窮盡式真源。

### 登入提供者

pi-ai 提供登入的提供者可以透過 harness 授權 seam 登入：流程提供 OAuth 或互動式金鑰提示（金鑰鍵入 pi-ai 自己的登入提示，而非設定表單），得到的憑證儲存在 harness 憑證儲存的 `llm-pi-ai/<provider id>` 記錄中。儲存的登入在其路由的 `apiKeyEnv` 覆蓋之下完成認證，並在儲存的跨程序鎖下自行重新整理；退出登入即刪除儲存記錄。落在記錄文法之外——小寫連字元識別符號——的手工宣告路由鍵無法登入，因為對它的記錄寫入會以 `LlmError('UNSTORABLE_PROVIDER_ID')` 拒絕；這類路由改用 `apiKeyEnv` 或提供者 ambient 設定認證。

### 解析模型目錄

profile 的 `models` 列表會替換而非擴充功能路由的已安裝目錄；每個條目從同 id 已安裝模型取未設定欄位的預設值，因此把路由收窄到兩個模型、修正一個容量或新增比已安裝目錄更新的模型都是一行編輯。`modelOverrides` 無需該代價即可重塑個別已安裝目錄模型——修正一個模型，保留其餘三十七個——當它與 `models` 列表並存、位於手工宣告路由上、或點名目錄未描述的模型時會被拒絕，因為靜默不變的模型會成為別人日後尋找的拼寫錯誤。

### 帶推理（reasoning）與協定相容執行

`reasoningEfforts` 宣告模型可選擇的 thinking 等級：每個鍵都是選擇器提供的等級，其值是分派時在協定中傳送的拼寫，因此 `max: ultra` 可以為擁有自有詞彙的閘道重新命名等級。省略該欄位時保留已安裝目錄條目的能力；`false` 宣告非推理模型。對於 pi-ai 無法識別的端點，`compat` 開關重塑請求——哪個角色攜帶系統提示詞、哪個欄位限制輸出、thinking 等級如何傳遞——可逐路由、逐模型設定。條目與已安裝目錄都沒有尺寸的模型，會採用路由的 `defaultContextWindow` 與 `defaultMaxTokens` 退回值。

對於自託管 Chat Completions 端點，`thinkingTokenBudgetField` 選擇推理預算參數，`vllmPriority` 在伺服器端啟用優先順序排程時設定整數排程優先順序。範本參數接受 `$var: thinking.budget`。`openai-responses` 閘道可設定 `supportsMaxOutputTokens: false` 來省略 `max_output_tokens`；Azure 與 Codex 傳輸會忽略這個共享相容欄位。這些控制均需顯式啟用；目錄擁有的 Anthropic effort 和退回能力不是可設定開關。

### 執行時更改設定

每次操作捕捉目前 `providers` Config 引用。新增或修改的 provider 設定在表單持久化前驗證；未更改的目錄故障仍可編輯。路由集合或重試策略變化時原子更新註冊；如果其他介面卡已擁有所請求的路由，則保留先前路由。

### 從端點發現模型

外掛會回答「該提供者可以提供哪些模型？」，供設定介面正在編輯或起草的路由使用。已安裝目錄提供的路由直接由目錄回答，不髮網路請求，並將其 `input` 陣列保留為發現結果的 `inputModalities`；只有目錄未描述的路由才會經網路詢問。`openai-completions` 與 `openai-responses` 使用帶 bearer 授權驗證的 `GET {baseURL}/models`，`anthropic-messages` 則以 `x-api-key` 和 `anthropic-version` 使用原生 `GET /v1/models?limit=1000` 語義；其列表 URL 接受帶或不帶末尾 `/v1` 的 API 根地址，因為閘道文件兩種寫法都會發布，且只有該列表 URL 會歸一化這一段，模型請求收到的仍是設定原樣的 `baseURL`。已設定且具名的路由會在 Host 內部提供已存憑證與 profile `headers`，因此透過 `cordis.patch.yml` 或 Cordis 設定設定的部署標頭可以到達模型發現請求，但不會成為發現請求或 Models 頁面的欄位；表單中新鍵入的金鑰仍優先於已存憑證。解析器接受標準 `data` 陣列或富資訊 `models` 物件，並歸一化每個候選的 id、顯示名、上下文視窗與最大輸出 token 數；Anthropic 的 `max_input_tokens` 與 `max_tokens` 會進入相同容量欄位，即使物件條目點名了另一個規範 id，物件鍵仍是請求 id，原始型別的物件屬性會被忽略，缺失的顯示名則退回到該請求 id。回答是介面可以提供給使用者採納的候選中繼資料——不儲存任何內容，`cordis.patch.yml` 仍然是決定路由服務內容的唯一事實。

### 失敗與恢復

pi-ai 不提供的路由需要 `api`、`baseURL` 與非空 `models` 列表；無法服務的 profile 會在寫入處被拒絕，並點名路由與模型。失敗攜帶穩定 code：無法使用的憑證以 `INVALID_CREDENTIAL` 失敗並點名路由與引用，`apiKeyEnv` 引用解析為空的路由以 `MISSING_CREDENTIAL` 失敗，未設定模型以 `UNKNOWN_MODEL` 失敗，終止性提供者失敗則區分 `QUOTA` 與暫時性 `RATE_LIMIT`。`GenerateOptions.stop` 以 `UNSUPPORTED_OPTION` 被拒絕，因為 pi-ai 的通用流式 UI 無法跨提供者保證它。

Config 更新嚴格驗證發生變化的 provider。初始載入將已儲存的目錄故障保留為可編輯的 provider 診斷；未更改的故障 provider 不阻止其他編輯。可用模型仍可選擇，無法解析的模型在網路 I/O 前失敗。修復或刪除問題設定會清除其診斷。

只修改 `displayName`、`apiKeyEnv` 或 `baseURL` 而未解決提供者的模型設定錯誤時，儲存仍會被拒絕。例如，OpenRouter 路由的模型 `111` 缺少 `api` 時，不能單獨儲存路由名稱的修改：需要在同一份編輯草稿中修復或刪除該模型，再儲存完整的提供者設定。中間修復狀態保留在草稿中，直到整條提供者設定透過驗證；其他提供者可以獨立儲存。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋介面卡背後的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

介面卡建立在不可變快照與按操作解析之上。每個操作都會在第一次 `await` 前捕捉整個快照——profile 加一個持有每條路由所建置 `Provider` 的 `createModels()` 集合——設定變更會建置新集合而非修改使用中的集合，因此在一個設定下開始的請求絕不會在另一個設定下結束。路由自己的憑證引用經 harness seam 解析，並以請求 `apiKey` 選項傳入，pi-ai 將其視為優先順序最高的 auth 覆蓋——這正是明確失敗引用語義的所在。該覆蓋未覆蓋的一切都經集合自身的 auth 到達 pi-ai：憑證儲存持有登入寫入、重新整理輪換的記錄（以 `llm-pi-ai/<provider id>` 定址），auth context 回答提供者解析時提出的 ambient 問題。兩者跨快照保持穩定，因此設定變更重建集合時不會忘記誰已登入。執行時 import 使用 pi-ai 的 provider、API 與 utility 入口；`src/models.ts` 提供本介面卡所需的少量 model helper，而不會求值 pi-ai 聚合入口。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Config 快照、目錄及路由註冊 |
| [`src/auth.ts`](src/auth.ts) | 覆蓋 harness 憑證平面的憑證儲存與 ambient auth context |
| [`src/login.ts`](src/login.ts) | 面向提供登入的已安裝提供者的授權流程 |
| [`src/config.ts`](src/config.ts) | Profile schema、解析與可服務性驗證 |
| [`src/catalog.ts`](src/catalog.ts) | 已安裝目錄整合與漂移門禁 |
| [`src/models.ts`](src/models.ts) | 基於 pi-ai 窄入口的 model collection、靜態 provider 與 reasoning level |
| [`src/provider.ts`](src/provider.ts) | 受支援協定表與提供者建置 |
| [`src/context.ts`](src/context.ts) | Harness 到 pi-ai 的上下文轉換、圖片處理、回放恢復 |
| [`src/stream.ts`](src/stream.ts) | 把 pi-ai 事件轉換為 harness `StreamChunk` 值 |
| [`src/replay.ts`](src/replay.ts) | 帶版本的 `ReplayEnvelope` 儲存與驗證 |
| [`src/discovery.ts`](src/discovery.ts) | 面向設定介面的端點詢問 |

### 註冊與目錄

外掛會在可設定提供者目錄中宣告它能認證的每個已安裝目錄提供者，並加入目前 profile 宣告的每條路由，因此設定介面可以在任何路由存在之前提供完整目錄。每個條目都攜帶 `declared`——pi-ai 是否在該鍵下不提供任何內容——因為只有介面卡能區分手工宣告路由與收窄目錄路由。路由註冊具有原子性：與其他介面卡衝突的候選集合會讓此前路由繼續服務。零路由的裸掛載即休眠姿態：settings 分節提供 profile 前不註冊任何內容，分節清空時路由隨之消失。

### 回放與詞彙

成功 assistant 回應會儲存帶版本的、無損 JSON 回放狀態，與產生它們的提供者和模型放在一起——回應級事實加每個流式塊一條逐塊條目。請求時，`LlmRuntime` 僅當同一介面卡實例擁有兩條路由時才傳遞迴放狀態；介面卡驗證它並恢復原生回應 id、提供者簽名與可選的 `providerThinkingLevel` effort 中繼資料，缺失的 effort 中繼資料仍保持缺失。回放會對照 assistant 來源驗證請求模型身份，並在提供者解析別名或退回時單獨恢復 Anthropic 回應模型。回放狀態缺失或無法使用時會降級為提供者無關內容，並保留 assistant 來源中必需的提供者和模型。pi-ai 工具呼叫參數是解析後的物件，因此介面卡解析輸入並重新字串化輸出，以符合 harness 原始 JSON 約定；pi-ai 流內錯誤事件對映為終止 `finish` 分片。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從服務約定逐步進入孿生介面卡與共享型別。

- [dsh-llm 服務](../llm/README.zh.md)——本介面卡註冊其上的提供者無關服務。
- [llm-deepseek 介面卡](../llm-deepseek/README.zh.md)——`deepseek-official` 路由的 DeepSeek 直連孿生。
- [LLM 流式子系統](../../../docs/subsystems/llm-streaming.zh.md)——`StreamChunk` 協定與介面卡約定。
- [llm-retry](../llm-retry/README.zh.md)——應用每個 profile `retryPolicy` 的重試執行器。
- [孿生 LLM 介面卡](../../../.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.zh.md)——為什麼 DeepSeek 路由交付兩個結構不同的介面卡。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-pi-ai)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 經 pi-ai 的提供者請求

#### 模型看到什麼

所選目錄模型會收到一條系統提示詞（`GenerateOptions.system`，否則取歷史中首條 `system` 訊息的文字；首條 system 訊息文字為空時不傳送系統提示詞）、其餘歷史、工具與 pi-ai 通用流式 API 支援的取樣欄位。每張保留圖片前都會有文字，註明其完整附件 id 與實際請求尺寸。目前執行檔案系統可以對映附件提供者的主機物件時，該文字還會攜帶只讀規範化物件路徑，並警告規範化或請求投影可能縮放或重新編碼上傳內容。日誌中的圖片省略決策選中的每個出現位置都會在替換文字中保留自己的身份與目前已解析存取方式，其規範化附件不會讀取或變換。當保留的出現位置按精確 base64 載荷仍超過路由的 `maxRequestImageBytes` 時，呼叫以 `IMAGE_OFFLOAD_REQUIRED` 失敗，由 `dsh-compaction-image-offload` 用 `image/offload` 事件記錄所選位置並重試步驟。提供者原生回放中繼資料只在介面卡針對歷史內容驗證透過後恢復。

#### Token 影響

提供者分詞決定精確輸入。保留圖片會新增穩定的附件與座標描述符；解除安裝預留位置會替代省略圖片的視覺 token。回放中繼資料可能讓原生 API 複用提供者側狀態。

#### KV Cache 影響

轉換保持邏輯請求順序，圖片控制代碼與解除安裝預留位置則會新增模型可見文字。即使附件身份與請求位元組保持穩定，執行世界路徑變化也會改寫歷史控制代碼，並可能從該圖片起阻止複用。更換介面卡實例、提供者、模型或其他上游 token 具有相同的字尾影響。一次省略決策會把較早圖片換成佔位文字，因此複用在該訊息處結束；省略永不退回，此後字首保持穩定。

### 提供者回應

#### 模型看到什麼

pi-ai 事件變成 harness 的推理、文字、工具呼叫、用量與 finish 分片。介面卡把解析後的工具參數以原始 JSON 字串傳給 harness。

#### Token 影響

生成內容只在 loop 記錄後才影響後續輸入。提供者未單獨報告推理 token 時，pi-ai 會把推理 token 併入輸出用量，並原樣保留其精確 `totalTokens` 值。

#### KV Cache 影響

已記錄的回應內容會追加到下一個請求，不會使其更早可複用字首失效。未記錄的傳輸中繼資料與用量計量不影響快取標識。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明介面卡在哪裡停止、由未來工作接續。它們是目前包約束，不是通用 pi-ai 對比或任務積壓。

- **`maxRequestImageBytes` 只計算 base64 圖片載荷**，文字、工具、描述符與 JSON 結構在該上限之外，因此它必須留有餘量地低於閘道請求體上限。
- **登入只存在於發起它的程序中**——授權嘗試不持久，因此登入中途重新整理頁面會放棄它，使用者需要重新開始。退出登入是對已儲存記錄執行 `deleteRecord`，只在本地忘記它，不會告知簽發方。
- **提供者原生髮現經本外掛的 ambient context 回答**——不點名憑證的路由交由目錄提供者自身解析，它會詢問環境值（`AZURE_OPENAI_API_KEY`、`AWS_PROFILE` 及各提供者自有集合）與本地憑證檔案。兩個問題都在這裡得到回答：憑證 seam 先於程序環境被查詢，檔案存在性則針對主機程序的檔案系統以 `~` 展開後檢查。它做不到的是*讀取*憑證檔案內容——自行解析 `~/.aws/credentials` 的提供者會直接讀取，不經該 seam。
- **重置恢復繼承設定**——重置下層 profile 提供的路由會恢復該路由。
- **完整替換 Config 可以移除繼承的字典條目**——欄位重置則恢復其繼承值。
- **`headers` 可以攜帶 redactor 永遠看不到的憑證**——profile 解析會拒絕 Fetch 無法表示的名稱與值，但該字典仍是純字串；以 `apiKeyEnv` 引用儲存憑證。
- **發現操作不更改已設定模型**——需顯式將發現結果採納到路由設定中。
- **Anthropic 模型發現最多讀取 1,000 個模型**——請求使用 API 的最大頁大小，但不會遍歷 `has_more`；第一頁之外的條目需要手工新增。
- **每條路由一種協定格式**——混合協定目錄路由無法承載另一協定格式的模型；把提供者拆到兩個路由鍵是變通辦法。
- **模態宣告不受驗證**——宣告 `image` 而其閘道不支援的模型會在提示詞准入後被提供者拒絕。持久圖片仍留在歷史中，同一誤宣告模型可能再次失敗；切換到純文字模型仍然可行，因為共享 LLM 執行時會針對該請求把圖片引用投影為穩定文字。
- **未認證路由取決於其協定**——不點名憑證的路由解析為已設定但無金鑰，但 pi-ai 的 OpenAI 相容實作仍要求 API 金鑰或 `Authorization` 標頭，因此無金鑰本地伺服器需要由 `apiKeyEnv` 引用或 `headers` 中的 `Authorization` 條目提供的佔位憑證。
- **不支援 `GenerateOptions.stop`**——pi-ai 的通用流式選項無法跨提供者保證停止序列行為。
- **只有歷史中首條 `system` 訊息會成為 pi-ai 的 `systemPrompt`**——pi-ai 只有一個系統槽位，因此後續的 `system` 訊息，或在同時設定了 `GenerateOptions.system` 時的首條訊息，會在原位置摺疊為 `user` 訊息；系統提示詞的提供者專屬放置遵循 pi-ai，而非 harness 自有的協定覆蓋。system 或 assistant 歷史中的圖片（包括首條系統訊息中的圖片）在兩條轉換路徑上都會以 `UNSUPPORTED_CONTENT` 失敗。
- **提供者 HTTP 狀態不可用**——pi-ai 錯誤事件不跨提供者暴露穩定 HTTP 狀態。
- **重試策略由提供者自有，而非 SDK 重試**——pi-ai SDK 重試保持停用，因此持久 agent（智慧代理）步驟與 `llm/retry` 事件擁有每個可見嘗試，直接 `ctx.llm.stream()` 呼叫仍是單次嘗試。
- **流式工具呼叫參數只在呼叫結束時解析一次**——安裝的 pi-ai 帶有 [`patches/@earendil-works__pi-ai@0.85.1.patch`](../../../patches/@earendil-works__pi-ai@0.85.1.patch)，它移除了每個流介面卡中對整段累計參數 JSON 的逐 delta 重新解析（上游 [earendil-works/pi#9265](https://github.com/earendil-works/pi/issues/9265)）；未打補丁時，數 MB 的參數流會在事件迴圈上消耗 O(n²) CPU，並使程序內所有工作階段停滯。在 `toolcall_end` 之前，pi-ai partial 的工具呼叫 `arguments` 保持為 `{}`；本介面卡只讀取 delta 字串與最終參數。每次升級 pi-ai 時都要重新應用或撤銷該補丁。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是不具權威性的工作上下文：尚未決定的探索方向與維護者備註。已交付的行為與既定理由以上文、包程式碼和相關 Agent Note 為準。

- 提供的協定集合刻意比 pi-ai 的完整 API 集合更窄：Bedrock、Vertex、Azure 與 Codex 透過 profile 無法以金鑰、端點與標頭完整描述的流程認證；目錄路由仍可經自有提供者到達它們，只有顯式覆蓋會被拒絕。Codex 可經授權流程的 OAuth grant 登入。
- `compat` 開關集合由漂移門禁釘在 pi-ai 的 compat 型別上；上游升級若新增欄位、為更多協定賦予 compat 型別或擴大值聯合，會在有人分類前讓建置失敗。

</details>

**執行時不變式：** 不釋出伴生入口。本包沒有獨立事件序列或可變資料關係，相關約定在所屬 seam 強制執行。
