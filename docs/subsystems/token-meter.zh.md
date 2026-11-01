# Token 計量

[English](token-meter.md) | 中文

`@deepseek-ai/dsh-token-meter` 公開一個獨立的回放快照，用於表示請求壓力與按位置計算的表層定價。`logRevision` 表示生成該計量中每個欄位時所消費的持久事件數量。

來源：[`packages/llm/token-meter/src/types.ts`](../../packages/llm/token-meter/src/types.ts)

## `TokenMeasurement`

```ts type-equiv
/** Detached immutable request-pressure and surface snapshot at one consumed log revision. */
interface TokenMeasurement {
  /** Number of durable events consumed; equal to the next unread event seq. */
  readonly logRevision: SessionLogOffset
  /** Provider or heuristic anchor used for this measurement. */
  readonly baseline: TokenMeasurementBaseline
  /** Signed repricing of current surface content relative to the baseline anchor. */
  readonly surfaceDeltaTokens: number
  /** Non-negative current request-and-response pressure. */
  readonly totalTokens: number
  /** Total route-priced request tokens across the current surface; equals the sum of the node prices. */
  readonly surfaceTokens: number
  /** Current surface nodes in positional head-to-tail order. */
  readonly nodes: readonly TokenSurfaceNode[]
}
```

每次計量都會透過 `ctx.llm` 把生效信封的路由 provider/model 解析為該路由宣告的請求圖片定價，因此圖片出現處按請求實際傳送的視覺 token 加模型可見文字計價；未宣告定價的路由與組合保持固定啟發式規則。`baseline.kind === 'usage'` 表示最近一次成功的提供者呼叫具有相同的規範請求 envelope，且該呼叫的總量不低於其完整路由定價錨點。`estimated` 表示不存在可複用的保守 usage 錨點，因此服務自行對完整信封和表層定價。後續成功請求會替換早先的錨點；有符號的 `surfaceDeltaTokens` 會保留相對於匹配錨點的增長與縮減，且兩側按同一路由重新定價。`totalTokens` 仍表示請求與回應壓力，`surfaceTokens` 則是表層的路由定價總量，等於所有節點價格之和。

## `TokenSurfaceNode`

```ts type-equiv
/** One token-priced node in the current ordered session surface. */
interface TokenSurfaceNode {
  /** Durable sequence number of the surface event. */
  readonly seq: SessionSeq
  /**
   * Request-pressure tokens for the exact message projected by this node under
   * the measured route: image occurrences carry the route's declared visual
   * price when the routed adapter declares one, and the fixed heuristic
   * otherwise. Trigger, retention, and range selection all read this price.
   */
  readonly tokens: number
  /**
   * Fixed-heuristic tokens for the same message, independent of any route.
   * The shadow-price protocol prices replacements with this value so the O(1)
   * projection fold stays in agreement with its own appends.
   */
  readonly heuristicTokens: number
}
```

表層順序具有權威性；替換節點的持久 seq 可能高於位置排在其後的節點。該快照不可變，不會隨底層回放摺疊推進而增長。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtokenmeter--tokenmeter"></a>

### `ctx.tokenMeter` — `TokenMeter`

Replay owner for one service-wide estimator and isolated per-session folds.

```ts cordis-catalog
/**
 * Measure current request pressure and surface through the durable tail.
 *
 * The effective envelope's routed provider/model selects the request-image
 * pricing every node is priced under: a route whose adapter declares image
 * pricing charges each retained image its visual tokens plus its
 * model-visible text, while other routes keep the fixed heuristic. Provider
 * usage is reused only when the latest successful call's canonical request
 * envelope matches `requestHeader` and its total is no lower than that
 * call's full route-priced anchor; otherwise the complete envelope and
 * surface are repriced. The anchor includes all surface nodes immediately
 * before the assistant message, including inputs admitted after step/start.
 *
 * `requestHeader` replaces the latest logged envelope for pressure and node
 * pricing; the node set always describes the current session surface. Every
 * call clones those positional nodes, so measurement is O(surface).
 *
 * @param session - session to replay through its current durable tail.
 * @param requestHeader - optional effective request envelope replacing the latest logged header.
 * @returns a detached deeply immutable pressure and surface measurement.
 */
measure(session: Session, requestHeader?: EpochHeader): TokenMeasurement

/**
 * Heuristically price one model-visible message (instance face of the pure
 * `estimateMessage` export from `estimate.ts`).
 * @param message - message to price without mutation.
 * @returns content and role-framing tokens under the fixed service heuristic.
 */
estimateMessage(message: Message): number
```

Types: [EpochHeader](session.zh.md) · [Message](llm-streaming.zh.md) · [Session](session.zh.md)

Source: [`packages/llm/token-meter/src/index.ts`](../../packages/llm/token-meter/src/index.ts)
<!-- END GENERATED cordis-surface -->
