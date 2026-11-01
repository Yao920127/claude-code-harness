---
description: "後臺任務註冊表約定，供組合、實作或排查後臺工作的使用者與維護者閱讀：id、歸屬、生命週期、輸出環與事件流。"
kind: "package-reference"
---

# @deepseek-ai/dsh-jobs

[English](README.md) | 中文

## 概述

`dsh-jobs` 讓工具可以在 agent（智慧代理）繼續推進時保持長時間工作執行。每項任務都會獲得穩定的 `<kind>-N` id，擁有它的 agent 可以讀取輸出、帶超時等待或請求取消。歸屬範圍限定在 agent 工作階段內，因此其他 agent 無法檢視或停止任務；任務完成時會透過工作階段內通知送達，無需輪詢。使用者可以檢視保留的即時輸出，而不消耗 agent 可讀取的內容。只有部署提供任務執行能力時，後臺任務才能啟動。

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

在組合後臺任務能力或編寫註冊長時間工作的生產方時使用本包。本包本身定義約定；組合透過載入 `dsh-jobs-local` 這樣的實作，以及模型側的 `dsh-tool-jobs`，獲得該功能。

### 後臺任務提供什麼

生產方以 kind 和一行標籤註冊工作；註冊表返回 `<kind>-N` id，例如 `bash-1`。擁有任務的任何一方都可以讀取輸出、列出任務、帶超時等待結算或請求取消——每次呼叫都返回任務狀態的全新投影，從 `running`、`stopping` 到終止態的 `completed`、`killed` 或 `failed`。任務結算時，註冊表的事件流宣佈它，`dsh-tool-jobs` 把結算變成工作階段內通知，因此無需輪詢。生產方可以附加一個可選的位元組上限，讓每次完整的模型側讀取或通知保持有界。

生產方透過在 spec 上宣告拉取源——由註冊表按自己的節奏泵送的非消耗偏移讀取器——或經 starter 收到的 `JobHandle` 推送塊來流式輸出；二者都落入該 job 的有界環，其中 `stdout` 與 `stderr` 塊到達模型，`log` 塊只到達觀察者。觀察者按絕對位元組偏移讀取保留塊並在推進時收到訊號；結束 job 的結算同時封流，在此之前 `updateProgress` 把即時進度行釋出進每個投影。觀測對模型不可見：`readAt` 不消耗任何東西，也從不觸碰通知狀態。

### 歸屬邊界

任務屬於啟動它的 agent 工作階段：其他 agent 無法讀取或停止它。`bash-1` 這樣的 id 可預測，因此這道隔離是授權，而非保密。沒有所有者啟動的任務對任何呼叫方開放，並持續到服務被釋放為止。

### 啟動後臺工作需要一個控制器

只有附加了服務於所有者的控制器時，生產方才能啟動工作——載入 `dsh-tool-jobs` 即附加一個。組合中未載入任何控制器的 agent 無法啟動後臺工作；`start()` 會以指出缺失控制器的訊息失敗，而不會啟動 agent 永遠無法收集或停止的工作。

### 最小可用組合

```yaml
- name: '@deepseek-ai/dsh-jobs-local'
- name: '@deepseek-ai/dsh-tool-jobs'
```

在已提供 agent、工具與系統提示詞服務的 harness 基礎上載入這兩個外掛，即可獲得完整功能：`dsh-jobs-local` 提供程序內後臺任務註冊表，`dsh-tool-jobs` 提供 `job_output`、`job_list`、`job_kill` 工具以及完成通知投遞。

### 可能出什麼問題

任何預檢拒絕都不會留下 job id 或已註冊的工作。由隨附的程序內註冊表管理的任務會隨 harness 程序終止而消失；跨重新啟動的持久執行需要一個實作本約定的不同後端。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋約定背後的設計決策，並指出實作它們的程式碼位置；可觀察行為已在[使用本包](#use-this-package)中完整說明。

### 設計理念

- **約定與實作分屬不同包。** `JobRegistry` 是抽象 Cordis 服務；直接載入該類會丟擲異常，因此錯誤設定的組合會在載入時失敗，而不是註冊一個空的 `ctx.jobs`。
- **每個程序一個註冊表，按所有者返回結果。** 一個實例服務程序內的每套組合，因此註冊與投遞都相對註冊方所在 scope：從不帶 scope 的上下文註冊的控制器或監聽器服務於每個所有者；在某套 agent 組合的 scope 下注冊的，恰好服務於該組合下組合出的 agent。
- **存取以所有者的工作階段 id 為界。** id 可預測，因此是授權——而非保密——構成邊界。
- **結算首次優先，其事件跟在每個被釋放的等待方之後。** 一條終止記錄、釋放的等待方，然後是一輪受到隔離的事件投遞；`settled` 事件報告它是否釋放了一個存活的 `wait`（`awaited`），因此無論是哪個外掛在等待，`dsh-tool-jobs` 永遠不會播報等待方已經收走的完成。
- **註冊的存續期長於生產方與控制器 fiber。** 所有者與服務釋放會取消正在執行的工作並等待守約的生產方；銷燬期間的取消若丟擲異常，只會將記錄強制標記為失敗。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：抽象 `JobRegistry` 服務及其約定 |
| [`src/types.ts`](src/types.ts) | 共享詞彙：`JobSpec`、`JobHandle`、`JobHooks`、`JobOutcome`、`JobEvent` 與讀取結果 |
| [`src/view.ts`](src/view.ts) | 用戶端安全葉子：`JobView`、`JobChunk`、`JobStatus` 與可合併擴充功能的 `JobKindMap` |
| [`src/brand.ts`](src/brand.ts) | `JobId` 帶型別標記的識別符號，無需 agent 依賴即可匯入 |
| [`src/archive-admission.ts`](src/archive-admission.ts) | Workspace 註冊表歸檔准入中的 `job` 族，由接縫建構函式為每個實作安裝 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式伴生外掛：驗證每個 job 的事件協定（先 registered、恰一次結算、最後 removed）以及每個通告的投影與註冊表自身讀取的一致性 |

### 服務操作

每個讀取或控制操作接收可選的呼叫方 `SessionId`，省略時僅允許存取無主 job：`list` 與 `get` 返回全新投影，`read` 推進模型遊標並在結算後把生產方的 result 交出一次，`readAt` 按絕對偏移讀取保留塊且不消耗任何東西，`kill` 在改變狀態前呼叫生產方取消併為終態 `detail` 記錄原因，`wait` 阻塞至超時，`remove` 丟棄呼叫方經自己的等待收走且從未交出的已結算記錄，`start()` 在呼叫生產方 `run()` 一次之前預檢存取、驗證與准入，同時拒絕任何沒有已附加控制器服務的所有者；`events.subscribe` 按所有者、scope 或程序粒度投遞註冊、進度、停止中、結算、移除與輸出提交。

每個實作還會回答 Workspace 註冊表的歸檔准入（[接縫](../../workspace/workspace/README.zh.md)），由接縫的建構函式只透過抽象的 `list` 與 `kill` 安裝：`workspace/session-activity` 把被詢問工作階段擁有的執行中或停止中任務作為 `job` 族報告，每個任務一項、附其 label；`workspace/session-stop` 以原因 `session archived` 逐個 kill 它們，因此一個在取消時拋錯的生產方只記日誌，該工作階段的其他任務仍會停止。無主任務不屬於任何工作階段，絕不會為某個工作階段被報告或 kill。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從任務型別逐步進入隨附實作、模型側控制與設計記錄。

- [後臺任務執行時子系統](../../../docs/subsystems/jobs.zh.md)——任務型別、投影欄位與 `ctx.jobs` 的 Cordis 介面面。
- [jobs 組對映](../README.zh.md)——同級組頁面及其包表格。
- [程序本地註冊表](../jobs-local/README.zh.md)——在本程序中執行任務的隨附實作。
- [模型側任務控制](../tool-jobs/README.zh.md)——`job_output`、`job_list` 與 `job_kill` 工具及完成通知。
- [通用長時間執行工具執行時 Agent Note](../../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.zh.md)——後臺任務執行時背後的設計。
- [任務註冊表 seam Agent Note](../../../.agents/notes/archived/architecture/2026-07-26-job-registry-seam.md)——按所有者隔離的註冊表約定及其理由。
- [jobs seam 收斂 Agent Note](../../../.agents/notes/implemented/architecture/2026-09-03-jobs-seam-consolidation.zh.md)——一個輸出環、一個投影、一條事件流。

-----

<a id="model-experience"></a>
## 模型體驗

透過生產方外掛與控制器外掛間接影響模型；它們負責基於任務註冊表完成所有面向模型的渲染。

#### KV Cache 影響

不會直接導致 KV Cache 失效；請求字首變更由上述消費方負責。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明約定何時不合適。它們是目前包約束，不是任務積壓。

- **約定是程序內的**——`JobSpec.run()` 傳入回呼，註冊表解析擁有者工作階段背後的活體 `Agent`；持久化或跨程序後端必須先重塑身份、重新啟動、所有權與觀察語義，才能實作此 seam。
- **模型遊標是唯一的消耗式讀取**——獨立觀察者使用非消耗的 `readAt`，從不移動它。
- **已結算記錄會一直列出直到被移除**——由持有者釋放、服務釋放，或收走它的呼叫方顯式 `remove`；註冊表不對已結算 job 保留任何數量上限。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
