# 核心

[English](core.md) | 中文

**核心**子系統即 [`packages/core`](../../packages/core/README.zh.md)，包含每個組合都會啟動的包：事件溯源的工作階段日誌、系統提示片語裝、工具註冊表、agent（智慧代理）型別，以及驅動它們的具體迴圈。本頁說明 `agent`/`agent-loop` 這對包所宣告的內容：agent 如何被建立與擁有，以及 `Agent` 控制代碼的投遞、取消與攔截約定；本頁還說明每個子系統都遵循的兩個型別模式。該組的專屬頁面與目錄其餘部分見[子系統 README](README.zh.md)。

## 主幹逐包速覽

一個輪次按同一條迴圈流經六個包：[`agent-loop`](../../packages/core/agent-loop) 中的 driver 認領一條排隊的提示詞，在[工作階段日誌](session.zh.md)（`ctx.sessions`）上開啟輪次，透過 [system-prompt](system-prompt.zh.md)（`ctx.systemPrompt`）組裝請求字首並從日誌派生歷史，經 [LLM（大語言模型） seam](llm-streaming.zh.md) 流式取得模型回應，經[工具註冊表](tools.zh.md)（`ctx.tools`）分發工具呼叫，並把每個模型可見的事實追加回日誌，供下一步派生。迴圈搬運的對話詞彙——`Message`、`ContentBlock`、`StreamChunk`、模型請求——由 [`packages/llm`](../../packages/llm/README.zh.md) 宣告，記錄在 [llm-streaming.md](llm-streaming.zh.md)。

| 包 | 負責內容 | 頁面 |
|---|---|---|
| `session/` | 僅追加的 `SessionEvent` 日誌與記憶體 store——唯一真源（`ctx.sessions`） | [session.md](session.zh.md) |
| `system-prompt/` | 提示詞段落與工具 schema 組裝（`ctx.systemPrompt`） | [system-prompt.md](system-prompt.zh.md) |
| `tools/` | 帶作用域的工具註冊表與受保護的執行流水線（`ctx.tools`） | [tools.md](tools.zh.md) |
| `agent/` | `Agent` 介面、即時註冊表、發起者作用域與 `agent/*` 事件詞彙（`ctx.agents`） | 本頁 |
| `agent-loop/` | 實作公開 `Agent` 約定的具體 driver（`ctx.agentLoop`） | 本頁 |
| `scope/` | 註冊表與迴圈用於建置按 agent 作用域的註冊原語 | [scope.md](scope.zh.md) |

`scope/` 是這裡唯一的非服務包：一個零依賴庫（`createScope`/`scopeOf`/`scopeTarget`），在模組圖中位於 `session/` 與 `system-prompt/` 之下，正是為了讓它們消費它而不形成環。`agent-loop` 是公開 `Agent` 約定的唯一具體實作，放在這裡因為它是 harness 的預設產品迴圈；它在 `ctx.agents.withInitiator()` 內執行每個 driver。擴充功能外掛依賴 `agent`——包括需要發起 Agent 時——而絕不直接依賴 `agent-loop`，因此迴圈保持可替換。[`dsh-base`](../../packages/bundle/base/README.zh.md) 是預設產品組合，[`dsh-sdk-minimal`](../../packages/bundle/sdk-minimal/README.zh.md) 則宣告一棵更小的獨立設定樹。

<a id="creation-and-ownership"></a>

## 建立與所有權

消費方透過 `ctx.agents` 建立 agent——`create()` 在一個呼叫方提供的 `SessionId` 下建置全新工作階段與 agent，`resume()` 先載入持久工作階段——或者透過迴圈的宣告式設定條目建立。程式設計式建立返回歸屬所有者的控制代碼：

原始碼：[`packages/core/agent/src/index.ts`](../../packages/core/agent/src/index.ts)

```ts type-equiv
/**
 * An owned agent plus its disposer, returned by {@link AgentRegistry.create} /
 * {@link AgentRegistry.resume}. The disposer is a CAPABILITY: among consumers,
 * only the holder can tear this agent down. The registered factory provider is
 * also a structural owner because the scoped agent depends on that provider's
 * service API; provider unload stops and drains every live handle it made.
 * `dispose()` stops the loop, awaits its exit, unregisters the agent, removes
 * its session from the store, and finally unwinds its scoped world.
 *
 * `ctx.agents.get(id)` still returns a bare {@link Agent} — the handle is
 * exposed only to the consumer owner that created it; the structural provider
 * reaches the same teardown internally. Config-created agents (the loop's own
 * startup) are owned by the loop fiber and never need a handle.
 */
interface AgentHandle {
  agent: Agent
  dispose(): Promise<void>
}
```

`CreateAgentOptions` 攜帶共享標識以及新 agent 釋出前所需的一切：可選的存活 `parentAgent`、工作階段中繼資料（`meta`——已驗證的 `cwd`、fork 譜系、`isSeeded` 標記、來源分類、委派深度與 `agentPreset`）、同級欄位 `inheritedEventCount` 所表示的精確 fork cut、可選的 `seed` 回放字首、按 agent 的 `AgentOptions`、僅建立期有效的取消 `signal`，以及 `setup`。`ResumeAgentOptions` 是持久標識的對應項：`resumeSessionId`、`parentAgent`、`agentOptions`、`signal` 與 `setup`。`setup` 回呼（`AgentSetup`）在兩個 id 均未釋出時接收 `(agentCtx, agent)`：上下文擁有作用域註冊，顯式 Agent 提供確切的子 Session，Context 無需反向屬性。凡經 `agentCtx` 註冊的內容都先於 `agent/created` 與第一次提示片語裝存在。Setup 可以返回在釋出前一刻呼叫的同步 commit；setup 拒絕、commit 丟擲或所有者 dispose（資源釋放）都會復原事務，兩個 id 均不釋出。

`AgentFactory` 是註冊表背後的建立介面：迴圈經 `ctx.agents.setFactory()` 註冊其工廠，因此消費方使用 `ctx.agents` 時無需依賴具體迴圈包。執行時子 Agent 的建立方設定 `options.parentAgent`；註冊表把 options 與呼叫方 Context 傳給工廠，不從其中一項推導另一項。確切的 `create`/`resume` 簽名及復原約定見下方[生成區塊](#ctxagents--agentregistry)。

<a id="the-agent-handle"></a>

## Agent 控制代碼

`Agent` 是每個外掛（UI、掛鉤、orchestrator）面向程式設計的 surface；`ctx.agents.get(id)` 返回它，[發起者作用域](#initiating-agent)攜帶它。具體實作為 dsh-agent-loop 包內部細節；迴圈外沒有任何元件依賴它。統一的 `send` 方法直接暴露 target 與 wakeup 路由；`followup`、`steer` 與 `inject` 是固定預設的別名方法。

原始碼：[`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

```ts type-equiv
/** Public live-agent handle; the runtime face augments its live capabilities. */
interface Agent {
  /** Session-backed Agent identity. */
  readonly id: SessionId
  /** The provider route and model this agent's requests use. */
  readonly options: AgentOptions
  /** The live session this agent drives; its log is the durable source of truth. */
  readonly session: Session
  /** Agent-owned access to durable pending work. */
  readonly inbox: Inbox
  /** The current lifecycle state, mirrored on every `agent/status` transition. */
  readonly status: AgentStatus
  /** Agent-scoped context; its contributions are agent-local, unwind on disposal, and reject registration afterward. */
  readonly ctx: Context

  /**
   * Clear queued and steering work — unless `keepInbox` — and abort the active
   * turn or between-turn task. The first cause wins for that activity. With no
   * active activity, cancellation is a no-op and does not arm later work.
   * @param cause - the stable caller intent carried by the active operation signal.
   * @param options - cancellation options; `keepInbox` preserves pending work.
   */
  cancel(cause: AgentCancelCause, options?: CancelOptions): void

  /**
   * Resolve after the current whole-agent activity reaches quiescence. This
   * follows replacement work started before the observed driver retires,
   * but does not identify the settlement of any particular message.
   * @returns fulfillment after no active driver or maintenance task remains.
   */
  whenIdle(): Promise<void>

  /**
   * Run one non-turn maintenance task from the true idle phase. The task starts
   * synchronously after claiming that phase; later waking input remains in the
   * inbox until the task settles, while public status stays `idle`.
   * `whenIdle()` follows both the task and any waking work released behind it.
   * @param task - operation whose fulfillment or rejection is preserved, with a signal aborted by {@link cancel}.
   * @throws synchronously when turn-driving or another maintenance task already owns the agent.
   * @returns the task promise.
   */
  runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>

  /**
   * Route identified input to an inbox boundary and optionally wake the driver.
   * Waking input submitted after active cancellation is queued for the next
   * turn and runs when the aborted activity converges to idle; a `disposed`
   * cancel leaves it parked. A wake submitted while already idle always opens
   * its turn boundary, even when its message is cleared before the driver
   * claims ([cancel-convergence wake latch](../../../../.agents/notes/implemented/bug-fix/2026-08-07-cancel-convergence-wake-latch.md)).
   * @param message - identified content and the source that supplied it.
   * @param target - the preferred next-turn or next-step inbox boundary.
   * @param wakeup - whether delivery may wake the driver.
   */
  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void

  /**
   * Queue an ordinary follow-up turn and wake the driver. The item becomes the
   * sole ordinary message of its own turn.
   * @param message - identified prompt content and the source that supplied it.
   */
  followup(message: UserMessage): void

  /**
   * Submit steering for the nearest step. An idle driver starts a turn;
   * a running driver consumes it at its next step boundary.
   * A rejected step leaves steering parked in the inbox until the next
   * wake; cancellation or disposal may discard pending steering.
   * @param message - identified steering content and the source that supplied it.
   */
  steer(message: UserMessage): void

  /**
   * Queue model-facing context for the next pre-step without waking the
   * driver. A running driver claims it at the nearest later step boundary;
   * idle drivers leave it pending until follow-up or steering
   * wakes them. It may miss a request whose pre-step already claimed its
   * batch. Cancellation or disposal may discard pending context.
   * @param message - identified injected context and the source that supplied it.
   */
  inject(message: UserMessage): void
}
```

```ts type-equiv
/**
 * An agent's lifecycle state, emitted on every transition as `agent/status`:
 * `idle` means no driver is active; `running` begins when waking input starts
 * cancellable pre-step processing and lasts while the driver drains,
 * closes, or checkpoints turns. Disposal removes the agent from its registry;
 * it is not a third observable status.
 */
type AgentStatus = 'idle' | 'running'
```

```ts type-equiv
/** One process-local live assistant streaming publication. */
type AssistantStreamFrame =
  | {
    readonly type: 'start'
    readonly attemptId: LlmAttemptId
    /** Monotone within one attached Agent lifecycle; replacement restarts at 1. */
    readonly revision: number
    readonly turn: number
    readonly step: number
  }
  | {
    readonly type: 'chunk'
    readonly attemptId: LlmAttemptId
    readonly revision: number
    /** Dense zero-based position within the attempt. */
    readonly index: number
    /** Safe-integer timestamp reused by the durable embedded stream. */
    readonly time: number
    readonly chunk: StreamChunk
  }
  | {
    readonly type: 'end'
    readonly attemptId: LlmAttemptId
    readonly revision: number
    /** Number of chunk frames emitted by this attempt. */
    readonly index: number
    /** Durable settlement committed before this notification, or live abandonment without one. */
    readonly outcome:
      | {
        readonly kind: 'committed'
        readonly eventType: 'assistant/message' | 'assistant/attempt'
        readonly seq: SessionSeq
      }
      | { readonly kind: 'abandoned' }
  }
```

`running` 描述整個驅動器的排空區間，可能跨越連續的排隊輪次；它不能證明某個輪次仍然開啟。dispose 會把 agent 從註冊表移除並行出 `agent/disposed`；它不是一個終態 status 值。`followup()` 不返回控制代碼：其 `MessageId` 標識的是持久的 inbox 插入、認領與丟棄事實，而非之後的助手輸出或輪次結束。`whenIdle()` 觀察的是整個 agent，因此只有當呼叫方明確擁有從回執到空閒的這段區間時，才能把它稱為一次 run（[決策](../../.agents/notes/implemented/architecture/2026-07-30-followup-enqueue-and-owned-runs.zh.md)）。

```ts type-equiv
/** Merge-extensible agent creation options. Persona belongs to system-prompt sections. */
interface AgentOptions {
  /** Provider route (must have a registered adapter at call time). */
  provider?: string
  /** Model id interpreted by the selected provider adapter. */
  model?: string
  /** Adapter-owned reasoning effort for the selected provider/model route. */
  reasoningEffort?: ReasoningEffortId
  /** Maximum output tokens for each conversation-model request. */
  maxTokens?: number
}
```

在 `agent/request` 之後，分發要求 `provider` 與 `model` 都存在。顯式 `reasoningEffort` 會為該路由的首次請求提供初始值；確切模型解析會驗證該值，省略時則允許填入介面卡預設值。提供 `maxTokens` 時，它必須是正安全整數，並限制每次對話模型請求的輸出；省略時，系統會在寫入請求 header 前填入確切模型的介面卡預設值，否則提供者行為保持不變。agent 作用域的 `deployment:persona-prefix` 提示詞段落可以遮蔽全域預設 persona。

inbox 即投遞詞彙——agent 以持久投影形式擁有的兩條有序待處理訊息列表：

```ts type-equiv
/** Agent-owned access to pending work; concrete storage belongs to the driver. */
interface Inbox {
  /** Prompts awaiting individual turns. */
  readonly nextTurn: readonly UserMessage[]
  /** Input awaiting the next step boundary. */
  readonly nextStep: readonly UserMessage[]

  /** Durably cancel all pending input, clearing next-step before next-turn. */
  clear(): void

  /**
   * Append one message to a pending list.
   * @param target - pending list to extend.
   * @param message - message to append.
   */
  append(target: InboxTarget, message: UserMessage): void

  /**
   * Prepend one message to a pending list.
   * @param target - pending list to extend.
   * @param message - message to prepend.
   */
  prepend(target: InboxTarget, message: UserMessage): void

  /**
   * Replace one pending message in place.
   * @param messageId - identity of the pending message to replace.
   * @param newMessage - replacement message.
   * @returns whether the message was still pending.
   */
  replace(messageId: MessageId, newMessage: UserMessage): boolean

  /**
   * Remove one pending message.
   * @param messageId - identity of the pending message to remove.
   * @returns whether the message was still pending.
   */
  remove(messageId: MessageId): boolean

  /**
   * Apply standard splice semantics and durably record the normalized result.
   * @param target - pending list to mutate.
   * @param start - splice position.
   * @param deleteCount - maximum number of messages to remove.
   * @param inserted - messages to insert at the resolved position.
   * @returns messages removed by the splice.
   */
  splice(
    target: InboxTarget,
    start: number,
    deleteCount: number,
    inserted: UserMessage[],
  ): UserMessage[]
}
```

```ts type-equiv
/** One of the two ordered pending-message lists owned by an agent. */
type InboxTarget = 'next-turn' | 'next-step'
```

每個待處理入隊項就是其 `UserMessage`；`MessageId` 是唯一標識。結構化 `Inbox` 方法會記錄規範化的持久 `agent/inbox/spliced` 變更，並拒絕重複的待處理 id。`replace(messageId, newMessage)` 與 `remove(messageId)` 透過 `MessageId` 跨兩份列表定位待處理訊息；替換可以改變標識，並先將舊訊息作為 discarded 釋出，再將新訊息作為 inserted 釋出。普通刪除和 `clear()` 都表示取消。在步驟邊界，dsh-agent-loop 包內部的 `ReactLoopInbox` 會透過純刪除 splice 移除擬進入步驟的批次——全部 `next-step` 輸入，外加輪次邊界上的一條 `next-turn` 訊息——且不發出 discarded 通知，隨後逐條發出 claimed 通知。僅供迴圈使用的待處理檢測與領取操作不屬於 `Agent.inbox`。`AgentLoop` 服務在釋出工廠之前註冊標準 `inbox` 投影；其 cell 是唯一 live 狀態，同一份摺疊在沒有 Agent 時也服務於冷消費方。該 fold 會拒絕不安全或越界的 splice 座標，以及跨兩份列表重複的標識，並透過事件 seq 指出格式錯誤的持久歷史。跟蹤單條訊息的消費方使用精確的 `agent/inbox/inserted`、`claimed` 與 `discarded` 通知。

取消：

```ts type-equiv
/** Options for {@link Agent.cancel}. */
interface CancelOptions {
  /**
   * Preserve queued and steering inbox items instead of discarding them. The
   * active turn is still aborted, but un-started and pending work survives for a
   * later turn and no canceled inbox splice is logged.
   */
  keepInbox?: boolean | undefined
}
```

```ts type-equiv
/** Why an active agent driver was cancelled. */
type AgentCancelCause =
  | { readonly kind: 'user' }
  | { readonly kind: 'parent' }
  | { readonly kind: 'hook'; readonly reason: string }
  | { readonly kind: 'disposed' }
```

cause 是由 TypeScript 強制約束的同程序輸入。活躍的取消持有者把同一個物件暴露為僅執行時的 `AbortSignal.reason`；signal 不授予協作監聽器任何分類權限。持久 `turn/end` 以 `{ kind: 'aborted', reason: TurnEndCancelCause }` 記錄結果，取消原因隨終態結果一起持久化。

[事件分類](../architecture.zh.md#events)負責 `agent/*` 生命週期、檢查點與 waterfall（瀑布式事件）約定。輪次和步驟邊界是持久工作階段事件，而不是 agent emit。

<a id="initiating-agent"></a>

## 發起 Agent

`ctx.agents` 攜帶的程序本地 initiator 就是上面的確切 `Agent`，不是單獨的 frame 或複製的標識。環境中存在該值既不能證明存活，也不代表授權；[initiator 作用域決策](../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.zh.md)定義其生命週期和作用域規則。

<a id="interception-decisions"></a>

## 攔截決策

pre-step 決策使用與持久 user-role 輸入相同、帶標識的 `UserMessage` 型別。進入步驟的批次具有權威性，並保留每條訊息的 `id` 和 `source`。掛鉤橋接層把其原生決策欄位對映到這一型別化結果上。

原始碼：[`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

`agent/pre-step` 接收一個 payload，攜帶獨佔的已領取批次（`messages`）、擬進入步驟的座標（`turn`、`step`）與目前輪次的取消 `signal`。首次提案在已開啟的輪次內、任何步驟開始前執行；工具 continuation 可以在步驟之間提交空的已領取批次：

它返回 `PreStepDecision`。reject 不會開啟步驟。enter 提供在 `step/start` 後追加的完整訊息批次；最終決策省略的已領取訊息保持已刪除，而領取後插入的輸入仍留待後續處理：

```ts type-equiv
/** Whether and with which messages the loop enters a proposed step. */
type PreStepDecision =
  | { kind: 'reject' }
  | {
    kind: 'enter'
    messages: UserMessage[]
    /** Start a distinct model-message series before this step's admitted messages. */
    startsRequestSeries?: true
  }
```

`agent/request-error` 在失敗的模型步驟關閉之後、其輪次關閉之前執行。listener 可以在失敗輪次的 signal 仍然存活時修復持久狀態或 await 策略工作。處理該錯誤的 listener 返回 `{ kind: 'retry' }` 且不呼叫 `next()`；預設的 `undefined` 會讓失敗保持終態。

```ts type-equiv
/** Action returned by a listener that owns model-request recovery. */
type RequestErrorAction = { kind: 'retry' } | undefined
```

`agent/pre-step` 是請求推導前唯一的 waterfall（瀑布式）監聽器鏈。`agent/turn-stopping` 在輪次沒有工具或 steering（中途引導）後續時執行，先於最後一次 steering 排空。

`agent/created` 攜帶 `SessionStartSource`（工作階段生命週期為何開始；橋接層據此匹配其 SessionStart）：

```ts type-equiv
/** Why a session lifecycle began; seeded creates are `startup`, while persisted loads are `resume`. */
type SessionStartSource = 'startup' | 'resume' | 'clear' | 'compact'
```

## 工作階段

`Session` 是一份型別化 `SessionEvent` 的**僅追加日誌**——唯一的真源。LLM 訊息歷史從日誌*派生*（`deriveMessages()`），而非單獨儲存。每個條目攜帶單調的 `seq`、`time` 與按 `type` 判別的 `data` payload；surface 變體還可以在 `sourceEventSeqs` 中列出被引用的較早事件，並攜帶 `surfaceOp`。

`SessionEvent` 信封的確切條件欄位、十三種核心事件變體（`turn/start`、`turn/end`、`step/start`、`step/end`、`user/message`、`system/message`、`assistant/message`、`assistant/attempt`、`tool/call`、`tool/result`、`request/header`、`request/context`、`session/end-seed`）、`deriveMessages()` 投影規則、`TurnEndReason` 原因以及執行封閉和獨立事件規則都在 **[session.md](session.zh.md)** 中。日誌如何持久化——`SessionPersistence` 介面、JSONL provider、`session/flush` 檢查點、崩潰恢復與 `SessionHeader`——則在 **[persistence.md](persistence.zh.md)** 中。

## `ToolDefinition`

唯一屬於核心的流水線編寫型別：每個已註冊工具*是什麼*——一個面向模型的 `ToolSchema` 加上一個 `execute` 函式，以及可選的最終內容回呼與 UI 回呼。工具作者很少手動建構它（`defineTool` DSL 會使用型別化參數建置），但它是註冊表儲存並由迴圈用於分發的約定。

其完整欄位、`defineTool`/`ValueSchemaSpec`/`ParameterSchemaSpec` 型別化 schema DSL、`ToolExecution`/`ToolExecutionResult` waterfall 型別，以及工具展示 UI 型別都在 **[tools.md](tools.zh.md)** 中。

## 全倉通用型別模式

兩個模式在每個子系統中反覆出現，只在此處記錄一次。

<a id="the-map--derived-union-pattern"></a>

### `…Map → derived-union` 模式

harness 中幾乎所有可擴充功能的和型別都遵循同一模式：一個以判別標籤為鍵的介面（`…Map`），聯合型別由 `keyof` 派生。外掛透過**宣告合併**新增變體——無需修改擁有該型別的包。

```ts ignore-check
// The pattern, schematically:
interface ThingMap {
  'a': { kind: 'a'; /* … */ }
  'b': { kind: 'b'; /* … */ }
}
type ThingKind = keyof ThingMap          // 'a' | 'b'
type Thing = ThingMap[keyof ThingMap]    // the discriminated union

// A plugin extends it without touching the source package:
declare module '@deepseek-ai/dsh-llm' {
  interface ThingMap {
    'c': { kind: 'c'; /* … */ }
  }
}
```

五個規範 map 使用此模式；外掛作者擴充功能它們：

| Map | 包 | 派生 | 目錄 |
|---|---|---|---|
| `ContentBlockMap` | dsh-llm | `ContentBlock` | [llm-streaming.md](llm-streaming.zh.md#content-blocks-and-messages) |
| `MessageSourceMap` | dsh-llm | `MessageSource` | [llm-streaming.md](llm-streaming.zh.md#content-blocks-and-messages) |
| `FinishReasonMap` | dsh-llm | `FinishReason` | [llm-streaming.md](llm-streaming.zh.md#the-model-request-and-result) |
| `TurnEndReasonMap` | dsh-session | `TurnEndReason` | [session.md](session.zh.md) |
| `SessionEventMap` | dsh-session | `SessionEvent` | [session.md](session.zh.md) |

消費方最常 `switch` 的兩個大型判別聯合型別是：**`StreamChunk`**（流式協定）和 **`SessionEvent`**（日誌條目）。按儲存庫約定，對標籤做 `switch`——不要鏈式 `if`——這樣每個分支都能窄化型別，拼錯的標籤會編譯失敗。

<a id="branded-ids"></a>

### 品牌化 ID

在包之間傳遞的 ID 都經過**品牌化**——結構上是字串，但在型別層面不可互換（不能把 `SessionId` 傳給需要 `ToolCallId` 的位置）。建構使用共享 `brandString<T>()` helper 或所屬方自定義的驗證工廠；比較、日誌記錄和 JSON 行為與普通字串相同。

`Branded<B>` 原語與無狀態建構函式位於 [dsh-brand](../../packages/util/brand)，該包不依賴 harness 能力。`brandString<T>()` 應用僅編譯期存在的字串品牌。

原始碼：[`packages/util/brand/src/index.ts`](../../packages/util/brand/src/index.ts)

```ts type-equiv
/** A string carrying a compile-time-only brand `B`. */
type Branded<B extends string> = string & { readonly [BRAND]: B }
```

兩個核心 ID 是 `ToolCallId`（關聯工具呼叫及其結果；dsh-llm）和 `SessionId`（活躍 agent 與持久工作階段共享的標識；dsh-session）。能力包也會品牌化各自的 id，例如 [jobs.md](jobs.zh.md) 中的 `JobId`。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentdefaultmodel--agentdefaultmodelconfig"></a>

### `ctx.agentDefaultModel` — `AgentDefaultModelConfig`

Owns the default model selection independently of any Host or transport. Each operation reads the owning Config references.

```ts cordis-catalog
/**
 * Read the current default model selection.
 * @returns a detached provider, model, and optional reasoning selection.
 */
currentSelection(): ModelSelection

/**
 * Save the complete default model selection. A deployment without a configuration
 * editor keeps its composition entry. Saves commit in submission order; a failed
 * save rejects its caller without blocking later saves.
 * @param next - resolved selection accepted by an entry point.
 * @returns fulfillment after the optional profile write settles.
 */
async saveSelection(next: ModelSelection): Promise<void>
```

Source: [`packages/core/agent-default-model/src/index.ts`](../../packages/core/agent-default-model/src/index.ts)

<a id="ctxagentloop--agentloop"></a>

### `ctx.agentLoop` — `AgentLoop`

Concrete agent factory and driver service.

```ts cordis-catalog
/**
 * Create an agent and session under one caller-supplied identity, owned by
 * the accessing fiber. Constructor-driven config calls mint a fresh combined
 * id before entering this boundary. When a persistence backend is mounted,
 * the session's durable identity and any seed are stored before publication.
 * @param id - shared agent/session identity.
 * @param options - concrete loop options.
 * @param meta - optional fresh-session workspace metadata.
 * @returns the published running agent.
 */
async create(id: SessionId, options: AgentOptions = {}, meta: Pick<SessionHeader, 'cwd'> = {}): Promise<Agent>

/**
 * Create an owned agent on a caller-supplied session id.
 * @param ownerCtx - caller context that structurally owns the lifecycle.
 * @param options - identities, optional live parent, session seed/metadata, loop options, setup, and cancellation.
 * @returns the published handle.
 */
async createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>

/**
 * Resume an owned agent from the configured persistence service.
 * @param ownerCtx - caller context that owns load, setup, and the live lifecycle.
 * @param options - persisted identity, optional live parent, loop options, setup, and cancellation.
 * @returns the published handle.
 */
async resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>
```

Types: [SessionHeader](persistence.zh.md)

Source: [`packages/core/agent-loop/src/index.ts`](../../packages/core/agent-loop/src/index.ts)

<a id="ctxagentpresets--agentpresetregistry"></a>

### `ctx.agentPresets` — `AgentPresetRegistry`

Registry of YAML-declared presets and the revisions live Agents retain.

```ts cordis-catalog
/** Register and eagerly load a definition; activation failure remains visible in the roster.
 * @param definition Parsed configuration supplied by the declaring plugin.
 * @returns Definition disposer after activation or its diagnostic settles; the declaring plugin owns it.
 */
async register(definition: PresetDefinition): Promise<() => Promise<void>>

/** Read every declared preset, including activation failures.
 * @returns Display metadata and loading diagnostics.
 */
async list(): Promise<AgentPreset[]>

/** Read the selection roster.
 * @returns Current presets, each marked when it is the default.
 */
@Remote('list') async remoteExportList(): Promise<AgentPresetRoster>

/** Resolve an identity without starting an Agent.
 * @param id Explicit preset or the current default.
 * @returns Current metadata, including failure when activation failed.
 */
async resolve(id?: string): Promise<AgentPreset>

/** Read one declaration's child plugin list as YAML, for viewing only.
 * @param agentPreset Preset identity.
 * @returns The declared composition beside its published metadata.
 */
@Remote('read') readDocument(agentPreset: string): Promise<AgentPresetDocument>

/** Bind an unpublished Agent to the current preset revision.
 * @param ctx Agent context from its setup callback.
 * @param id Requested preset, or the default.
 * @returns Bound preset identity.
 */
async mount(ctx: Context, id?: string): Promise<AgentPreset>

/** Join a child to the exact revision retained by its parent.
 * @param ctx Child Agent context.
 * @param parent Parent Agent context.
 * @returns Inherited preset id, or undefined in a preset-free composition.
 */
composeFrom(ctx: Context, parent: Context): string | undefined

/** Read the preset a live Agent uses.
 * @param ctx Agent context.
 * @returns Its preset id, if bound.
 */
composedPreset(ctx: Context): string | undefined

/** Read a service supplied inside an Agent's isolated preset group.
 * @param agent Agent whose composition is queried.
 * @param name Cordis service name.
 * @returns The service, or undefined.
 */
serviceFor<K extends string & keyof Context>(agent: { ctx: Context }, name: K): Context[K] | undefined

/** Rebind a blank Agent; the caller owns the blank-session check.
 * @param ctx Agent context.
 * @param id Requested preset.
 * @returns The bound identity.
 */
async recompose(ctx: Context, id: string): Promise<AgentPreset>

/** Select a preset before a session starts its first turn.
 * @param agent Target Agent.
 * @param agentPreset Requested identity.
 * @returns Committed preset identity.
 */
@Remote('select') async select(agent: Agent, agentPreset: string): Promise<string>

/** Read current registrations for cold transcript presentation.
 * @param id Preset identity or the default.
 * @returns A revision lease; dispose it after the scoped read completes.
 */
async acquireScope(id?: string): Promise<{ key: ScopeKey } & AsyncDisposable>

/** Read plugin rows without creating an Agent.
 * @returns Current declaration metadata and activation states.
 */
compositionInventory(): Promise<AgentPresetComposition[]>
```

Types: [ScopeKey](scope.zh.md)

Source: [`packages/preset/agent-preset-registry/src/index.ts`](../../packages/preset/agent-preset-registry/src/index.ts)

<a id="ctxagents--agentregistry"></a>

### `ctx.agents` — `AgentRegistry`

Agent service (`ctx.agents`): tracks live agents and carries the initiating Agent through one process-local asynchronous driver chain. Agent *creation* is provided by whichever plugin implements the AgentFactory (`@deepseek-ai/dsh-agent-loop`), registered via setFactory.

Initiator methods provide same-process causal attribution only. Ambient presence is neither liveness proof nor authorization; subjects and owners remain explicit, as does identity at worker, process, persistence, and wire boundaries. Returned Promise boundaries drain during teardown, except a nested lineage that starts an owning-fiber unload is excluded from its own drain.

```ts cordis-catalog
/**
 * Read the Agent that initiated the inherited asynchronous driver chain.
 * Use this optional form for logging, tracing, metrics, or host attribution
 * that also supports agentless calls. When a parent creates a child, setup
 * reports the causal parent while the setup callback's Agent parameter
 * identifies the child.
 * @returns the inherited Agent, or `undefined` outside an initiator boundary
 *   and inside an explicit clearing boundary.
 * @throws when this service instance has been disposed.
 */
currentInitiator(): Agent | undefined

/**
 * Read the initiating Agent and fail when no initiator boundary is active.
 * Use this for private helpers contractually below a driver, or for a
 * deployment-owned outbound request whose contract forbids agentless calls.
 * Generic or direct-call paths use optional lookup or explicit request fields.
 * @returns the inherited Agent.
 * @throws when no initiator is active or this service instance has been disposed.
 */
requireInitiator(): Agent

/**
 * Run an operation with one exact Agent as its process-local initiator. The
 * exact synchronous value or Promise returned by the operation is preserved.
 * Custom drivers and test harnesses wrap their complete returned foreground
 * lifetime.
 * A queue or wire receiver may establish this boundary only after validating
 * explicit identity and resolving the exact live Agent; this method does neither.
 * Detached work remains owned by the subsystem that starts it.
 * @param agent - initiating Agent to inherit; presence is neither liveness proof nor authorization.
 * @param operation - synchronous or asynchronous operation to invoke.
 * @returns the exact value returned by `operation`.
 * @throws when the initiator scope is closing/disposed, or when `operation` throws.
 */
withInitiator<T>(agent: Agent, operation: () => T): T

/**
 * Run an operation inside a boundary that hides any inherited initiating
 * Agent. The exact synchronous value or Promise is preserved.
 * Use this while creating lazy shared timers, queue pumps, pool maintenance,
 * watchers, or exporters so they do not inherit the first Agent that happens
 * to initialize them. It clears only initiator attribution, not explicit
 * fields, and does not own or drain detached resources.
 * @param operation - synchronous or asynchronous operation to invoke without an initiator.
 * @returns the exact value returned by `operation`.
 * @throws when the initiator scope is closing/disposed, or when `operation` throws.
 */
withoutInitiator<T>(operation: () => T): T

/**
 * Register the agent-creation factory (the loop calls this on construction,
 * effect-scoped). A traced Cordis service is canonicalized to its concrete
 * target; each create/resume call is then traced through that caller's
 * context so ownership follows the caller without stacking proxy layers.
 * Throws if a factory is already registered. Returns the disposer; on
 * dispose the factory slot is cleared.
 * @param factory - the loop-owned factory {@link create}/{@link resume} delegate to.
 * @returns the disposer that clears the factory slot. The exact
 *   Cordis effect disposer (single-shot): composite (generator) effects may
 *   yield it directly — exact identity nests the teardown in order.
 */
setFactory(factory: AgentFactory): () => void

/**
 * Create and publish a new agent through the registered factory.
 * Distinct from {@link register} (which records an already-constructed
 * agent): this constructs the agent and its session. Rejects if no factory is
 * registered or creation/setup fails. The resolved {@link AgentHandle} lets
 * the owner tear down exactly this agent.
 * @param options - shared identity, optional live parent, session seed/metadata, and agent options.
 * @returns the handle after setup, rollback-covered publication, and loop start complete.
 */
async create(options: CreateAgentOptions): Promise<AgentHandle>

/**
 * Load a persisted session and resume an agent on it through the registered
 * factory. Rejects if no factory is registered; the factory rejects if
 * session persistence is not configured or persistence/setup fails.
 * @param options - persisted identity, optional live parent, configuration, and setup.
 * @returns the handle after setup, rollback-covered publication, and loop start complete.
 */
async resume(options: ResumeAgentOptions): Promise<AgentHandle>

/**
 * Register a live agent with source `startup`. Rejects if the id is already registered or a
 * serial `agent/created` listener fails. Emits `agent/disposed`
 * when the calling fiber is disposed — both with the agent's scope carrier
 * (`scopeTarget(agent, agent)`): the subject is the agent in hand, so the
 * emits are scope-filtered regardless of which context invoked `register`
 * (calling through `agent.ctx` scopes EFFECTS; dispatch scoping always
 * requires passing the carrier). The entry is a runtime root; factory-backed
 * creation uses `options.parentAgent` for child ownership. Await the registration before using the agent.
 * @param agent - the already-constructed agent to record in the store.
 * @returns the awaitable Cordis effect disposer (single-shot; a repeat call
 *   returns undefined without awaiting an in-flight teardown). Exact
 *   identity is load-bearing: a composite (generator) effect that owns a
 *   teardown ORDER — the agent factory's lifecycle chain — must yield THIS
 *   function so Cordis nests the unregistration at that yield position;
 *   yielding a wrapper would leave it disposing as a concurrent sibling on
 *   owner unload, unregistering the agent (and emitting `agent/disposed`)
 *   while its final turn is still draining.
 */
register(agent: Agent): ReturnType<Context['effect']>

/**
 * Insert an already-constructed agent without announcing it. This is the
 * advanced ordered-lifecycle primitive used by the async agent factory: it
 * first completes setup while the agent is unpublished, then assigns the
 * returned detach closure into its pre-installed composite teardown before
 * calling {@link announce}. Ordinary callers use {@link register}.
 * @param agent - the prepared, unpublished agent.
 * @param owner - explicitly supplied live runtime owner, or
 *   undefined for a top-level runtime root. This is runtime ownership, not
 *   the resumed session's durable parent lineage.
 * @returns an idempotent closure that removes this exact entry and emits
 *   `agent/disposed` with listener failures contained. When called from a
 *   `agent/created` listener, removal and disposal wait until the serial
 *   creation dispatch settles.
 */
enter(agent: Agent, owner: Agent | undefined): () => void

/**
 * Announce an agent previously inserted with {@link enter}.
 * @param agent - the live inserted agent to announce.
 * @param source - fresh creation, resume, clear, or compaction source.
 * @param signal - optional factory initialization cancellation signal passed to listeners.
 * @returns completion of the serial creation listeners; a listener failure rejects.
 * @throws if `agent` is not the exact live registry entry for its id, or its
 *   creation announcement already began (including a reentrant call from a
 *   creation listener).
 */
async announce(agent: Agent, source: SessionStartSource, signal?: AbortSignal): Promise<void>

/**
 * Look up a live agent.
 * @param id - the shared agent/session id to look up.
 * @returns the agent, or undefined when no live agent has that id.
 */
get(id: SessionId): Agent | undefined

/**
 * Test whether a live agent was created through one exact parent agent's
 * scoped context. Runtime ownership is independent of durable session
 * lineage and remains unambiguous when unrelated providers reuse an id.
 * @param id - the candidate child agent's shared agent/session id.
 * @param owner - the expected runtime creator agent.
 * @returns true only while the exact child entry is live under that owner.
 */
isOwnedBy(id: SessionId, owner: Agent): boolean

/**
 * All live agents, in registration order.
 * @returns a fresh array; mutating it does not affect the registry.
 */
list(): Agent[]

/**
 * All live top-level agents in registration order. A top-level agent was
 * created without an owning agent context; durable session lineage does not
 * affect this runtime relation, so a resumed fork may still be a root.
 * @returns a fresh array; mutating it does not affect the registry.
 */
roots(): Agent[]
```

Source: [`packages/core/agent/src/index.ts`](../../packages/core/agent/src/index.ts)

<a id="agent-events"></a>

### `agent/*` events

<a id="agentassistant-stream--emit"></a>

#### `agent/assistant-stream` — emit

Process-local assistant-stream publication. Chunk frames are transient; the loop appends one final v2 `assistant/message` or `assistant/attempt` with the same stream before a committed end frame.

```ts cordis-catalog
/**
 * Process-local assistant-stream publication. Chunk frames are transient;
 * the loop appends one final v2 `assistant/message` or `assistant/attempt`
 * with the same stream before a committed end frame.
 * @param payload.agent - the agent whose attempt produced the frame.
 * @param payload.frame - one ordered start, chunk, or end publication.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/assistant-stream'(this: Scoped<Agent>, payload: { agent: Agent; frame: AssistantStreamFrame }): void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentcreated--serial"></a>

#### `agent/created` — serial

An entered agent is ready for per-agent initialization after factory setup. Listeners run in order and are awaited before creation resolves. AgentLoop holds queued input until all listeners finish. A throw or rejection fails creation and skips later listeners. Disposal retains the scope and session until dispatch settles; listeners must not await agent.whenIdle() or their own owner's disposal.

```ts cordis-catalog
/**
 * An entered agent is ready for per-agent initialization after factory setup.
 * Listeners run in order and are awaited before creation resolves. AgentLoop
 * holds queued input until all listeners finish. A throw or rejection fails
 * creation and skips later listeners. Disposal retains the scope and session
 * until dispatch settles; listeners must not await agent.whenIdle() or their
 * own owner's disposal.
 * @param payload.agent - the newly registered agent with its live session and completed setup.
 * @param payload.source - fresh creation, resume, clear, or compaction source.
 * @param payload.signal - factory initialization cancellation signal, when provided.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode serial
 */
'agent/created'(this: Scoped<Agent>, payload: { agent: Agent; source: SessionStartSource; signal?: AbortSignal }): undefined | Promise<undefined>
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentdisposed--emit"></a>

#### `agent/disposed` — emit

An agent left the registry; AgentLoop emits this after driver quiescence and scoped-registration unwind, but before session detachment. Custom registry users own their driver-ordering contract.

```ts cordis-catalog
/**
 * An agent left the registry; AgentLoop emits this after driver quiescence
 * and scoped-registration unwind, but before session detachment. Custom
 * registry users own their driver-ordering contract.
 * @param payload.agent - the exact agent removed from the registry.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/disposed'(this: Scoped<Agent>, payload: { agent: Agent }): void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agenterror--emit"></a>

#### `agent/error` — emit

A step or turn errored. The machine reports a failure here even when the error has no in-turn position for a durable record.

```ts cordis-catalog
/**
 * A step or turn errored. The machine reports a failure here even when
 * the error has no in-turn position for a durable record.
 * @param payload.agent - the agent whose turn errored.
 * @param payload.turn - the turn in which the failure surfaced.
 * @param payload.step - the step at which the failure surfaced.
 * @param payload.error - the failure, verbatim.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; error: unknown }): void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxclaimed--emit"></a>

#### `agent/inbox/claimed` — emit

One message left the inbox inside its open turn. If the proposed step is rejected, the claimed message ends here: it is neither discarded nor re-emitted as a user/message, and the turn closes without a step.

```ts cordis-catalog
/**
 * One message left the inbox inside its open turn. If the proposed step
 * is rejected, the claimed message ends here: it is neither discarded nor
 * re-emitted as a user/message, and the turn closes without a step.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the claimed message.
 * @param payload.turn - the owning turn.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/claimed'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage; turn: number }): void
```

Types: [Scoped](scope.zh.md) · [UserMessage](session.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxdiscarded--emit"></a>

#### `agent/inbox/discarded` — emit

One message was discarded from the live inbox.

```ts cordis-catalog
/**
 * One message was discarded from the live inbox.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the discarded message.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/discarded'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void
```

Types: [Scoped](scope.zh.md) · [UserMessage](session.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxinserted--emit"></a>

#### `agent/inbox/inserted` — emit

One message entered the live inbox.

```ts cordis-catalog
/**
 * One message entered the live inbox.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the inserted message.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/inserted'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void
```

Types: [Scoped](scope.zh.md) · [UserMessage](session.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentpre-step--waterfall"></a>

#### `agent/pre-step` — waterfall

Reject a proposed step or replace the messages that enter it. Calling `next()` preserves the current messages.

```ts cordis-catalog
/**
 * Reject a proposed step or replace the messages that enter it. Calling
 * `next()` preserves the current messages.
 * @param payload.agent - the agent proposing the step.
 * @param payload.messages - messages removed from the inbox for this step.
 * @param payload.turn - the turn that will own the step.
 * @param payload.step - the step proposed by the loop.
 * @param payload.signal - the current turn's cancellation signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
 */
'agent/pre-step'(this: Scoped<Agent>, payload: { agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
```

Types: [Scoped](scope.zh.md) · [UserMessage](session.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentrequest--waterfall"></a>

#### `agent/request` — waterfall

Replace the frozen call configuration. `await next()` yields the config the machine would use (agent options on the first request, the logged header afterwards); return a replacement to switch. On step admission, this runs after assembly and `step/start`, before the system prompt and accepted user batch are committed. Cancellation here or during subsequent `prepareCall()` resolution commits neither. The prepared call capability governs prompt admission. Model-visible content must use logged channels; this waterfall cannot mutate messages.

```ts cordis-catalog
/**
 * Replace the frozen call configuration. `await next()` yields the config
 * the machine would use (agent options on the first request, the logged
 * header afterwards); return a replacement to switch. On step admission,
 * this runs after assembly and `step/start`, before the system prompt and
 * accepted user batch are committed. Cancellation here or during subsequent
 * `prepareCall()` resolution commits neither. The prepared call capability
 * governs prompt admission. Model-visible content must use logged channels;
 * this waterfall cannot mutate messages.
 * @param payload.agent - the agent making the model call.
 * @param payload.turn - the open turn number.
 * @param payload.step - the step whose request this is.
 * @param payload.signal - the current turn's explicit abort signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
*/
'agent/request'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; signal: AbortSignal }, next: () => Promise<LlmCallConfig>): Promise<LlmCallConfig>
```

Types: [LlmCallConfig](llm-streaming.zh.md) · [Scoped](scope.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentrequest-error--waterfall"></a>

#### `agent/request-error` — waterfall

Handle one failed model-request attempt before the loop retries or closes its step. A listener returns `{ kind: 'retry' }` without calling `next()` when it owns recovery, or calls `next()` to delegate. The default `undefined` leaves the failure terminal.

```ts cordis-catalog
/**
 * Handle one failed model-request attempt before the loop retries or closes
 * its step. A listener returns `{ kind: 'retry' }` without calling `next()`
 * when it owns recovery, or calls `next()` to delegate. The default
 * `undefined` leaves the failure terminal.
 * @param payload.agent - the agent whose request failed.
 * @param payload.turn - the turn containing the failed request.
 * @param payload.step - the step containing the failed request attempt.
 * @param payload.provider - the provider selected for the failed request.
 * @param payload.failure - serializable facts normalized at the final adapter boundary.
 * @param payload.retryPolicy - the policy of the adapter registration that served the failed request.
 * @param payload.signal - the turn abort signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
 */
'agent/request-error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; provider: string; failure: LlmFailure; retryPolicy: ResolvedRetryPolicy | undefined; signal: AbortSignal }, next: () => Promise<RequestErrorAction>): Promise<RequestErrorAction>
```

Types: [LlmFailure](llm-streaming.zh.md) · [ResolvedRetryPolicy](llm-streaming.zh.md) · [Scoped](scope.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentstatus--emit"></a>

#### `agent/status` — emit

Agent status changed (`idle` ⇄ `running`). A waking delivery enters `running` synchronously after reserving cancellation; `idle` means no driver remains scheduled or active.

```ts cordis-catalog
/**
 * Agent status changed (`idle` ⇄ `running`). A waking delivery enters
 * `running` synchronously after reserving cancellation; `idle` means no
 * driver remains scheduled or active.
 * @param payload.agent - the agent whose status flipped.
 * @param payload.status - the status just entered (the transition's destination).
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/status'(this: Scoped<Agent>, payload: { agent: Agent; status: AgentStatus }): void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentturn-stopping--serial"></a>

#### `agent/turn-stopping` — serial

The turn is about to close: the model owes no response (no live tool calls, no fresh steering). Awaited before the boundary commits — a listener that objects steers (`agent.steer(...)`) and the machine re-reads its inbox: fresh steering runs another step, none closes the turn. Data decides, so listener order cannot change the outcome. The inverse control (stop a tool loop early) is data too: a tool result carrying `concludesTurn` ends the turn at its step. The conclusion never short-circuits already-submitted next-step work: same-step `additionalContexts` or racing steering still runs, and the turn closes only when that inbox drains.

```ts cordis-catalog
/**
 * The turn is about to close: the model owes no response (no live tool
 * calls, no fresh steering). Awaited before the boundary commits — a
 * listener that objects steers (`agent.steer(...)`) and the machine
 * re-reads its inbox: fresh steering runs another step, none closes the
 * turn. Data decides, so listener order cannot change the outcome. The
 * inverse control (stop a tool loop early) is data too: a tool result
 * carrying `concludesTurn` ends the turn at its step. The conclusion
 * never short-circuits already-submitted next-step work: same-step
 * `additionalContexts` or racing steering still runs, and the turn
 * closes only when that inbox drains.
 * @param payload.agent - the agent whose turn is at its stop boundary.
 * @param payload.turn - the turn about to close.
 * @param payload.signal - the current turn's explicit abort signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode serial
 */
'agent/turn-stopping'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; signal: AbortSignal }): Promise<void> | void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agent-loop-events"></a>

### `agent-loop/*` events

<a id="agent-loopconfig-start-failed--emit"></a>

#### `agent-loop/config-start-failed` — emit

A declarative agent entry failed before it could publish a live agent. Consumers that buffer work for the configured identity use this transient signal to reject that work instead of waiting forever. Normal factory teardown suppresses failures from the cancelled startup attempt.

```ts cordis-catalog
/**
 * A declarative agent entry failed before it could publish a live agent.
 * Consumers that buffer work for the configured identity use this
 * transient signal to reject that work instead of waiting forever. Normal
 * factory teardown suppresses failures from the cancelled startup attempt.
 * @param payload.sessionId - exact shared agent/session identity that failed startup.
 * @param payload.error - persistence, setup, or publication failure.
 * @mode emit
 */
'agent-loop/config-start-failed'(payload: { sessionId: SessionId; error: unknown }): void
```

Source: [`packages/core/agent-loop/src/index.ts`](../../packages/core/agent-loop/src/index.ts)

<a id="agent-preset-events"></a>

### `agent-preset/*` events

<a id="agent-presetselected--emit"></a>

#### `agent-preset/selected` — emit

One session committed a different agent preset to its durable log. Consumers invalidate only state derived from that session's composition.

```ts cordis-catalog
/**
 * One session committed a different agent preset to its durable log.
 * Consumers invalidate only state derived from that session's composition.
 * @mode emit
 * @param sessionId - the session whose composition changed.
 * @param agentPreset - the preset recorded by the committed selection.
 */
'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
```

Source: [`packages/preset/agent-preset-registry/src/types.ts`](../../packages/preset/agent-preset-registry/src/types.ts)
<!-- END GENERATED cordis-surface -->
