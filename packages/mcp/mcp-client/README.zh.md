---
description: "面向部署方與維護者的 MCP 用戶端橋接說明，用於選擇、設定或排查連線到外部 MCP 伺服器、並將其工具註冊到 ctx.tools 的外掛。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-client

[English](README.md) | 中文

## 概述

`dsh-mcp-client` 讓模型使用外部 MCP（Model Context Protocol）伺服器的工具與資源。每臺伺服器設定一條記錄；其工具使用 `mcp__github__create_issue` 這樣的名稱。預設不啟用任何伺服器。隨附 profile 已提供[共享資源發現與讀取](../mcp-resources/README.zh.md)。呼叫方作用域為空時，不新增 MCP 工具或提示詞文字。伺服器指令作為字面文字加入已記錄的系統提示詞；MCP 提示詞範本不受支援。緩慢或崩潰的伺服器可能延遲啟動，或讓呼叫失敗直至恢復。

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

當模型需要像呼叫原生工具一樣呼叫外部 MCP 伺服器時，新增 `dsh-mcp-client`。為每臺伺服器指定唯一名稱和傳輸方式。官方 SDK 優先選擇可用的 2026-07-28 協定，並退回到支援的舊版協定。本地程式使用 stdio，遠端服務使用 Streamable HTTP；stdio 協商會先啟動臨時探測程序，再啟動實際服務程序。

### 最小設定

每臺伺服器新增一條設定項即可，無需其他內容。harness 啟動後，伺服器的工具會出現在模型的工具列表中。

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN

- id: mcp-web
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: web
    transport: streamable-http
    url: http://localhost:3000/mcp
    headers:
      Authorization: !!js '`Bearer ${process.env.MCP_TOKEN}`'
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `transport` | 必填 | `stdio` 或 `streamable-http` |
| `serverName` | 必填 | 伺服器工具名稱的 namespace；`[A-Za-z0-9_-]{1,32}`，在一個註冊作用域內唯一 |
| `command` / `args` / `env` / `cwd` | — | stdio：可執行檔案、參數、合併到清洗過的環境之上的額外環境變數、工作目錄 |
| `url` / `headers` | — | streamable-http：端點 URL 與額外請求標頭 |
| `toolCallTimeoutMs` | `60,000` | 每次 `tools/call` 或資源請求的超時 |
| `maxInstructionBytes` | `32,768` | 包括伺服器歸屬資訊在內的伺服器指令 UTF-8 位元組上限；超出時連線失敗 |
| `failOnStartupError` | `false` | 初始連線或工具同步失敗時拒絕外掛啟用 |
| `reconnect.enabled` | `true` | 連線丟失後自動重新連線 |
| `reconnect.initialDelayMs` | `500` | 首次重連延遲；每次連續失敗嘗試翻倍 |
| `reconnect.maxDelayMs` | `30,000` | 退避上限；同時是重置嘗試預算所需的正常執行時長 |
| `reconnect.maxAttempts` | `10` | 每次中斷內連續失敗嘗試次數上限，超出後放棄 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-mcp-client)是每個受支援欄位的窮盡式真源。

啟動後，伺服器的工具會以 `mcp__<serverName>__<tool>` 形式出現——試著用一條提示詞呼叫其中一個。如果初始連線失敗，harness 仍會啟動，但該伺服器的工具不會出現，並會記錄一條錯誤。設定 `failOnStartupError: true` 會拒絕外掛啟用；[app-boot 的啟動策略](../../boot/app-boot/README.zh.md)仍允許可選 MCP 設定項失敗，而不中止 harness。

### 工具命名與共存

模型看到每個工具都帶有穩定的伺服器限定名稱：`mcp__<serverName>__<rawName>`，例如 `mcp__github__create_issue`——與 Claude Code 和 Codex 使用的命名形態相同。只要伺服器保持相同的工具名稱，名稱就保持不變，因此工作階段歷史與權限規則在重新啟動和過載後仍然有效。兩個伺服器可以同時提供名為 `search` 的工具，分別以 `mcp__github__search` 和 `mcp__web__search` 共存。

- 釋出相同工具名稱（例如 `search`）的兩個伺服器會在各自的 namespace 下共存。
- 兩條設定項使用相同的伺服器名稱時，後載入的一條會在載入時以明確錯誤失敗。
- 伺服器在工具列表中兩次列出同一工具時，其工具列表會被作為無效列表拒絕，上一組工具保持可用。
- SDK 負責發現分頁及頁數上限。發現失敗會保留之前的工具；格式錯誤的遊標鏈遵循 SDK 的處理行為。
- 工具更新與已有工具名稱衝突時，該更新會被整體拒絕——絕不會得到該伺服器的部分工具集。

### 呼叫工具與讀取結果

模型呼叫 MCP 工具時，呼叫會以每次呼叫超時（預設 60 秒）發往遠端伺服器，並像其他工具呼叫一樣可以取消。結果按塊順序以普通文字返回；資源連結以文字形式顯示名稱與 URI。如果伺服器報告錯誤，呼叫會明確失敗——模型不會看到虛假的成功。

目前模型接受圖片輸入且 harness 啟用了附件功能時支援圖片；圖片會像其他圖片一樣出現在對話中。不支援圖片時——以及伺服器返回音訊或嵌入資源時——模型會看到清晰的診斷訊息，而不是什麼都沒有。

### 啟動、工具更新與重連

伺服器的工具會在 harness 開始首個輪次之前出現。伺服器更改工具列表時，模型的工具集會自動更新；更新失敗時，上一組工具繼續可用。

伺服器連線斷開時——例如本地伺服器程序崩潰——外掛會以從 500 ms 起逐次翻倍、上限 30 s 的延遲自動重連，並重新整理工具集；重連進度在日誌中可見。中斷期間最後已知的工具仍會列出，但對它們的呼叫會失敗，直到伺服器恢復。連續失敗十次後，該伺服器的工具會被移除，重連停止，直到你過載設定或重新啟動 harness；伺服器持續連線一段時間後，該計數會重置。設定 `reconnect.enabled: false` 可停用自動重連——此時工具在斷開後仍會列出，但呼叫失敗，直到你過載。編輯設定項會在原地過載伺服器連線，未變的名稱保持不變。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋橋接背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **伺服器限定身份。** 每個 MCP 工具都有穩定的身份 `(serverName, rawName)`。namespace 是本地設定，絕不採用遠端 `serverInfo.name`——遠端名稱不可信、在部署間不唯一、且升級時可能變化，這些都不允許靜默重新命名面向模型的工具。
- **命名是固定約定。** 公開名稱是 `(serverName, rawName)` 的純函式，並滿足 DeepSeek 函式名稱約定；有損規範化會追加 12 位十六進位制 SHA-256 hash，使不同身份絕不會摺疊。工作階段歷史與權限規則因此能在 HMR（熱模組替換）、重新同步和其他伺服器變化後保持有效。
- **原始名稱是唯一的協定名稱。** `tools/call` 始終收到原始名稱；公開名稱絕不會發給伺服器，也絕不會被解析來還原原始名稱。
- **要麼完整世代，要麼沒有。** 同步會原子地交換世代：取得失敗保留上一世代，註冊衝突則復原整個嘗試中的世代。
- **一個規範值，一個投影。** 執行器保留完整的規範 MCP 回傳值，並準備有序圖文內容。`projectContent` 在 `tools/post-execute` 之前安裝已準備的內容，讓省略策略看到真實圖片塊。後續策略的內容替換、值替換和阻止均保持生效。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`Config` schema、`serverName` 預留、啟用等待 |
| [`src/connection.ts`](src/connection.ts) | 連線監督器：用戶端世代、重連策略、嘗試預算、dispose（資源釋放） |
| [`src/server-context.ts`](src/server-context.ts) | 資源提供者註冊與字面伺服器指令 |
| [`src/tools.ts`](src/tools.ts) | 工具橋接：發現、命名、註冊交換、執行、圖片投影 |
| [`src/transport.ts`](src/transport.ts) | 傳輸工廠：帶清洗環境的 stdio spawn、Streamable HTTP |
| — | 不釋出執行時不變式伴生入口；MCP 世代會透過工具註冊表發揮作用，但橋接在非同步重新同步後不提供獨立的伺服器工具對映快照。 |

匯出的 `createMcpToolDefinition(ctx, options)` 將上游工具 schema 和原始結果回呼適應到相同的規範值、錯誤和持久化影象投影。每次回呼都收到原樣的 `ToolExecution`，包括其 Agent 和取消訊號；SDK 的規範型別驗證會在投影前檢查返回結果。呼叫方負責註冊、取消截止時間和提供者解除安裝。原生 Cua Driver 提供者使用此適應函式，無需開啟 MCP 傳輸。

### 生命週期與同步

`apply` 解析重連策略、在目前註冊作用域內預留 `serverName`、啟動監督器，並等待初始連線加發現完成。獨立 agent（智慧代理）作用域可以複用相同 namespace，因為其工具與傳輸彼此隔離；同一作用域內重複會在載入時失敗。監督器把所有同步——初始、通知與重連——序列到同一條佇列，因此兩次同步絕不會交錯執行各自的先 dispose 後註冊交換。dispose 會取消待執行的重連、關閉協商中的傳輸或已繫結的用戶端、等待進行中的嘗試與排隊同步完全停穩，然後登出目前世代。

SDK 透過舊版通知或現代協定訂閱接收工具列表變化。監督器將每次重新同步排隊；取得失敗時保留之前的註冊代，註冊衝突則復原本次嘗試。每次故障共享一個嘗試預算：連續失敗達到 `maxAttempts` 後登出工具並停止重連；連線持續超過 `maxDelayMs` 則重置預算。

### 工具執行內部細節

工具呼叫向 SDK 提供原始名稱、完整工具定義、JSON 參數、取消訊號及設定的超時。SDK 負責協定驗證、已宣告輸出 schema 的總和檢查碼現代協定請求 header。成功結果規範值為 `{ content: JsonValue[], structuredContent? }`，為程式設計呼叫方及 PTC 模式保留有效的 MCP JSON 塊。MCP `isError` 結果會在圖片持久化前丟擲。橋接器在儲存前驗證整批圖片；拒絕時將每張圖片投影為診斷文字。

### 環境清洗（stdio）

子程序環境以子程序 seam 的 `scrubbedParentEnv()` 為基座——刪除匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的環境名稱與所有 `DSH_*` 名稱——再在其上合併設定的 `env`，因此顯式覆蓋得以保留。實際 spawn 由 MCP SDK 負責；本包共享清洗定義，而非 spawn 路徑。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享工具註冊表逐步進入橋接的設計證據與可執行的範例設定。

- [工具子系統參考](../../../docs/subsystems/tools.zh.md)——接收已橋接工具的 `ToolRuntime` 與 `ctx.tools.register()` 約定。
- [MCP 用戶端外掛 Agent Note](../../../.agents/notes/implemented/feature/2026-07-07-mcp-client-plugin.zh.md)——命名不變式、發現與執行設計、備選方案與後果。
- [規範工具輸出約定 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-20-canonical-tool-output-contract.zh.md)——MCP 結果如何對映進規範工具輸出約定。
- [第三方記憶 MCP 指南](../../../docs/user/guide/mcp-memory.zh.md)——使用本包的三份記憶伺服器 overlay。
- [生成設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-mcp-client)——每個受支援設定欄位及其源宣告。

-----

<a id="model-experience"></a>
## 模型體驗

### 已發現的 MCP 工具

#### 模型看到什麼

發現成功後，SDK 接受的 MCP 工具以原生工具名稱 `mcp__<serverName>__<rawName>`（或其確定性規範化形式）出現，攜帶伺服器描述和輸入 schema。重新同步會替換註冊代；釋放或重連預算耗盡會移除工具。未宣告 tools 能力的伺服器以空工具集連線。

#### Token 影響

工具註冊期間，工具描述與輸入 schema 會進入每次請求；重新同步會替換而非累積 schema，伺服器限定名稱也會為每個工具定義和呼叫增加 token。已設定用戶端還會啟用[共享資源工具與伺服器名稱提示詞](../mcp-resources/README.zh.md#model-experience)。

#### KV Cache 影響

已發現工具集合及其 schema 不變時，工具定義字首保持穩定。增加、移除、重新命名或更改工具的重新同步會替換定義，並可能使從第一個變化的 schema token 起的複用失效；恢復未變列表的重連會生成完全相同的定義，字首保持穩定。

### 工具呼叫歷史與結果

#### 模型看到什麼

公開工具名稱和 JSON 參數保留在 assistant 歷史中。規範值始終為程式化呼叫方與 PTC 模式呼叫方保留完整的 MCP JSON 塊與可選結構化內容；受支援的圖片塊在確切路由能力得到證明後，按原始順序與文字一起投影。被拒絕的圖片、音訊、嵌入資源、資源連結與未知塊繼續以有界文字診斷可見；MCP `isError` 會在圖片持久化之前拒絕呼叫。

#### Token 影響

參數、對映後的文字與持久圖片引用保留到壓縮（compaction）發生時。內聯 MCP base64 只存在於執行區域性的規範值中，絕不會複製進工作階段事件；提供者會從附件儲存讀取經過驗證的位元組。音訊與嵌入資源載荷不會進入模型上下文。

#### KV Cache 影響

僅追加；新可見內容位於可複用請求字首之後，不會使現有 KV-cache 條目失效。

### 伺服器指令

#### 模型看到什麼

每個成功連線返回的非空白指令儲存在一個帶伺服器名稱的段落中。未返回指令或指令僅含空白時，不向提示詞新增文字。花括號保持字面值。替代連線僅在發現成功後釋出其指令；釋放或耗盡恢復預算時移除該段落。

#### Token 影響

作用域段落生效期間，伺服器指令為模型請求貢獻文字。資源文件僅透過顯式資源讀取進入歷史。

#### KV Cache 影響

未變化的指令保留相同提示詞文字。更新或移除指令會改變下一次組裝的系統訊息及其可複用字首。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明你無法用本外掛做什麼、以及何時需要運維注意。它們是目前包約束，不是與其他 MCP 用戶端的對比，也不是任務積壓。

- **資源按需讀取**——隨附 profile 提供[共享資源服務](../mcp-resources/README.zh.md)；資源訂閱與 MCP 提示詞範本不受支援。
- **啟動與發現超時繼承自 MCP SDK**——外掛不暴露單獨的連線或發現超時。協商與發現使用 SDK 預設的 60 秒請求超時；發現也使用 SDK 的頁數上限。外掛解除安裝先關閉傳輸以中斷待處理的啟動請求，再等待清理。
- **重連處理協商失敗與傳輸關閉**——初始探測失敗或 stdio 子程序崩潰都會使用設定的重連預算。HTTP 建立連線後，請求失敗使用 SDK 傳輸的恢復機制，而非重新建立連線。
- **圖片是唯一的持久豐富結果橋接**——PNG、JPEG、WebP 與 GIF 在確切能力得到證明後進入 Native 上下文。音訊與嵌入資源載荷仍只存在於執行區域性並帶明確診斷，資源連結只以文字保留名稱與 URI。
- **無效的協定結果或輸出 schema 由 SDK 拒絕**——橋接器不接受舊式 `toolResult` 替代結果，也不繞過已宣告的 schema 驗證。
- **要求基於任務的 MCP 工具在呼叫時被拒絕**——要求使用基於任務的執行（task-based execution）擴充功能的工具會丟擲異常而非被橋接；該擴充功能未實作。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放設計問題與尚未決定的探索方向。它明確不具權威性——已交付行為、限制與既定理由以上文、包程式碼與所連結的 Agent Note 為準。

- 公開名稱演算法是由測試固定的 v1 約定；釋出後更改會破壞工作階段歷史與權限規則。
- 由 DSH 顯式擁有的連線與發現超時是開放的探索方向；SDK 的 60 秒預設值約束著啟動請求。
- Streamable HTTP 的重連歸屬仍未決定：按請求重試是 SDK 行為，supervisor 也可以擁有 HTTP 世代。
- MCP 提示詞範本需要獨立的使用者選擇和範本呼叫機制。
- 固定的 MCP SDK 仍在演化；上游破壞性變更需要更新橋接。

</details>
