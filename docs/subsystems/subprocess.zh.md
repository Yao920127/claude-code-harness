# 子程序

[English](subprocess.md) | 中文

子程序 seam 分為 Service Definition（[dsh-subprocess](../../packages/subprocess/subprocess)，`ctx.subprocess`）與 Service Provider（[dsh-subprocess-local](../../packages/subprocess/subprocess-local)）；它的 Consumer 是其他能力 seam 與程序外後端：[bash 執行器家族](shell.zh.md)使用收集模式的批次輸出，LSP 使用原始協定管道，PTY 後端使用終端原語，ACP（Agent Client Protocol）subagent 後端則使用透過管道傳輸的 ndjson，並讓 stderr 採用 inherit。該 seam 擁有受管的 `DSH_*` 環境名稱空間、共享的憑證清除（`scrubbedParentEnv`）與 `CollectedOutput` 形狀；[dsh-shell](../../packages/shell/shell) 重匯出這套詞彙，使 bash 消費方保持單一匯入入口。

原始碼：[`packages/subprocess/subprocess/src/types.ts`](../../packages/subprocess/subprocess/src/types.ts) 與 [`packages/subprocess/subprocess/src/index.ts`](../../packages/subprocess/subprocess/src/index.ts)

## 可執行檔案查詢

一個提供者的 spawn 工作目錄、可執行檔案路徑、普通程序與終端工作階段，和掛載的檔案系統提供者處於同一路徑與程序名稱空間。`resolveExecutable(command, env?, signal?)` 驗證絕對可執行檔案路徑，或透過提供者清理後的 `PATH` 加有意覆蓋來解析裸名稱。

## 受管環境名稱空間與捕捉的輸出

`DSH_*` 變數是歸 Harness 所有的子程序事實；實作會在合併呼叫方顯式 `env` 之前丟棄環境中已有的 `DSH_*` 名稱，因此目前事實只會以有意提供的字串條目形式到達，而顯式的 `undefined` tombstone 會刪除普通環境中已有的值。每條被收集的流都透過 `CollectedOutput` 報告自身的截斷與 spill 恢復狀態。

```ts type-equiv
/** One environment key inside the managed {@link DSH_ENV_PREFIX} namespace. */
type DshEnvironmentKey = `${typeof DSH_ENV_PREFIX}${string}`
```

```ts type-equiv
/** Trusted DeepSeek Harness variables for one child-process execution. */
type DshEnvironment = Readonly<Record<DshEnvironmentKey, string>>
```

```ts type-equiv
/** One captured stream: the (possibly truncated) text plus recovery info. */
interface CollectedOutput {
  /** Collected text — the TAIL of the stream when truncated. */
  text: string
  /** True when bytes were dropped from `text`. */
  truncated: boolean
  /** Path to a file holding the COMPLETE stream, when truncated and available. */
  spillPath?: string
}
```

## Node 風格的 stdio 處置方式（disposition）

每條流的處置方式都顯式給出，由各消費方自行選擇：原始管道用於協定分幀（LSP JSON-RPC、ACP ndjson），inherit 用於直通的診斷輸出，收集模式用於有界的批次輸出；其中 spill 檔案是可選的，因此診斷尾部（語言伺服器的 stderr）可以只在記憶體中緩衝，不留下任何檔案。

```ts type-equiv
/**
 * stdin disposition. `'ignore'` leaves fd 0 on `/dev/null`; `'pipe'` exposes
 * {@link SubprocessHandle.stdin} for the caller's ongoing protocol writes;
 * `{ data }` writes the bytes and closes (the batch shape).
 */
type SubprocessStdinMode = 'ignore' | 'pipe' | { readonly data: string }
```

```ts type-equiv
/**
 * Bounded in-memory collection for one output stream, with an optional
 * full-stream spill file. Omitting `spill` keeps only the in-memory tail —
 * the diagnostic-tail shape (a language server's stderr); including it makes
 * the complete stream recoverable up to its cap (the bash tool shape).
 */
interface SubprocessCollect {
  /** In-memory cap in bytes; overflow keeps the TAIL. */
  maxBytes: number
  /** Full-stream spill file; absent disables spilling entirely. */
  spill?: {
    /** Whole-stream byte cap; a larger stream discards its now-incomplete spill. */
    maxBytes: number
  }
}
```

```ts type-equiv
/**
 * stdout/stderr disposition. `'pipe'` exposes the raw `Readable` for the
 * caller's protocol decoding; `'inherit'` passes the parent's descriptor
 * through (child diagnostics land on the harness's own stream); a
 * {@link SubprocessCollect} object buffers boundedly with offset-based reads.
 */
type SubprocessOutputMode = 'pipe' | 'inherit' | SubprocessCollect
```

```ts type-equiv
/** Per-stream stdio dispositions, all explicit — this seam applies no defaults. */
interface SubprocessStdio {
  stdin: SubprocessStdinMode
  stdout: SubprocessOutputMode
  stderr: SubprocessOutputMode
  /** Request a separate byte-mode duplex channel; omission creates none. */
  control?: 'pipe'
}
```

## 完全顯式的 spawn spec

該 seam 不應用任何預設值：每項處置方式、限制與目錄都在 spec 上顯式給出，因此由呼叫方自己的設定決定它們，而不是由某個隱藏的子程序服務預設值決定。`argv` 絕不經過 shell 解釋。

```ts type-equiv
/**
 * A fully-specified spawn request. This seam applies no defaults: every
 * disposition, limit, and directory is explicit, so the caller's own config —
 * not a hidden subprocess-service default — decides them (the `dsh-shell`
 * request/spec split is the owning template).
 */
interface SubprocessSpawnSpec {
  /** Executable and arguments; `argv[0]` is the program. Never shell-interpreted here. */
  argv: readonly string[]
  /** Working directory for the child. */
  cwd: string
  /** Per-stream stdio dispositions. */
  stdio: SubprocessStdio
  /**
   * Positive finite grace period in milliseconds, no greater than
   * `MAX_TIMER_DELAY_MS`, available to the provider's termination procedure
   * and used for draining still-open collected pipes after the process exits
   * (an inherited descriptor held by a survivor cannot hold the outcome open
   * indefinitely). Providers document whether range termination is staged or
   * immediate.
   */
  graceMs: number
  /**
   * Abort signal — starts the terminate escalation on the managed range when
   * it fires. The caller owns deadlines and cause classification; this seam
   * only reacts to the abort.
   */
  signal?: AbortSignal | undefined
  /**
   * Explicit environment entries merged onto the implementation's scrubbed
   * parent base (see `scrubbedParentEnv`), with no namespace validation. A
   * string is a deliberate caller opt-in, so a forwarded credential-shaped
   * entry or current `DSH_*` fact survives the scrub; `undefined` is a
   * tombstone that removes an ordinary ambient entry from the child.
   */
  env?: NodeJS.ProcessEnv | undefined
}
```

## 控制代碼：流、讀取器與 managed-range 終止

spawn 會同步返回活動控制代碼，目標與受管範圍標識則保留在 provider 內部。收集模式的讀取器接受全流位元組偏移量且從不消費，因此獨立讀取器不會搶走彼此的增量；管道化的流歸呼叫方所有。`terminate()` 啟動 provider 記錄的終止過程，`waitForExit()` 觀察同一個 provider-managed range；分階段 provider 可以使用 `graceMs`，立即終止的 provider 不會等待。消費方可以在這兩項操作上建置自己的分級清理流程；ACP 後端先關閉 stdin 的 `disposeAcpChild` 是參考實作。

```ts type-equiv
/**
 * A live subprocess and its provider-managed process range. Collected output
 * remains readable after exit; piped streams belong to the caller.
 *
 * Termination and {@link SubprocessHandle.waitForExit} use the same managed
 * range. Each provider documents the range it can observe and its signalling
 * and observation limits.
 */
interface SubprocessHandle {
  /** The child's stdin, present iff spawned with `stdin: 'pipe'`. */
  readonly stdin: Writable | undefined
  /** The child's raw stdout, present iff spawned with `stdout: 'pipe'`. */
  readonly stdout: Readable | undefined
  /** The child's raw stderr, present iff spawned with `stderr: 'pipe'`. */
  readonly stderr: Readable | undefined
  /** Separate caller-owned byte channel when requested; native startup failure may leave it absent. */
  readonly control: Duplex | undefined
  /** Offset-based readers for collect-mode streams (also readable after exit). */
  readonly collected: SubprocessCollectedOutputs
  /** Resolves with spawned-command exit facts; rejects for spawn or provider failures. */
  readonly done: Promise<SubprocessOutcome>
  /**
   * Begin the provider's documented termination procedure on the managed range
   * — the seam's only termination verb. Idempotent, a no-op once that range is
   * gone, and also triggered by the spec's abort signal.
   */
  terminate(): void
  /**
   * Wait until the same managed range is empty — not just until the spawned
   * command reports its outcome, so surviving work remains observable.
   * @param signal - optional bound for the wait.
   * @returns `true` when the managed range is empty, `false` when the signal aborted first.
   * @throws when the selected provider can no longer observe its managed range.
   */
  waitForExit(signal?: AbortSignal): Promise<boolean>
}
```

```ts type-equiv
/**
 * Cursor-free incremental access to one collected output stream. Offsets are
 * whole-stream byte coordinates owned by the caller, so independent readers
 * cannot consume one another's output; `readFrom(0)` after settlement is the
 * batch result (`lossy` then means the in-memory tail lost its head — the
 * {@link CollectedOutput.truncated} fact).
 */
interface SubprocessOutputReader {
  /**
   * Read everything captured since `fromByte`. When that offset has slid out
   * of the in-memory tail window the read is `lossy` — it returns the whole
   * retained tail and the gap is only recoverable from the spill file.
   * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 for the first read).
   * @returns the delta text, the next offset, the `lossy` flag, and the spill path when one exists.
   */
  readFrom(fromByte: number): SubprocessOutputRead
}
```

```ts type-equiv
/** One incremental {@link SubprocessOutputReader.readFrom} read. */
interface SubprocessOutputRead {
  /** Stream text from the requested offset (the whole retained tail when lossy). */
  text: string
  /** Whole-stream offset to resume from on the next read. */
  nextOffset: number
  /** True when the requested offset slid out of the in-memory tail window. */
  lossy: boolean
  /** Path to the full-stream spill file, when one was created and remains intact. */
  spillPath?: string
}
```

```ts type-equiv
/** Offset-based readers for the streams spawned in collect mode. */
interface SubprocessCollectedOutputs {
  /** Present iff stdout is a {@link SubprocessCollect}. */
  readonly stdout?: SubprocessOutputReader
  /** Present iff stderr is a {@link SubprocessCollect}. */
  readonly stderr?: SubprocessOutputReader
}
```


## 結果只承載退出事實

`done` 報告 Node close 事件的詞彙，不攜帶原因分類：服務會在中止時終止程序，但絕不判定原因（呼叫方讀取歸自己所有的 deadline 訊號，例如 bash 執行器的 `timedOut`/`aborted` 拆分）。收集到的輸出在結算後仍可經 `handle.collected` 讀取，因此批次與流式呼叫方共用一條存取路徑。

```ts type-equiv
/**
 * Exit facts of one closed process — Node's `close`-event vocabulary.
 * Deliberately carries NO timeout or cancellation classification (the caller
 * reads the signal it owns to classify causes) and NO output: collected
 * streams stay readable through {@link SubprocessHandle.collected} after
 * settlement, so batch and streaming callers share one access path.
 */
interface SubprocessOutcome {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
}
```

## 終端程序原語

`spawnTerminal(spec)` 是非管道程序原語。提供者分配控制終端，並負責 UTF-8 文字傳輸、前臺程序組檢查與訊號傳送，以及一項須等待的 TERM→KILL 操作；該操作會使提供者仍可觀察到的每個工作階段成員完全停穩，提供者則會記錄執行基底特有的可觀察性限制。PTY 後端仍負責提示符檢測、就緒推斷、scrollback、沙箱策略和持久工作階段所有權；普通 `spawn()` 無法重建控制終端語義。

終端 spec 完全指定 argv、cwd、環境覆蓋、終端型別、尺寸、清理寬限期與可選的分配取消和 shell 活動觀察。其控制代碼公開 `pid`、有序輸出、`done`、`write`、`resize`、`inspectForeground`、`inspectActivity`、`signalForeground` 和須等待的 `terminate`；[`SubprocessTerminalSpawnSpec` 與 `SubprocessTerminalHandle`](../../packages/subprocess/subprocess/src/types.ts) 定義這些欄位和操作。`resize(cols, rows)` 更新正在執行的 PTY 尺寸，程序退出後拒絕呼叫。

`inspectActivity()` 返回 `SubprocessTerminalActivity`：`state` 為 `idle`、`busy` 或 `unknown`，`revision` 隨 provider 觀察到的活動或輸入變化。終端請求透過 `shellActivity` 啟用受支援的 shell 生命週期觀察；各 provider 的支援範圍和保守返回 unknown 的情況見 [subprocess-local](../../packages/subprocess/subprocess-local/README.zh.md#running-terminal-sessions)。

`terminalEnvironment(signal?)` 返回 `SubprocessTerminalEnvironment`：執行環境平臺（`posix` 或 `windows`）與可選的 `defaultShell`。這些事實來自提供者，而非 Web 伺服器或瀏覽器。`resolveExecutable` 驗證候選 shell；`SubprocessExecutableNotFoundError` 表示可執行檔案不存在，提供者與傳輸故障仍作為錯誤報告。

## 服務行為

抽象的 [`SubprocessRuntime`](../../packages/subprocess/subprocess/src/index.ts) Service Definition 規定執行世界座標、可執行檔案查詢、普通 `spawn` 與 `spawnTerminal`。[`LocalSubprocessRuntime`](../../packages/subprocess/subprocess-local/src/index.ts) 以平臺選擇的 managed range、按處置方式接線、憑證清除、`node-pty`、平臺程序檢查，以及先終止再等待退出的資源釋放提供這些能力。Service Definition 約定見 [`dsh-subprocess`](../../packages/subprocess/subprocess/README.zh.md)，本地機制見 [`dsh-subprocess-local`](../../packages/subprocess/subprocess-local/README.zh.md)。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsubprocess--subprocessruntime-abstract-seam"></a>

### `ctx.subprocess` — `SubprocessRuntime` (abstract seam)

Abstract subprocess service. Subclass, implement spawn, and load the subclass as a plugin — it registers as `ctx.subprocess` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- Executable paths belong to one execution world shared with the mounted filesystem provider.
- spawn returns a live handle synchronously. Target identity remains provider-private; `done` resolves with the spawned command's exit facts and may reject for spawn or provider failures.
- Collect-mode readers are offset-based and non-consuming, so independent readers never consume one another's output; lossy reads report truncation and the spill file holding the complete stream when one exists. Piped streams are handed to the caller raw and never buffered here.
- SubprocessHandle.terminate (and the spec's abort signal) starts the provider's documented procedure against its managed range. SubprocessHandle.waitForExit observes that same range so a consumer-owned teardown ladder can hold each tier on real quiescence; each provider documents its signalling and observability limits.
- Disposal of the service terminates all still-running managed processes and awaits their exit.
- spawnTerminal owns terminal allocation, text transport, foreground groups, signalling, and whole-session quiescence behind one awaited termination method; readiness and persistent-shell policy stay in the PTY consumer. Its output stream ends after queued terminal output when the top-level process exits.

```ts cordis-catalog
/**
 * Resolve one configured executable in this provider's execution world.
 * Absolute paths are verified; bare names use the provider's scrubbed PATH
 * plus explicit environment overrides. Relative paths containing separators
 * are rejected: the resolution base is undefined, so providers fail loud
 * instead of guessing.
 * @param command - absolute executable path or bare PATH name.
 * @param env - explicit environment entries used for lookup.
 * @param signal - aborts remote or local lookup.
 * @returns a canonical executable path.
 */
abstract resolveExecutable( command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal, ): Promise<string>

/**
 * Inspect shell-selection facts in the provider's execution environment.
 * @param signal - cancellation of remote environment inspection.
 * @returns platform and preferred shell; executable lookup and allocation remain separate operations.
 */
abstract terminalEnvironment(signal?: AbortSignal): Promise<SubprocessTerminalEnvironment>

/**
 * Start one managed child process from a fully-specified spec; this seam
 * applies no defaults.
 * @param spec - argv, directory, stdio dispositions, grace, cancellation, and environment.
 * @returns the live process handle (streams/readers, signalling, outcome promise).
 * @throws synchronously when pre-aborted or when argv, cwd, environment, or grace is invalid before handle creation.
 */
abstract spawn(spec: SubprocessSpawnSpec): SubprocessHandle

/**
 * Allocate a real terminal and start one owned process session. This is the
 * only non-pipe process primitive: implementations own terminal byte I/O,
 * foreground groups, signals, and whole-session quiescence.
 * @param spec - fully specified argv, cwd, environment, dimensions, grace, and allocation cancellation.
 * @returns the live terminal handle after allocation succeeds.
 */
abstract spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>
```

Source: [`packages/subprocess/subprocess/src/index.ts`](../../packages/subprocess/subprocess/src/index.ts)
<!-- END GENERATED cordis-surface -->
