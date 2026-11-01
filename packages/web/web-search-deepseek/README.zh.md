---
description: "ctx.web 的 DeepSeek 搜尋提供者：部署方如何透過 Anthropic 相容 Messages API 掛載 DeepSeek 原生 web 搜尋，並逐次解析憑證。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-deepseek

[English](README.md) | 中文

## 概述

有了 `dsh-web-search-deepseek`，harness 可以透過 DeepSeek 原生搜尋檢索 web，使用部署已有的 `DEEPSEEK_API_KEY`。當部署希望使用 DeepSeek 原生搜尋、並接受一次搜尋在延遲與 token 上消耗一個完整模型輪次時選擇它，因為 DeepSeek 不提供專用搜尋端點。結果來自 DeepSeek 返回的結構化搜尋塊，絕不會從回覆文字中抓取。憑證缺失時呼叫以結構化錯誤失敗；回應缺少搜尋結果塊時會明確報錯，而非降級。面向模型的 `web_search` 工具位於 `dsh-tool-web`。

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

在已載入 web 服務的組合中掛載本提供者；它以 `deepseek-official` 搜尋提供者身份註冊，因此當它是唯一可用的搜尋後端時，`ctx.web.search()` 會自動解析到它——也可以用 `searchProvider: deepseek-official` 固定。

### 何時選擇

當部署希望使用 DeepSeek 原生伺服器端 web 搜尋、且已持有 `DEEPSEEK_API_KEY` 時選擇此後端——提供者複用該憑證引用。一次搜尋比專用檢索端點更重：DeepSeek 在完整模型輪次內執行搜尋，因此每次搜尋都要預期一次 Messages 呼叫的延遲與生成 token，每次請求最多 `maxUses` 次伺服器端搜尋。當單次搜尋的成本或延遲佔主導時避免使用它。

### 最小設定

載入 web 服務與本提供者；金鑰在已掛載 `ctx.credentials` 服務時從其解析，否則從程序環境解析。輔助搜尋呼叫有獨立的端點設定，使用 Anthropic 相容基址 `https://api.deepseek.com/anthropic/v1`，並追加 `/messages`。它讀取 `$DEEPSEEK_SEARCH_BASE_URL`，與工作階段介面卡的 `$DEEPSEEK_BASE_URL` 相互獨立。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    baseURL: https://gateway.internal/anthropic/v1
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `apiKey` | 未設定 | DeepSeek API 金鑰字面值；優先使用 `apiKeyEnv`，避免金鑰進入設定。非空字面值優先 |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 每次搜尋透過 `ctx.credentials` 解析的憑證引用；沒有該服務時從程序環境解析。值缺失時呼叫以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失敗 |
| `baseURL` | `https://api.deepseek.com/anthropic/v1` | Anthropic 相容端點基址；追加 `/messages`。預設時退回到 `$DEEPSEEK_SEARCH_BASE_URL`；無法解析時提供者不可用 |
| `model` | `deepseek-v4-flash` | Anthropic 格式模型名稱 |
| `apiVersion` | `2023-06-01` | `anthropic-version` 標頭值 |
| `maxTokens` | `4096` | Messages 請求生成 token 的正整數上限 |
| `maxUses` | `5` | 每次請求使用 `web_search` 伺服器工具的正整數上限 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-deepseek) 列出所有接受的欄位。每次搜尋從即時 Config 引用捕捉選項。

### 搜尋返回什麼

`content` 始終省略：DeepSeek 的提供者文字不作為答案受到信任。`sources[]` 來自 `web_search_tool_result` 塊內的 `web_search_result` 條目——`url` 和 `title` 直接取自同名欄位，`publishedAt` 取自 `page_age`——snippet 在存在摘錄時按 URL 關聯的 `cited_text` 條目拼接。結果按 URL 去重，且由於 DeepSeek 不公開結果數量旋鈕，服務透過截斷並標記來強制執行 `maxResults`。

### 請求日誌

由發起 agent（智慧代理）執行的搜尋會在發出請求前一刻，追加僅用於日誌的 `web/deepseek-search-llm-request` 工作階段事件。其中包含已解析端點、API 版本，以及傳送給 DeepSeek 且不含金鑰的精確 JSON 請求體；不包含標頭和憑證。發出請求前發生憑證失敗或取消時不會建立事件，而發出請求後的 HTTP 或回應失敗會保留本次請求嘗試的持久記錄。

### 失敗與恢復

失敗丟擲攜帶可按機器路由 code 的 `WebError`：憑證缺失為 `WEB_PROVIDER_CREDENTIAL_MISSING`，呼叫方取消為 `WEB_ABORTED`，提供者或傳輸失敗，包括回應中沒有 `web_search_tool_result` 塊，為 `WEB_PROVIDER_ERROR`。HTTP 重定向會在接觸 `Location` 指向的目標之前被拒絕。請求發出後的每項失敗都會指出已解析的搜尋端點，並說明搜尋端點設定獨立於聊天端點。如果該端點不符合使用者預期，錯誤訊息會要求工作階段模型指導使用者進入 Settings > Plugins > Plugin configuration > Web search，修改 Endpoint 欄位並儲存。該頁面不可用時，訊息會把 `DEEPSEEK_SEARCH_BASE_URL` 和 `web-search-deepseek.baseURL` 作為部署設定方式。模型不得替使用者選擇或修改端點。面向模型的 `web_search` 工具會在自己的錯誤包裝層內呈現這段文字。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋提供者背後的設計決策；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

本提供者建立在兩項承諾之上：

- **只取結構化塊。** DeepSeek 在伺服器端執行搜尋並返回結構化的 `web_search_tool_result` 塊；提供者解析這些塊，絕不從模型文字中抓取 URL。嚴格模式下，沒有此類塊的回應會丟擲 `WEB_PROVIDER_ERROR`，而非降級。
- **一個憑證，逐次解析。** 提供者複用 `DEEPSEEK_API_KEY` 引用（不新增金鑰），但透過 `$DEEPSEEK_SEARCH_BASE_URL` 保持輔助請求端點獨立。已掛載的憑證服務具有權威性；沒有該服務時退回到啟動程序的環境。按次解析意味著在 Web 的 Models 頁中儲存或輪換的金鑰無需重新啟動，即可用於下一次搜尋。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | Config schema 與每次搜尋的選項捕捉 |
| [`src/provider.ts`](src/provider.ts) | `DeepSeekSearchProvider`：Messages 請求分發、塊解析、引用拼接、憑證解析 |
| [`src/types.ts`](src/types.ts) | 搜尋回應的 Anthropic 協定型別 |
| — | 不釋出執行時不變數配套入口；本包會在分發前發出日誌事件，但沒有後續的權威分發事件可與之關聯；精確的請求包絡相等性改由提供者邊界保障。 |

### 請求流程

每次搜尋先把目前 Config 段投影為提供者選項——端點、模型、金鑰引用、上限——然後透過 `ctx.credentials`（或環境）解析憑證引用，追加僅用於日誌的工作階段事件，並以原生 `web_search` 伺服器工具分發 Messages 請求。回應中的 `web_search_tool_result` 塊變為 `sources[]`；文字塊中的 `cited_text` 條目按其 URL 拼接為 snippet；結果按 URL 去重；服務在返回路徑上強制執行請求的來源上限。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享詞彙逐步進入服務、面向模型的工具與設計依據。

- [web 子系統](../../../docs/subsystems/web.zh.md)——窮盡式的搜尋請求／結果詞彙與錯誤碼。
- [web 包對映](../README.zh.md)——六包家族與各角色。
- [dsh-web](../web/README.zh.md)——本提供者註冊進入的 web 服務。
- [dsh-tool-web](../tool-web/README.zh.md)——渲染本提供者來源的面向模型 `web_search` 工具。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-deepseek)——每個受支援設定欄位及其源宣告。
- [web 能力 seam 決策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md)——搜尋與抓取為何共用一項提供者選擇服務。

-----

<a id="model-experience"></a>
## 模型體驗

### 輔助 DeepSeek 搜尋請求

#### 模型看到的內容

獨立的 DeepSeek 模型會原樣接收 `Perform a web search for the query: <query>` 作為使用者文字，並收到一個原生 `web_search` 伺服器工具定義。該請求不屬於工作階段模型上下文。

#### Token 影響

每次搜尋都會產生獨立的提供者輸入與輸出 token；`maxTokens` 限制生成輸出，`maxUses` 限制原生搜尋次數。

#### KV Cache 影響

與工作階段請求快取相互獨立。輔助指令與原生工具定義可以形成穩定字首，但查詢或模型路由的每次變化都會阻止從首個差異起的複用。

### 間接的工作階段工具結果

#### 模型看到的內容

透過 `dsh-tool-web`，工作階段模型會看到結構化搜尋塊中去重後的 URL、標題、日期與引用 snippet；提供者文字不會作為答案受到信任。該提供者的具體失敗訊息包括帶有處理指引的憑證缺失訊息、`DeepSeek search credential resolution failed: <error>` 和 `DeepSeek search aborted`。請求、HTTP、原生搜尋和回應正文失敗會追加已解析端點及前述條件式設定指引。錯誤包裝屬於消費方。

#### Token 影響

註冊不會直接產生工作階段 token。結果 token 隨返回源與 snippet 增長，隨後服務強制執行請求的來源上限。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明提供者在哪些情況下昂貴或不完整。它們是目前包約束。

- **一次搜尋消耗一個完整的 Messages 模型輪次**——產生延遲與生成 token，最多執行 `maxUses` 次伺服器端搜尋；DeepSeek 不公開專用檢索端點。
- **動態憑證的可用性在操作內部解析**——同步可用性檢查可以確認解析器存在，但無法查詢非同步憑證儲存，因此選中的無金鑰提供者會使搜尋以 `WEB_PROVIDER_CREDENTIAL_MISSING` 失敗；穩定的 `web_search` schema 仍保持註冊。
- **超量返回的來源仍消耗 token**——協定沒有結果數量旋鈕，`maxResults` 只能由服務在事後截斷。
- **未引用的結果沒有 `snippet`**——只有當文字塊引用（`cited_text`）匹配其 URL 時，來源才會獲得 snippet。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為、限制與既定理由以上文和相關 Agent Note 為準。

#### 未來：專用檢索端點

能夠避免完整模型輪次的 DeepSeek 原生搜尋端點將消除主要成本；在 DeepSeek 公開此類端點之前，本提供者仍是 Messages 呼叫介面卡。

</details>
