# Conversation 組裝

[English](conversation.md) | 中文

Conversation 是 Client `SessionEventLikeEntry` window 與瀏覽器 view 之間的 target-neutral assembly 層。[`ui-conversation`](../../packages/client/ui-conversation/README.zh.md)擁有 event 與 view registry、每個 `SessionBinding` 對應的 identity-stable binding、Turn/Step Location、增量 Context assembly、target source、共享 shell 與輸入編排。[`ui-chat`](../../packages/client/ui-chat/README.zh.md)和 [`ui-trajectory`](../../packages/client/ui-trajectory/README.zh.md)等 target 包擁有各自的 Definition、最終 snapshot 與渲染。

本文定義資料模型與業務自有 Conversation node 的擴充功能路徑。[Web Client 架構](web-client.zh.md)說明該子系統在 Client model 與 Slots 之間的位置；[Conversation Node 組裝決策](../../.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.zh.md)記錄其設計理由。

## 資料模型與所有權

Session Controller 擁有連續的已載入邏輯 event window。每個 `SessionEventLikeEntry` 要麼是表示一個持久事件的 `{ type: 'event', event: SessionEvent }`，要麼是表示一個 Client-only `assistant/live-chunk` 呈現的 `{ type: 'transient', event: AssistantLiveChunkEvent }`；兩種內部 event 都公開 `type`、`seq`、`time` 與 `data`。`ui-conversation` 把這些 entry 直接交給 assembler，不另開 history stream。每個 Session 對應一個 `ConversationNodeAssembler`，它應用所有已註冊 Definition，併為每個已註冊 view target 釋出獨立 source。

| 概念 | Owner 與用途 |
|---|---|
| Event Definition | 業務包一次匹配一個持久 event 或 Client-only 瞬態 event，以穩定 `(kind, id)` 關聯輸入、摺疊確定性 State，並可選擇 materialize 一個 target node。 |
| Context | Engine 為一個 `(kind, id)` 擁有的有序 Match 與目前 State。持久和瞬態事件都可以作為 start。目前最早的 start 初始化 State，後續 Match 更新它。只有 update 的證據保持 pending，直到其 start 載入。 |
| Location | Engine 根據持久 boundary event 推導的 Session、Turn 或 Step 座標。Definition 可以向一個 Turn 或 Step 釋出型別化資料。 |
| View Definition | Target 包為每個 Session 建立一個增量 builder，並擁有該 target 的最終 snapshot 型別。 |
| Group Definition | 業務包從物化後的 Node 派生一個目標的根引用和組快照，擁有成員歸屬、分段、摘要及增量快取。 |
| View | Chat 或 Trajectory 等 Slot entry 只讀取自身 target snapshot，並渲染 target 自有 node。 |

Chat 與 Trajectory 可以識別同一個持久 event family，但各自保留自己的 Definition State 與最終 node payload。共享的 target-neutral 機制只包括 identity routing、有序 replay、Location data、predecessor dependency 與 publication cadence。

## Target 啟用

每個 Session 都保留單調增長的 active target 集合。建立或讀取 target source 不會啟用它。shell 會顯式啟用持久化選擇或新選擇的 View，其他消費者則透過 target source 的首個訂閱啟用 target。首次啟用會建立該 target 的 builder，並從目前按 target 索引的 Context 呼叫一次 `replace()`。後續 flush 對每個 active target 呼叫 `apply()`，取消訂閱不會移除 target。

shell 擁有 View 選擇，並在 binding 建立、被選為 current 或 View roster 變化時，於渲染前解析已註冊的偏好 View 或 Chat fallback。assembler 只接收解析後的 target id，不自行選擇 Chat 或其他預設 target。第三方 View 使用相同的選擇與啟用操作。View Definition 可以提供 `toolCallFocus(callId)`；shell 僅為宣告瞭此能力且可見的目標提供 Inspect，由目標將呼叫 id 對映為自己的焦點標識。

<a id="group-definitions"></a>
## Group Definition

可選的 `ctx.uiConversation.groups.register(definition)` 貢獻沿用事件及檢視註冊的 effect 生命週期。它要求已有 View 目標，拒絕重複目標註冊，不建構 Builder。每個 Session 僅在目標啟用時建立自己的 Group 上下文。註冊替換透過既有註冊重建流程丟棄舊上下文，並清空其被觀察的組。

[分組型別](../../packages/client/ui-conversation/src/client/contract/groups.ts)定義完整協定：

| 型別 | 含義 |
|---|---|
| `ConversationGroupDefinition<Node, State, Data>` | `create()` 初始化 Session 內的 State；`update(context, input)` 返回下一份 State；`buildGroups(context)` 返回待發布輸出或 `null`。替換輸入要求輸出 entries 與完整組替換。 |
| `ConversationGroupInput<Node>` | `replace` 提供目標順序、時間線及同步的 `readNode`、`readTurn`、`readPosition` 讀取器。`apply` 增加投影后的 `previous/current` 節點變化、生命週期 `changedTurns` 和 `changedTurnOrders`。不要把讀取器留在 State 中。 |
| `GroupNodePosition` | 所屬 Turn（如有）及前後緊鄰的可見 Node 鍵。相鄰關係保留僅按 Turn 取鍵時會遺漏的分隔。 |
| `NodeReference` / `GroupReference` | 以 `kind` 區分的品牌型別 `NodeKey` 或 `GroupKey`。Node 引用可選擇渲染器擁有的 `groupPart`，省略表示整個 Node。 |
| `GroupSnapshot<Data>` | 不可變的組鍵、業務資料和有序 Node 引用。Group 不包含其他 Group，也不擁有原 Node 資料。 |
| `GroupUpdate<Data>` | `entries` 替換完整根序列，僅 apply 輸入允許省略它以保留原序列。替換輸入必須同時提供 `entries` 與 `groups.replace`。`groups.replace.snapshots` 替換全部組；`groups.apply.upserts/removes` 只更新具名組記錄。刪除組不刪除 Node。 |
| `ConversationGroupDataMap` | 透過宣告合併關聯目標與資料型別，註冊及 `views.grouped(target)` 共用。未宣告的目標沒有組載荷型別。 |
| `ConversationGroupedView<Data>` | 穩定的根 `entries` 與按鍵 `groupSource(key)` 讀取器；已刪除的組返回 `undefined`。 |

註冊分組時 Builder 必須提供 `groupInput()`，缺少輸入方法在首次啟用時報錯。它記錄自身投影后的節點值，並在僅正文更新時保留順序陣列身份。assembler 每次更新都提供變化輪次，直接呼叫未分組 Builder 的呼叫方可以省略。擁有獨立來源的 Builder 把通知推遲到 `publish()`。首次啟用與普通 flush 共用同一順序：物化 Location 資料和 Node，更新 Builder，呼叫 Group Definition，驗證並安裝分組，再發布全部受影響目標及 Location 來源。分組階段複用既有釋出節奏。

目標位置索引提供這些讀取器，並標識可見鍵或相鄰關係發生變化的 Turn。`changedTurnOrders` 包含移動 Node 的新舊所屬輪次，以及相鄰的輪次外 Node 被插入或移除所影響的輪次；僅生命週期變化仍由 `changedTurns` 提供。業務 Definition 可只重分這些輪次，並只重新整理包含變化內容的組。結構輸出仍替換完整根引用陣列，但不要求重讀未變化的 Node 內容。

Group 儲存在安裝前驗證完整提交結果：根 Group 引用與記錄一一對應，引用的 Node 全部存在，每個 `(NodeKey, groupPart)` 在根和成員位置中最多佔位一次。整 Node 不能與自身任一部分共存。重複 upsert、重複刪除以及同時 upsert 和刪除一個組都會報錯。僅資料 upsert 保留根及成員陣列、不讀取 Node，並只通知變化組的來源；完整替換重新驗證全部引用。

渲染器按兩種引用 kind 切換，由所屬 View 選擇元件，不透過組資料中的 renderer 欄位選擇。根 Node 引用與被引用組的成員構成完整渲染列表；未被引用的目標 Node 仍保留在儲存中，但不渲染。組 body 將成員與摘要資料分開讀取。展示模式必須保留元件型別、key 和成員父級；業務資料改變成員歸屬時，移動成員可以正常重掛載。框架不解釋部分內容完備性、分段或展示策略。

## 可回放 event family

編寫 Definition 前先選定穩定的業務 id。構成同一個 Node 的每條事件都必須攜帶該 id，或只憑自身 payload 獨立推匯出該 id；Client 絕不能把 update 猜測為屬於“最近一個未完成”的 Context。

以一個 review job 為例，事件約定可以是：

| 事件 | 角色 | 必須持久化的事實 |
|---|---|---|
| `review/start` | 唯一 start | `reviewId`、Turn/Step 座標、標題 |
| `review/progress` | update | 相同的 `reviewId`、座標、可回放進度 |
| `review/end` | update | 相同的 `reviewId`、座標、最終摘要 |

跨程序邊界使用生產方擁有的 branded id 型別。把 `SessionEventMap` 合併和 payload 型別放在生產方的純型別匯出中，再由 Client 包透過僅型別副作用匯入該匯出。每個 `(kind, id)` 最多只能有一條 start 事件。單事件業務可以把事件自身的穩定身份（例如 `event.seq`）作為 Definition 內部 id。

系統支援增量事件。如果生產方能以較低成本發出 whole-value checkpoint，應優先採用，因為 start 位於已載入視窗之外時它仍可直接使用。每條 delta 都必須攜帶穩定 id，並且按照日誌 `seq` 升序回放時能夠確定性地產生 State；它不能依賴只存在於即時記憶體中的狀態。如果目前歷史視窗只有 update，Assembler 會保留一個 pending Context，並在更早分頁補齊 start 前不建構 State。如果產品必須在 start 尚未載入時渲染，terminal 或 checkpoint 事件就必須攜帶足夠的完整 fallback 狀態，讓 Definition 能直接建構結果；不要透過掃描無關事件恢復它。

即時 Assistant delta 作為 Client-only `assistant/live-chunk` event 到達。重連 baseline 會把活躍的程序內緊湊 stream 展開為相同的瞬態 event，持久 `assistant/message` 與 `assistant/attempt` event 則嵌入完整緊湊 stream 供歷史回放。瞬態 event 可以初始化 Context。具名工具 delta 和後續 tool/call 可以按同一個 callId 匹配為 start；只有最早的 Match 呼叫 start()，後續 Match 呼叫 update()。歷史分頁不把已結束訊息展開為即時 delta。消費 Assistant 輸出的 Definition 在同一組 `match()` 與 `update()` 方法裡處理 live chunk 與持久 settlement，其他 Definition 直接返回 `null`，無需展開 stream。

## Definition 與型別化 Chat payload

為了完整展示關聯關係，下面把生產方宣告和 Client 貢獻寫在同一個程式碼塊裡。實際的包族中，branded id 與 `SessionEventMap` 宣告留在事件生產方，Definition、Chat data 合併與 renderer 留在 Client 外掛。

```ts ignore-check
import { createElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ConversationLocation, ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'

type ReviewId = Branded<'ReviewId'>

interface ReviewStartData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly title: string
}

interface ReviewProgressData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly completed: number
}

interface ReviewEndData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly summary: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable review job.
     * @mode emit
     * @param data - stable identity, location, and initial display state.
     */
    'review/start': ReviewStartData
    /**
     * Records replayable progress for one review job.
     * @mode emit
     * @param data - stable identity, location, and latest progress.
     */
    'review/progress': ReviewProgressData
    /**
     * Closes one review job with its final summary.
     * @mode emit
     * @param data - stable identity, location, and final display state.
     */
    'review/end': ReviewEndData
  }
}

interface ReviewChatData {
  readonly title: string
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationStepDataMap {
    'review-job': ReviewChatData
  }
}

interface ReviewState extends ReviewChatData {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function viewData(state: ReviewState): ReviewChatData {
  return {
    title: state.title,
    completed: state.completed,
    status: state.status,
    ...state.summary === undefined ? {} : { summary: state.summary },
  }
}

const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'review/start') {
      return { id: String(event.data.reviewId), role: 'start' }
    }
    if (event.type === 'review/progress' || event.type === 'review/end') {
      return { id: String(event.data.reviewId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'review/start') throw new Error('review-job requires review/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'review/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'review/end') {
      return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === 'review/progress'
    ? 'animation-frame'
    : 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'review-job',
      value: viewData(context.state),
    }
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'review-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: viewData(context.state),
    }
  },
}

function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}

export const inject = ['uiConversation', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

`match(event)` 是身份提取器，不是 fold：它只能收到目前 `SessionEventLike`，並返回 Definition 內部 id 與生命週期角色。命中後，Assembler 透過 `(kind, id)` 定位 Context；目前最早的 start 初始化 State，不論它是持久事件還是瞬態事件。後續所有 Match，包括其他 start，都呼叫 `update`。移除瞬態 Match 後，從剩餘事件重新選擇 start 並重算 State；沒有剩餘 start 時 State 為 undefined。兩個函式都必須返回引擎隨後採用的 State；推薦返回新的 immutable value，但函式原地修改後返回同一物件時，採用語義也相同。

`buildLocationData(context, scope)` 可以把 Definition 擁有的資料釋出到引擎擁有的 Turn 或 Step 上。透過 declaration merging 為每個 key 指定精確 value 型別。同一 Location 內的另一個 Node 可以使用受限 slot hook（例如 `useTurnData(key)`）讀取該值，無須取得 Session，也無須掃描 `snapshot.chat.nodes`。

`target` 與 `buildViewNode(context)` 必須同時宣告一項由 target 擁有的渲染貢獻。把 `context.key` 保留為 React 側身份，根據持久排序證據選擇 `anchorSeq`，並且只返回 renderer 可以直接使用的資料。某個 target Node 一旦釋出，就要繼續返回同一個 key；需要暫時離開可見流時使用 `visibility: 'hidden'`，不要改為返回 `null` 撤回它。

## Predecessor read

有些 Definition 需要另一個業務 kind 在目前位置之前的最新 State。`start` 會收到 `ConversationContextReader`；應在這裡呼叫 `reader.previous<State>(kind)`，不要接收 Context 集合或掃描事件。Reader 返回目前 start `seq` 之前最近一個已啟動 Context 的只讀資料。

Assembler 會記錄這項依賴。如果後續 older prepend 帶來了更近的前序 Context、補齊了原先未知的視窗缺口，或者前序 State 被修訂，引擎會從 `start` 重新執行依賴方 Context，並按 `seq` 升序回放其 update。被查詢的 Definition 仍負責把有用資訊寫入自身 State；Reader 不提供業務專用查詢方法，也不授予修改其他 Context 的權限。

## Window 更新路徑

歷史可能從尾部開始一頁一頁向前請求。Session journal 先驗證互不重疊的邏輯 seq range，Assembler 再按每個已接受 input 的首 `seq` 排序並進入 State 回放。

| 路徑 | 引擎工作 | Definition 可觀察到的行為 |
|---|---|---|
| open、resync 或 gap repair 時 replace | 重建已載入視窗，每條標準 event 或 packed run 對每個 Definition 匹配一次，再回放每個已有 start 的 Context | 先執行 `start`，再按邏輯 `seq` 升序執行其 update；只有 update 的 pending Context 仍沒有 State |
| prepend 一頁更早歷史 | 只匹配新增的更早 input，按 `(kind, id)` 合併進 Context，保留現有 keyed node，並只重放受影響的 Context 與依賴 | 新發現的 scalar start 會啟用已收集的 scalar 與 packed update；Location 或前序依賴變化也可能重跑 Context |
| append 一條即時事件 | 每個 Definition 各呼叫一次 `match`，按 key 查詢命中的 Context，只更新該 Context | 對 start 之後的匹配事件執行一次 scalar `update` 並請求一次釋出；不掃描已有 Context |

註冊 `D` 個 Definition 時，一條新 scalar event 或 packed run 會進行 `D` 次僅目前 input 匹配；命中後的 Context key 查詢是常數時間。Definition 程式碼必須維持這個性質：正常 append 熱路徑不得遍歷完整事件視窗、所有 Context、`context.matches` 或已渲染 Node 集合。累計事實放進 State，同 Turn/Step 共享資訊放進 Location data，有索引的前序依賴使用 `reader.previous()`。

`publication` 控制發生 State 變更後何時物化。結構或 terminal 變化使用 `immediate`，高頻可見 delta 使用 `animation-frame`，只為後續釋出積累 State 時使用 `none`。引擎按日誌順序應用每條 scalar update，並用一次 batch update 應用一個 packed run；該選項只合並檢視釋出頻率。

## 驗證要求

新增聚焦測試，證明以下結果：

1. 完整視窗透過 replace 後產生預期的最終 State、Location data、Node payload 與 `anchorSeq`。
2. 只有 update 的尾部視窗保持 pending；prepend 其 start 後，結果與完整 replace 相同。
3. 初始歷史後繼續即時 append，與回放合併後的完整視窗得到相同結果。
4. prepend 更早分頁只增加更早的行；資料未變化的既有 keyed Node value 不被替換。
5. 重複的可見 delta 保持 `context.key`，並在請求 `animation-frame` 時每幀最多釋出一次。
6. keyed renderer 只消費 `node.data` 與受限 Location hook，不掃描 Session 事件視窗、Context 或 Chat Node。
7. scalar 與 packed Assistant 歷史產生相同的最終 State、timing boundary 和 target snapshot；一個 packed run 在 replace、prepend、Location replay 與 registry rebuild 中始終只保留一個 Match。
8. 建立 target source 不執行 builder 工作；顯式選擇或首次訂閱執行一次完整 replace，後續更新送達所有 active target，重複啟用不會再次 replace。

流式與中斷處理可參考 [`packages/client/ui-chat/src/client/conversation-nodes/assistant.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/assistant.ts)，前序查詢可參考 [`inbox.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/inbox.ts) 與 [`message.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/message.ts)，只發布 Turn data 而不建立自有 Node 的例子見 [`packages/client/ui-deliverables`](../../packages/client/ui-deliverables)。
