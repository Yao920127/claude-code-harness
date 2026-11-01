---
description: "面向使用者與維護者的預設 agent（智慧代理）驅動器說明，用於選擇、設定或除錯 agent 的建立方式以及輪次與步驟的執行方式。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-loop

[English](README.md) | 中文

## 概述

`dsh-agent-loop` 建立全新 agent 或恢復持久化工作階段，隨後透過模型請求、流式回應、工具執行和持久工作階段歷史驅動每個輪次。標準 agent 組合應掛載本包；宣告式條目會在啟動時啟動 agent，公開的 `ctx.agents` API 則支援以程式設計方式建立和恢復 agent。`maxParallelToolCalls` 限制同時執行的並行安全呼叫數量，獨佔呼叫保留順序。取消會保留已經流式交付給使用者的文字。只有標準的「呼叫模型、執行工具、重複」生命週期無法滿足需求時，才應選擇自定義 `Agent` 實作。

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

在任何應執行 agent 的組合中掛載 `dsh-agent-loop`。它提供 `ctx.agents` 背後的驅動器，並啟動你在設定中宣告的 agent；[`dsh-base`](../../bundle/base/README.zh.md) 與 [`dsh-sdk-minimal`](../../bundle/sdk-minimal/README.zh.md) 都將它作為顯式設定行掛載。

### 設定宣告式 agent

設定中宣告的 agent 會在外掛載入時自動啟動。每個條目需要一個 `id` 標籤；模型呼叫還同時需要 `provider` 與 `model`（`agent/request` 可以在分發前補齊缺失的這一對值）。

```yaml
- name: '@deepseek-ai/dsh-agent-loop'
  config:
    maxParallelToolCalls: 10
    agents:
      - id: 'main'
        provider: deepseek
        model: deepseek-chat
        reasoningEffort: high
        cwd: /workspace
```

| 欄位 | 預設值 | 含義 |
|---|---|---|
| `maxParallelToolCalls` | `10` | 每個步驟同時在途的並行安全工具呼叫數；`1` 為序列 |
| `agents[].id` | 必填 | 穩定標籤；未設定 `sessionId` 時，全新工作階段會生成 `${id}-session-<uuid>` |
| `agents[].provider` / `agents[].model` | — | 模型路由；分發前兩者都必須存在 |
| `agents[].reasoningEffort` | — | 非空的初始推理強度；`agent/request` 可以覆蓋它 |
| `agents[].maxTokens` | — | 正數的逐請求輸出 token 上限 |
| `agents[].cwd` | — | 全新工作階段的工作目錄 |
| `agents[].sessionId` | — | 確切身份：首次使用建立，重新掛載時恢復已實體化的歷史 |
| `agents[].resumeSessionId` | — | 載入這個持久化工作階段而不是建立新工作階段；與 `sessionId` 互斥 |

生成的[設定目錄](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-loop) 列出所有接受的欄位。`maxParallelToolCalls` 是在下一個工具組開始時讀取的 volatile Config 欄位；`agents` 仍是啟動設定。

### 以程式設計方式建立或恢復 agent

外掛與主機透過 `ctx.agents.create()` 建立 agent，透過 `ctx.agents.resume()` 恢復持久化工作階段；兩者都返回 `AgentHandle`，其 `dispose()`（資源釋放）負責精確拆除對應的 agent。迴圈會把每個建立的 agent 執行到完成——只有呼叫方需要自行拆除 agent 時才需要控制代碼。

```text
const handle = await ctx.agents.create({
  sessionId,
  agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
  setup: (agentCtx, agent) => { /* scoped registrations plus explicit unpublished Agent */ },
})
```

每次 inbox 變更都會提交一條規範化的 `agent/inbox/spliced` 事件。投影註冊表會同步摺疊該事件，因此 `Session.append()` 返回時，即時投影已經反映該 splice。插入、編輯、移除、領取與取消都透過同一組標準 splice 座標回放。普通刪除攜帶 `outcome: 'canceled'` 並行出 `agent/inbox/discarded { message }`；領取使用不帶 outcome 的純刪除，並行出 `agent/inbox/claimed`。每次插入都會發出 `agent/inbox/inserted { message }`。`MessageId` 在兩個待處理列表之間保持唯一。需要被移除訊息的消費方應使用 claimed 或 discarded 通知，而不依賴 splice 前的 `session/event` 投影檢視。

### 一個步驟做什麼

每個步驟都會傳送工作階段的派生歷史——最新的非空 `system/message` 節點是有效提示詞，渲染提示詞為空時則沒有系統訊息——及其可見工具 schema；模型的工具呼叫經過受守衛的工具流水線，每個被接納的事實都會在下一步據此派生之前追加到工作階段日誌。並行安全呼叫最多可重疊 `maxParallelToolCalls` 個；獨佔呼叫單獨執行並構成排序屏障。取消是協作式的：`agent.cancel()` 中止目前活動，並在未設定 `keepInbox` 時清除待處理工作；被取消的流會終結已送達使用者的文字。

-----

<a id="understand-the-implementation"></a>
## 理解實作

<details>
<summary>實作細節——點選展開</summary>

本節解釋該包如何實作上述行為；可觀察約定已在[使用本包](#use-this-package)中完整說明。

### 設計理念

該包是公開 `Agent` 約定的唯一具象實作。它在 `ctx.agents` 上把自身註冊為 `AgentFactory`，因此消費方從不匯入本包；每個建立 agent 的所有權歸屬於呼叫方 fiber 與迴圈提供者，並匯合到同一個記憶化的完全停穩邊界。每個可觀察效果都透過工作階段事件與 `agent/*` 分類體系發生——包內部實作絕不屬於公開介面。

### 請求 header 與介面卡預設值

`agent/request` 返回後，`ctx.llm.prepareCall()` 會在活躍輪次訊號下驗證介面卡持有的欄位，並解析推理強度和輸出 token 預設值。迴圈會在解析、`request/header` 記錄與分派期間保留同一個介面卡。迴圈會為首次請求、變化的 envelope（設定或工具——提示詞不屬於 header）、顯式訊息序列起點、surface 替換或圖片省略決定後的請求及恢復寫入完整 header；同一序列內內容未變的步驟、重試與普通後續輪次繼承最新 header，歷史內追加提示詞不是替換，因此緊隨其後的請求同樣繼承 header。在 header 之外，迴圈還會記錄 `request/context`——提供者、模型、`contextWindow` 以及來自 `prepareCall()` 的路由 `systemPromptUpdate` 模式——且僅在其中任何一項與最新快照不同時記錄。下一次 waterfall 分發前，迴圈移除介面卡預設欄位，使目前路由重新解析它們；顯式設定則保留。未處理的路由仍以 `NO_ADAPTER` 失敗。

迴圈在每個派生訊息物件首次進入請求時執行深凍結，並且僅在同一 agent 內複用該證明。恢復的訊息保留物件身份；建構請求不會凍結包含訊息的事件包裝物件。每個請求都會凍結本地規範化 header、新訊息陣列和請求封裝，同時保留取消訊號的可變性。[請求凍結決策](../../../.agents/notes/implemented/simplification/2026-09-06-agent-request-freeze-evidence.zh.md)解釋了所有權與測量依據。

### 原始碼地圖

| 檔案 | 職責 |
|---|---|
| [`src/index.ts`](src/index.ts) | 外掛入口：`AgentLoop` 服務、設定 schema、宣告式 agent 啟動、工廠註冊 |
| [`src/agent.ts`](src/agent.ts) | 具體 `ReactLoopAgent` 驅動器：收件箱、輪次／步驟狀態機、取消 |
| [`src/inbox.ts`](src/inbox.ts) | 包內部的 `ReactLoopInbox`：持久投影、結構化命令與僅供迴圈使用的領取狀態 |
| [`src/tool-calls.ts`](src/tool-calls.ts) | 工具排程：獨佔屏障與有界並行池 |
| [`src/runtime-context.ts`](src/runtime-context.ts) | 逐步驟執行時上下文快照處理 |
| [`src/constants.ts`](src/constants.ts) | `DEFAULT_MAX_PARALLEL_TOOL_CALLS` |
| [`src/invariant.ts`](src/invariant.ts) | 不變式配套：從工作階段日誌重建請求 |

### 建立與拆除

建立是同一個受復原保護的事務：建構私有工作階段、具象 agent 與帶作用域上下文；等待可選 setup；進入兩個註冊表；宣告 `session/created`；等待序列 `agent/created` 監聽器；隨後釋放已排隊輸入。建立執行時子 Agent 的呼叫方設定 `options.parentAgent`；呼叫方 Context 則單獨擁有事務和存活控制代碼。Setup、commit、監聽器失敗或所有者 dispose 都會復原已準備的資源。已送達的宣告仍可被觀察，並有配對的銷燬通知。Teardown 停止並排空驅動器、撤銷作用域、關閉工作階段寫路徑、detach agent，再 detach 工作階段。每次 detach 都繫結到確切進入的物件，因此陳舊 disposer 無法移除之後出現的同 id 替代項。

### 持久化整合

迴圈是工作階段寫控制代碼在生產環境中的取得點。掛載 `ctx.sessionPersistence` 後，`create`/`createAgent` 呼叫 `persistence.create(header)`——在釋出之前儲存持久身份並取得寫所有權——並透過控制代碼追加建構 seed；`resume` 先呼叫 `persistence.open(id, 'write')`（排除同 id 的並行恢復），透過控制代碼讀取物理上有效的日誌，併為在輪次中途崩潰的日誌把 `interruptedTurnClosers` 作為普通批次追加——語義崩潰修復是 agent 層的職責，而非儲存入口。釋出前的最後一刻，`appendUnstoredSuffix` 儲存 setup 視窗期間追加的事件（seed 標記、委派策略記錄），它們絕不會經由 `session/event` 重新發出。釋出之後，掛載的後端按工作階段 id 把該工作階段的 `session/event` 批次、`session/flush` 屏障與 `session/disposed` 退役路由進活躍寫控制代碼；迴圈只透過它擁有的控制代碼觸碰儲存。記憶化的 teardown 在迴圈提交工作階段的收尾事件之後關閉控制代碼——close 會排空任何已路由的緩衝——可證明地釋放寫所有權。沒有後端時，工作階段只存在於記憶體中，其餘一切不變。

### 輪次與步驟流程

驅動器在其整個生命週期內擁有一個 agent，並在 `ctx.agents.withInitiator(agent, ...)` 內執行。`AgentLoop` 在服務生命週期內註冊標準 `inbox` 投影，因此冷讀取在沒有 Agent 和所有 Agent 解除安裝後都可用。其包內部 `ReactLoopInbox` 使用該共享投影執行結構化命令與僅供 loop 使用的領取操作。在輪次邊界，它先開啟持久輪次，再原子領取待處理的 next-step 輸入與一條排隊提示詞；在步驟之間則只領取 next-step 輸入。驅動器組裝提示詞與工具、投影執行時上下文，並執行 `agent/pre-step`。被拒絕的決定或空的首批輸入不開啟步驟。接納後的首次嘗試先記錄 `step/start`，再執行 `agent/request` waterfall 與 `prepareCall()`；這兩個非同步階段都看不到待提交的系統提示詞與已接納使用者訊息進入歷史，在任一階段取消都不會提交這兩者。每次嘗試時，迴圈隨後依據已準備呼叫的能力，同步將渲染後的提示詞與存活的 `system/message` 節點協調一致、僅在首次嘗試追加已接納的 `user/message` 批次、按需記錄 header 與 context，再派生並凍結請求，透過該繫結的已準備呼叫發起流式請求。重試複用同一份已渲染組裝結果，不重複組裝、`agent/pre-step` 或使用者訊息准入。協調過程可見 pre-step 與重試中的壓縮；序列中斷時將提示詞歸併到頭部，而非在已提交使用者訊息之後追加更新。請求由 `header.config`、`deriveMessages()` 與 `header.tools` 構成，不攜帶 `system` 欄位。每次模型嘗試會發出一個程序本地 `start`，僅在匹配的持久 assistant-frame 結算之後發出各個 `chunk`，並恰好發出一個終態 `end`；最終組裝或訊息追加失敗時以 `aborted` 結算，`committed` 則出現在持久 `assistant/message` 之後。每次成功的模型呼叫都恰好追加一個 message 錨點，被取消的流則追加帶 `interrupted: true` 的錨點並攜帶已交付字首，使下一次請求包含使用者看到的內容。在步驟內，獨佔呼叫形成屏障，並行安全呼叫使用有界滾動池；策略、持久結果與結果上下文保持模型順序。

提示詞准入依據實際的 `prepareCall()` 結果，而非先前的 `request/context`。沒有系統節點時，即使提示詞為空也追加（預留第 0 號節點，但不產生協定訊息）。在不具備能力的路由上或新請求序列開始時，非空渲染文字歸併到首個系統節點：每個非空的後續系統節點分別收到有日誌記錄的空內容替換，隨後按需重寫頭節點。未生效的空尾節點無需替換，也不決定有效文字。即使最新有效文字未變，也執行歸併。延續中的 `in-history` 序列在有效提示詞不變時不產生事件，非空變更則追加。無論路由或序列狀態如何，空渲染文字都會透過有日誌記錄的逐節點空內容替換清除每個非空的後續系統節點，再按需清空頭節點。模型不會繼續看到舊指令。空頭節點且沒有生效的後續系統節點表示沒有提示詞；重複清除與恢復工作階段都保持為空。重新提供的非空提示詞遵循同一路由／序列規則：延續中的具備能力路由可以追加它，不具備能力的路由或新序列則重新填充頭節點。以下情況開啟序列：pre-step 決定宣告 `startsRequestSeries`，或 `session.surface.contentGeneration` 自附接或上次請求以來發生變化（替換或圖片省略決定）。僅當已準備路由未宣告 `toolUpdate` 時，可見工具 schema 變化才強制歸併提示詞。同時支援工具和系統提示詞更新的路由可以追加變更後的提示詞並啟用新增工具，無需改寫此前訊息。如果其他准入條件替換系統節點，請求會以目前工具宣告開啟新序列。恢復與單純的提供者或模型切換都延續序列；准入仍由已準備的路由決定。逐節點的空內容替換保留其間歷史，無需 surface 刪除操作。

### 失敗與取消

`turn/end` 宣告的型別是 `TurnEndCancelCause`；取消時，迴圈在其中記錄一份新的 `AgentCancelCause`，保留呼叫方的 `kind` 和 hook 的 `reason` 文字。即時 `AbortSignal.reason` 仍是呼叫方的那個物件，傳輸層可能向其新增屬性——Node 的 fetch 會給它賦一個 `stack`——因此這份複製既讓該呼叫堆疊不進入日誌，也讓結束事件保持可追加。

最終介面卡選擇、分發與迭代失敗以終止結束的形式到達並進入 `agent/request-error`；處理該失敗的監聽器返回 `{ kind: 'retry' }` 且不呼叫 `next()`，未被處理的失敗則是終態。Middleware、結果處理、工具及其他擴充功能失敗仍會丟擲並直接關閉輪次——外掛失敗結束的是輪次，不是迴圈。取消後未分發的模型工具呼叫會收到合成的 `tool/call` 加 `ABORTED_BEFORE_DISPATCH` 結果對。[顯式取消決策](../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.zh.md)擁有訊號生命週期。

</details>

-----

<a id="further-exploration"></a>
## 進一步探索

包級約定對大多數消費方已經足夠；需要周邊領域與設計原理時再閱讀以下頁面。

- [agent 包](../agent/README.zh.md)——本迴圈實作的 `Agent` 控制代碼、註冊表與 `agent/*` 事件。
- [Core 子系統](../../../docs/subsystems/core.zh.md)——輪次流與攔截決策。
- [工作階段子系統](../../../docs/subsystems/session.zh.md)——迴圈寫入並據此派生的持久日誌。
- [工具子系統](../../../docs/subsystems/tools.zh.md)——迴圈分發所經過的流水線。
- [顯式取消 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-16-explicit-turn-cancellation.zh.md)——訊號生命週期與取消競態。
- [core 分組地圖](../README.zh.md)——core 各包如何組合。

-----

<a id="model-experience"></a>
## 模型體驗

### 完整對話請求

#### 模型看到什麼

每個步驟中，迴圈會傳送工作階段的派生訊息與可見工具 schema。非空的 `system/message` 節點承載提示詞，最新一條是有效版本；空渲染文字會從派生歷史中清除所有提示詞版本。它提供 `provider`、`model` 與 `cwd` 變數值，但不新增固定文案。 請求頭始終記錄目前有效工具。將其名稱與前一請求頭比較後，新增和移除合併為一條 `developer/message`，不依賴模型能力；新增記錄引用新請求頭。請求還攜帶 `Session.toolHistory()`，供 LLM 執行時建構提供者宣告。

#### Token 影響

系統文字與 schema 在每個步驟都會再次計入，在 `in-history` 路由上，每個保留的提示詞版本都會持續計入，直到壓縮將其遮蔽或提示詞協調將其清空。逐 agent 作用域決定貢獻，而權威組裝 waterfall 可以改變最終請求，並使其監聽器負責保持協定連貫。

#### KV Cache 影響

字首複用要求在同一提供者與模型路由下，此前訊息和宣告保持逐位元組一致。渲染後的提示詞未變時，快取字首得以保留，除非不具備能力的路由或新請求序列必須歸併保留的歷史內系統節點。原地替換某個系統節點的提示詞變更會使請求從該節點的第一個 token 起就不同——該節點是第 0 號節點時則整個請求都不同——因此提供者字首快取從那裡開始未命中；當已準備呼叫宣告 `systemPromptUpdate: 'in-history'` 時，同一請求序列延續期間的非空提示詞變更會追加到已快取歷史之後，因此直到該歷史末尾的字首仍可複用。更改保留工具的定義或重建宣告，會從第一個改變的請求 token 起使複用失效。

### 保留的訊息歷史

#### 模型看到什麼

已接納的 user 訊息、assistant 訊息、工具呼叫與結果、注入上下文與 steering（中途引導）都會記錄，並在後續步驟中傳送。原始流分片、生命週期邊界與其他僅寫入日誌的事件會被排除。

#### Token 影響

輸入會隨每條表層訊息增長，直到壓縮替換遮蔽較舊節點；包含多個步驟的工具輪次會在每個步驟重新傳送累積的歷史。

#### KV Cache 影響

普通曆史增長僅追加，並保留可複用條目。表層替換或壓縮會從第一個被遮蔽的歷史 token 起使複用失效。

### 取消後未分發的呼叫

#### 模型看到什麼

如果後續請求回放一箇中止的步驟，取消所阻止分發的每個工具呼叫都有錯誤碼 `ABORTED_BEFORE_DISPATCH`，結果文字為 `Error: tool call aborted before dispatch`。

#### Token 影響

每個跳過的呼叫都會在歷史中保留一個固定錯誤結果，直到壓縮將其遮蔽。

#### KV Cache 影響

僅追加；每個合成結果都位於可複用請求字首之後，不會使現有 KV Cache 條目失效。

## 已知限制與延期工作

<a id="known-limitations-and-deferred-work"></a>


這些限制說明迴圈何時需要特別留意。它們是目前包約束，不是任務積壓。

- **分類是一元的**：安全性取決於比較同級呼叫或資源的呼叫必須保持獨佔（[原理](../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.zh.md)）。
- **設定標籤預設對應新工作階段**：省略 `sessionId` 時，每次啟動都會建立新的 `${id}-session-<uuid>`；如需確切的恢復或建立行為，必須顯式提供穩定的 `sessionId`，而 `resumeSessionId` 要求已有持久化歷史。
- **設定 agent 沒有逐 agent persona 欄位或 setup 掛鉤**：它們使用部署 persona；只有程式設計式 `ctx.agents.create()` / `resume()` 工廠選項支援帶作用域的 persona 與工具組合。
- **沒有內建輪次預算**：工具呼叫或 steering 會讓目前輪次繼續；限制失控輪次的策略必須從既有生命週期擴充功能點（如 `agent/turn-stopping`）執行取消。

<a id="dev-note"></a>
### 開發備註

<details>
<summary>維護者的工作上下文——點選展開</summary>

無。

</details>
