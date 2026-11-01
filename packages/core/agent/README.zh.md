---
description: "面向外掛、UI 與編排器的 Agent 控制代碼、即時註冊表、程序本地發起方作用域，以及 agent/* 事件詞彙。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent

[English](README.md) | 中文

## 概述

使用 `dsh-agent` 建立或恢復即時 agent（智慧代理）、傳送後續或 steering（中途引導）輸入、注入面向模型的上下文、取消工作，並等待 agent 進入空閒狀態。外掛、UI、掛鉤與編排器還可以觀察或攔截 agent 活動，並僅為一個 agent 應用能力而不影響其他 agent。當程式碼需要透過公開 `Agent` API 控制或擴充功能即時 agent 時，請選擇本包。請將它與 `dsh-agent-loop` 等 agent 驅動器配合使用；本包本身不會建立模型請求。發起方歸因僅存在於程序內，跨 worker、程序、持久佇列與重新啟動時必須顯式傳遞。

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

在存在即時 agent 的任何地方掛載 `dsh-agent`：它提供 `ctx.agents` 以及外掛、UI、掛鉤和編排器所面向程式設計的 `Agent` 控制代碼。在沒有驅動器註冊工廠之前，該服務保持惰性——隨附驅動器是 `dsh-agent-loop`，因此最小的可用組合需要同時載入兩者。

### 建立或恢復 agent

`ctx.agents.create()` 在一個身份下建置全新 agent 與工作階段；`ctx.agents.resume()` 載入持久化工作階段並在此基礎上重建 agent。兩者都委託給已註冊工廠，並返回 `AgentHandle`——唯一能拆除該 agent 的物件。在任一操作的 options 中設定 `parentAgent`，可使結果成為執行時子級；省略它則得到執行時根級。`get(id)`、`list()` 與 `roots()` 用於查詢即時 agent；`isOwnedBy(id, parent)` 用於檢驗這項確切的即時所有權關係。

```text
const handle = await ctx.agents.create({
  sessionId,
  agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
})
// later:
await handle.dispose()   // stops the loop, unregisters, removes the session, unwinds the scope
```

`AgentOptions` 提供初始提供者／模型路由、可選的由介面卡定義的 `reasoningEffort`，以及可選的正數 `maxTokens` 輸出上限。迴圈會驗證確切模型的推理（reasoning）支援、解析介面卡預設值、把生效值記錄在請求頭中，並將它們應用到每個對話請求。可選的 `setup(agentCtx, agent)` 回呼會在 agent 釋出之前組合其作用域世界：`agentCtx` 擁有註冊，顯式的未釋出 Agent 則提供其 Session；Context 不含反向 Agent 屬性。作用域工具、提示詞段與監聽器在任何建立公告之前就已存在。Setup 只做組合：建立完成後才能驅動 agent。

### 驅動 agent 的對話

控制代碼的方法把帶標識的 user 角色訊息路由進 agent 的收件箱。`followup()` 排隊一條普通的下一個輪次提示詞並喚醒驅動器；`steer()` 提交下一步輸入並喚醒它；`inject()` 新增面向模型的上下文但不喚醒驅動器，因此它落在下一個被接納的步驟中。`cancel(cause)` 中止目前活動，並在未設定 `keepInbox` 時清除待處理工作；`whenIdle()` 會在整個 agent 達到完全停穩後完成。

```text
handle.agent.followup({
  content: [{ type: 'text', text: 'Summarize this workspace.' }],
  source: { kind: 'user' },
})
handle.agent.steer({
  content: [{ type: 'text', text: 'Focus on the tests.' }],
  source: { kind: 'plugin', plugin: 'my-plugin' },
})
await handle.agent.whenIdle()
```

### 將註冊限定到單個 agent

`Agent.ctx` 是該 agent 的作用域上下文：透過它進行的註冊（工具、提示詞段、變數、事件監聽器、限制）只對該 agent 生效，並在 dispose（資源釋放）時全部撤銷。同一機制也是 agent preset 用來讓一個工作階段獲得不同能力集、同時不影響其鄰居的方式。

### 攔截或觀察進行中的工作

`agent/*` 事件讓外掛無需依賴迴圈包即可作用於即時工作。`agent/pre-step` 可以拒絕擬進入的步驟或替換進入它的訊息；`agent/request-error` 讓監聽器重試失敗的模型請求；`agent/turn-stopping` 在本可完成的輪次關閉前執行，並可透過 steer 使其保持開啟。`agent/assistant-stream` 攜帶一個程序本地 Assistant attempt 的有序 start、瞬態分片與 end frame。start 給出該 attempt 的輪次與步驟，分片索引從零開始密集遞增，`end.index` 則是下一個分片位置。loop 會在 committed end frame 前把完整緊湊流提交為一個 `assistant/message` 或 `assistant/attempt`，因此即時事件仍是呈現資料而非回放來源。`agent/status`、`agent/created` 與 `agent/disposed` 驅動 UI 與協調狀態，逐訊息的 `agent/inbox/*` 通知則讓收件箱投影保持同步。確切簽名、分發 mode 與 payload 約定見 [core 子系統頁](../../../docs/subsystems/core.zh.md#cordis-surface) 的生成區塊。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該包如何實作上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該包建立在一項職責分離之上：公開的 `Agent` 介面與註冊表位於本包，建構與驅動則位於迴圈包，並透過已註冊工廠提供。消費方因此依賴 `dsh-agent` 而不依賴 `dsh-agent-loop`，從而保持驅動器可替換。第二個理念是發起方作用域：一條 `AsyncLocalStorage` 鏈把確切的即時 `Agent` 攜帶經過它啟動的非同步驅動器工作，使驅動器之下的輔助函式無需逐呼叫轉發 agent 即可歸因自己的工作。

### 步驟准入

`PreStepDecision` 要麼是 `{ kind: 'reject' }`，要麼是 `{ kind: 'enter', messages, startsRequestSeries? }`。enter 分支包含完整、帶標識且凍結的訊息批次。接納不等於提交：組裝與 `step/start` 之後，`agent/request` 和 `prepareCall()` 先解析路由，迴圈隨後才提交系統提示詞與使用者批次。在任一非同步階段取消都不會提交這兩者。`startsRequestSeries: true` 宣告一個獨立的模型訊息序列；包裝下游 enter 的監聽器會保留該宣告與批次，除非有意替換其中一項。領取會從 inbox 移除候選訊息，領取後插入的訊息則等待後續邊界。

### 持久 inbox

`Agent.inbox` 只暴露結構型 `Inbox` 介面，投影詞彙仍位於本包。dsh-agent-loop 持有包內部的 `ReactLoopInbox` 與標準 `inbox` 投影；建構具體 inbox 時會確保投影註冊表為持久 `agent/inbox/spliced` fold 持有一份註冊。註冊表繼續作為即時 `{ 'next-turn', 'next-step' }` 狀態的唯一所有者。重建過程會拒絕不安全或越界的 splice 座標，以及跨兩份待處理列表重複的 `MessageId`，並報告出錯事件的 seq。

`Inbox` 暴露待處理的 `nextTurn` 與 `nextStep` 訊息，並透過 `append`、`prepend`、`replace`、`remove`、`clear` 與 `splice` 變更它們。普通刪除和 `clear()` 都是持久取消。在步驟邊界，迴圈的內部實作會透過純刪除 splice 領取待處理輸入。即時通知刻意採用逐訊息的最小載荷：`agent/inbox/inserted { message }`、`agent/inbox/claimed { message, turn }` 與 `agent/inbox/discarded { message }`。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`AgentRegistry`、工廠槽位、發起方作用域、`CreateAgentOptions`/`ResumeAgentOptions` |
| [`src/runtime-types.ts`](src/runtime-types.ts) | `Agent`、結構化 `Inbox`、`AgentStatus` 與 `agent/*` 事件宣告 |
| [`src/types.ts`](src/types.ts) | `AgentOptions`、取消原因與收件箱投影詞彙 |
| [`src/dispatch.ts`](src/dispatch.ts) | `agentEvents` 融合分發器與 `assembleContextFor(agent)` |
| [`src/consumed-work.ts`](src/consumed-work.ts) | `foldConsumedWork(events)`：日誌消費掉的工作最終怎樣了 |
| [`src/model-selection.ts`](src/model-selection.ts) | `installModelSelection`：把一個選擇耦合到組裝與路由 |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套：無操作的 `agent/status` 轉換會失敗 |
| [`src/archive-admission.ts`](src/archive-admission.ts) | Workspace 註冊表歸檔准入中的 `turn` 族：執行中的回合及其使用者原因取消 |

### 註冊表與生命週期

`AgentRegistry` 為每個即時 agent 保留一個條目，含其載體與建立者關係。使用已建構的 agent 前，等待 `register()` 以 `startup` 來源完成序列建立監聽器；非同步工廠使用拆分的 `enter()`/`announce()` 對，使 setup 與初始化始終受復原保護。建立期間請求的 detach 會等待所有已呼叫的非同步監聽器結算，且每次 detach 都繫結到確切條目，因此陳舊 disposer 無法移除之後出現的同 id 替代項。Teardown 停止並排空迴圈、撤銷作用域、detach agent，再 detach 工作階段；私有清理完成後該 id 即可複用。

註冊表還為它釋出的每個 Agent 回答 Workspace 註冊表的歸檔准入（[接縫](../../workspace/workspace/README.zh.md)）：`workspace/session-activity` 在工作階段的 Agent 執行時報告 `turn` 族（等待審批或回答的回合也算），`workspace/session-stop` 以使用者自己的停止方式取消該回合——`agent.cancel({ kind: 'user' })`，但不帶停止按鈕的 `keepInbox`，因此排隊輸入被丟棄並記錄一次收件箱拼接，而不會在之後喚醒已歸檔工作階段。任何一步都不等待收斂；沒有活 Agent 的工作階段沒有可執行的回合。`turn` 鍵從 [`src/types.ts`](src/types.ts) 合併進 `SessionActivityKindMap`，渲染各族的 Client 為此匯入 `@deepseek-ai/dsh-agent/types`。

### 發起方作用域

每個驅動器在 `ctx.agents.withInitiator(agent, ...)` 內執行其完整生命週期，因此繼承的非同步鏈會觀察到該 agent；`withoutInitiator()` 為共享定時器等無關的程序本地工作隱藏它。該邊界只是程序本地歸因——環境中的身份既不是存活證明，也不是授權，顯式身份在 worker、程序、持久化與 wire 邊界保持權威。Teardown 拒絕新邊界，讓返回 Promise 的邊界排空，然後停用底層儲存。[發起方作用域決策](../../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.zh.md) 擁有詳細約定。

### 所有權不變式

`AgentHandle` disposer 是一項能力：在消費方中，只有其持有者能拆除該 agent。已註冊的工廠提供者是結構化共同擁有者，因為作用域 agent 依賴該提供者的服務 API；提供者解除安裝會停止並排空它建立的每個即時控制代碼。`ctx.agents.get(id)` 仍返回裸 `Agent`——控制代碼只暴露給建立它的消費方。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域與設計原理時再閱讀以下頁面。

- [Core 子系統](../../../docs/subsystems/core.zh.md)——迴圈圖、`Agent` 控制代碼、攔截決策與生成的服務 API。
- [agent-loop 包](../agent-loop/README.zh.md)——建立、驅動並拆除 agent 的預設驅動器。
- [工作階段子系統](../../../docs/subsystems/session.zh.md)——控制代碼背後的持久日誌與派生歷史。
- [發起方作用域 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.zh.md)——邊界與 teardown 約定。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 使用者、steering 與注入訊息

#### 模型看到什麼

`followup`、`steer` 與 `inject` 以帶標識的 user 角色訊息饋送所屬工作階段；被接納的內容成為模型在後續步驟中讀取的派生歷史的一部分。`agent/pre-step` 與其他已宣告事件讓外掛能夠拒絕擬進入的步驟或新增持久請求材料。`installModelSelection` 會在首次為不同提供者／模型路由組裝且原本會發出模型請求的步驟中加入 `[model changed: assistant turns above this point were generated by <previous>; the session continues with <next>]`；僅跨提供者切換時顯示提供者名稱，只改變推理強度時不新增訊息。第一個決策為空時，以及某個決策移除候選訊息後為空時，都不會產生請求。如果請求步驟在記錄請求頭前失敗，持久記錄中的先前路由沒有變化，所以下一個請求步驟會再次收到提示。

#### Token 影響

被接納內容成為保留歷史，或成為每次請求重複的工作階段字首；被阻止內容不貢獻請求 token。每條實際發出的模型切換提示都會把對應文字加入保留歷史。大小取決於呼叫方與外掛。

#### KV Cache 影響

被接納歷史與 steering 只追加；被阻止的提交不傳送請求。工作階段字首在迴圈實例內保持穩定，而新建或恢復的實例可能建立不同字首。

### Agent 作用域的請求組合

#### 模型看到什麼

透過 `agent.ctx` 進行的註冊可以遮蔽提示詞段或工具，也可以在未釋出 setup 期間安裝僅適用於該 agent 的攔截器，因此一個 agent 看到的提示詞與工具集會與其鄰居不同。模型選擇會在提示片語裝前捕捉一次提供者／模型／推理強度值，並將其應用到同一步驟的請求；之後發生的並行變更等待下一個步驟。

#### Token 影響

每次提供者／模型切換會增加一條簡短且保留在歷史中的 user 角色提示。其他帶作用域貢獻隻影響該 agent，並在 dispose 時消失。

#### KV Cache 影響

切換提示追加在先前歷史之後，因此保留該字首；路由變更可能使新的提供者或模型無法複用此字首。改變提示詞段、工具定義或請求監聽器的 setup 或 reload，可能從第一個受影響的請求 token 起使複用失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明本包何時需要特別留意。它們是目前包約束，不是任務積壓。

- **發起方作用域只存在於程序內**：worker、子程序、HTTP、持久佇列和重新啟動必須顯式傳遞所需身份。
- **環境身份可能比存活狀態更久**：消費方在生命週期敏感工作前，仍要檢查 `agent.status`、取消狀態和所屬能力約定。
- **建立監聽器共享初始化生命週期。** `agent/created` 監聽器不得等待 `agent.whenIdle()` 或自身所有者的 dispose：這些操作要等待建立完成。所需的非同步工具與提示詞安裝完成後，監聽器才可返回。
- **`cancel()` 預設清空收件箱**：它會中止正在處理的輪次以及排隊和 steering 工作；`cancel(cause, { keepInbox: true })` 只中止輪次並保留待處理項，且不存在讓輪次繼續執行、只中止步驟的操作。
- **每條附加 `UserMessage` 恰好攜帶一個 `MessageSource`**：多個外掛合併到一條訊息上的貢獻會歸入同一來源，因此該訊息無法列出多個生產者。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

本開發備註是維護者的工作上下文；它明確不具權威性。尚未決定的開放方向：委派之外的 agent 間通道——共享狀態、流式子輸出以及後臺或輪詢語義仍不在目前委派 seam 之內；以及 `SessionStartSource` 的 `'clear'`/`'compact'` 值已保留但尚無發出方，待驅動子系統落實。

</details>
