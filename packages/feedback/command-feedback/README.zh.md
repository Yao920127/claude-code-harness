---
description: "工作階段回饋：`/feedback` 命令、Web 回饋彈出視窗背後的 `sessionFeedback` Host Remote，以及固定的分類表；供使用者與維護者選擇、組合或排查回饋採集。"
kind: "package-reference"
---

# @deepseek-ai/dsh-command-feedback

[English](README.md) | 中文

## 概述

`dsh-command-feedback` 讓使用者告訴 harness 他們對工作階段的看法。輸入 `/feedback` 加一條評價，評價即被記錄，並以工作階段 id 與匿名使用者 id 確認；Web 回饋彈出視窗透過 `sessionFeedback` Host Remote 記錄分類與可選描述。記錄是即時的，絕不會啟動模型工作：模型既看不到這條評價，也不會被打斷。本包同時擁有所有回饋介面共用的固定分類表。它隨標準 `dsh` 基礎組合交付，無需任何設定；無頭模式、ACP（Agent Client Protocol）與 JSON-RPC 入口不提供斜槓命令。

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

使用者可以直接在 Web 用戶端中記錄回饋：`/feedback` 命令隨標準 `dsh` 基礎組合交付，無需設定，可在任何對話中使用。自定義應用必須把 Session 服務、命令註冊表與本外掛組合在一起，才能提供同樣的命令。

### `/feedback` 命令

輸入 `/feedback` 加你的評價併傳送。成功時會以接收工作階段 id 與匿名使用者 id 確認：

| 輸入 | 結果 |
|---|---|
| `/feedback the diff view is unreadable` | 記錄評價並以兩行確認：`Feedback recorded for session {sessionId}` 和 `Anonymous user: {userId}.` |
| `/feedback` | 用法錯誤：`Feedback text is required. Usage: /feedback <text>`。僅含空白的輸入視為空輸入。 |

前後空白會被去除，但除此之外，評價會按輸入原樣保留：不進行截斷、大小寫摺疊或命令解析——`/feedback /plan felt slow` 記錄的就是這段字面文字。每次執行命令都會記錄自己的條目；不會發生合併或替換。

<a id="the-web-feedback-dialog"></a>
### Web 回饋彈出視窗

在 Web 用戶端中，不帶文字的 `/feedback`（從輸入框選單選中，或直接輸入後傳送）會開啟回饋彈出視窗，而不是返回用法錯誤。彈出視窗提供下表的七個分類和一個自由文字框；每一項都可不填，空提交也會被接受，對話日誌和其他回饋事件一樣隨記錄的事件一起投遞。彈出視窗透過 `sessionFeedback.record` 記錄，追加的是同一個 `feedback/record` 事件，但沒有命令簿記，也沒有確認行；彈出視窗改用 toast 提示。

| 分類 id | 含義 |
|---|---|
| `task-result` | 任務結果 |
| `instruction-following` | 指令理解與遵循 |
| `product-interaction` | 產品功能與互動 |
| `service-stability` | 穩定性和速度 |
| `resource-cost` | 資源使用與費用 |
| `security-privacy-permission` | 安全隱私與權限 |
| `other` | 其他 |

這些 id 是日誌中的持久詞彙，與逐訊息回饋共用；各介面自行擁有在地化標籤。

### 從自己的 UI 記錄回饋

回饋不一定來自斜槓命令或彈出視窗：任何 UI、掛鉤或 host 整合都可以透過 `recordFeedback` 或 `sessionFeedback` Remote 直接記錄評價，享有同樣的保證且無需模型輪次。想要斜槓命令的自定義應用，把 Session 儲存、命令註冊表與本外掛組合在一起即可；`sessionFeedback` Remote 從 Session 儲存中解析 live Session：

```yaml
- id: session
  name: '@deepseek-ai/dsh-session'
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-feedback
  name: '@deepseek-ai/dsh-command-feedback'
```

Web 用戶端隨附該命令。無頭模式、ACP 自動化和 JSON-RPC 不提供斜槓命令，因此 `/feedback` 在那裡不可用。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

### 設計理念

評價是工作階段日誌中一個僅追加的事實，由事件而非產生它的觸發方式擁有：回饋可能來自命令、彈出視窗或任何整合，因此事實絕不能依賴斜槓命令。命令自身的簿記不攜帶載荷，所以評價文字在日誌中只存在於一個地方，且該事件絕不會呈現給模型。

### 評價如何被記錄

生產方去除文字空白，把空白文字記為預設，並向工作階段日誌寫入一個事件，即使條目既無文字也無分類；`/feedback` 處理器自行拒絕空輸入，其餘部分是該生產方的薄包裝層；`sessionFeedback.record` Remote 則按 id 找到 live Session 後同樣呼叫它，沒有 live 持有者時回答 `session-not-found`。兩條路徑都不啟動模型工作。寫入是即時但未 flush 的：確認文字表示條目已到達日誌，而不是已寫入磁碟。某個 harness home 首次接受的命令評價還會建立確認文字所報告的匿名使用者 id。精確的生產方約定見 [`src/index.ts`](src/index.ts)；事件載荷、分類表與 Remote 詞彙見 [`src/types.ts`](src/types.ts)。

### 原始碼索引

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`recordFeedback` 生產方、`sessionFeedback` Remote 服務、`/feedback` 命令註冊 |
| [`src/types.ts`](src/types.ts) | `feedback/record` 事件宣告、分類表，以及 Remote 請求與結果型別 |
| — | 未釋出配套的執行時不變式；每個 `feedback/record` 都是獨立的僅追加事實，不涉及跨事件關係或與可變資料的關係。 |

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們涵蓋這條採集路徑所依賴的命令註冊表、持久化與身份事實。

- [dsh-commands](../../interaction/commands/README.zh.md)——發現全域命令並定義 `recordInput` 語義的註冊表。
- [工作階段持久化子系統](../../../docs/subsystems/persistence.zh.md)——追加事件如何持久化、flush 屏障的含義。
- [匿名使用者身份](../../identity/anonymous-user-id/README.zh.md)——確認文字報告的 id。
- [ui-message-feedback](../../client/ui-message-feedback/README.zh.md)——透過 `sessionFeedback` Remote 記錄的 Web 回饋彈出視窗。
- [回饋包索引](../README.zh.md)——展示僅寫入日誌的採集與逐訊息回饋在包中的並列位置。

-----

<a id="model-experience"></a>
## 模型體驗

### 使用者 `/feedback` 採集

#### 模型看到什麼

無。斜槓輸入、彈出視窗、`feedback/record` 以及確認文字都不出現在模型請求中。回饋事件和註冊表生命週期記錄僅寫入日誌且不攜帶 `surfaceOp`，因此它們絕不會進入有序 surface、`deriveMessages()` 或系統提示詞。在某個輪次中記錄回饋不會改變該輪次剩餘的請求。

#### Token 影響

無直接 token 影響。無論是已接受的條目還是用法錯誤，都不會在記錄所在輪次或此後任何輪次增加模型 token。

#### KV Cache 影響

與模型請求路徑無關。記錄只追加到工作階段日誌，不觸碰已經可複用的請求字首。本包貢獻的任何內容都不會使快取複用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明工作階段回饋何時不合適，或何時行為與使用者預期不同。它們是目前包約束，不是任務積壓。

- **沒有回饋檢索或管理 surface**——本包不為 `feedback/record` 提供檢索、聚合或面向模型的工具。
- **只有分類與文字**——一條條目至多攜帶一個分類和一個自由文字字串，沒有嚴重程度或關聯事件連結。
- **Remote 只服務 live Session**——沒有 live 持有者的 Session，`sessionFeedback.record` 回答 `session-not-found`；彈出視窗開啟期間 Session 退役時，Web 彈出視窗會報告該失敗。
- **不支援修改或撤回**——工作階段日誌是僅追加的，本包也不新增 tombstone，因此錯誤的條目會一直保留在記錄中，只能由後續條目取代。
- **沒有顯式持久化屏障**——確認文字緊隨追加而非 flush，因此緊臨崩潰前記錄的條目可能與其他未 flush 的尾部一同丟失。需要該保證的消費方可自行等待 `ctx.sessions.flush(session)`。
- **新工作階段上沒有可見的確認**——Web transcript（文字記錄）只在工作階段啟用後渲染命令列，因此在仍為空白的新工作階段上輸入 `/feedback <text>` 會記錄事件但不會顯示確認行；彈出視窗的 toast 不依賴文字記錄。
- **隨附的產品入口中只有 Web 使用此命令**——無頭模式、ACP 自動化和 JSON-RPC 不提供命令介面卡，因此 `/feedback` 在那裡不可用。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文，明確不具權威性。已交付的行為、限制與理由以上文與包程式碼為準。

- 確認文字句子與分類順序由 [`tests/command-feedback.spec.ts`](tests/command-feedback.spec.ts) 固定；修改它們會改變使用者可見文案。
- 檢索 surface 仍是第一條限制背後的開放方向；目前約定沒有為它預留任何格式。

</details>
