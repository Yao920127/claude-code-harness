# 後臺任務執行時

[English](jobs.md) | 中文

長時間執行的生產方、`ctx.jobs` 與任務控制命令共用的型別。[seam 收斂 Agent Note](../../.agents/notes/implemented/architecture/2026-09-03-jobs-seam-consolidation.zh.md) 負責目前設計，[執行時 Agent Note](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.zh.md) 記錄其起源；本頁記錄 [`packages/jobs/jobs/src/types.ts`](../../packages/jobs/jobs/src/types.ts) 與用戶端安全葉子 [`view.ts`](../../packages/jobs/jobs/src/view.ts) 中的確切欄位與變體。

## ID 與狀態

`JobId` 是按 `<kind>-N` 生成的[品牌化 id](core.zh.md#branded-ids)。存取控制依賴擁有者授權，而非 id 的保密性。`JobKind` 派生自可合併擴充功能的 map；註冊表將各個 kind 視為不透明的 id 名稱空間。

```ts type-equiv
/**
 * Producer-defined job kinds. Plugins extend this map by declaration merging;
 * the registry treats every value as an opaque id namespace.
 */
interface JobKindMap {
  bash: 'bash'
  subagent: 'subagent'
}
```

`JobStatus` 為 `'running' | 'stopping' | 'completed' | 'killed' | 'failed'`；生產方特有的事實在執行期間歸入 `JobView.progress`，結算後歸入 `JobView.detail`。

## 生產方約定

`JobSpec` 宣告身份、擁有者工作階段、可選的拉取式 `output` 源與啟動器。執行時會在完成預檢後攜帶該 job 的 `JobHandle` 呼叫 `run()`，隨後提交註冊，不再執行可能失敗的步驟。生產方擁有執行資源；執行時擁有身份、存取、生命週期狀態與輸出環。

```ts type-equiv
/**
 * Producer declaration passed to {@link JobRegistry.start}. The runtime
 * preflights access and cleanup before invoking {@link run}; the producer owns
 * execution resources while the runtime owns identity, lifecycle state, and
 * the output ring.
 */
interface JobSpec {
  /** Producer kind — also the id prefix (`bash`, `subagent`, …). */
  kind: JobKind
  /** One-line model-facing label (the command; the delegation description). */
  label: string
  /**
   * Owning session. Access is fenced by it, and the owner's live Agent must be
   * the one currently registered under that id: its disposal cancels and
   * awaits the job. Omitting the owner creates an unowned job, open to any
   * caller until service disposal.
   */
  owner?: SessionId
  /**
   * Optional UTF-8 byte cap for each complete model-facing completion notice or
   * output read, including controller status metadata. Independent of ring
   * retention: it bounds the consuming model surface, never observers.
   */
  outputLimitBytes?: number
  /**
   * Pull sources the registry pumps into the ring at its own cadence.
   * Producers that narrate their own progress use {@link JobHandle.append}
   * instead; a job may use both.
   */
  output?: readonly JobOutputSource[]
  /**
   * Start the work after preflight and synchronously return its hooks. Called
   * once with the job's producer face; a throw leaves nothing registered (the
   * spent ordinal is skipped), and the producer must clean up any partially
   * started resources.
   * @param job - the issued id plus the ring append and progress writers.
   */
  run(job: JobHandle): JobHooks
}
```

```ts type-equiv
/**
 * Producer face of one registered job, handed to {@link JobSpec.run} and
 * valid for the job's whole life. All methods are synchronous. Writes staged
 * inside the starter call are retained and become visible with the
 * registration commit; after settlement — the producer's own outcome, a kill,
 * or a registry-forced teardown end — writes log and drop instead of
 * throwing, so a producer's trailing flush cannot break its own teardown path.
 */
interface JobHandle {
  /** The registry-issued id (`<kind>-N`). */
  readonly id: JobId
  /**
   * Append one chunk to the output ring. Offsets advance by the chunk's UTF-8
   * byte length; an empty chunk is dropped without waking observers.
   * @param text - the chunk text, exactly as produced.
   * @param options - stream label and gap marker.
   */
  append(text: string, options?: JobAppendOptions): void
  /**
   * Replace the live progress line (`3/10`, the current phase). Settlement
   * clears it; the terminal reason travels in {@link JobOutcome.detail}.
   * @param line - the new progress line.
   */
  updateProgress(line: string): void
}
```

`JobHooks.done` 會在生產方釋放其資源後 resolve，而不是僅在工作完成時 resolve。結果是一個值而非流的 job——subagent 的報告、workflow 渲染出的結果——把它作為 `JobOutcome.result` 返回；模型在結算後的第一次讀取攜帶它一次。

```ts type-equiv
/** Hooks through which the runtime controls and observes producer work. */
interface JobHooks {
  /**
   * Request termination. Must be synchronous, idempotent, and eventually settle
   * {@link done}; throws propagate. The optional reason is forwarded verbatim.
   */
  cancel(reason?: string): void
  /**
   * Resolves after the producer releases its resources, not merely when work
   * finishes. Must not reject; the runtime converts a rejection to `failed`.
   * If teardown cancellation throws, the runtime may force-fail only the
   * registry record without claiming that the work stopped.
   */
  done: Promise<JobOutcome>
}
```

```ts type-equiv
/** Terminal result supplied by a producer through {@link JobHooks.done}. */
interface JobOutcome {
  /** How the job ended: finished (`completed`), cancelled (`killed`), or broke (`failed`). */
  status: 'completed' | 'killed' | 'failed'
  /**
   * Terminal reason rendered into status lines (`exit code: 3`, `max-tokens`).
   * When the job settles `killed` after a {@link JobRegistry.kill} with a
   * reason, the registry appends that reason.
   */
  detail?: string
  /**
   * Return value for jobs whose result is a value rather than a stream (a
   * workflow's rendered result, a subagent's report). The output ring carries
   * the stream; this is handed out once by the model's next {@link JobRegistry.read}.
   */
  result?: string
}
```

拉取源把一個非消耗的偏移讀取器——子程序的 `readFrom` 家族——交給註冊表。註冊表按自己的節奏（`dsh-jobs-local` 的 `pumpPollMs`）泵送每個源，並在結算封環之前再排幹一次，因此生產方不需要把任何東西折進 `done`。

```ts type-equiv
/**
 * A pull source the registry pumps into the job's output ring — the subprocess
 * `readFrom` family. The registry owns the cadence and drains every source one
 * last time before settlement closes the ring, so a producer folds nothing
 * into its `done`.
 */
interface JobOutputSource {
  /** Stream label attached to every chunk this source yields. */
  channel?: JobChannel
  /**
   * Read everything captured since `fromByte` without consuming it.
   * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 first).
   * @returns the delta text, the next offset, the lossy flag, and the spill path the source currently keeps.
   */
  read(fromByte: number): JobSourceRead
}
```

```ts type-equiv
/** One incremental read from a {@link JobOutputSource}. */
interface JobSourceRead {
  /** Text captured since the requested offset (the whole retained tail when lossy). */
  text: string
  /** Whole-stream offset to resume from on the next read. */
  nextOffset: number
  /** True when the requested offset slid out of the source's retained window. */
  lossy: boolean
  /**
   * Host path of a file holding the complete stream, when the source
   * currently keeps an intact one. Reported on every read, so the registry
   * tracks it as source metadata: a later read without it withdraws the file.
   */
  spillPath?: string
}
```

## 輸出環

每個 job 擁有一個有界的環。拉取源被泵入其中，`JobHandle.append` 的推送整塊落實；模型透過註冊表保管的遊標（`JobRegistry.read`）消耗該環，任意數量的觀察者按絕對位元組偏移讀取它（`JobRegistry.readAt`），二者互不干擾。`JobChannel` 標記 `stdout`、`stderr` 與 `log`；`log` 是隻到達觀察者、從不進入模型消耗式讀取的生產方敘述。結算即封流並把保留量裁剪到結算上限——環沒有獨立的生命週期。拉取源保留的 spill 檔案是 job 中繼資料（`JobView.output.spillPaths`，每次泵讀取都會重新整理），不是逐塊中繼資料，所以環淘汰了位元組之後、甚至缺口 chunk 本身也被淘汰之後，模型的丟失輸出提示仍能點名該檔案。瀏覽器透過 [`dsh-api-job-controller`](../../packages/api/job-controller/README.zh.md) 的 Remote 流 `job.list` 與 `job.follow` 觸達名冊與環，其幀列於下文的 Cordis API 一節。

```ts type-equiv
/** One chunk of a job's output ring: absolute offset, text, channel, and loss marker. */
interface JobChunk {
  /** Absolute offset of the chunk's first byte; offsets never move once assigned. */
  readonly at: number
  /** Chunk text exactly as appended (possibly tail-trimmed by retention). */
  readonly text: string
  /** Stream label, when the producer supplied one. */
  readonly channel?: JobChannel
  /** Bytes immediately before this chunk were lost, at the producer or to retention. */
  readonly gapBefore?: true
}
```

```ts type-equiv
/** Result of one non-consuming {@link JobRegistry.readAt}. */
interface JobOutputRead {
  /** Retained chunks overlapping `[from, total)`, in offset order. */
  chunks: readonly JobChunk[]
  /**
   * Offset to resume from — the ring's current `total`. Always a chunk
   * boundary: appends land whole and trimming only advances chunk starts, and
   * consumers concatenate `chunks` under that assumption, so a provider
   * serving partial chunks would silently duplicate text.
   */
  next: number
  /** True when `from` fell below the oldest retained byte, so bytes are missing before `chunks`. */
  lossy: boolean
}
```

## 消費方檢視

`JobView` 是每個讀者都消費的唯一投影：模型工具、瀏覽器名冊與觀測流。`owner` 攜帶劃定存取邊界的工作階段 id；註冊表為生命週期清理解析其背後的活體 `Agent`，從不把該物件交出去。`progress` 是生產方的即時行，結算時清除；`detail` 是終態原因，合併了記錄下來的 kill 原因。

```ts type-equiv
/**
 * Read-only projection of one job — a fresh object per call, never live
 * registry state. The model tools, the browser roster, and the observation
 * stream all consume this one shape.
 */
interface JobView {
  /** The registry-issued id (`<kind>-N`). */
  readonly id: JobId
  /**
   * The producer kind the job was registered with: a Host-registered
   * `JobKind`, carried as an open string because a browser bundle or a Remote
   * codec sees only the `JobKindMap` merges its own program compiles.
   */
  readonly kind: string
  /** The producer-supplied one-line label. */
  readonly label: string
  /** Owning session; absent for an unowned job, which every caller can see. */
  readonly owner?: SessionId
  /** Producer-owned cap for complete model-facing notices and reads, in UTF-8 bytes. */
  readonly outputLimitBytes?: number
  /** Current lifecycle state. */
  readonly status: JobStatus
  /** The producer's live progress line (`3/10`, the current phase); cleared at settlement. */
  readonly progress?: string
  /** Terminal reason (`exit code: 3`); a recorded kill reason is merged in. */
  readonly detail?: string
  /** Epoch ms when the job was registered. */
  readonly startedAt: number
  /** Epoch ms when the job settled; absent while live. */
  readonly finishedAt?: number
  /**
   * The output ring's absolute coordinates and the complete-stream files
   * behind it. `total` is the offset the next chunk starts at (0 while
   * nothing was written); `earliest` is the oldest retained byte, greater
   * than zero exactly when retention dropped the head. `spillPaths` lists the
   * spill files the job's pull sources currently keep, in source order and
   * deduplicated, and is absent while no source keeps one: it outlives any
   * chunk, so a reader below `earliest` can still name where the bytes went.
   */
  readonly output: { readonly total: number; readonly earliest: number; readonly spillPaths?: readonly string[] }
}
```

`JobRegistry` 的 `list`、`get`、`read`、`readAt`、`kill` 和 `wait` 各自接收呼叫方的 `SessionId`；省略呼叫方時僅可存取無主 job，傳入工作階段時還可存取該工作階段擁有的 job。

```ts type-equiv
/** Output and post-read state returned by the consuming {@link JobRegistry.read}. */
interface JobRead {
  /** Ring chunks appended since the model cursor, in offset order; every channel included. */
  chunks: readonly JobChunk[]
  /** True when the cursor fell below the oldest retained byte, so bytes are missing before `chunks`. */
  lossy: boolean
  /** The producer's {@link JobOutcome.result}, handed out by the first read after settlement only. */
  result?: string
  /** The job's state at read time. */
  job: JobView
}
```

## 事件

註冊表透過一條帶過濾的流宣佈每次提交。生命週期事件攜帶其所宣佈的提交之後的投影；`settled` 標出原因，完成播報方據此跳過 teardown；`output` 只攜帶 id 與新的 total，觀察者從自己的遊標讀取，註冊表從不推送負載。

```ts type-equiv
/**
 * One lifecycle or output event. Lifecycle events carry the job's projection
 * after the commit they announce; `output` carries only the id and the new
 * total, so an observer schedules a {@link JobRegistry.readAt} from its own
 * cursor and the registry never pushes payloads.
 */
type JobEvent =
  | {
    /** Registration commit, progress line change, stopping transition, or removal from the visible set. */
    readonly type: 'registered' | 'progress' | 'stopping' | 'removed'
    readonly job: JobView
  }
  | {
    readonly type: 'settled'
    readonly job: JobView
    readonly cause: JobSettleCause
    /**
     * Whether this settlement released a live {@link JobRegistry.wait}. That
     * waiter's caller receives the terminal projection as its own result, so
     * a completion reporter treats an awaited settlement as already delivered
     * and reports only the unawaited ones. A wait that timed out or was
     * aborted before the settlement does not count.
     */
    readonly awaited: boolean
  }
  | {
    readonly type: 'output'
    readonly id: JobId
    /** Owning session, absent for an unowned job. */
    readonly owner?: SessionId
    /** The ring's total after the append (or at settlement, which ends the stream). */
    readonly total: number
  }
```

```ts type-equiv
/**
 * Who a subscription hears about. `{ owner }` delivers that session's jobs
 * plus every unowned job (the set that session can see). `{ owners: 'scope' }`
 * delivers the owners composed under the subscribing context — one registry
 * serves every composition in the process, and a mount under one preset must
 * not hear another preset's agents. `{ owners: 'all' }` delivers everything.
 */
type JobEventFilter =
  | { readonly owner: SessionId }
  | { readonly owners: 'all' | 'scope' }
```

## 服務行為

抽象的 [`JobRegistry`](../../packages/jobs/jobs/src/index.ts) Service Definition 規定了原子化的 `start`、各自接收呼叫方的 `list`、`get`、消耗式 `read`、非消耗的 `readAt`、`kill` 與有界的 `wait`、帶過濾的 `events` 流，以及 `attachController`；[`LocalJobRegistry`](../../packages/jobs/jobs-local/src/index.ts) 是程序本地的 Service Provider。授權比較擁有者工作階段；擁有者清理與准入使用 job 啟動時登記在該擁有者工作階段下的活體 `Agent`。本地提供者的正安全整數設定 `maxConcurrentJobsPerOwner` 預設為 `10`，按精確擁有者統計 `running` 加 `stopping` 記錄，無主任務共享一個桶；生產方的終態結算釋放容量；`retainBytes`（預設 262144）與 `settledRetainBytes`（預設 16384）約束每個環的執行期與結算後保留量，`pumpPollMs`（預設 150）是拉取節奏。參見 [`dsh-jobs`](../../packages/jobs/jobs/README.zh.md) 瞭解 Service Definition 約定，[`dsh-jobs-local`](../../packages/jobs/jobs-local/README.zh.md) 瞭解註冊表生命週期與准入策略，[`dsh-tool-jobs`](../../packages/jobs/tool-jobs/README.zh.md) 瞭解面向模型的 Consumer。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxjobcontroller--jobcontroller"></a>

### `ctx.jobController` — `JobController`

Host service backing the generated `ctx.remote.job` namespace.

```ts cordis-catalog
/**
 * Stream the jobs one session can see — its own plus every unowned job —
 * as whole-set frames: one on open, then one after each coalesced burst of
 * lifecycle commits. The stream has no natural end; the carrier closes it.
 * @param request - the session whose visible set to mirror.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns the roster frames.
 */
@Remote({ mode: 'stream' }) list(request: JobListRequest, signal: AbortSignal): AsyncIterable<JobListFrame>

/**
 * Stream one job's retained output from an absolute byte offset, then its
 * terminal projection once settled and drained. Non-consuming: the
 * model-facing cursor and notice state never observe these reads. The
 * request's session is the fenced read's caller; the registry rejects a
 * job the session cannot see and an unknown job.
 * @param request - target job, owning session, and optional resume offset.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns anchor, coalesced output frames, and the terminal status.
 */
@Remote({ mode: 'stream' }) follow(request: JobFollowRequest, signal: AbortSignal): AsyncIterable<JobFollowFrame>

/**
 * Kill one background job on a human's behalf. The request's session is
 * the fenced read's caller, so the job must be one that session can see:
 * the registry's owner fence is the only access rule, and a child session's
 * own jobs are killable from its list like any other. The kill records
 * `cancelled by the user` as its reason; it is not one the model requested,
 * so the owning agent still receives the completion notice, and a shell
 * tool waiting on that job reads the reason in its own result.
 * @param request - Session whose job list carries the job, and the job id.
 * @returns the registry's admission of the kill request.
 */
@Remote('kill') kill(request: JobKillRequest): JobKillValue
```

Source: [`packages/api/job-controller/src/index.ts`](../../packages/api/job-controller/src/index.ts)

<a id="ctxjobs--jobregistry-abstract-seam"></a>

### `ctx.jobs` — `JobRegistry` (abstract seam)

Abstract background job registry. Subclass, implement the abstract members, and load the subclass as a plugin — it registers as `ctx.jobs` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- Registrations outlive producer and controller fibers. Owner and service disposal cancel live work and await compliant producers; a throwing teardown cancel force-fails only the record. Such settlements announce `cause: 'teardown'`, because a job whose owner is being destroyed has no reader left.
- Owned-job access is fenced by the owner's session id. Ids are predictable, so authorization — not secrecy — is the boundary.
- Settlement is first-wins: one terminal record, released waiters, then one round of contained event delivery, even against a late producer outcome. The `settled` event follows every released waiter and reports whether it released one (`awaited`), so a completion reporter can skip settlements a waiting caller already collected.
- A settled record stays listed until its owner's disposal, service disposal, or an explicit remove by a caller that collected the terminal state itself and never handed the id out.
- start refuses work while no attached job controller serves the spec's owner, so a producer cannot start work that owner cannot collect or stop. One registry serves every composition in the process, so this question — and event delivery under `{ owners: 'scope' }` — is owner-relative rather than process-wide: registrations made from an unscoped context serve every owner, and registrations made under an agent composition's scope serve exactly the agents composed under it.
- Every job owns one output ring. Pull sources named by the spec are pumped by the registry and drained once more before settlement; pushed appends land whole. The model's consuming cursor and observers' absolute offsets read the same bytes and never disturb each other.
- Ring retention is bounded. Appends past the live cap drop the oldest retained bytes; a reader below the retained window gets a lossy read, never an error. Settlement trims retention to the settled cap and ends the stream; the ring has no separate lifecycle.

```ts cordis-catalog
/**
 * Preflight access, validation, owner cleanup, and implementation-owned
 * admission before starting and atomically registering work. Any preflight
 * rejection leaves no job id or execution resource. A throwing starter
 * leaves nothing registered; after it returns, registration cannot fail.
 * @param spec - job identity, owner, output sources, and synchronous starter.
 * @returns the registry-issued `<kind>-N` id.
 */
abstract start(spec: JobSpec): JobId

/**
 * List caller-owned and unowned jobs in registration order.
 * @param caller - reading session; omission sees only unowned jobs.
 * @returns fresh projections.
 */
abstract list(caller?: SessionId): JobView[]

/**
 * Project one job without changing its cursor. Throws for an unknown or
 * foreign job.
 * @param id - job to look up.
 * @param caller - reading session checked against the owner.
 * @returns a fresh projection.
 */
abstract get(id: JobId, caller?: SessionId): JobView

/**
 * Consume the ring from the model cursor and advance it to the current
 * total. After settlement the first read also carries the producer's
 * result. Throws for an unknown or foreign job.
 * @param id - job to read.
 * @param caller - reading session checked against the owner.
 * @returns the chunks since the cursor, the lossy flag, the result once, and the post-read projection.
 */
abstract read(id: JobId, caller?: SessionId): JobRead

/**
 * Read retained ring output without moving the model cursor. Resume with
 * a previous read's `next`; an offset inside a retained chunk returns the
 * whole chunk (its `at` may precede `from`). Throws for a negative or
 * non-integer offset, or an unknown or foreign job.
 * @param id - job to read.
 * @param from - absolute byte offset to read from (0 for the retained head).
 * @param caller - reading session checked against the owner.
 * @returns retained chunks overlapping `[from, total)`, the resume offset, and the lossy flag.
 */
abstract readAt(id: JobId, from: number, caller?: SessionId): JobOutputRead

/**
 * Request cancellation, then mark the job stopping. A producer throw
 * propagates without changing job state. A supplied reason is merged into
 * terminal `detail` when the job settles `killed`. Throws for an unknown
 * or foreign job.
 * @param id - job to cancel.
 * @param caller - killing session checked against the owner.
 * @param reason - cancellation reason forwarded verbatim to the producer.
 * @returns `requested` for live work, otherwise `already-finished`.
 */
abstract kill(id: JobId, caller?: SessionId, reason?: string): 'requested' | 'already-finished'

/**
 * Wait for settlement or timeout without cancelling the job. Caller abort
 * rejects only while the job is live; after settlement the terminal
 * projection wins. Rejects for an invalid timeout or an unknown or foreign
 * job.
 * @param id - job to wait for.
 * @param timeoutMs - positive finite wait bound in milliseconds.
 * @param caller - waiting session checked against the owner.
 * @param signal - optional cancellation of the wait itself.
 * @returns projection at settlement or timeout.
 */
abstract wait(id: JobId, timeoutMs: number, caller?: SessionId, signal?: AbortSignal): Promise<JobView>

/**
 * Drop one settled job's record from the visible set and announce
 * `removed`. For a caller that collected the terminal state through its own
 * {@link wait} and never handed the id to the model, such as a shell tool's
 * foreground call. Throws for a job that is still live, unknown, or foreign.
 * @param id - settled job to drop.
 * @param caller - removing session checked against the owner.
 */
abstract remove(id: JobId, caller?: SessionId): void

/**
 * Attach an effect-scoped controller that can read and stop jobs. It serves the
 * owners its registering context's scope covers, and {@link start} refuses an
 * owner no attached controller serves.
 * @param name - diagnostic label; duplicate names remain independent.
 * @returns disposer that detaches this controller.
 */
abstract attachController(name: string): () => void
```

Types: [SessionId](core.zh.md)

Source: [`packages/jobs/jobs/src/index.ts`](../../packages/jobs/jobs/src/index.ts)
<!-- END GENERATED cordis-surface -->
