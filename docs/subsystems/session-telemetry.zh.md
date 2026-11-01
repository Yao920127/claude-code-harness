# 遙測（telemetry）

[English](session-telemetry.md) | 中文

對外的工作階段上報拆分為一項[能力 seam](../capability-seams.zh.md)：Service Definition 與捕捉協調器（[dsh-session-telemetry](../../packages/session/session-telemetry)，`ctx.sessionTelemetry`）擁有完整的權威事件捕捉、`session-telemetry/record` 脫敏 waterfall（瀑布式事件）、handoff 遊標與最小後端約定；部署方載入的 Service Provider（[dsh-session-telemetry-otel](../../packages/session/session-telemetry-otel)）則是原樣設定的 OpenTelemetry JS SDK 日誌流水線。它是一項可選能力，不屬於 agent loop（智慧代理迴圈）主幹，這裡也沒有任何內容會進入模型請求。邊界公理（harness 的職責止於 `emit()`；批處理、重試、排隊與丟失策略都屬於上報 SDK）連同被否決的替代方案，均已在[復活 Agent Note](../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.zh.md)中定案；捕捉與遊標約定見 [Service Definition README](../../packages/session/session-telemetry/README.zh.md)。

原始碼：[`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

## 邏輯記錄

```ts type-equiv
/**
 * Severity of a telemetry record, pre-mapped at capture so a receiver can
 * alert with zero configuration: `error` for events whose own outcome flag
 * says so (the tool message's `isError`, `turn/end` error reasons) and for
 * `agent-error` operational records. Captured events otherwise default to
 * `info`; `warn` remains available to `session-telemetry/record` policies and
 * backends.
 */
type SessionTelemetrySeverity = 'info' | 'warn' | 'error'
```

```ts type-equiv
/**
 * One logical record handed to a backend — the capture contract's whole outbound
 * vocabulary. Ledger records mirror session-log events one-to-one;
 * operational records (`channel: 'ops'`) carry the two signals with no log
 * home (`agent-error`, `shutdown`) and deliberately omit `event.seq`-style
 * identity so they can never be mistaken for ledger rows.
 */
interface SessionTelemetryRecord {
  /** Ledger (session-log mirror) or ops (operational signal) channel; backends keep the two under separate instrumentation scopes. */
  channel: 'ledger' | 'ops'
  /** Unix epoch milliseconds — the source event's append time for ledger records, the emission time for ops records. */
  time: number
  /** Pre-mapped alerting severity; see {@link SessionTelemetrySeverity}. */
  severity: SessionTelemetrySeverity
  /**
   * Identity attributes, deliberately minimal: ledger records carry
   * `session.id`, `session.format_version`, `event.type`, `event.seq`, plus optional
   * `session.cwd` / `session.parent_id`; a seeded Session also carries
   * `session.seed_length` from its exact inherited event count;
   * ops records carry `telemetry.op`, `session.id`, and (for `agent-error`)
   * `agent.id`, `turn`, `step`, `error.name`. Anything recoverable from the
   * body is intentionally NOT duplicated here.
   */
  attributes: Record<string, string | number>
  /**
   * The complete payload: a deep copy of the session event's `data` for
   * ledger records (JSON-serializable by `Session.append`'s own
   * validation), or the op payload for ops records. Never mutated after
   * handoff.
   */
  body: unknown
}
```

每條權威[工作階段事件](session.zh.md)都會完整直接傳遞為一條有序 ledger 記錄，包括每個攜帶完整緊湊 stream 的 `assistant/message` 或 `assistant/attempt`，以及該 seam 從未聽說過、由外掛合並進來的型別。程序本地 `agent/assistant-stream` frame 不進入該持久 feed。新 fork 從子工作階段自有字尾開始，包括繼承標記和 fork 結束事件；恢復的 Session 從已儲存字首之後開始，包括恢復的 fork。後端可以選擇 `includeHistory` 來包含完整字首；重新收養同一物件時會從 handoff 遊標之後繼續。投遞是盡力而為的：遊標標記的是「已交接」而非「已送達」，記錄可能丟失（崩潰、過載視窗）也可能重複（新物件回放、SDK 重試），因此接收端對 ledger 記錄基於 `(session.id, session.format_version, event.seq)` 去重；ops 記錄刻意省略這類標識——它們是用於告警的訊號，而非用於累加的條目，重複被容忍而非被去重。

## 共享披露

每個後端都透過 `ctx.sessionTelemetry` 上必需的抽象 `sharing` 成員暴露其部署級模式（[Service Definition README](../../packages/session/session-telemetry/README.zh.md#the-sharing-disclosure)）。它既不是逐 Session 的接納決定，也不是投遞迴執。`/feedback` 確認文字不查詢它。

```ts type-equiv
/**
 * Deployment-selected session-sharing mode, not confirmation of SDK delivery.
 */
type SessionTelemetrySharingStatus = 'full' | 'feedback-only' | 'disabled'
```

## 捕捉策略

```ts type-equiv
/** Whether capture follows live events or reads the canonical log only when requested. */
type SessionTelemetryCapture = 'live' | 'on-demand'
```

```ts type-equiv
/** Backend-selected capture mode and history policy. */
interface SessionTelemetryCaptureOptions {
  /** Follow live events, or wait for explicit capture; defaults to live. */
  capture?: SessionTelemetryCapture
  /** Include inherited fork history and stored history from earlier lifecycles; defaults to false. */
  includeHistory?: boolean
}
```

`includeHistory` 允許捕捉儲存與繼承的記錄，但本身不授權捕捉。[OTel 後端](../../packages/session/session-telemetry-otel/README.zh.md)使用按需捕捉，並要求新的自身顯式回饋；它只釋放截至該回饋的完整字首，適用於所有提供者。

## 後端約定

```ts type-equiv
/**
 * The minimum backend contract the coordinator requires. {@link SessionTelemetryBackend} is
 * its service-registered form; tests compose the coordinator with a bare
 * implementation of this interface.
 */
interface SessionTelemetrySink {
  /**
   * Hand one record to the backend's pipeline. MUST be a non-blocking
   * enqueue — the coordinator calls this synchronously from the
   * `session/event` hot path or an explicit canonical-log capture, so anything
   * slower than a queue push would tax the agent loop or feedback handling.
   * Errors thrown here are contained by the coordinator and logged; they
   * never reach the loop.
   * @param record - the logical record to report; owned by the backend after the call.
   */
  emit(record: SessionTelemetryRecord): void
  /**
   * Optional hint that a turn ended. A backend may forward it to its SDK's
   * flush so records are exported after each turn. Called
   * fire-and-forget; implementations must not block and must not throw
   * meaningfully (the coordinator contains exceptions). Most backends should
   * leave this unimplemented and let their SDK's own batching cadence govern
   * export timing: a backend that does implement it owns the interaction
   * between its concurrent flushes and {@link shutdown}'s drain (the OTel
   * backend leaves it unimplemented for exactly that hazard — see the
   * revival Agent Note).
   */
  flush?(): void
  /**
   * Forward the fiber's disposal to the SDK: flush whatever is queued and
   * reach quiescence, per the SDK's own shutdown contract. Everything
   * emitted before this call must still be delivered — including records
   * enqueued while a {@link flush} hint is in flight, so a backend whose SDK
   * guards against concurrent flushes orders behind the outstanding one (the
   * coordinator emits its dispose-time `shutdown` markers immediately before
   * calling this). Awaited by the coordinator's dispose; a rejection is
   * logged as a warning and never fails application teardown.
   * The coordinator captures dispose-time shutdown markers immediately before
   * this call for live capture; on-demand capture creates no ops records.
   * @returns resolves when the backend's pipeline has quiesced.
   */
  shutdown(): Promise<void>
}
```

`SessionTelemetryBackend`（`ctx.sessionTelemetry`，[簽名](#ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam)）是該約定的可載入形態：每個上下文只允許一個實作，重複載入會丟擲異常；後端在其建構函式中組合 seam 的 `SessionTelemetryCoordinator`，以此裝配捕捉側。

## 脫敏 waterfall：`session-telemetry/record`

每條記錄在權威事件副本與 `emit()` 之間都要經過 `session-telemetry/record` [waterfall](../cordis-primer.zh.md#cordis-waterfall-semantics)（[事件條目](#session-telemetryrecord--waterfall)）。seam 自身不帶任何規則：未掛載監聽器時，記錄以捕捉時的原樣到達後端；匯出資料能幹淨到什麼程度，恰恰取決於部署方掛載了什麼規則。監聽器透過變換 `next()` 的回傳值來堆疊；不呼叫 `next()` 就返回，即替換其下方的全部邏輯；丟擲異常的監聽器會在協調器的隔離範圍內以 fail-closed 方式扣下這一條記錄。脫敏只作用於匯出副本；權威工作階段日誌永不改寫。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam"></a>

### `ctx.sessionTelemetry` — `SessionTelemetryBackend` (abstract seam)

Loadable form of the backend contract: one implementation per context — the cordis `Service` registration under the `telemetry` key throws on a duplicate, cordis' standard behavior. A backend composes a SessionTelemetryCoordinator in its constructor to install the capture side.

```ts cordis-catalog
/**
 * See {@link SessionTelemetrySink.emit} — that declaration is the contract's one home.
 * @param record - the logical record to report; owned by the backend after the call.
 */
abstract emit(record: SessionTelemetryRecord): void

/** See {@link SessionTelemetrySink.flush}. */
flush?(): void

/**
 * See {@link SessionTelemetrySink.shutdown}.
 * @returns resolves when the backend's pipeline has quiesced.
 */
abstract shutdown(): Promise<void>
```

Source: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

<a id="session-telemetry-events"></a>

### `session-telemetry/*` events

<a id="session-telemetryrecord--waterfall"></a>

#### `session-telemetry/record` — waterfall

Transform one outbound record before it reaches the backend. This waterfall is the Service Definition's redaction extension point. It ships NO rules of its own: the innermost `next()` passes the record through unchanged, and with no listener mounted records reach the backend as captured, so exported data is exactly as clean as the rules a deployment mounts. Listeners stack by transforming `next()`'s return value; returning without `next()` replaces everything beneath. Dispatched synchronously on the capture hot path inside the coordinator's containment: a throwing listener withholds that one record (fail-closed) and never reaches the agent loop. Live capture dispatches at append time; on-demand capture dispatches while reading the canonical log. Redaction applies to the exported copy only; the canonical session log is never rewritten.

```ts cordis-catalog
/**
 * Transform one outbound record before it reaches the backend. This
 * waterfall is the Service Definition's redaction extension point. It ships NO rules
 * of its own: the
 * innermost `next()` passes the record through unchanged, and with no
 * listener mounted records reach the backend as captured, so exported
 * data is exactly as clean as the rules a deployment mounts. Listeners
 * stack by transforming `next()`'s return value; returning without
 * `next()` replaces everything beneath. Dispatched synchronously on the
 * capture hot path inside the coordinator's containment: a throwing
 * listener withholds that one record (fail-closed) and never reaches the
 * agent loop. Live capture dispatches at append time; on-demand capture
 * dispatches while reading the canonical log. Redaction applies to the
 * exported copy only; the canonical session log is never rewritten.
 * @param record - the candidate record, already the coordinator's own deep
 *   copy; listeners return a (possibly new) record and must not mutate it.
 * @mode waterfall
 */
'session-telemetry/record'(record: SessionTelemetryRecord, next: () => SessionTelemetryRecord): SessionTelemetryRecord
```

Source: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)
<!-- END GENERATED cordis-surface -->
