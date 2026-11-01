---
description: "面向使用者與維護者的 subagent 委派 seam，用於選擇提供者後端、組裝委派工具或排查子 agent（智慧代理）執行問題。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent

[English](README.md) | 中文

## 概述

使用 `dsh-subagent` 把工作委派給具名子 agent、收集結果，並跨輪次繼續受支援的子級對話。一個組合可以並排提供程序內、ACP（Agent Client Protocol）、SDK、Codex 或 Claude Code 子級。需要單個結果時選擇一次性子級；需要後續訊息與中斷能力時選擇可繼續子級。你還可以檢查可用子級及其模式、線上活動狀態、最近已結束輪次的完成狀態與譜系，而無需載入或恢復它們。啟用時需要至少一個受支援的子級後端和一個委派工具。

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

本包是每個委派組合都共享的約定。你透過把服務與一個或多個提供者後端以及面向模型的委派工具一起掛載來啟用它；此後 agent 即可委派工作，服務會把每個請求路由到具名提供者。

### 啟用委派

把服務與一個提供者和委派工具一起掛載。提供者以你設定的名稱註冊（程序內 spawn 後端預設為 `spawn`）；工具行指名該提供者，讓模型看到一個靜態工具。一個最小的一次性設定：

```yaml
- name: '@deepseek-ai/dsh-subagent'
- name: '@deepseek-ai/dsh-subagent-spawn-in-process'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
```

呼叫該工具的 agent 會把子 agent 的最終答案作為工具結果收到。只掛載服務本身不會改變任何行為：在組合出提供者和工具之前，什麼都不能委派。

### 委派設定

**外掛 → 子智慧代理**頁面的限制部分編輯 Host 的 `subagent` 設定分節。使用者值覆蓋本外掛的組合設定；恢復預設會刪除使用者覆蓋。`maxDepth` 預設為 `1`，在委派工具自身未設定深度時提供預設值。工具顯式指定的深度（包括 `provider-managed`）優先。深度 `0` 禁止繼承此設定的工具委派；深度 `1` 只允許直接子代理。修改在下一次委派時生效。直接呼叫服務的呼叫方仍自行提供可選的請求深度。

### 可續接子代理容量

在 Host 的 `dsh-subagent` 外掛上設定 `maxActiveSubagents`，限制透過連續可續接父子關係共享名額的存活子代理數。預設值為 `8`，接受正安全整數。非可續接父代理建立獨立的池，自身不佔名額；可續接後代繼承該池。新建和冷恢復在重建 Agent 前預佔名額，清理在 handle 釋放後歸還名額。等待後代的父代理、有待處理收件箱內容的代理以及正在停止的 Activation 仍佔名額。向駐留子代理傳送訊息複用其名額。一次性和外部提供者執行不受此限制。池的繼承不會跨越一次性父代理；其可續接子代理共享獨立的池。深度仍由委派工具的獨立策略決定。

每次新建或冷恢復 Activation 前都會讀取目前 `maxActiveSubagents`。調高後已有樹可接納更多子代理；調低後駐留子代理繼續執行，使用量降至上限以下前拒絕新接納。

容量耗盡時，新建或冷恢復以 `ACTIVATION_LIMIT_REACHED` 拒絕（瀏覽器訊息返回 `subagent/delivery-unavailable`）：等待子代理完成，或繼續使用現有代理。接納不會排隊，避免等待後代的父代理又等待自己佔用的名額。名額僅存在於目前程序，不限制累計 Session 歷史或 token 用量。

### 一次性與可繼續子級

一次性子 agent 只執行一次，並以單個結果結算，可附帶可選的結構化輸出與失敗時的安全診斷。啟動請求可以透過 `agentOptions` 覆蓋子 Agent 的提供者、模型、推理強度與輸出 token 上限；每個請求的選項都要求提供者宣告對應能力。可繼續子 agent 保留持久工作階段並按順序接受後續訊息：呼叫方收到穩定的子 agent id、傳送相鄰 Agent 訊息，並可中斷目前輪次而不銷燬子 agent。工具行的 `backgroundMode` 選擇形態（預設 `one-shot`，或在支援的提供者上使用 `continuable`）。

### 訊息、中斷與發現

每個確切線上 Agent 都可以對直接可繼續 child 使用 `sendMessage()`；駐留的可繼續 child 還可以對自己的直接 parent 使用它。正在工作的目標透過 Steer 在最近 step 接收 Agent 訊息；空閒目標啟動輪次，且只有直接 child 可以冷恢復。parent 也可以隨時中斷正在執行的後代或列舉自己的子級。瀏覽器發出的繼續執行 prompt 會獨立選擇 Queue 或 Steer，並且可以攜帶圖片部分：Host 先透過附件儲存完成整批圖片的准入與持久化，子級 inbox 才接受這條訊息；當子級宣告的模型不接受圖片輸入時拒絕投遞。 直接子級發現讀取 parent 自有的 `subagentCatalog` projection。`listChildren(parentSessionId, signal?)` 持有一次優先即時來源的 Session 觀察，非同步返回目錄，不讀取子級日誌。它轉發取消訊號，並在物化後釋放觀察。物化以 O(D) 時間保留 D 條事實的父日誌事件順序。後代發現按父事件順序遞迴讀取子級目錄，每個可達 Session 觀察一次。無法讀取目錄的分支會被跳過，並返回診斷；兩條路徑都不載入或恢復子級 Agent。

### 失敗與恢復

需要所選提供者不具備的能力的請求會在啟動時明確報錯，而不會被靜默忽略。失敗的子 agent 執行會返回停止原因，提供者後端還會附加安全診斷；被取消的請求以 `aborted` 結算。子 agent 相互隔離：崩潰或行為異常的子 agent 無法破壞父級工作階段。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋服務的建置方式以及可觀察行為從何而來；完整約定見[使用本包](#use-this-package)。

### 設計理念

- **一個服務，多個提供者。** 服務是具名提供者註冊表；每個後端以唯一名稱註冊，請求按名稱選擇一個。
- **兩種子級形態。** 一次性執行在釋出時轉移所有權；可繼續子級保留持久 Session，且同一時刻至多一個程序內 Activation。
- **兌現即釋出。** 提供者的 `start()` 只有在真實子 agent 存在後才兌現，因此呼叫方要麼擁有一段線上執行，要麼一無所有。
- **同程序值可信。** 請求、描述符與結果按不可變約定借用；序列化與不可信輸入驗證屬於程序與協定邊界。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服務入口：提供者註冊表、啟動與繼續 API、生命週期事件 |
| [`src/continuation.ts`](src/continuation.ts) | 可繼續子級編排：身份預留、提供者準備、冷恢復、授權與路由 |
| [`src/continuation-activation.ts`](src/continuation-activation.ts) | 程序內 Activation 圖、准入、結算與子級優先釋放 |
| [`src/continuation-messages.ts`](src/continuation-messages.ts) | 相鄰 Agent 訊息、返回指引與結算通知 |
| [`src/internal.ts`](src/internal.ts) | Host 專用 Queue 與 Steer 介面卡，以及標準相鄰 Agent 訊息標記 |
| [`src/inbox.ts`](src/inbox.ts) | Activation 區域性的 Queue 和 Steer 准入，以及同步 closing cutoff |
| [`src/types.ts`](src/types.ts) | 公開的請求、結果與提供者約定 |
| [`src/descriptor.ts`](src/descriptor.ts) | 版本化的 `subagent/descriptor` 工作階段事件詞彙 |
| [`src/catalog.ts`](src/catalog.ts) | parent 自有的 `subagent/catalog` 事件與分塊 host projection |
| [`src/child-agent.ts`](src/child-agent.ts) | 子級組裝、委派策略、深度輔助函式 |
| [`src/list-children.ts`](src/list-children.ts) | 直接與遞迴的 parent 目錄讀取 |
| [`src/control.ts`](src/control.ts) | 瀏覽器控制請求驗證與穩定失敗分碼 |
| [`src/control-types.ts`](src/control-types.ts) | client-safe 的目錄行、控制面請求、回執與失敗 |
| [`src/archive-admission.ts`](src/archive-admission.ts) | Workspace 註冊表歸檔准入中的 `subagent` 族：執行中的子孫及其父級取消 |

### 一次性流程

請求先對照提供者宣告的能力進行驗證，隨後對持久化描述符做快照，再由提供者建置子 agent。兩個程序內提供者都宣告 `agentOptions`：建立子級時把請求欄位疊加到父級最新已記錄請求的提供者、模型與推理強度之上；父級還沒有請求時退回到建立選項，並保留設定的 token 上限。它們還會在第一次 await 前快照委派權限狀態：Auto 或 Full access 父級讓子級獲得相同的 `permission/preset` 身份，而既有沙箱覆蓋與審批策略固定仍然生效；同時記錄這兩個身份可防止 fork 中更早的同旋鈕組合身份勝出。Auto 隨後會獨立審查 child 的每個受支援呼叫：普通專案內工作為低風險並直接允許；中風險工作必須在既有建立 prompt 或已核驗的 human／直接父級訊息中獲得動作、準確目標和範圍的明確授權，且不與 human 限制衝突；高風險工作始終拒絕。reviewer 從 `parentSession` 與既有訊息派生這份上下文；委派不會新增父 call metadata、委派記錄、review receipt 或 Session format。更改路由而不顯式指定推理強度時，會清除繼承的路由自有強度，使所選模型解析自己的預設值。DSH SDK 也宣告 `agentOptions`，但會執行獨立子執行時，因此不繼承 Auto；ACP、Codex 與 Claude Code 同樣在父級委派呼叫透過審查後保留各自的權限系統。成功時執行被髮布、所有權轉移給呼叫方；失敗時提供者復原每個尚未釋出的資源。結果攜帶子 agent 的最終輸出、可選的結構化值、停止原因與可選的安全診斷。

### 可繼續流程

管理器預留 child 身份、解析持久化描述符、建立（或冷恢復）child、把它安裝進 Activation 並提交提示詞。模型編寫的訊息透過固定 Steer 排程跨一條 parent/child 邊；瀏覽器人類 prompt 透過內部介面卡選擇 Queue 或 best-effort Steer，其他 host 協定仍可保留 Queue 以建立獨立輪次。Session queue command 僅根據 child 自身的 continuable descriptor 准入線上 subagent-owned Agent。Settlement 會等待 Agent 活動結束、Inbox 為空且沒有所擁有子級，再在准入開放時 flush 最終 Session 狀態。管理器隨後在 child lock 內重新驗證 wake generation、Session 序號、Inbox 與所擁有子級；`Agent.runMaintenance()` 的同步 task 入口會佔用 idle 階段，並在同一個 JavaScript turn 內關閉私有 subagent Inbox，然後才釋放控制代碼。直接 child 不存在 Activation 時會從持久化工作階段冷恢復。當駐留 Activation 結算時，管理器會在 parent 自身的輪次流中告知該 child 的直接 parent。

本地子級建立成功時，父 Session 追加一條 `subagent/catalog` 事實。一次性建立在提供者返回後記錄；可繼續建立在初始 inbox 准入後、返回子級 id 前記錄。失敗會釋放子級，不釋出補償性目錄事件。一次性目錄追加失敗時會處理 run 的結果拒絕，並保留目錄錯誤；資源釋放失敗會單獨記錄。`subagentCatalog` projection 排除 fork 繼承的事實，透過 Session 觀察和用戶端快照中的 `projections.values.subagentCatalog` 暴露直接子級列表。每個 child 的 `subagentTiming` projection 會累加 descriptor 之後的耗時，並記錄最近一個已結束輪次是否以 `completed` 結束；新輪次開啟時會清除該完成狀態。無效的自身 catalog payload（包括不支援的版本）會使 projection 恢復失敗。projection 狀態版本變更會從持久日誌重新摺疊快取行。目錄檢視對 D 條事實以 O(D) 時間保留父目錄事件順序，其不可變儲存和檢查點驗證使用 [`dsh-chunked-list`](../../util/chunked-list/README.zh.md)。[父目錄決策](../../../.agents/notes/implemented/architecture/2026-09-01-parent-owned-subagent-catalog.zh.md) 說明排序、持久化成本和替代方案。Catalog 載荷 v0 記錄已知模式，v1 還接受未知模式，讀取器支援兩版。歷史遷移在 descriptor 不可用時根據可讀子 header 追加 v1 `subagent/catalog`；正常建立保留 v0。其 `mode: 'unknown'` 投影讓子工作階段保持可見，但不表示支援繼續執行；已有完整條目仍具有權威性。

### 所有權與不變式

- **釋出即邊界**——釋出前提供者擁有設定並須在失敗時復原；釋出後呼叫方擁有執行並須 dispose（資源釋放）它。
- **註冊受 effect 作用域約束**——移除提供者會阻止新啟動，但絕不撤銷已接受的執行。
- **Agent 訊息權限基於確切相鄰關係**——`sendMessage()` 要求確切線上 sender；每個 sender 都可以指定直接可繼續 child，只有具備駐留可繼續 Activation 的 sender 可以指定自己的直接 parent。
- **描述符僅進日誌**——它是工作階段事件，不進入模型歷史，並跨壓縮（compaction）保留；可繼續描述符會顯式記錄解析後的子級提供者、模型與推理強度，用於冷恢復。
- **本 runtime 為子代理回答歸檔准入**（[接縫](../../workspace/workspace/README.zh.md)）——`workspace/session-activity` 把回合中的線上子代理子孫作為 `subagent` 族報告：按本包記錄的持久化血緣查詢（帶 subagent 來源的 `parentSession`，任意深度，從不包括 fork），組合了 Session query 服務時經一次活工作階段 observation 從各 child 的描述符取名稱，否則只報 id；`workspace/session-stop` 以父級原因逐個取消它們，一個拒絕取消的 child 只記日誌，其兄弟仍會停止。父級自身的回合、它的任務以及已歸檔血緣的步驟門禁歸 API Session Controller。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

當包級約定不夠用時閱讀以下頁面。它們從共享 seam 逐步進入後端、面向模型的工具與設計決策。

- [Subagent 子系統](../../../docs/subsystems/subagent.zh.md)——服務約定、提供者約定與終態結果語義。
- [Subagent 能力 seam](../../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.zh.md)——委派能力家族的設計記錄。
- [可繼續的 subagent](../../../.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.zh.md)——接受後續輪次的持久子級。
- [程序內 spawn 後端](../subagent-spawn-in-process/README.zh.md)——最容易組合的提供者。
- [Auto review](../../experimental/auto-review/README.zh.md)——只有程序內 DSH 子級繼承的目前工作階段授權模式。
- [程序外 ACP 後端](../subagent-acp/README.zh.md)——經 Agent Client Protocol 擁有自有執行時的子級。
- [DeepSeek 輸入轉換](../../llm/llm-deepseek/README.zh.md#model-experience)——已儲存結算通知的提供者回放規則。
- [tool-subagent-control README](../tool-subagent-control/README.zh.md)——後續訊息、中斷與列舉面。

-----

<a id="model-experience"></a>
## 模型體驗

### 結算通知

#### 模型看到什麼

一條使用者角色的父級訊息，開頭是結果本身——`Background subagent <child-id> finished and will do no further work unless you send it more.`，或子級被停止、耗盡額度、拒絕任務或失敗時的對應句子——隨後是 `Its closing message:` 與子級最終 assistant 輸出中的非空文字塊，保留原始內容與順序。推理與其他非文字塊不會進入通知；若沒有剩餘的非空文字，通知會寫明 `It left no closing message.`。這條由執行時生成的通知與模型編寫的父子訊息相互獨立；後者使用 `sendMessage()` 與 `AgentMessageSource`。委派 schema 與模型控制工具歸消費方包所有。

#### Token 影響

父級請求中，每個已結算的 Activation 一條通知，長度取決於子級的最終文字。如果子級先傳送自己的訊息再結算，父級請求會同時承擔兩者。

#### KV Cache 影響

在父級中僅追加：通知位於其可複用請求字首之後。到達空閒父級會啟動一次獨立的模型請求，到達繁忙父級則不會。

### 子級委派範圍宣告

#### 模型看到什麼

每個程序內子 agent 的執行時上下文快照都攜帶下方的 `subagent:delegation` 宣告，位於沙箱策略與審批策略語句之後。

##### 委派範圍宣告

```markdown
You are a delegated subagent: your permission scope was fixed when you were started and cannot be widened from inside this session — operations that require approval are rejected automatically. When the job needs access beyond that scope, do not retry the denied operation; state the limitation in your reply so the delegating agent can handle it.
```

#### Token 影響

每個子 agent 的執行時上下文快照中一條固定宣告；父級請求中沒有任何新增。

#### KV Cache 影響

子級內部字首穩定：該宣告在子 agent 生命週期內絕不變化，因此只寫入第一份執行時上下文快照一次。父級側不會直接使快取失效；具名工具消費方共同負責請求字首的任何變化。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明該 seam 何時不合適，或何時需要特別的運維注意。它們是目前包約束，不是通用委派對比或任務積壓。

- **後代讀取序列執行**——每個可達目錄（包括一次性子級）都需要一次觀察。冷 Session 缺少有效的 prepared 觀察時需要讀取完整日誌；大型冷工作階段樹可能累積儲存延遲。
- **ACP 子級仍為一次性，且無法透過追蹤列舉**——ACP 執行在父級工作階段語料中沒有本地子工作階段，遠端提供者需要 Activation 所有權約定才能支援可繼續子級。
- **僅允許相鄰模型訊息**——`sendMessage()` 要求確切線上 sender；每個 sender 都可以指定直接可繼續 child，只有具備駐留可繼續 Activation 的 sender 可以指定自己的直接 parent。瀏覽器提示使用獨立的人類 Queue 或 Steer 控制路徑。
- **child 到 parent 的投遞要求直接 parent 保持線上**——服務沒有持久 parent mailbox；parent 缺失時會拒絕訊息，而非接受無法喚醒的工作。
- **取消收斂期間存在喚醒缺口**——中斷訊號發出後、driver 進入 idle 前被接受的後續訊息會保持排隊，直到另一條喚醒傳送到達。
- **待處理的注入上下文會保留 Activation**——settlement 會保守地把每個 Inbox occurrence 都視為未完成。Agent 進入 idle 後停放的上下文會讓 child 及其線上祖先繼續駐留，直到喚醒投遞將其 claim、queue 變更將其移除，或 manager teardown 將其丟棄。
- **駐留僅限程序內**——Activation inbox 與所有權圖不會在兩個 harness 程序之間協調；對單個持久化儲存的並行存取需要持久化電子郵件與跨程序租約協定。
- **不回放已接受但未記錄的訊息**——崩潰可能丟失從未寫入子工作階段日誌、已被接受的提示詞；丟失的訊息不會自動回放。
- **沒有持久化 parent mailbox**——child 到 parent 的訊息要求駐留的可繼續 child 與線上直接 parent，提供的是接受標識，不保證恰好一次投遞。
- **生命週期事件只供觀察**——影響執行的 `subagent/end` 延續或決策介面仍需等待具體消費方。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文：開放問題與尚未決定的探索方向。它明確不具權威性——已交付的行為與限制以上文和包程式碼為準。

- **跨程序繼續執行**——持久化電子郵件與租約協定可讓兩個 harness 程序共享一個持久化儲存。
- **可繼續 ACP 子級**——需要持久化遠端工作階段 id 與逐子級的繼續執行能力宣告。
- **host-user 投遞**——未來的 host 介面卡需要具體的經認證互動，該 seam 才能獲得使用者投遞能力。

</details>
