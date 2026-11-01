---
description: "用於在無提供者金鑰的情況下測試 LLM（大語言模型）介面卡與恢復策略的可透過腳本控制的 Messages 相容故障伺服器，面向測試作者與演示。"
kind: "package-library"
---

# @deepseek-ai/dsh-llm-mock-server

[English](README.md) | 中文

## 概述

本包為測試與演示提供可編腳本的 Messages 相容 HTTP／SSE（Server-Sent Events）端點，使其無需提供者金鑰即可檢驗模型提供者的失敗與成功。每個已接受的 `/v1/messages` 請求依次消費下一個腳本行為，包括重置、停滯、畸形分片、速率限制、伺服器錯誤、補全與工具呼叫。測試作者可以透過 `pnpm run mock:llm` 執行伺服器，也可以呼叫 `startMockLlmServer`，後者會返回捕捉的請求供斷言使用。帶種子的 `random` 行為支援可復現的混合故障壓力執行。

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

本包讓測試或演示無需實際提供者即可使用提供者協定進行通訊：啟動伺服器，腳本化你想檢驗的協定行為，然後把真實 LLM 介面卡指向它的 base URL。

### 獨立執行

從本儲存庫執行源入口：

```sh
pnpm run mock:llm \
  --port 8000 \
  --api-key mock-key \
  --sequence partial_disconnect,success \
  --partial-text "discard this half"
```

將釋出的 DeepSeek 介面卡指向伺服器；它會向伺服器 `/v1` 根路徑下的 `/messages` 傳送請求：

```sh
DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1 \
DEEPSEEK_API_KEY=mock-key \
pnpm dsh --profile headless "test provider recovery"
```

儲存庫腳本將 JSONL 寫入 stdout：`ready` 記錄攜帶以 `/v1` 結尾的 base URL 與隨機種子，後續請求/結果記錄同時命名腳本行為與實際選中的具體行為。本包不公開可安裝的二進位制命令。

### 腳本化行為

`--sequence` 是逗號分隔的 FIFO。耗盡時返回結構化 HTTP 500；`--repeat-last` 顯式重用最後一項。

| 行為 | 協定結果 |
|---|---|
| `connection_reset` | 在傳送 HTTP 標頭前銷燬 socket |
| `stream_disconnect` | 傳送 SSE 標頭，然後在第一個事件前重置連線 |
| `partial_disconnect` | 傳送文字增量，然後重置 socket |
| `stall` | 傳送 SSE 標頭，並保持空閒，直到用戶端／伺服器取消 |
| `empty` | 傳送有效的無內容 stop 和 `[DONE]` |
| `empty_body` / `stream_eof` / `partial_eof` | 正常結束，但缺少必需的 `[DONE]` 邊界 |
| `malformed_json` / `malformed_event` | 傳送無效 SSE JSON 或無效提供者分片形態 |
| `rate_limit` / `server_error` / `service_unavailable` | 返回面向重試的 429/500/503 JSON 錯誤 |
| `auth_error` / `invalid_request` / `context_overflow` / `quota_exceeded` | 返回終止性錯誤或需要單獨恢復的提供者錯誤 |
| `success` / `slow_success` / `reasoning_success` | 流式傳送完整文字回應，可選延遲或先傳送推理（reasoning） |
| `tool_call_success` / `max_tokens` | 以工具呼叫或結束原因 `length` 完成 |
| `wrong_content_type` | 以 `application/json` 內容型別傳送有效 SSE 正文 |
| `random` | 按帶權重的種子隨機選擇具體請求行為 |

`connection_refused` 只能在 CLI 中使用，且必須是第一個條目。它會延遲繫結呼叫方指定的非零埠，因此 `--listen-delay-ms` 期間的請求會收到真實 TCP 拒絕；其餘條目在 listener 啟動後開始。

### 隨機模式

使用重複 `random` 條目執行開放式混合執行：

```sh
pnpm run mock:llm \
  --port 8000 \
  --sequence random \
  --repeat-last \
  --seed 42 \
  --random-weights 'success=60,slow_success=10,connection_reset=5,stream_disconnect=5,partial_disconnect=10,empty=5,server_error=5'
```

省略 `--seed` 會生成種子，並在 `ready` 記錄中列印。`--random-weights` 接受非負的相對 `behavior=weight` 條目，並要求至少一個正權重具體行為。匯出預設值是一個成功佔主導的壓力分佈，包含 reset、disconnect、部分輸出、空完成、stall、429/5xx、乾淨截斷與格式錯誤的 JSON；它用於施加測試壓力，而非估計生產事故頻率。`connection_refused` 被排除，因為已繫結的請求處理器無法產生真實拒絕。隨機權重包含 `stall` 時，為待測用戶端設定較短的流空閒超時，使情境及時結束。

### 時序與內容控制

CLI 公開 `--success-text`、`--partial-text`、`--reasoning-text`、`--chunk-size`、`--chunk-delay-ms`、`--disconnect-delay-ms`、`--retry-after-ms`、`--request-id`、`--tool-name` 與 `--tool-arguments`。毫秒延遲是 Node 定時器範圍內的有界整數；`retryAfterMs` 還必須為正數。庫接受相同的 camel-case 選項。可選的 `apiKey` 會精確驗證 `x-api-key: <token>`；省略時接受任何 token。

### 可能出什麼問題

- **腳本耗盡**——耗盡時返回結構化 HTTP 500；當一次執行需要更多請求時設定 `--repeat-last` 或加長序列。
- **沒有正權重具體行為的隨機權重會被拒絕**——每個條目都必須命名現有行為，且至少一個條目帶正權重。
- **無效請求不消費腳本**——錯誤方法、路徑、API key 與畸形 JSON 會收到普通 4xx 回應，因此設定錯誤的用戶端可能耗盡重試卻不推進序列。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋伺服器的設計；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計

伺服器建立在一個規則之上：每個已接受的 Messages 請求從按到達順序排列的 FIFO 遊標消費恰好一個行為，伺服器從不重試或解讀 harness 策略。驗證先於遊標推進——只有 `POST` 且路徑以 `/v1/messages` 結尾、設定金鑰時攜帶有效 API key、且 JSON 正文可解析的請求才消費腳本；其餘請求都收到普通 4xx。`random` 條目在請求時透過帶種子的 PRNG 按設定權重解析，因此一次執行可由其列印出的種子復現。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | `startMockLlmServer`：listener、行為表、種子隨機、遙測（telemetry）、捕捉的請求記錄 |
| [`src/cli.ts`](src/cli.ts) | `--sequence` 與時序/內容選項解析、JSONL stdout 遙測 |
| [`src/bin.ts`](src/bin.ts) | `pnpm run mock:llm` 源入口 |
| — | 不釋出執行時不變式伴生元件；該獨立測試伺服器不擁有 Cordis 事件流或共享資料；其協定行為和生命週期透過直接 HTTP 測試及組裝後的迴圈測試進行檢驗。 |

### 協定流程

請求進入處理器、透過驗證，然後選擇行為：具體腳本條目直接執行，`random` 抽取一個，已耗盡腳本則以結構化 500 報告 `script_exhausted`。隨後 `runBehavior` 執行協定結果——銷燬 socket、SSE 流、JSON 錯誤或補全——同時每個請求與結果按到達順序記錄到返回的控制代碼上，供測試斷言。`close()` 停止接受請求並強制終止停滯連線。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從故障伺服器逐步進入它所檢驗的介面卡約定，以及用於已記錄成功 transcript（文字記錄）的無金鑰替代方案。

- [LLM 包](../../llm/llm/README.zh.md)——本伺服器所檢驗的提供者流約定與重試策略。
- [llm-replay](../llm-replay/README.zh.md)——回放已記錄成功 transcript 而非製造故障的無金鑰替代方案。
- [測試策略](../../../docs/testing.zh.md)——本伺服器服務的覆蓋層級與恢復測試。
- [test-support 組地圖](../README.zh.md)——兄弟 harness 與支援包。

-----

<a id="model-experience"></a>
## 模型體驗

無。該測試伺服器替代提供者協定行為，而不呼叫真實模型。

#### KV Cache 影響

無；請求在本地終止，絕不會到達提供者快取。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明何時需要對該伺服器特別小心。它們是目前包約束，不是任務積壓。

- **隨機權重建模測試壓力，而非生產事故頻率**——需要環境專用分佈的呼叫方必須提供已測量權重，並記錄發出的種子。
- **請求腳本按到達順序執行**——並行呼叫方共享一個遊標，因此確定性的每工作階段故障分配需要獨立伺服器實例。
- **真實連線拒絕發生在監聽器生命週期階段**——CLI 延遲必須與用戶端嘗試重疊；請求級隨機選擇只能重置已接受的連線。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
