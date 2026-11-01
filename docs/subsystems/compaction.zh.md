# 壓縮（compaction）

[English](compaction.md) | 中文

壓縮 seam 是一個[能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)，與 bash 一樣分為 Service Definition（[dsh-compaction](../../packages/compaction/compaction)，`ctx.compaction`）、Service Provider（例如 [dsh-compaction-basic](../../packages/compaction/compaction-basic) 後端）和麵向使用者的 Consumer（[dsh-command-compact](../../packages/compaction/command-compact)）。壓縮是**一項可選能力**，不屬於 agent loop（智慧代理迴圈）主幹，因此其詞彙定義在此而非 [core.md](core.zh.md) 中。基於 tokenizer 或範本的後端是實作同一介面的兄弟包。與 bash 不同，該介面必然依賴 `dsh-session` 和 `dsh-llm`：其動詞作用於 agent 所有的 `Session`，而其持久摘要事件使用 `ContentBlock` 詞彙（見[壓縮能力 seam Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.zh.md)）。

原始碼：[`packages/compaction/compaction/src/types.ts`](../../packages/compaction/compaction/src/types.ts)

## `compaction/*` 工作階段事件

壓縮透過宣告合併為 [`SessionEventMap`](session.zh.md) 擴充功能三種事件型別。三者都**僅寫入日誌**——它們記錄鎖、摘要、選中範圍、被遮蔽事件 seq、token 數以及模型呼叫，絕不進入 surface。這裡有意不擴充功能 `SurfaceEventType`（只有產生訊息的事件才到達模型），因此摘要本身承載在另一條帶有 `surfaceOp: { op: 'replace', startSeq, endSeq }` 的 `user/message` 上——這是摘要壓縮執行的唯一 surface 變更。[Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.zh.md) 負責複用 `user/message` 的決策依據。

| 事件 | 載荷 | 作用 |
|---|---|---|
| `compaction/start` | `{ turn }` | 取得日誌記錄的鎖；數字標識尚未結束的自動輪次，`null` 標識獨立手動嘗試 |
| `compaction/summary` | `{ summary, rawOutput?, llmStreamCall?, shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage? }` | 安全摘要投影、可選的完整提供者輸出與 usage、生成結果時恰好透過此上下文的 `ctx.llm.stream()` 發起一次呼叫所帶的 `llmStreamCall: true` 標記（此時必須提供完整的 `rawOutput`）、被遮蔽的 surface 邊界對（`start`/`end` seq——位置跨度，而非數值區間）、按 surface 順序排列的被遮蔽 seq、估算 token 數，以及摘要呼叫的 envelope（`provider`、`model`，若有生成上限則還包括該上限）——寫入日誌後，該一次性請求可由日誌 + 程式碼重建（見可重建性 Agent Note）；未帶標記的 `rawOutput` 並不能判定呼叫路徑 |
| `compaction/end` | `{ turn, error? }` | 使用相同的數字或 `null` 歸屬值釋放鎖（`error` 記錄失敗嘗試） |

鎖括住**整個**操作：先追加 `compaction/start`，然後執行摘要生成、寫入 `compaction/summary` 記錄與 `user/message` 替換，最後才追加 `compaction/end`。最後釋放鎖意味著操作中途崩潰會表現為可檢測的遺留鎖（有 `compaction/start` 而無匹配的 `compaction/end`），而非一個虛假聲稱壓縮已完成的 `compaction/end`。

這些標記表示鎖的時間點，而不是排他的容器。摘要等待期間，不相關的空閒注入可以出現在獨立的手動 start 與 end 之間。手動路徑只重新驗證所選位置 span，因此替換檢查點之後仍保留該注入上下文。活動的未匹配 start 會阻塞所有入口點；較新 `session/end-seed` 之前的未匹配 start 是先前生命週期留下的陳舊證據，會被忽略。

這些變體在 `declare module '@deepseek-ai/dsh-session/types'` 塊內合併，因此——與其他子系統頁面上的頂層型別不同——它們不以漂移檢查的 ` ```ts type-equiv ` 塊貼上（`verify-type-equiv` 提取器只按名稱匹配頂層宣告）。上方的載荷表即為目錄條目；權威欄位請循原始碼連結檢視。

<a id="image-offload"></a>
## 圖片省略

`compaction-image-offload` 擁有 `image/offload` 宣告及其純訊息投影。每個目標指定目前輸入節點和按深度優先計數的確切圖片位置。事件保留節點和訊息身份，不攜帶 `surfaceOp`。[包 README](../../packages/compaction/compaction-image-offload/README.zh.md)負責恢復策略、註冊和獨立回放說明。

```ts type-equiv
/** Exact input-image occurrences selected by one durable offload decision. */
interface ImageOffloadTarget {
  /** Current message-producing event containing these occurrences. */
  seq: SessionSeq
  /** Zero-based depth-first image indexes within the immutable message. */
  imageIndexes: number[]
}
```

## `CompactionResult`

成功壓縮向呼叫方返回：記帳事件 seq、安全摘要投影、被遮蔽的範圍與 seq，以及估算 token 數。

```ts type-equiv
/** Result of a successful compaction operation. */
interface CompactionResult {
  /** Stable identity shared by this compaction's complete durable lifecycle. */
  compactionId: CompactionId
  /** Human command that initiated this compaction, when it was manual. */
  sourceCommandId?: CommandId
  /** The seq of the appended `compaction/start` event. */
  startSeq: SessionSeq
  /** The seq of the appended `compaction/summary` event. */
  summarySeq: SessionSeq
  /** The seq of the appended `compaction/end` event. */
  endSeq: SessionSeq
  /** The summary content blocks produced by the backend. */
  summary: ContentBlock[]
  /**
   * The surface-boundary pair that was shadowed: the seqs of the first
   * (`start`) and last (`end`) surface nodes of the replaced range. A
   * surface-POSITION span, not a numeric seq interval — after a prior replace
   * lands a fresh high-seq summary node at an older range's position, `start`
   * can be GREATER than `end`. {@link CompactionResult.shadowedSeqs} is the
   * authoritative set of shadowed nodes, in surface order.
   */
  shadowedRange: { start: SessionSeq; end: SessionSeq }
  /** The seqs of all shadowed surface nodes, in surface order. */
  shadowedSeqs: SessionSeq[]
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
}
```

## 服務

自動呼叫方會說明策略為何執行；實作可以比普通壓力更激進地處理已確認的溢位。

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactionEngine` 暴露 `compactIfNeeded(agent, trigger, signal)` 以執行自動 `pressure` 或 `context-overflow` 策略，暴露 `compactNow(agent, signal)` 以便即使未達到壓力也對空閒工作階段進行一次有效縮減，還針對顯式、兩端均包含的 surface 範圍暴露 `compactRegion(...)`。`compactNow()` 作為輪次之間的 agent maintenance 執行；沒有有效範圍時返回 `null` 且不寫入；在摘要前記錄獨立的 `turn: null` 標記對，並在後續排隊提示詞能夠從新表層派生前 flush 已閉合嘗試。每個後端都使用 `compactCheckpointSource(compactionId, sourceCommandId?)` 建立替換用 `user/message` 的源；client 與 wire 消費方從無 Cordis 的 `@deepseek-ai/dsh-compaction/checkpoint` 子路徑匯入該建構函式、`CompactionCheckpointSource` 和 `isCompactCheckpointSource()`，包根則為 host 消費方重新匯出它們。必填的事務身份會關聯替換檢查點，而該判定函式使檢查點識別不依賴任一特定後端。實作必須把傳入的 signal 轉發給摘要流程。該 seam 不擁有計價 API：單例 [`ctx.tokenMeter`](token-meter.zh.md) 直接擁有估算與回放，而 `dsh-compaction-basic` 擁有保留策略、事件排序、按路由執行的摘要呼叫及其設定。

預期的手動失敗使用 `ManualCompactionErrorCode`：

```ts type-equiv
/** Expected failure classes for an explicit idle-session compaction request. */
type ManualCompactionErrorCode =
  | 'busy'
  | 'cancelled'
  | 'changed'
  | 'summary'
  | 'commit'
  | 'persistence'
```

`changed` 和 `summary` 閉合失敗嘗試並將其持久化到日誌，不寫入摘要替換；恢復過程中記錄的圖片省略仍然有效。`commit` 可能發生在部分變更之後；`persistence` 表示記憶體中的標記對已閉合，但 flush 失敗。取消獨立於這些失敗，並在完成必要清理後丟擲原始 abort 原因。

壓力壓縮在 `agent/pre-step` waterfall（瀑布式事件）中執行，先於請求推導。一旦壓力或規範化溢位滿足條件，compaction-basic 會在選擇範圍前呼叫可選的 [`ctx.toolResultPruner`](../../packages/compaction/compaction-tool-result-pruner/README.zh.md)，再透過 `ctx.tokenMeter` 重新測量，並且可以在不生成摘要的情況下推進 surface。失敗請求的恢復在失敗的步驟關閉後透過 `agent/request-error` 執行；僅當 surface replacement generation 前進時才返回重試動作，即便後續摘要工作在剪枝後拋異常亦如此；取消仍然優先。區域邊界保持工具呼叫/結果配對，但不保持整個輪次，因此一個過大輪次中較早關閉的步驟可以被壓縮。`dsh-compaction-basic` 擁有閾值、保留尾部策略、溢位上限與失敗處理。

該 Service Definition 匯出 `toolPairingBalancedBefore(session, seq)` 與 `toolPairingBalancedAfter(session, seq)`，用於檢查 seq 之前與之後的工具呼叫/結果配對。兩者都會驗證目前 surface 成員關係，並拒絕缺失的 seq 與遺留結果；[包約定](../../packages/compaction/compaction/README.zh.md#tool-pairing-boundaries)定義其快取行為。

## 工具結果剪枝產出

可選的工具結果剪枝服務會報告每次持久內容替換以及 Unicode code point 的總減少量。其公開結果型別位於 [`compaction-tool-result-pruner/src/types.ts`](../../packages/compaction/compaction-tool-result-pruner/src/types.ts)。

```ts type-equiv
/** Cited source event and size accounting for one landed surface replacement. */
interface PrunedEntry {
  /** Full-fidelity tool-result event shadowed by the replacement. */
  readonly originalSeq: SessionSeq
  /** Newly appended pruned tool-result event. */
  readonly replacementSeq: SessionSeq
  /** Tool call shared by the original and replacement. */
  readonly callId: ToolCallId
  /** Original text size in Unicode code points. */
  readonly charsBefore: number
  /** Replacement text size in Unicode code points. */
  readonly charsAfter: number
}
```

```ts type-equiv
/** Aggregate outcome of one stable-surface pruning pass. */
interface PruneResult {
  /** Replacements in the snapshotted surface order. */
  readonly pruned: readonly PrunedEntry[]
  /** Total Unicode code points removed across replacements. */
  readonly charsRemoved: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcompaction--compactionengine-abstract-seam"></a>

### `ctx.compaction` — `CompactionEngine` (abstract seam)

Abstract compaction service. Implementations own trigger policy, retention, and summarization, and may consume a separate measurement service. A successful run replaces the selected surface span with one summary node and prevents concurrent compaction of the same session. The replacement user message uses compactCheckpointSource with the transaction identity so consumers recognize and correlate it independently of the backend. Load one implementation per context as `ctx.compaction`.

```ts cordis-catalog
/**
 * Consider automatic compaction for one explicit trigger. Pressure policy
 * uses the latest durable routed request, while context-overflow policy may
 * force a useful balanced reduction even below the normal threshold. Return
 * `null` when no safe range can be compacted. A single oversized retained
 * unit or request envelope cannot be repaired through surface compaction.
 *
 * @param agent - agent context owning the session surface and routing options.
 * @param trigger - normal pressure or provider-confirmed context overflow.
 * @param signal - cancellation signal; model-backed implementations must forward it.
 * @returns the compaction result, or `null` if no compaction was needed.
 */
abstract compactIfNeeded( agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal, ): Promise<CompactionResult | null>

/**
 * Explicitly compact useful history even below automatic pressure thresholds.
 * Implementations synchronously start an idle task before any asynchronous
 * work, select a useful range without writing on a no-op, then
 * append a standalone `compaction/start` before summarization. That durable
 * marker is the compaction lock until one `compaction/end` attempt. Later waking
 * prompts remain accepted in FIFO order and start only after the optional
 * durability checkpoint and idle-task settlement. Context injected while the
 * summary runs may sit between the marker pair; only the selected span must
 * remain stable.
 *
 * @param agent - idle agent whose durable history should be compacted.
 * @param signal - cancellation scoped to this compaction request.
 * @param sourceCommandId - initiating command identity for a manual compaction.
 * @returns the compaction result, or `null` when no safe useful range exists.
 * @throws {@link ManualCompactionError} for expected busy, agent-cancellation,
 * changed-span, summarization/shrink, commit-stage, or persistence failures;
 * an aborted request preserves its exact abort reason. Failed attempts remain
 * visible in the log.
 */
abstract compactNow( agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId, ): Promise<CompactionResult | null>

/**
 * Forcibly compact a range of surface nodes into a single summary node.
 * `start` and `end` name an inclusive span by surface position, not numeric seq
 * order; replacements can make visible seqs non-monotonic. Both edges must be
 * balanced so assistant tool calls remain paired with their results. A model-
 * backed implementation forwards cancellation and rejects active, missing,
 * reversed, or unbalanced ranges. The target session is `agent.session`.
 * Its replacement user message must use {@link compactCheckpointSource} with
 * the transaction's `CompactionId`.
 * Use {@link toolPairingBalancedBefore} and {@link toolPairingBalancedAfter}
 * for the edge checks.
 *
 * @param start - first surface seq, inclusive.
 * @param end - last surface seq, inclusive.
 * @param agent - context whose session is mutated and whose routing options guide summarization.
 * @param signal - optional cancellation; model-backed implementations must forward it.
 * @throws when compaction is active or the range is missing, reversed, or unbalanced.
 * @returns the appended event seqs, summary, replaced range, and token accounting.
 */
abstract compactRegion( start: SessionSeq, end: SessionSeq, agent: CompactionAgentContext, signal?: AbortSignal, ): Promise<CompactionResult>
```

Types: [CommandId](commands.zh.md) · [SessionSeq](session.zh.md)

Source: [`packages/compaction/compaction/src/index.ts`](../../packages/compaction/compaction/src/index.ts)

<a id="ctxtoolresultpruner--toolresultpruner"></a>

### `ctx.toolResultPruner` — `ToolResultPruner`

Deterministic head/middle/tail pruning for current tool-result surface nodes.

```ts cordis-catalog
/**
 * Measure text content in Unicode code points; non-text blocks cost zero.
 * @param blocks - tool-result content to measure.
 * @returns total Unicode code points across text blocks.
 */
measureContent(blocks: readonly ContentBlock[]): number

/**
 * Replace an over-budget text middle while retaining rich-block order.
 * Text slicing is by Unicode code point, not UTF-16 code unit, so a retained
 * boundary cannot split a surrogate pair. Grapheme clusters may still split.
 * @param blocks - original tool-result content.
 * @returns pruned content, or `null` when the text is within budget.
 */
pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null

/**
 * Prune every over-budget tool result from one stable current-surface snapshot.
 * Each replacement preserves the complete event data except for `content`,
 * cites the shadowed node so replay can recover the replacement input, and is
 * immediately preceded by a `compaction/prune` shadow-price event pricing the
 * shadowed node through the injected token meter, so pure consumers can
 * subtract it without per-node state.
 * @param session - session whose current surface is rewritten.
 * @returns landed replacements and aggregate Unicode-code-point savings.
 * @throws when the session rejects a replacement; replacements committed
 * earlier in the pass remain durable.
 */
pruneSession(session: Session): PruneResult
```

Types: [ContentBlock](llm-streaming.zh.md) · [Session](session.zh.md)

Source: [`packages/compaction/compaction-tool-result-pruner/src/index.ts`](../../packages/compaction/compaction-tool-result-pruner/src/index.ts)

<a id="compaction-events"></a>

### `compaction/*` events

<a id="compactionsummary-error--waterfall"></a>

#### `compaction/summary-error` — waterfall

Recover a failed summary request by synchronously recording a durable change to its selected input. Return true only after making progress; the provider re-derives and re-prices the selection before retrying. Call next() when the failure cannot be recovered. Decisions survive a later summary failure or cancellation.

```ts cordis-catalog
/**
 * Recover a failed summary request by synchronously recording a durable
 * change to its selected input. Return true only after making progress;
 * the provider re-derives and re-prices the selection before retrying.
 * Call next() when the failure cannot be recovered. Decisions survive a
 * later summary failure or cancellation.
 * @param payload.session - session containing the selected input.
 * @param payload.sourceEventSeqs - selected message events in request order.
 * @param payload.error - failure thrown by the summarizer.
 * @param payload.signal - optional compaction cancellation signal.
 * @param next - delegate to the next recovery listener.
 * @mode waterfall
 */
'compaction/summary-error'(payload: { session: Session; sourceEventSeqs: readonly SessionSeq[]; error: unknown; signal?: AbortSignal }, next: () => boolean): boolean
```

Types: [Session](session.zh.md) · [SessionSeq](session.zh.md)

Source: [`packages/compaction/compaction/src/index.ts`](../../packages/compaction/compaction/src/index.ts)
<!-- END GENERATED cordis-surface -->
