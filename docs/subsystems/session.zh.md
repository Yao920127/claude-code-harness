# 工作階段

[English](session.md) | 中文

[dsh-session](../../packages/core/session) 的記憶體事件溯源模型。`Session` 是一份由型別化 `SessionEvent` 組成的**僅追加日誌**，是 agent（智慧代理）完整互動歷史的唯一真源。LLM（大語言模型）訊息歷史從日誌*派生*而來，從不單獨儲存；回放即從同一組事件重新派生。日誌如何實作**持久化**（持久化 seam、後端、崩潰恢復）是兄弟文件 [persistence.md](persistence.zh.md) 的關注點。

原始碼：[`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

## `SessionEventMap`：事件詞彙

僅追加的事件型別。可透過宣告合併擴充功能：外掛透過 declaration merging 宣告額外的事件型別。例如[壓縮（compaction） seam](compaction.zh.md) 新增了 `compaction/start` / `compaction/summary` / `compaction/end`，`@deepseek-ai/dsh-hook-protocol` 為掛鉤橋接新增了僅記錄日誌的 `hook/invoked` / `hook/result` 記錄。與 `compaction/*` 一樣，這些都不是 `SurfaceEventType`（沒有 `surfaceOp`）。生成的[持久化日誌事件目錄](../persistence-catalog.zh.md)列舉了所有成員（核心與合併擴充功能的），包含其 payload、surface 標記與宣告位置。

```ts type-equiv
/** A user-role specialization of the shared message representation. */
interface UserMessage extends MessageBase {
  readonly role: 'user'
}
```

```ts type-equiv
/**
 * The merge-extensible, append-only source of truth for an agent interaction.
 * Message history is derived from this log. Every event is lossless JSON and
 * sequence numbers stay contiguous. Assistant attempt events embed their exact
 * compact raw streams so persistence stores one durable settlement per attempt.
 */
interface SessionEventMap {
  /**
   * Opens turn `turn` before the loop claims queued input or runs pre-step.
   * Rejection, empty input, cancellation, or failure may close it with no
   * step; otherwise the following identified `user/message` event or batch
   * records the messages entering the step.
   */
  'turn/start': { turn: number }
  /**
   * Closes turn `turn` with the {@link TurnEndReason} that ended it. A turn
   * with no entered step has no `step/start` or `step/end`. The loop does not await a
   * flush at turn boundaries: `dsh-session-checkpoint-policy` owns the
   * per-request durability checkpoint, and consumers that read storage after
   * `whenIdle()` flush themselves. Success commits the turn; rejection is
   * reported live and does not prevent later work.
   */
  'turn/end': { turn: number; reason: TurnEndReason }
  /** Opens step `step` of turn `turn` — one model call plus the tool executions it requested. */
  'step/start': { turn: number; step: number }
  /** Closes step `step` of turn `turn`. */
  'step/end': { turn: number; step: number }
  /**
   * A user-role message on the model-visible surface: a direct human prompt
   * (the queued message claimed for this turn), a synthetic `agent.inject()`
   * context (file-change notices, subdir AGENTS.md, skill content, cron
   * notifications, …), or an entered goal continuation round. All three
   * project their `content` verbatim; `source` tells them apart.
   */
  'user/message': UserMessage
  /** An incremental agent session change admitted at the named turn and step. */
  'developer/message': {
    turn: number
    step: number
    message: DeveloperMessage
    /** Earlier request/header defining every tool addition; required exactly when additions are present. */
    headerSeq?: SessionSeq
  }
  /**
   * The rendered system prompt on the model-visible surface. The loop appends
   * the first one as surface node 0 before the step's first `user/message`.
   * A prepared in-history route can append nonempty changes in a continuing
   * series. An incapable route or new series normalizes text to the first system
   * node. Normalization empties nonempty later nodes, then rewrites the head if
   * needed, through logged per-node replacements. An empty rendering always
   * clears all active system nodes, leaving no older instructions model-visible.
   * Empty later nodes are dormant and project to no message; an empty head with
   * no active later node records "no system prompt". Restored nonempty text follows
   * the same route and series rule; empty nodes never restore older text.
   */
  'system/message': { turn: number; step: number; message: SystemMessage }
  /**
   * Assembled assistant message for one step (derived history uses this).
   * Carries the step's `usage` when the adapter reported token accounting, so
   * the model output and its accounting travel together (there is no separate
   * usage record). `usage` is absent when the adapter reported none. A turn
   * cancelled mid-stream finalizes its delivered text/reasoning prefix as this
   * event with `interrupted: true`; undispatched tool calls are absent. The
   * marker distinguishes that prefix without re-deriving interruption from turn
   * boundaries. An aborted turn with no such event streamed no visible content.
   */
  'assistant/message': {
    turn: number
    step: number
    message: AssistantMessage
    /** Exact timed model stream, compacted without joining delta boundaries. */
    stream: AssistantStreamRecord[]
    usage?: TokenUsage
    interrupted?: true
  }
  /**
   * One model attempt that committed no surface message. The embedded stream
   * preserves a failed, retried, cancelled, or stream-error attempt that
   * reached settlement without fabricating model-visible history.
   */
  'assistant/attempt': { turn: number; step: number; stream: AssistantStreamRecord[] }
  /**
   * The model requested one tool invocation: `name` with the raw `arguments`
   * JSON string exactly as the model produced it (unparsed). `callId` pairs the
   * call with its `tool/result`.
   */
  'tool/call': { turn: number; step: number; callId: ToolCallId; name: string; arguments: string }
  /**
   * A completed tool call's model-facing result, optional internal failure
   * identity and user-facing reason, and optional tool-private `meta`
   * presentation payload. The reason remains outside the model-facing message.
   * `meta` is
   * opaque to the core (the producing tool owns its shape and reads it back in
   * `presentResult`) but MUST be JSON-serializable: `Session.append`
   * runtime-validates all event data with `isJsonValue`, so a non-serializable
   * `meta` is rejected at the source, and the durable log reproduces the
   * identical card on replay. Absent
   * unless the tool attaches one (e.g. `dsh-tool-fs` carries its result-time
   * contextual diff here).
   */
  'tool/result': {
    turn: number
    step: number
    message: ToolResultMessage
    /**
     * Optional failure identity and raw user-facing reason, outside model content;
     * allowed only when the message has `isError: true`.
     */
    error?: { name: string; code: string; reason?: string }
    meta?: JsonValue
  }
  /**
   * Full header for the next request, appended inside its step before dispatch.
   * It is log-only; the latest snapshot reconstructs the request header.
   */
  'request/header': {
    header: EpochHeader
    reason: RequestHeaderReason
    /** This request begins a distinct model-message series, independently of the header reason. */
    startsSeries?: true
  }
  /**
   * Route metadata for the next request, logged only when the route, capacity,
   * or system prompt update mode changes. It does not participate in request
   * reconstruction or header equality. Prompt admission uses the bound prepared
   * call's capability, not this snapshot from an earlier request.
   */
  'request/context': RequestContext
  /**
   * Separates inherited or restored history from later lifecycle-owned work.
   * This log-only marker need not be at {@link Session.firstLiveSeq}: a fork
   * seed can already contain its tagged marker and child-owned synthetic
   * closers before construction.
   *
   * A fresh fork child owns one `{ inherited: true }` marker at its exact
   * inherited-prefix cut, even when that prefix ends in an ancestor marker.
   * `buildForkSeed` appends that marker before any synthetic closers; the
   * `Session` constructor supplies it when given only the inherited prefix.
   * The last tagged marker is the current Session's cut; untagged markers
   * keep ordinary restore and replay lifecycle boundaries.
   *
   * Only the `Session` constructor and `buildForkSeed` may create this marker.
   * The invariant companion deliberately constrains nothing here, so a plugin
   * appending one would silently classify every live bracket before it as seed history.
   *
   * An owner of a standalone open/close bracket (`compaction/start` …
   * `compaction/end`) reads it because seed history and live work are otherwise
   * byte-identical: an unmatched opening marker before this event belongs to
   * an ended lifecycle, whatever ended it. NOT a liveness signal about other
   * writers — a concurrently live session holds its own boundary elsewhere,
   * so tolerating concurrent writers needs a signal beyond the log.
   */
  'session/end-seed': { inherited?: true }
}
```

`UserMessage` 是普通提示詞、注入上下文、steering（中途引導）與即時收件箱事件共享的帶標識且凍結的 user-role 值。事件包裝層只會增加事件本地的位置或結果事實；條目待處理期間，loop 只額外附加驅動器自有的路由狀態。

<a id="the-request-header-event-requestheader"></a>

### 請求頭事件：`request/header`

請求信封（即 `EpochHeader`：呼叫設定 + 介面卡所提供預設值的標記 + 已組裝的工具 schema）會作為工作階段狀態寫入日誌，因此每個對話請求都是日誌的純函式（見可重建性 Agent Note）。渲染後的系統提示詞不屬於請求頭：它是派生歷史，即 surface 第 0 號節點上的 `system/message` 事件以及任何後續的歷史內系統節點（[決策](../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.zh.md)），因此提示詞變更替換或追加一個系統節點，而請求頭保持不變。帶有 reason `'initial'` 或 `'resume'` 的完整 `request/header` 快照記錄每個 agent loop 實例的邊界；請求變化時會追加 reason 為 `'change'` 的快照；未變的信封顯式開啟訊息序列或跟隨 surface 替換時，會追加 reason 為 `'series'` 的快照。如果 `'initial'`、`'resume'` 或 `'change'` 快照所屬請求同時開啟序列，它會攜帶 `startsSeries: true`；reason `'series'` 已記錄這一事實。普通的僅追加後續 Turn，以及同一模型訊息序列內的後續 Step 與重試沿用最新快照。`foldRequestHeader(events)` 透過選擇最新快照重建請求頭。該事件不是 `SurfaceEventType`，不產生 LLM 訊息。

```ts type-equiv
/**
 * Logged request state outside derived history: call config and tools. The
 * system prompt is derived history — surface node 0, a `system/message` event.
 * The latest full `request/header` snapshot reconstructs the header; canonical
 * empty optional fields are absent.
 */
interface EpochHeader {
  /** The conversation's call configuration (provider, model, reasoning effort, and sampling scalars). */
  config: LlmCallConfig
  /** Effective config fields materialized from the exact adapter rather than proposed by a caller. */
  adapterDefaults?: LlmCallConfigAdapterDefaults
  /** Assembled tool schemas; absent for a tool-less request. */
  tools?: ToolSchema[]
  /** Retired request text; system prompts belong to system/message events.
   * @persistenceReserved
   */
  system?: never
}
```

目前事件接納要求 `request/header.header` 為規範形式：禁止任何 `system` 欄位，必須省略 `tools: []` 與 `adapterDefaults: {}`。僅含空白的系統訊息內容、`config.stop: []` 與巢狀擴充功能保持不變。seed、append 與目前持久化讀取拒絕非規範 header，而不會靜默規範化；[V3 信封決策](../../.agents/notes/implemented/architecture/2026-09-06-v3-canonical-session-envelopes.zh.md)負責歷史轉換。包含舊版 `request/header-delta` 事件或完整快照原因為 `fallback` 的舊版 v0 日誌，會被拒絕，而不會以不完整方式回放。

### 路由容量事件：`request/context`

請求所解析到的路由的上下文中繼資料是獨立的已記錄狀態，在同一步驟內緊隨 `request/header` 追加，且僅在提供者、模型、容量或 `systemPromptUpdate` 模式與上一條記錄不同時追加。它保持在 `EpochHeader` 之外，因為該型別是 `headerEquals` 逐欄位比較的重建約定。容量與更新模式描述的是路由，不是請求輸入，把它們摺疊進去會讓一次路由變化被登記為請求信封的 `change`，也會把介面卡中繼資料拉進 loop 的重建不變式。與 `request/header` 一樣，它不是 `SurfaceEventType`，也不產生 LLM 訊息。`session.requestContext()` 以增量方式歸併最新一條記錄；agent loop 在決定變化後的系統提示詞是替換最新的系統節點還是追加到已快取歷史之後時，讀取該記錄的 `systemPromptUpdate`（[決策規則](../../packages/core/agent-loop/README.zh.md#understand-the-implementation)）。介面卡不公佈容量的路由會以缺失 `contextWindow` 的形式記錄，因此新記錄可以清除較早路由的容量；未宣告更新模式的路由同樣會清除較早路由的 `systemPromptUpdate`。

```ts type-equiv
/** Registration-bound metadata for one resolved model route. */
interface RequestContext {
  /** Registered provider route the metadata belongs to. */
  provider: string
  /** Provider-owned model id the metadata belongs to. */
  model: string
  /** Maximum combined request and response context in tokens, when advertised. */
  contextWindow?: number
  /** `'in-history'` when the route reads the latest `system` message at any position as the effective system prompt. */
  systemPromptUpdate?: SystemPromptUpdate
}
```

## `SessionEvent<T>`：一條日誌條目

基於 `type` 的真正可辨識聯合（而非獨立的 `type`/`data` 聯合），因此 `switch (event.type)` 能直接收窄 `event.data`，無需型別斷言。`seq` 是日誌中的單調遞增位置（`seq = log.length`）；`time` 為 epoch 毫秒。

```ts type-equiv
/** Sequence number of one existing event in a Session log. */
type SessionSeq = BrandedNumber<'SessionSeq'>
```

```ts type-equiv
/** A Session log gap, prefix length, or read offset, which may equal the event count. */
type SessionLogOffset = BrandedNumber<'SessionLogOffset'>
```

```ts type-equiv
/** Inclusive Session event watermark, or `-1` before any event exists. */
type SessionSeqCursor = SessionSeq | -1
```

```ts type-equiv
/** One existing Session event position, or explicit absence. */
type OptionalSessionSeq = SessionSeq | null
```

`SessionSeq(value)` 與 `SessionLogOffset(value)` 只接納非負安全整數，並拒絕負零。它們僅新增編譯期品牌，不改變序列化後的數值；算術會返回普通 `number`，呼叫方必須按結果的預期角色透過對應建構器重新接納。

```ts type-equiv
/**
 * One immutable entry in the session log.
 *
 * A proper discriminated union over `type` (not independent `type`/`data`
 * unions), so `switch (event.type)` narrows `event.data` without casts.
 *
 * The {@link sourceEventSeqs} and {@link surfaceOp} fields are conditional:
 * they only exist on {@link SurfaceEventType} variants (`system/message`, `user/message`,
 * `assistant/message`, `tool/result`).
 * Non-surface events (boundary markers, attempts, errors) never carry
 * surface metadata — the compiler enforces this at `Session.append()`
 * call sites.
 */
type SessionEvent<T extends SessionEventType = SessionEventType> = {
  [K in SessionEventType]: {
    type: K
    /** Monotonic sequence number within the session. */
    seq: SessionSeq
    /** Unix epoch milliseconds. */
    time: number
    data: SessionEventMap[K]
    /**
     * Marks an event a reader may safely skip when it does not recognize
     * `type`. Absent means required: a reader meeting an unrecognized type
     * without this marker MUST refuse to reconstruct the session instead of
     * silently dropping the event, because an unrecognized required event may
     * change how the rest of the log is interpreted. A writer sets `true` only
     * on purely informational records whose loss cannot affect reconstruction;
     * defaulting to required means a forgotten marker over-refuses (an
     * inconvenience) rather than silently resuming a gutted session.
     */
    ignorable?: true
  } & (K extends SurfaceEventType ? SurfaceIntent<K> : {
    surfaceOp?: never
    sourceEventSeqs?: never
  })
}[T]
```

`SessionEventType = keyof SessionEventMap`。由於 `SessionEventMap` 可透過合併擴充功能，對 `SessionEvent` 的 switch 語句禁止使用 `assertNever`：外掛新增的變體是合法的未知值；處理已知 case 後在 `default` 中放行。

每個 surface 事件都要求 `surfaceOp`；已知僅日誌事件禁止兩個 surface 中繼資料欄位。原生未知或已退役的可忽略信封保持不透明。`assistant/message` 嵌入其提供者 stream，並禁止 `sourceEventSeqs`。System、user 與 tool surface 事件可以在來源歸屬或替換覆蓋需要時引用完整、非空且唯一的較早事件集合。`tool/result` 僅在訊息帶有 `isError: true` 時可以攜帶 `data.error`；失敗結果的失敗身份仍可省略。

<a id="surface-types"></a>

## Surface 型別

產生訊息的型別（`SurfaceEventType`：`system/message`、`developer/message`、`user/message`、`assistant/message`、`tool/result`）攜帶 surface 中繼資料，用來宣告它們如何加入有序的派生 surface。`system/message` 承載渲染後的系統提示詞：迴圈把第一條追加為 surface 第 0 號節點，並在提示詞變化時恰好替換最新的系統節點，或在歷史內路由上追加一條新的；surface 摺疊拒絕任何其他覆蓋第 0 號節點 `system/message` 的替換，而後續系統節點是普通曆史，壓縮替換可以遮蔽它。見 [session surface Agent Note](../../.agents/notes/implemented/architecture/2026-06-18-session-surface.zh.md)。

### `SurfaceEventType`：事件型別中產生訊息的子集

```ts type-equiv
/**
 * The subset of {@link SessionEventType} values whose events produce LLM
 * messages and are eligible to appear on the ordered surface. Only these
 * event types may carry {@link SurfaceOp}; system, user, and tool events may also cite
 * earlier sources through {@link SessionEvent.sourceEventSeqs}.
 */
type SurfaceEventType =
  | 'system/message'
  | 'developer/message'
  | 'user/message'
  | 'assistant/message'
  | 'tool/result'
```

### `SurfaceOp`：事件如何進入 surface

```ts type-equiv
/**
 * How a session event entered the ordered surface. Only valid on
 * {@link SurfaceEventType} events.
 *
 * - `'append'`: added to the tail — normal path for user/assistant/tool
 *   messages.
 * - `{ op: 'replace', startSeq, endSeq }`: replaces surface nodes from `startSeq`
 *   (inclusive) through `endSeq` (inclusive) with this node. Both must exist as
 *   surface nodes in the current surface. `startSeq === endSeq` replaces a single
 *   node. The node's {@link SessionEvent.sourceEventSeqs} must include every
 *   shadowed surface node. Used by compaction; any surface-replacing producer
 *   may use it.
 */
type SurfaceOp =
  | 'append'
  | { op: 'replace'; startSeq: SessionSeq; endSeq: SessionSeq }
```

`'append'` 是常規的尾部追加路徑。`replace` 恰好包含 `op`、`startSeq` 和 `endSeq`，不接受別名或額外來鍵。它遮蔽這兩個目前 surface 事件序號之間的閉區間，並在原位置插入新事件；相同端點僅替換一個條目。端點必須早於替換事件，但它們的相對順序按 surface 順序而非數值序號順序確定。

### `SurfaceIntent`：`session.append()` 的參數

```ts type-equiv
/**
 * Surface placement and cited source-event seqs for {@link Session.append}. Required on
 * message-producing events and forbidden on log-only events.
 */
type SurfaceIntent<T extends SurfaceEventType = SurfaceEventType> = {
  surfaceOp: SurfaceOp
} & (T extends 'assistant/message' ? {
  /** Assistant messages embed their provider stream instead of citing source events. */
  sourceEventSeqs?: never
} : {
  /** Complete non-empty set of known earlier source-event seqs. */
  sourceEventSeqs?: SessionSeq[]
})
```

對 `SurfaceEventType` 事件必填：每個產生訊息的事件都必須宣告它如何加入 surface（派生模型歷史的唯一來源）。面向人類的 transcript（文字記錄）是另一個投影，讀取的是日誌中追加來源的事件，因為 surface 會有意遮蔽替換所概括的範圍（見 [dsh-session](../../packages/core/session/README.zh.md) 的 `isAppendSurfaceEvent`）。非 surface 型別在編譯期拒絕此參數。

`assistant/message` 不能攜帶 `sourceEventSeqs`；它的 `stream` 擁有精確 provider 證據。其他 surface event 不引用較早 event 時省略該欄位，需要引用時使用完整非空 list。

<a id="plugin-owned-message-projections"></a>
### 外掛擁有的訊息投影

修改內容的外掛用 `@messageProjection` 標記事件宣告，並透過 `ctx.sessions.registerMessageProjection()` 註冊純處理器。Session 在提交前透過處理器驗證完整決策，應用其不可變訊息更新，並推進 `contentGeneration`。缺少處理器時拒絕操作，包括恢復和獨立摺疊，解除安裝已經使用的處理器後也會拒絕讀取快取。獨立讀取器將處理器顯式傳給 `foldSurface(events, projections)`，並透過 `deriveEventMessage()` 應用 `projectedMessages`。目前格式目錄為離線讀取器裝配第一方處理器。[圖片省略外掛](compaction.zh.md#image-offload)擁有圖片專用的事件及解釋邏輯。

```ts type-equiv
/** Readonly history immediately before a message-projection event. */
interface SessionMessageProjectionContext {
  /** Current message-producing event sequences in model-visible order. */
  nodes: readonly SessionSeq[]
  /** Contiguous event window; entries at or beyond the candidate seq are not committed inputs. */
  events: readonly SessionEvent[]
  /** Absolute sequence of the window's first event. */
  baseSeq: SessionLogOffset
  /** Previously projected messages keyed by their original event sequences. */
  messages: ReadonlyMap<SessionSeq, Message>
}
```

```ts type-equiv
/** Pure interpretation of one plugin-owned event that changes existing message content. */
interface SessionMessageProjection<T extends SessionEventType = SessionEventType> {
  /** Event interpreted by this definition; declare it with `@messageProjection` in SessionEventMap. */
  type: T
  /**
   * Validate the complete durable decision before returning any updates. Preserve
   * message identities and publish immutable copies without mutating the input.
   * @param event - candidate event, not yet applied to the supplied history.
   * @param context - history preceding this decision.
   * @returns changed current messages keyed by their original sequences.
   * @throws when the durable decision cannot be applied to this history.
   */
  project(event: SessionEvent<T>, context: SessionMessageProjectionContext): ReadonlyMap<SessionSeq, Message>
}
```

### `SessionSurface`：即時只讀 surface 投影

`Session.surface` 返回工作階段穩定的 `SessionSurface` 檢視。同一個增量管理器在提交前驗證追加候選事件，並根據已提交事件推進該投影；呼叫方可以觀察成員關係和替換代次，但不能呼叫驗證。

`SurfaceManager(log, baseSeq?, projections?)` 也可以摺疊一個連續的已載入視窗，其第一個事件的絕對序號為 `baseSeq`。每個事件在該絕對序號空間中仍保持連續；如果替換跨過視窗頭部，由於其宣告的範圍並不存在，該替換會失敗。

```ts type-equiv
/** Readonly live projection of the message-producing session events. */
interface SessionSurface {
  /** Current surface event sequences in model-visible order. */
  readonly nodes: readonly SessionSeq[]
  /** Monotonic count of committed positional replacements. */
  readonly replaceGeneration: number
  /** Monotonic count of committed replacements and plugin-owned message changes. */
  readonly contentGeneration: number
}
```

### `SurfaceFoldReplacement` 與 `SurfaceFoldResult`：完整的 surface 回放

`foldSurface(events, projections)` 返回一份獨立的目前事件 seq 列表，以及每個宣告的替換範圍實際遮蔽的 seq。即時管理器複用同一套狀態轉換，但不保留替換歷史。每提交一次替換，其 `replaceGeneration` 就遞增一次，使增量消費方能夠區分純尾部增長與重寫。

```ts type-equiv
/** One replacement operation observed while folding a session surface. */
interface SurfaceFoldReplacement {
  /** Seq of the event that replaced the prior surface range. */
  seq: SessionSeq
  /** Declared inclusive start seq of the replaced surface range. */
  start: SessionSeq
  /** Declared inclusive end seq of the replaced surface range. */
  end: SessionSeq
  /** Actual surface entries removed by the operation, in surface order. */
  shadowedSeqs: SessionSeq[]
}
```

```ts type-equiv
/** Complete result of replaying the surface operations in a session log. */
interface SurfaceFoldResult {
  /** Current surface event sequences in model-visible order. */
  nodes: SessionSeq[]
  /** Replacement operations in event order. */
  replacements: SurfaceFoldReplacement[]
  /** Immutable projected messages, keyed by their original event sequences. */
  projectedMessages: ReadonlyMap<SessionSeq, Message>
}
```

## `Session` 公共 API

去除方法體的宣告與原始碼中的普通類保持同步，覆蓋其脫離態工廠、狀態存取器、append 方法和歷史投影。儲存操作仍由生成的 [`ctx.sessions` 小節](#ctxsessions--sessionstore)記錄。

```ts public-api
/**
 * An event-sourced session: an append-only log of {@link SessionEvent}s.
 *
 * Plain class (not a Service) — create live instances via
 * `ctx.sessions.create()` and detached instances via {@link create}.
 * Seeding with an existing event log replays/forks a session.
 * @typert object
 */
declare class Session {
  /** The ordered surface over this session's event log. */
  get surface(): SessionSurface;
  /**
   * Detached, deep-frozen creation metadata (format version, cwd, lineage,
   * and whether fork history exists). Supplied by the store via `ctx.sessions.create()`. When a
   * `Session` is created without a store-owned header, a minimal header is
   * synthesized (stamped with the current {@link SESSION_FORMAT_VERSION}) so
   * `session.header` is always present. Kept out of the event log — it is a
   * storage concern, not replayable conversation state.
   */
  readonly header: SessionHeader;
  /** Number of leading events inherited from this Session's fork parent. */
  readonly inheritedEventCount: SessionLogOffset;
  /** The session identity, derived from its durable header's single copy. */
  get id(): SessionId;
  /**
   * The constructor seed length (0 without one), before any marker appended
   * during construction. Seed events never publish on `session/event`. A
   * marker appended before the store attaches occupies this seq without
   * publishing either; otherwise this seq is available for the next append.
   *
   * This in-process offset is not persisted. A fork seed can already contain
   * the child's inherited marker and synthetic closers, so its child-owned
   * history starts at {@link inheritedEventCount}, before this offset. A
   * resumed Session's seed contains its full stored log, while its inherited
   * count keeps the durable fork cut. Consumers needing complete canonical
   * history start at seq 0.
   */
  readonly firstLiveSeq: SessionLogOffset;
  /**
   * First event produced for this object lifecycle. A new fork includes its
   * child-owned seed marker and closers; a restored Session starts after its
   * complete stored prefix. This in-process capture offset is not persisted.
   */
  readonly firstLifecycleSeq: SessionLogOffset;

  /**
   * Create a detached session by validating and snapshotting borrowed seed
   * events and storage metadata.
   * @param id - session identity.
   * @param seed - optional borrowed replay or fork events.
   * @param header - optional borrowed storage metadata.
   * @param inheritedEventCount - exact fork-inherited prefix length for a seeded header.
   * @param projections - pure interpreters for plugin-owned message changes.
   * @returns a detached session.
   * @throws when a seed event requires a missing message interpreter or fails validation.
   */
  static create(
    id: SessionId,
    seed?: readonly SessionEvent[],
    header?: SessionHeader,
    inheritedEventCount?: SessionLogOffset,
    projections?: readonly SessionMessageProjection[],
    ): Session;
  /**
   * Restore a detached session by adopting an independently owned or deeply frozen seed.
   * Runtime-required event fields, event envelopes, sequence continuity, surface
   * transitions, and header fields are validated without copying or freezing events.
   * Embedded Assistant streams remain opaque until a stream consumer or storage
   * verifier reads them.
   * @param id - restored session identity.
   * @param seed - independently owned or deeply frozen events.
   * @param header - independently owned storage metadata.
   * @param inheritedEventCount - exact fork-inherited prefix length decoded from storage.
   * @param eventState - aliasing state carried from the operation that produced the seed.
   * @param projections - pure interpreters for plugin-owned message changes.
   * @returns a restored detached session.
   * @throws when a seed event requires a missing message interpreter or fails validation.
   */
  static fromRestore(
    id: SessionId,
    seed: readonly SessionEvent[],
    header: SessionHeader,
    inheritedEventCount: SessionLogOffset,
    eventState: SessionSeedEventState,
    projections?: readonly SessionMessageProjection[],
    ): Session;
  /**
   * Return the immutable event stored at one exact sequence number.
   * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
   * See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
   * @param seq - event sequence number.
   * @returns the accepted event, or undefined when the log does not contain it.
   */
  eventAt(seq: SessionSeq): SessionEvent | undefined;
  /**
   * Materialize an immutable snapshot of a half-open event sequence range.
   * A full current snapshot is reused until the next append; every previously
   * returned snapshot remains stable after later appends.
   * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
   * See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
   * @param fromSeq - non-negative inclusive sequence number; defaults to the log start.
   * @param toSeqExclusive - non-negative exclusive sequence number; defaults to the current end.
   * @returns a frozen array of the selected deeply frozen events.
   */
  snapshotEvents(
    fromSeq: SessionLogOffset = SessionLogOffset(0),
    toSeqExclusive: SessionLogOffset = this.seq,
    ): readonly SessionEvent[];
  /**
   * Return this Session's events after its fork-inherited prefix.
   * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
   * See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
   * @returns a fresh array containing child-owned events in log order.
   */
  ownEvents(): readonly SessionEvent[];
  /**
   * Whether one existing event position is outside the fork-inherited prefix.
   * @param seq - event position in this Session.
   * @returns true when the event belongs to this Session rather than its parent.
   */
  isOwnSeq(seq: SessionSeq): boolean;
  /** The next event's sequence number — always the log length (the `seq = log.length` contiguity contract). */
  get seq(): SessionLogOffset;
  /**
   * Append one typed event to the log and synchronously notify observers via
   * the store-owned, module-private publication hooks. The hot path never blocks
   * on I/O — persistence plugins buffer asynchronously. Once the event enters
   * the log, the append is committed: observer failures are logged and
   * contained per listener, so they do not change the return value or prevent
   * later listeners from observing the same accepted event.
   *
   * @param type - The event type (key of {@link SessionEventMap}).
   * @param data - The event payload; must be JSON-serializable.
   * @param opts - Surface metadata: `surfaceOp` controls how the event enters
   *   the ordered surface; `sourceEventSeqs` lists the seq numbers of earlier
   *   events this one derives from. REQUIRED for
   *   {@link SurfaceEventType} events (every message-producing event must
   *   declare how it joins the surface, the sole source of derived model
   *   history) and
   *   rejected by the compiler for non-surface types like `turn/start` or
   *   `assistant/attempt`. Assistant messages embed their exact provider
   *   stream and cannot cite top-level source events.
   * @returns the logged event — its assigned `seq`/`time` plus the SNAPSHOT of
   *   `data` that entered the log, so reading `event.data` back sees the logged
   *   value, never the caller's still-mutable input.
   * @throws if `data` or surface metadata is not losslessly JSON-serializable
   *   (BigInt, function, symbol, undefined, negative zero, non-finite number,
   *   circular reference, sparse array, or an exotic object such as
   *   Map/Set/Date/class instance), or when the candidate violates the
   *   request-header empty-field or tool-error consistency rules, or the
   *   canonical surface contract (marker shape and eligibility, unique
   *   earlier source-event references, positional replacement validity, and complete
   *   shadowed-node coverage). One iterative pass reads, validates, and
   *   copies each nested value once, so a stateful getter cannot supply one value
   *   to validation and another to storage. The event log is the durable source
   *   of truth, so a bad event fails at the append site rather than later during
   *   a backend flush. A synchronous internal dispatch validation failure or an
   *   append reentered while this acceptance/publication boundary is open also
   *   rejects before the log changes.
   */
  append<T extends SessionEventType>(
    type: T,
    data: SessionEventMap[T],
    ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent<T>] : []
    ): SessionEvent<T>;
  /**
   * The {@link EpochHeader} in force after the log's last header event — the
   * header the NEXT request will be compared against — or undefined before
   * the first `request/header` snapshot. The live, incrementally-maintained
   * form of `foldRequestHeader(session.snapshotEvents())`: each header event is folded
   * once, when first seen, so a per-step read costs O(new events).
   * @returns the folded header, or undefined when no header event exists yet.
   */
  requestHeader(): EpochHeader | undefined;
  /**
   * Return the latest resolved route metadata, or `undefined` before the first
   * `request/context` event. Each event is folded once.
   * @returns the latest immutable route metadata.
   */
  requestContext(): RequestContext | undefined;
  /**
   * Fold unseen committed events into capability-independent tool history.
   * Initial access reconstructs inherited history; later reads consume only new events.
   * @returns an immutable snapshot for LLM request projection, including historical addition definitions.
   */
  toolHistory(): ToolHistory;
  /**
   * Derive the LLM message history by walking the ordered sequences of
   * message-producing events maintained by `surfaceOp` markers. The
   * surface is the single source of derived history: every message-producing
   * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
   * turn boundary) is correctly absent, and a compaction `replace` deletes the
   * shadowed nodes from the derivation. The projection rules are
   * {@link deriveEventMessage}, with logged message projections applied
   * without changing node membership or message identity.
   *
   * CACHED: pure tail growth costs O(new nodes); a replacement or message projection
   * ({@link SessionSurface.contentGeneration}) rebuilds. The returned array is
   * a fresh snapshot per call (later appends never grow an array a caller
   * already holds); the `Message` objects in it are SHARED and **deep-frozen**.
   * Unchanged content reuses frozen event data; projected blocks are frozen
   * derived copies. Consumers cannot mutate the log through either form.
   * @returns a fresh array of the shared, frozen derived history.
   */
  deriveMessages(): Message[];
  /**
   * Project one event with all committed message projections applied.
   * The original durable event remains unchanged.
   * @param event - the event to project.
   * @returns the derived message, or null when the event produces none.
   */
  deriveEventMessage(event: SessionEvent): Message | null;
}
```

## 派生歷史：`deriveMessages()` 與 `deriveEventMessage()`

`Session.deriveMessages()` 將事件日誌投影為模型看到的 `Message[]`。它是快取的（每個 surface 節點在首次出現時投影一次；surface 重寫觸發重建）且凍結的（每次呼叫返回一個新陣列，引用共享的深凍結訊息，因此透過投影修改已記錄的歷史在型別上不可表達）。`deriveEventMessage(event)` 是摺疊所應用的逐節點純函式，公開暴露以便外部重建器和開發不變式檢查能以完全相同的規則投影日誌字首，不會與快取產生分歧。投影規則：

- `user/message` → 一條攜帶確切 `content` 的 user 訊息；可選 envelope 僅作為日誌中的展示中繼資料保留。
- `assistant/message` → 一條 assistant 訊息，包含生成它的提供者和模型，以及可選的介面卡私有回放狀態。其嵌入式緊湊 stream 是回放、usage 與 UI 證據，而不是第二條 message。**內容為空的** `assistant/message` 也會跳過：因 max-tokens 而截斷且無內容的步驟仍會記錄一條 `assistant/message` 來儲存 stream、usage、提供者和模型，但無內容的 assistant 輪次不得進入提供者 transcript（文字記錄）。
- `tool/result` → 一條一等 tool-role 訊息，攜帶結果內容與工具呼叫標識。
- `user/message`（注入上下文，即非 `user` 來源）→ 按時間順序在相應位置生成一條 user-role 訊息，並原樣承載其 `content`；其型別化 source 標明生產方，並攜帶所有生產方專用資料。

其餘所有事件（`turn/*`、`step/*`、`assistant/attempt`、外掛所屬的 `llm/retry`）均為結構資訊，不會投影為訊息。token 記帳會展開每個 `assistant/message` 或 `assistant/attempt` 的嵌入式 stream，message 頂層 `usage` 存在時仍是已提交 message 的權威。失敗的模型請求 attempt 因此可以保留提供者 usage，而無需虛構 assistant message。目前邏輯驗證會拒絕沒有提供者／模型的 request header 和 assistant 訊息，而不會猜測路由；受支援的歷史表示會在目前 Session 存在前，由其相鄰格式遷移邊歸一化並驗證。

## 活躍工作階段 fork API

`ctx.sessions.create(id, { seed, meta })` 是底層的回放/fork 原語。對於普通的活躍工作階段 fork，`SessionStore` 暴露一個策略 API：

- `fork(source, boundary?, childSessionId?)` 接受一個活躍的 `Session` 物件或活躍的 `SessionId`，選取到 `SessionSeq` boundary（含）為止的源事件（預設為目前最後一個事件），要求所選字首結束時沒有開放輪次，然後建立一個活躍的子工作階段，包含深克隆的 seed event、`parentSession`、`isSeeded: true`、精確 `inheritedEventCount` 及繼承的 `cwd`。

顯式 `boundary` 允許呼叫者從任意穩定的輪次間位置 fork，包括之前的 `turn/end` 或更晚的獨立純日誌事件，即使源工作階段有更新的事件或正在進行的輪次。API 拒絕結束於開放輪次內的字首，而不是靜默截斷。更廣泛的執行關係健全性檢查留在既有的 `dsh-invariants` 外掛和持久化修復路徑中，不在 `fork()` 中重複。`dsh-subagent-fork-in-process` 保留其已完成字首截斷邏輯，因為工具呼叫時的委託通常在父輪次仍然開啟時啟動；普通的工作階段分支應顯式指定請求的 boundary。

<a id="why-a-turn-ended-turnendreasonmap"></a>

## 輪次的結束原因：`TurnEndReasonMap`

`turn/start` 沒有 trigger 欄位。已進入的 `user/message` 批次記錄進入每個步驟的內容，`llm/retry` 記錄請求恢復，idle 注入則保持待處理，直到喚醒交付抵達後續 pre-step。即時輪次會保留停止驅動器的型別化 [`AgentCancelCause`](core.zh.md#the-agent-handle)；只有在匯入受支援的粗粒度取消記錄且記錄未儲存呼叫方時，持久化才使用額外的 `{ kind: 'legacy' }` 原因。

```ts type-equiv
/** Durable cancellation cause, including imports whose original coarse record carried no cause. */
type TurnEndCancelCause = AgentCancelCause | { readonly kind: 'legacy' }
```

```ts type-equiv
/**
 * Why a turn ended. Merge-extensible sum type.
 */
interface TurnEndReasonMap {
  completed: { kind: 'completed' }
  /** A cancellation request interrupted the live turn. */
  aborted: { kind: 'aborted'; reason: TurnEndCancelCause }

  blocked: { kind: 'blocked' }
  /**
   * The turn failed. `error` is always a structured failure: the `LlmError`
   * facts verbatim, or `{ message: errorChain(error), code: 'UNKNOWN' }`
   * flattened from any other error.
   */
  error: { kind: 'error'; error: LlmFailure }
  /** At least one step reached its output-token ceiling, even if a plugin continued the turn. */
  'max-tokens': { kind: 'max-tokens' }
  /**
   * A crash-orphaned turn was closed after the fact: agent-loop resume appends
   * this closer for a stored log whose last turn never ended, and session-query
   * synthesizes it on cold reads. The loop never emits this marker live, and
   * the events recorded before the crash remain intact.
   */
  interrupted: { kind: 'interrupted' }
  /**
   * Fork-seed construction closed a turn that was still open at the fork
   * boundary in the source session. Only fork seeds carry this marker — the
   * loop never emits it — and the source events before the boundary remain
   * intact in the child.
   */
  forked: { kind: 'forked' }
}
```

`max-tokens` 與模型呼叫中同名的 `FinishReason` 對應：只要輪次內有任何步驟以 `max-tokens` 結束，整個輪次就以 `max-tokens` 而不是 `completed` 結束（即使之後繼續執行，截斷事實仍優先），讓消費方能夠區分正常停止和截斷停止。取消和錯誤仍是不同的結果。loop 不會即時發出 `interrupted` 或 `forked`：崩潰恢復合成 `interrupted`（見 [persistence.md](persistence.zh.md)），而 fork 種子建構合成 `forked`。該 map 可透過合併擴充功能。

## 執行封閉與獨立事件

一個輪次包圍一次模型迴圈執行，而不是整個工作階段日誌。AgentLoop 只會在輪次內進入 pre-step 批次時記錄注入的 `user/message` 事件；外掛所屬的純日誌事件仍可出現在 `turn/end` 與下一個 `turn/start` 之間，佔用事件 seq 但不遞增輪次編號。持久化會將每個連續且已接受的事件納入有界持久化批次，而崩潰修復只關閉確實仍處於開放狀態的尾部輪次。需要即時永續性屏障的生產方會顯式等待 `ctx.sessions.flush(session)`。

可選的 `dsh-session/invariant` 配套外掛會強制核心擁有的關係：輪次與步驟編號、執行事件封閉，以及同一步驟內的工具呼叫／結果配對。可合併擴充功能事件的關係由宣告它的外掛擁有，因此核心不會僅因沒有開放輪次就拒絕未知事件。見[獨立事件決策](../../.agents/notes/implemented/simplification/2026-07-28-remove-synthetic-log-only-turns.zh.md)。

## 種子結束邊界：`session/end-seed`

`buildForkSeed` 在精確的 inherited-prefix cut 追加 `session/end-seed { inherited: true }`，然後新增合成的 fork 結束事件。`Session` constructor 保留該預先建構的 marker，或在 seed 僅含 inherited prefix 時追加 marker。restore 保留 tagged marker，並且只在完整 stored seed 尚未以 marker 結尾時追加普通 `session/end-seed {}`。兩種形式都只進入 log 且不產生 message；只有 constructor 和 `buildForkSeed` 可以建立它們。

對於 fork lineage，定位 payload 攜帶 `inherited: true` 的最後一個 marker；目前格式 decoding 只在 `SessionHeader.isSeeded` 為 true 時要求該 marker，並從其 seq 推導 `inheritedEventCount`。對於 lifecycle ownership，定位任一形式的最後一個 `session/end-seed`。重新開啟已經以任一 marker 結尾的 seed 時，不會再追加普通 marker。

它之所以必要，是因為種子歷史與即時工作在位元組層面完全相同，這會讓任何擁有獨立開／閉括號的外掛失效：一個未配對的 `compaction/start`，無論寫入方是在壓縮中途崩潰、還是此刻正在壓縮，讀起來都一樣。在 `session/end-seed` 之前的開啟標記來自建構種子，並且屬於一個已結束的生命週期，無論結束原因為何（崩潰、程序接替，或從仍在執行的父工作階段 fork 出來），因此其所有方可以視之為已死。這隻覆蓋*本*工作階段繼承的括號：另一個並行存活的工作階段可能在同一段歷史上持有開放括號，而它自己的邊界在別處，因此容忍並行寫入方還需要日誌之外的存活訊號。核心寫入該邊界但不從中讀取任何內容——括號的詞彙表仍歸其所屬外掛，這也正是崩潰修復只關閉輪次／步驟／工具邊界而從不處理 `compaction/*` 的原因。

按真人活動排序 Session 的消費方會排除該邊界：接手 Session 不算工作，因此按日誌尾部排序會把每個開啟過的 Session 頂到最前。

## 外掛貢獻的僅日誌事件

外掛可以透過 declaration merging 新增額外的 `SessionEventMap` 型別。這些是**僅日誌**事件：不是 `SurfaceEventType`（不攜帶 `surfaceOp`，不參與派生歷史）。事件所有方決定它們屬於一個開放的執行輪次，還是可以獨立位於輪次之間，並在自己的不變數配套外掛中強制所需關係。生成的[持久化日誌事件目錄](../persistence-catalog.zh.md)會列出每個核心或外掛貢獻的事件；壓縮 seam 的 `compaction/*` 語義在 [compaction.md](compaction.zh.md) 中討論。

如果同一個外掛事件族中的多條事件要組裝成一個 Web Client Conversation Node，該事件族中的每條 start、update、result、resource 或 interruption 事件都必須攜帶或獨立推匯出同一個穩定業務 id。此要求只約束需要關聯的 Node 事件族，並不要求每條 Session 事件都有業務 id；Client 因此無須根據相鄰關係猜測歸屬，也無須掃描歷史。參見 [Conversation 子系統](conversation.zh.md)。

掛鉤橋接層的 `hook/invoked` / `hook/result` 對（來自 `@deepseek-ai/dsh-hook-protocol`）透過 `handlerId` 關聯。`UserPromptSubmit`、`PreToolUse`、`PostToolUse` 與 `Stop` 在 loop 已開啟的輪次內觸發，因此其 `hook/*` 記錄天然位於輪次之內。`SessionStart` 不生成 `hook/*` 記錄，因為它在輪次 1 之前執行；其上下文會在 inbox 中保持待處理，直到喚醒交付開啟一個輪次。

## 永續性約定

持久化後端依賴的約定如下：持久日誌無損儲存每個事件，每個 Assistant attempt 都是一個 `assistant/message` 或 `assistant/attempt`，其嵌入式緊湊 stream 會保留原始帶時間 chunk。`seq` 在這些 settlement 與所有交錯事件之間保持連續。後端可以為事件批次選擇自己的儲存 framing，只要控制代碼的 `read()` 返回與追加時完全一致的事件即可；目前 JSONL 每個事件寫一行（見 [persistence.md](persistence.zh.md)）。所有 `event.data` 都必須可序列化為 JSON；`Session.append` 會從源頭強制這一要求（遇到不可序列化資料時丟擲），因此錯誤事件絕不會進入日誌，`session.snapshotEvents()` 始終與後端可持久化的內容一致。新增會攜帶不可序列化資料、破壞核心執行巢狀或違反事件所有方宣告關係的事件型別，都會構成磁碟格式的破壞性變更。

消費此約定的後端見 [persistence.md](persistence.zh.md)。

## Remote 目錄與 workspace 開啟

`ModelCatalog` 是 `session/modelCatalog` 返回的 Host generation 模型目錄：它攜帶部署預設值、可路由 provider id、成功的 provider 分組與相互隔離的 provider 失敗。它不由某個 Session 派生，因此與 Session projection 分開儲存。

`SessionOpenWorkspacePathRequest` 攜帶絕對路徑或已按 workspace 解析的 `path`。`SessionOpenWorkspacePathValue` 確認 Host 已接受原生交接。Session-aware Client 會在已知目前 Session cwd 時據此解析相對路徑；controller 將路徑原樣交給開啟器，並透過 Session Remote 錯誤詞彙表報告無效請求、取消與開啟器失敗。 可選的 `action: "reveal"` 選擇檔案管理器導航；省略時使用預設應用開啟。

可選的 `application` 指定檔案關聯應用，不修改系統預設值；`workspacePathApplications({ path })` 在驗證 Host 路徑後返回目前關聯應用、名稱、圖示和預設項。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessioncontroller--sessioncontroller"></a>

### `ctx.sessionController` — `SessionController`

Host service backing the generated `ctx.remote.session` namespace.

```ts cordis-catalog
/**
 * Resolve or resume one ordinary Session for another Host API domain.
 * @param sessionId - Session identity whose Agent owns the operation.
 * @returns the live Agent or the stable Session-domain failure.
 */
resolveAgent(sessionId: SessionId): Promise<ApiSessionAgentResult>

/**
 * Inspect one attached or persisted Session without activating its Agent.
 * @param sessionId - durable Session identity.
 * @param signal - optional caller cancellation for persistence reads.
 * @returns the current attached state or persisted header and event prefix.
 */
inspect( sessionId: SessionId, signal?: AbortSignal, ): Promise<SessionInspection>

/**
 * Read all visible Session rows without resuming an Agent.
 * @param _request - reserved empty list request.
 * @param signal - cancellation for persistence reads.
 * @returns visible Session summaries ordered by activity.
 */
@Remote('list') async list(_request: SessionListRequest, signal: AbortSignal): Promise<SessionListValue>

/**
 * Search visible Session content without resuming an Agent.
 * @param request - literal message-content query.
 * @param signal - cancellation for list and search reads.
 * @returns authorized bounded Session search results.
 */
@Remote('search') search(request: SessionSearchRequest, signal: AbortSignal): Promise<SessionSearchValue>

/**
 * Create or idempotently adopt one ordinary Session.
 * @param request - requested identity, location, and Agent preset.
 * @returns the Session identity and resolved preset when configured.
 */
@Remote('create') create(request: SessionCreateRequest): Promise<SessionCreateValue>

/**
 * Select one Session-local model after explicitly resuming the Session; save the default in the background.
 * @param request - Session identity and requested model selection.
 * @returns the normalized selection installed for the Session, without waiting for default persistence.
 */
@Remote('selectModel') selectModel(request: SessionSelectModelRequest): Promise<SessionSelectModelValue>

/**
 * Select the first available account model after login when no provider API key is configured.
 * @returns after saving the first available model or retaining the existing default.
 */
@Remote async initializeDefaultModel(): Promise<void>

/**
 * Describe every currently routable model for Host-generation selectors.
 * @returns provider-grouped models, the deployment default, and isolated provider failures.
 */
@Remote('modelCatalog') modelCatalog(): Promise<ModelCatalog>

/**
 * Report whether this deployment can hand a Session workspace path to a native desktop.
 * @returns true when the matching open operation is available.
 */
@Remote canOpenWorkspacePath(): boolean

/**
 * Describe the serving desktop for authenticated file-action routes.
 * @returns Host name, configured availability, and platform-specific file-manager behavior.
 */
workspaceDesktop(): { name: string; available: boolean; fileManager: 'finder' | 'explorer' | 'directory' | null }

/**
 * Verify one path through the composed filesystem and open it on the Host desktop.
 * @param request - path after best-effort Session workspace resolution.
 * @param signal - caller lifetime; abort terminates the native command.
 * @returns confirmation after the native opener accepts the path.
 * @throws RemoteError when the request is invalid, has no verified Host mapping, is cancelled, or the opener fails.
 */
@Remote('openWorkspacePath') async openWorkspacePath( request: SessionOpenWorkspacePathRequest, signal: AbortSignal, ): Promise<SessionOpenWorkspacePathValue>

/**
 * Query current file handlers on the serving desktop without activating an Agent.
 * @param request - file path in Host filesystem syntax.
 * @param signal - caller lifetime, propagated to filesystem and desktop queries.
 * @returns OS application names, icons, and default selection; empty when desktop opening is unavailable.
 * @throws RemoteError when the path is invalid, the query is cancelled, or native discovery fails.
 */
@Remote('workspacePathApplications') async workspacePathApplications( request: { readonly path: string }, signal: AbortSignal, ): Promise<readonly SessionWorkspacePathApplication[]>

/**
 * Rename one Session after explicitly resuming it.
 * @param request - Session identity and proposed title.
 * @returns the accepted title and durable event sequence.
 */
@Remote('rename') rename(request: SessionRenameRequest): Promise<SessionRenameValue>

/**
 * Permanently delete one ordinary Session and its subagent descendants.
 * Running work is stopped the way archiving with `stopActivity` stops it,
 * the live Agent is disposed, and each stored log, cached projection row,
 * and Workspace account entry is removed. Forks keep their copied history;
 * spilled output and content-addressed attachments are not removed.
 * @param request - Session identity.
 * @returns deletion confirmation.
 */
@Remote('delete') delete(request: SessionDeleteRequest): Promise<SessionDeleteValue>

/**
 * Fork one cold-readable exact event prefix into a new Session. An omitted
 * boundary selects the latest completed-turn prefix; an open cut receives
 * synthetic fork closers.
 * @param request - source Session and optional exact inclusive event boundary.
 * @returns the new Session identity.
 */
@Remote('fork') fork(request: SessionForkRequest): Promise<SessionForkValue>

/**
 * Admit one prompt after explicitly resuming its Session.
 * @param request - Session identity, prompt content, source metadata, and delivery mode.
 * @param signal - caller cancellation before prompt admission begins.
 * @returns acknowledgement that the Agent accepted the prompt.
 */
@Remote('prompt') prompt(request: SessionPromptRequest, signal: AbortSignal): Promise<SessionPromptValue>

/**
 * Read one image proven reachable from the addressed Session log.
 * @param request - Session and attachment identities used for authorization.
 * @returns the durable attachment reference and base64-encoded bytes.
 */
@Remote('attachment') attachment(request: SessionAttachmentRequest): Promise<SessionAttachmentValue>

/**
 * Mutate one still-pending queue occurrence, resuming a cold Agent first.
 * @param request - Session, queue item, and requested mutation.
 * @returns acknowledgement that the queue mutation was applied.
 */
@Remote('updateQueue') updateQueue(request: SessionUpdateQueueRequest): Promise<SessionUpdateQueueValue>

/**
 * Cancel one active Agent turn without dropping its pending inbox.
 * @param request - Session whose active Agent turn is cancelled.
 * @returns acknowledgement that cancellation was requested.
 */
@Remote('cancel') cancel(request: SessionCancelRequest): SessionCancelValue

/**
 * Read one cold-safe, message-aligned Session history page.
 * @param request - durable address, backward cursor, and page budget.
 * @param signal - cancellation for persistence reads.
 * @returns one chronological page.
 */
@Remote('page') page(request: SessionPageRequest, signal: AbortSignal): Promise<SessionPage>

/**
 * Follow one Session log from its opening or resume cursor.
 * @param request - durable address and last committed sequence already held by the caller.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns a complete opening snapshot followed by gap-free durable event
 *   frames and optional cursorless assistant-stream frames.
 */
@Remote({ mode: 'stream' }) follow(request: SessionFollowRequest, signal: AbortSignal): AsyncIterable<SessionFollowFrame>

/**
 * Read all registered projections without activating an Agent.
 * @param request - Session whose current values are required.
 * @param signal - cancellation for the Session observation.
 * @returns complete baseline, or null when the Session does not exist.
 */
@Remote('projections') async projections(request: SessionProjectionsRequest, signal: AbortSignal): Promise<SessionProjectionsValue>

/**
 * Stream a complete live-control baseline followed by replacement frames.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns one complete baseline followed by live replacement frames.
 */
@Remote({ mode: 'stream' }) control(signal: AbortSignal): AsyncIterable<SessionControlFrame>
```

Types: [SessionId](core.zh.md) · [SessionInspection](persistence.zh.md) · [SessionSearchRequest](session-query.zh.md)

Source: [`packages/api/session-controller/src/index.ts`](../../packages/api/session-controller/src/index.ts)

<a id="ctxsessions--sessionstore"></a>

### `ctx.sessions` — `SessionStore`

In-memory session store (`ctx.sessions`).

Persistence is intentionally not implemented here — the agent lifecycle attaches a session-log writer to each published session's write handle; a session published outside that lifecycle persists nothing.

```ts cordis-catalog
/**
 * Register one event interpreter for live creation, restore, and fork.
 * Disposing the contribution makes sessions that used it refuse further derivation.
 * @param projection - pure definition owned by the event's plugin.
 * @returns the fiber-owned disposer.
 * @throws when another definition already owns this event type.
 */
registerMessageProjection(projection: SessionMessageProjection): () => Promise<void>

/**
 * Create a session owned by the calling fiber: disposing that fiber stops
 * event notification and removes the session from the store. `options.seed`
 * populates the session with a copy of those events (replay/fork);
 * `options.meta` attaches creation metadata (validated absolute `cwd`, seed
 * and parent lineage, and delegation depth) as the immutable
 * {@link SessionHeader} (the store fills `version`/`id`/`createdAt`).
 *
 * For an agent whose session must be torn down IN ORDER with its loop (so the
 * loop's final events are published before the store attachment ends), do NOT use this
 * — fold the session lifecycle into the agent's own effect via
 * {@link prepare} + {@link enter} + {@link announce} (see
 * `dsh-agent-loop`'s creation transaction).
 *
 * @param id - the session id; omitted, the store mints `session-<n>`.
 * @param options - seed events and/or creation metadata for the header.
 * @returns the live session, already entered and announced.
 * @throws if a session with `id` already exists, metadata is not a plain
 *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
 *   non-absolute path (storage backends key directories off it).
 */
create(id?: SessionId, options?: CreateSessionOptions): Session

/**
 * Build a session WITHOUT entering it into the store — validate the id/cwd and
 * construct the {@link Session} (with its immutable {@link SessionHeader}).
 * Pairs with {@link enter} + {@link announce}: a caller that owns a composite
 * `ctx.effect` (the agent factory) folds the session lifecycle into that ONE
 * effect so a fiber unload tears the session + agent down as a single ORDERED
 * chain rather than as racing sibling effects — which would remove the publication hooks
 * before the driver's closing events commit, dropping them.
 *
 * @param id - the session id; omitted, the store mints `session-<n>`.
 * @param options - seed events and/or creation metadata for the header. With
 *   `eventState`, every seed event is either independently owned or any
 *   shared value is deeply frozen; {@link Session.fromRestore} validates and
 *   adopts those values without copying or freezing them.
 * @returns the constructed session, NOT yet in the store.
 * @throws if a session with `id` already exists, metadata is not a plain
 *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
 *   non-absolute path.
 */
prepare(id?: SessionId, options?: PrepareSessionOptions): Session

/**
 * Enter a {@link prepare}d session into the store: install the module-private
 * append publication hooks and add it to the store. Returns the DETACH
 * disposer (hooks + store removal). Does NOT emit `session/created` —
 * the caller yields this disposer inside its effect and THEN calls
 * {@link announce}, so a throwing `session/created` listener rolls the attach
 * back instead of leaking it.
 *
 * Re-checks the id for a duplicate: `prepare` and `enter` are public
 * cross-package primitives and a caller may interleave arbitrary work (or
 * another create) between them, so a stale prepared session must NOT overwrite
 * a live store entry of the same id — its detach disposer would later delete
 * the REAL session. The {@link create} convenience and the agent factory call
 * the two back-to-back so they never trip this, but the public API cannot
 * assume that.
 *
 * @param session - a {@link prepare}d session not yet in the store.
 * @returns the detach disposer (publication hooks + store removal). When called from
 *   a synchronous `session/created` listener, removal and disposal wait until
 *   that creation dispatch unwinds.
 * @throws if a session with this id is already in the store.
 */
enter(session: Session): () => void

/** Emit `session/created` exactly once for an {@link enter}ed session (with
 * the carrier {@link enter} captured). Separate from {@link enter} so the
 * caller can yield the detach disposer first (rollback safety — see
 * {@link enter}).
 * @param session - the entered session to announce to listeners.
 * @throws if the session is not live or its announcement already began,
 *   including a reentrant call from a creation listener. */
announce(session: Session): void

/**
 * Dispatch the awaited `session/flush` durability checkpoint for `session`,
 * with the carrier captured at {@link enter}. THE flush entry point: the
 * store owns the carrier, so callers (the checkpoint policy's per-request
 * barrier, goal-round-driver's idle checkpoint, teardown drains, and consumers
 * that flush themselves before reading storage) must come through here
 * rather than dispatch a raw `ctx.parallel('session/flush', …)` — one owner,
 * one spelling, and the scoped-dispatch invariant can pin it.
 * @param session - the session whose buffered events must reach durable storage.
 * @returns whether at least one durability listener participated, after every
 *   listener has settled successfully.
 * @throws the first registered listener failure after every listener settles.
 */
async flush(session: Session): Promise<boolean>

/**
 * Look up a live session.
 * @param id - the session id to look up.
 * @returns the session, or undefined when no live session has that id.
 */
get(id: SessionId): Session | undefined

/**
 * All live sessions, in creation order.
 * @returns a fresh array; mutating it does not affect the store.
 */
list(): Session[]

/**
 * Create a live child session from an exact prefix of a live source.
 * `boundary` is an inclusive source event seq; omitted means the source's
 * current last event. An open tail receives synthetic tool results and
 * step/turn closers with the forked cause. Closed steps and turns remain
 * unchanged, including any failed tool calls already missing results.
 * `inheritedEventCount` counts only copied source events, excluding these closers.
 *
 * @param source - Live source session object or id.
 * @param boundary - Inclusive source event seq to fork through; omitted means
 *   the source's current last event, and omitted on an empty source forks an
 *   empty child.
 * @param childSessionId - Optional child session id; omitted delegates to
 *   `SessionStore`'s id policy.
 * @returns The created live child session.
 */
fork(source: SessionForkSource, boundary?: SessionSeq, childSessionId?: SessionId): Session
```

Types: [CreateSessionOptions](persistence.zh.md) · [PrepareSessionOptions](persistence.zh.md) · [SessionId](core.zh.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="api-session-events"></a>

### `api-session/*` events

<a id="api-sessionactivity--emit"></a>

#### `api-session/activity` — emit

One user-authored durable message advanced Session list activity.

```ts cordis-catalog
/**
 * One user-authored durable message advanced Session list activity.
 * @mode emit
 * @param sessionId - addressed Session identity.
 * @param updatedAt - durable message time used for list ordering.
 */
'api-session/activity'(sessionId: SessionId, updatedAt: number): void
```

Types: [SessionId](core.zh.md)

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionadded--emit"></a>

#### `api-session/added` — emit

A Session became visible or its Agent was created or disposed. Consumers upsert the summary and replace its current running and availability state.

```ts cordis-catalog
/**
 * A Session became visible or its Agent was created or disposed.
 * Consumers upsert the summary and replace its current running and availability state.
 * @mode emit
 * @param summary - current list row for the Session.
 */
'api-session/added'(summary: SessionSummary): void
```

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionerror--emit"></a>

#### `api-session/error` — emit

One Agent failed outside a durable turn position.

```ts cordis-catalog
/**
 * One Agent failed outside a durable turn position.
 * @mode emit
 * @param sessionId - Agent and Session identity.
 * @param message - user-safe failure chain.
 */
'api-session/error'(sessionId: SessionId, message: string): void
```

Types: [SessionId](core.zh.md)

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionremoved--emit"></a>

#### `api-session/removed` — emit

A Session left the live Host registry.

```ts cordis-catalog
/**
 * A Session left the live Host registry.
 * @mode emit
 * @param sessionId - removed Session identity.
 */
'api-session/removed'(sessionId: SessionId): void
```

Types: [SessionId](core.zh.md)

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionstatus--emit"></a>

#### `api-session/status` — emit

One Agent changed running state.

```ts cordis-catalog
/**
 * One Agent changed running state.
 * @mode emit
 * @param sessionId - Agent and Session identity.
 * @param running - whether the Agent is running.
 */
'api-session/status'(sessionId: SessionId, running: boolean): void
```

Types: [SessionId](core.zh.md)

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="session-events"></a>

### `session/*` events

<a id="sessioncreated--emit"></a>

#### `session/created` — emit

Creation announcement during session publication. A synchronous throw vetoes and rolls back with a paired disposal; detach requested during dispatch is deferred. A returned-promise rejection is logged but cannot retroactively veto this synchronous boundary. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only sessions entered through that agent's context.

```ts cordis-catalog
/**
 * Creation announcement during session publication. A synchronous throw vetoes and rolls
 * back with a paired disposal; detach requested during dispatch is deferred.
 * A returned-promise rejection is logged but cannot retroactively veto this
 * synchronous boundary.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners
 * receive only sessions entered through that agent's context.
 * @param session - the session just entered and announced.
 * @dshScopeScan unsupported
 * @mode emit
 */
'session/created'(this: Scoped<Session>, session: Session): void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="sessiondisposed--emit"></a>

#### `session/disposed` — emit

Emitted once when an announced session leaves the store, including publication rollback, but never for an entry whose creation announcement did not begin. Listener failures are logged and contained. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`) reuses the owner scope.

```ts cordis-catalog
/**
 * Emitted once when an announced session leaves the store, including
 * publication rollback, but never for an entry whose creation announcement
 * did not begin. Listener failures are logged and contained.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`) reuses the owner scope.
 * @param session - the session that is no longer live in the store.
 * @dshScopeScan unsupported
 * @mode emit
 */
'session/disposed'(this: Scoped<Session>, session: Session): void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="sessionevent--emit"></a>

#### `session/event` — emit

Post-commit, fire-and-forget append feed. The listener snapshot resolves before the log push, but callbacks run after it; observer failures are logged and contained without making the committed append fail. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only events from sessions entered through that agent's context.

```ts cordis-catalog
/**
 * Post-commit, fire-and-forget append feed. The listener snapshot resolves
 * before the log push, but callbacks run after it; observer failures are
 * logged and contained without making the committed append fail.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners
 * receive only events from sessions entered through that agent's context.
 * @param session - the session whose log grew.
 * @param event - the appended event, exactly as recorded.
 * @dshScopeScan unsupported
 * @mode emit
 */
'session/event'(this: Scoped<Session>, session: Session, event: SessionEvent): void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="sessionflush--parallel"></a>

#### `session/flush` — parallel

Awaited parallel durability checkpoint: every listener runs and the caller awaits all of them, with no waterfall veto. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`) reuses the session's owner scope.

```ts cordis-catalog
/**
 * Awaited parallel durability checkpoint: every listener runs and the
 * caller awaits all of them, with no waterfall veto. Scope-filtered dispatch
 * (`@deepseek-ai/dsh-scope`) reuses the session's owner scope.
 * @param session - the session whose buffered events must reach durable storage.
 * @dshScopeScan unsupported
 * @mode parallel
 */
'session/flush'(this: Scoped<Session>, session: Session): Promise<void> | void
```

Types: [Scoped](scope.zh.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)
<!-- END GENERATED cordis-surface -->
