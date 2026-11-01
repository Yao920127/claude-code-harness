# DeepSeek 官方 LLM API 協定擴充功能

[English](deepseek-llm-api-wire-extensions.md) | 中文

本參考定義 [`@deepseek-ai/dsh-llm-deepseek`](../packages/llm/llm-deepseek/README.zh.md) 在 `deepseek-official` Messages 請求中傳送的全部 DeepSeek Harness 專用 HTTP 標頭與附加 JSON 欄位。它不重新定義上游 DeepSeek API 自有欄位。提供者無關的 LLM 介面與 `llm-pi-ai` 不實作這些擴充功能。

介面卡將這些擴充功能傳送至已解析的 `baseURL`，包括已設定的閘道。擴充功能位於 `messages`、系統提示詞和工具 schema 之外，因此不會增加模型輸入 token，也不會改變模型可見字首。

## 協定名稱空間與版本

| 位置 | 命名方式 | 範例 |
|---|---|---|
| HTTP 欄位名 | 小寫 kebab-case；HTTP 匹配仍不區分大小寫 | `user-agent`, `x-deepseek-harness-session-id` |
| DeepSeek 請求正文擴充功能欄位 | 使用保留 `dsh_` 字首的 snake case | `dsh_plugin_packages`, `dsh_session_log` |
| DSH 持有的巢狀 JSON 成員 | Camel case | `afterSeq`, `throughSeq`, `sessionId` |
| 帶標籤的值 | 使用 kebab-case 字串；持久事件採用 `domain/action` | `session-log-deepseek/delivery-accepted` |

每個正文擴充功能獨立持有自身的 `version`。版本僅適用於包含該欄位的物件；不同欄位的版本之間不存在相容或排序關係。JSON 成員順序不屬於協定。

[`DeepSeekLlmApiExtensionRegistry`](../packages/llm/deepseek-llm-api-extensions/README.zh.md) 為每個頂層副檔名保留一個提供者。空名稱、兩端帶空白的名稱、重複註冊以及與 DeepSeek 基礎請求衝突的名稱都會在 HTTP 分派前失敗。

## 請求標頭

| 標頭 | 出現條件 | 值 |
|---|---|---|
| `user-agent` | 每個提供者 HTTP 請求，包括 Files API 操作 | 採用 `product/version (+url)` 形式的應用身份；預設產品為 `deepseek-harness` |
| `x-deepseek-harness-user-id` | 每個已授權的模型請求 | 已解析 Harness home 的穩定匿名 UUID |
| `x-deepseek-harness-session-id` | 攜帶工作階段 id 的模型請求 | 確切的請求 `sessionId` 字串 |
| `x-deepseek-harness-compact` | 用途為 `compaction` 的模型請求 | 字面字串 `1` |

憑證失敗發生在解析匿名使用者 id 之前，因此未授權請求既不會傳送這些標頭，也不會建立身份檔案。沒有工作階段的直接請求會省略 `x-deepseek-harness-session-id`。工作階段標題請求沒有額外的用途標頭；請求攜帶 `sessionId` 時，仍然適用普通的工作階段 id 規則。

## 正文擴充功能事務

介面卡先序列化包括確切 `messages` 在內的完整基礎正文，再讓已註冊提供者準備欄位。提供者會收到該不可變正文、請求取消訊號，以及可選的 `sessionId` 和輔助呼叫 `purpose`。提供者返回 `undefined` 時，本次請求會省略其欄位。

系統將已準備的 JSON 值與提供者持有的狀態分離，再將其作為基礎欄位的頂層同級成員合併，並序列化到同一個 HTTP 正文中。準備失敗或衝突會阻止請求。合併後的正文無法序列化時，介面卡傳送不含任何擴充功能欄位的基礎正文，跳過接受事務，讓貢獻方在之後的請求中重發自身狀態，並記錄被省略的欄位名。組合未掛載註冊表時，介面卡傳送未經擴充功能的基礎正文。

已設定端點返回 HTTP 2xx 後，介面卡會在讀取 SSE 正文之前執行已準備的 `accept()` 事務。傳輸失敗和非 2xx 回應不會接受任何貢獻。即使端點返回 2xx，接受失敗仍會使模型請求失敗。接受僅記錄端點級 HTTP 成功，不表示 SSE 流已完整結束，也不表示端點已持久化擴充功能。

## `dsh_plugin_packages`

[`@deepseek-ai/dsh-plugin-package-inventory-deepseek`](../packages/llm/plugin-package-inventory-deepseek/README.zh.md) 貢獻完整存活的 Loader-backed 外掛包清單。該欄位預設啟用。

```json
{
  "dsh_plugin_packages": {
    "version": 1,
    "packages": [
      {
        "name": "@deepseek-ai/dsh-example",
        "version": "0.1.1-rc.2"
      }
    ]
  }
}
```

| 成員 | 型別 | 含義 |
|---|---|---|
| `version` | `1` | `dsh_plugin_packages` 的 schema 版本 |
| `packages` | 陣列 | 本次請求的完整存活集合 |
| `packages[].name` | 字串 | 來自所屬 manifest（中繼資料清單）的確切非空 npm 包名 |
| `packages[].version` | 字串 | 來自同一 manifest 的確切非空包版本 |

每個請求都會重新讀取主機樹中的存活非分組 Loader 設定項；請求工作階段存在 standing agent-preset 樹時，也會讀取該樹。相對與絕對模組使用距離自身最近的所屬 manifest；裸包設定項使用啟用自身的 Loader 解析基準。具名 manifest 未提供非空版本時，請求準備會失敗。

傳送方會對確切 `(name, version)` 組合去重，並使用與 locale 無關的文字比較，先按 `name`、再按 `version` 排序。同一包的多個同時存活版本會保留為獨立設定項。接收方不得按包名摺疊該陣列，也不得根據陣列順序推斷包的啟用關係。

該清單不包含已停用、pending、failed、unloading、disposed 和結構性 Loader 設定項。普通依賴、沒有具名所屬包的鬆散模組、以程式設計方式掛載的子 fiber，以及記憶體動態外掛也不在其中，因為它們沒有權威的 Loader 包來源資訊。

清單已啟用但沒有符合條件的設定項時，系統傳送 `packages: []`；停用貢獻外掛時，系統省略整個 `dsh_plugin_packages` 欄位。包身份屬於提供者中繼資料，絕不進入模型輸入。

## `dsh_session_log`

[`@deepseek-ai/dsh-session-log-deepseek`](../packages/session/session-log-deepseek/README.zh.md) 貢獻權威工作階段日誌的一段連續字尾。該欄位預設啟用。它適用於攜帶存活工作階段且至少存在一個事件的請求；直接請求、陳舊工作階段 id 或空日誌會省略該欄位，第一條待發事件本身超過 `maxBytes` 或無法序列化的請求也會省略該欄位；組合可用 `enabled: false` 停用它。下方範例使用邏輯 Session 格式 2 僅為說明協定欄位，並不標識[目前寫入格式](session-format-status.zh.md)。

```json
{
  "dsh_session_log": {
    "version": 1,
    "sessionFormatVersion": 2,
    "session": {
      "version": 2,
      "id": "session-id",
      "createdAt": 1780000000000
    },
    "afterSeq": -1,
    "throughSeq": 0,
    "events": [
      {
        "type": "turn/start",
        "seq": 0,
        "time": 1780000000001,
        "data": {
          "turn": 1
        }
      }
    ]
  }
}
```

| 成員 | 型別 | 含義 |
|---|---|---|
| `version` | `1` | `dsh_session_log` 的 schema 版本 |
| `sessionFormatVersion` | 非負整數 | 該字尾所表示的 Session 格式 generation |
| `session` | 物件 | 目前 Session header 的不可變協定投影 |
| `afterSeq` | 整數 | 本次請求前記錄為已接受的最大序號，或 `-1` |
| `throughSeq` | 非負整數 | 本次請求所表示的最大序號 |
| `events` | 陣列 | 從 `afterSeq + 1` 到 `throughSeq` 的連續事件 |

首次上傳使用 `afterSeq: -1`，此後每次上傳都從同一工作階段 id 的最大已接受水位（watermark）之後開始。每次上傳攜帶從該位置起、序列化後能放進 `maxBytes` 的最長連續事件段；`maxBytes` 預設 8 MiB，按 UTF-8 位元組計算，包括 header 與數值欄位，因此超過上限的積壓會分多次已接受的請求傳完。傳送方為每次請求僅快照一次事件陣列；快照後的追加內容屬於後續請求。

### Session 協定 header

`session` 成員將邏輯 Session 中繼資料投影為原始 JSON 基元。seeded Session 以 `seedLength` 傳送確切的 `Session.inheritedEventCount`；未 seeded 的 Session 省略該欄位。邏輯 `isSeeded` 標誌不出現在此協定中。外層 `dsh_session_log.version` 選擇本擴充功能 schema，`session.version` 則選擇邏輯 Session 格式。即使嵌入的邏輯格式同時變化，只要 Session header 投影變化，擴充功能 schema 也必須升版。

| 成員 | 出現條件 | 含義 |
|---|---|---|
| `version` | 必需 | 來自 `Session.header` 的邏輯 Session 格式版本；見[格式狀態](session-format-status.zh.md) |
| `id` | 必需 | 確切的工作階段 id |
| `createdAt` | 必需 | 非負安全整數 Unix epoch 毫秒數 |
| `cwd` | 可選 | 建立工作階段時記錄的絕對工作目錄 |
| `parentSession` | 可選 | fork 的父工作階段 id |
| `seedLength` | 僅 seeded Session | 確切的繼承事件數量；空的繼承字首使用零 |
| `origin` | 可選 | subagent 子項使用的字面值 `subagent` |
| `delegationDepth` | 可選 | 持久化的非負 subagent 委派深度 |
| `agentPreset` | 可選 | 用於組合該工作階段的 agent preset id |

### 權威事件信封

每個 `events` 元素以原始 JSON 基元承載規範事件，不依賴任何其他請求欄位。每個事件包含 `type`、數值型 `seq`、`time` 與 `data`，存在 `ignorable: true` 時保留該值。表層事件必須攜帶 `surfaceOp`；替換範圍使用數值型 `startSeq` 與 `endSeq`，system、user 和 tool 事件還可攜帶數值型 `sourceEventSeqs`。assistant 的提供者中繼資料保留在內嵌流中。已知的僅日誌事件省略表層中繼資料；恢復的未知可忽略記錄保留不透明中繼資料，但不將其解釋為表層操作。

### 接受水位與至少一次交付

端點返回 HTTP 2xx 後，該貢獻會向同一工作階段追加以下權威事件：

```json
{
  "type": "session-log-deepseek/delivery-accepted",
  "seq": 8,
  "time": 1780000000002,
  "data": {
    "sessionId": "session-id",
    "sessionFormatVersion": 2,
    "throughSeq": 7
  }
}
```

`delivery-accepted` 表示已設定端點為包含該欄位的 LLM 請求返回 HTTP 2xx。它不表示 SSE 已完整結束，也不表示遠端已經持久化。該事件的 `throughSeq` 必須標識一項更早的事件，`sessionId` 標識已傳送字尾所屬的 Session，`sessionFormatVersion` 則把水位繫結到該邏輯 generation。缺少該欄位表示歷史格式 v0。

傳送方只會為目前 Session id 與格式 generation 摺疊最大的匹配 `throughSeq`，因此並行已接受請求無法使遊標倒退，其他 generation 的水位也不能授權目前字尾。恢復後的程序會從持久日誌重建遊標。fork 會忽略命名其他 Session 的繼承水位，因此從序號零開始、按 `maxBytes` 分多次請求上傳自身的繼承字首，再以子工作階段 id 推進。水位事件自身屬於下一段未傳送字尾。

傳輸失敗、非 2xx 回應，以及序列化失敗後不帶擴充功能欄位發出的請求，都不會追加水位。端點接受後、本地持久化前發生崩潰時，系統可能重新傳送已接受範圍；不確定性只會產生重複，絕不會產生序號缺口。系統沒有獨立上傳儲存或截斷路徑；`maxBytes` 負責限制每次請求的欄位大小。

## 暴露內容與接收方要求

請求標頭會暴露 Harness 應用版本、一個匿名 Harness-home 身份和可選的工作階段身份。`dsh_plugin_packages` 會暴露存活 npm 包的名稱與版本。除非組合停用該欄位，`dsh_session_log` 可能暴露工作階段工作目錄、系統提示詞快照、使用者與 Assistant 內容、嵌入式 Assistant stream、失敗 attempt 輸出、工具參數與結果、壓縮摘要、回饋和外掛持有的事件。介面卡 API key 不是工作階段事件，因此不會進入該欄位。透過 `baseURL` 選擇的閘道會收到與官方端點相同的值。

接收方按名稱定位擴充功能欄位，按各欄位自己的 `version` 分派，保留不同的包版本，並忽略 JSON 成員順序。工作階段日誌接收方必須先驗證連續序號範圍，再解釋事件型別。遇到不帶 `ignorable: true` 的未知權威事件時，接收方無法進行無損重建。即使缺少註冊表或某項貢獻，基礎請求仍然可用；欄位缺失表示該項貢獻不適用於本次請求。工作階段日誌積壓補傳期間，`throughSeq` 落後於工作階段的最新事件，因此 2xx 並不表示接收方已持有目前完整日誌。
