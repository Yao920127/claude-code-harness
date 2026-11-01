# Shell 執行器

[English](shell.md) | 中文

shell 執行 seam 由 [dsh-shell](../../packages/shell/shell) 在 `ctx.shell` 上提供 Service Definition。[shell 包組](../../packages/shell/README.zh.md)列出其 Bash 與 PowerShell 提供者以及面向模型的 Consumer。通用後臺任務的 id、所有權與控制位於 [jobs.md](jobs.zh.md)；本 seam 返回程序控制代碼，不註冊後臺任務。managed-range 機制封裝在[子程序 seam](subprocess.zh.md)之後。

原始碼：[`packages/shell/shell/src/types.ts`](../../packages/shell/shell/src/types.ts)

## 受管 shell 環境名稱空間

`DSH_*` 變數是歸 Harness 所有的子程序事實。面向模型的 bash 工具透過 `ctx.shellEnv` 收集它們，再經由 `ShellExecRequest.dshEnv` 傳遞；子程序服務在合併目前快照之前會移除繼承而來的 `DSH_*` 名稱。`DshEnvironmentKey`／`DshEnvironment` 詞彙歸[子程序 seam](subprocess.zh.md)所有，由 `dsh-shell` 重匯出。

## 請求與規格：`resolve()` 拆分

該 seam 將**面向模型/外掛的請求**（`workdir`/`timeoutMs`/`stdoutMaxBytes` 可選，由設定或請求策略補全）與執行器實際使用的**完全解析後的 spec**（這些欄位均為必填）分開。工具層在二者之間呼叫 `ctx.shell.resolve(request)`（儲存庫的「包邊界處顯式優於隱式」規則）；`ShellExecSpec` 攜帶的是已解析的值。

```ts type-equiv
/**
 * A caller's execution REQUEST: `workdir` and `timeoutMs` are optional and
 * filled by {@link ShellExecutor.resolve} from the implementation's config.
 * This is the model-/plugin-facing shape; pass it to `resolve()` to obtain a
 * fully-resolved {@link ShellExecSpec}.
 */
interface ShellExecRequest {
  command: string
  /** Working directory override (default: implementation-configured). */
  workdir?: string | undefined
  /** Timeout override in milliseconds (implementations cap it). */
  timeoutMs?: number | undefined
  /** Deadline policy at `timeoutMs` expiry (default `'kill'`). */
  onExpiry?: ShellExpiryPolicy | undefined
  /**
   * Foreground stdout capture budget in bytes. Absent uses the executor's
   * default output cap. Trusted in-process consumers use this when they must
   * parse complete stdout up to their own bounded limit; the model-facing bash
   * tool does not expose it as a parameter.
   */
  stdoutMaxBytes?: number | undefined
  /** Abort signal — implementations kill the command when it fires, and treat a signal that is already aborted as fired. */
  signal?: AbortSignal | undefined
  /**
   * Bytes to write to the command's stdin, then close it. Absent leaves stdin
   * closed/empty (the default for model-driven tool calls). Set by in-process
   * plugins (e.g. the hooks bridges, which write a hook command's JSON payload
   * to its stdin); the model-facing bash tool does not expose it as a parameter
   * (a model that needs stdin uses shell syntax like a heredoc or a pipe).
   */
  stdin?: string | undefined
  /**
   * Ordinary environment entries for the command, merged after the credential
   * scrub. Managed facts belong in {@link dshEnv}, which merges after this
   * map, so an entry here can never displace one. Set by in-process plugins
   * (the hooks bridges set `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, …); the
   * model-facing bash tool does not expose it as a parameter.
   */
  env?: Record<string, string> | undefined
  /**
   * Harness-owned `DSH_*` variables for this execution (typed to managed
   * keys). Executors discard ambient `DSH_*` entries before merging this
   * snapshot last, so an unavailable current fact cannot inherit a stale
   * value from the harness process and a caller {@link env} entry cannot
   * displace a managed one.
   */
  dshEnv?: DshEnvironment | undefined
  /** Fully resolved per-call sandbox policy; sandboxing executors default it. */
  sandboxPolicy?: SandboxExecutionPolicy | undefined
}
```

```ts type-equiv
/**
 * A resolved execution spec. {@link ShellExecutor.resolve} fills and caps the
 * required fields; under `onExpiry: 'none'` the resolved `timeoutMs` arms no
 * timer and is only echoed into {@link ShellRunResult.timeoutMs}.
 */
interface ShellExecSpec {
  command: string
  workdir: string
  timeoutMs: number
  /** Deadline policy at `timeoutMs` expiry ({@link ShellExecutor.resolve} defaults it to `'kill'`). */
  onExpiry: ShellExpiryPolicy
  /**
   * Resolved stdout capture budget in bytes, applied to every execution's
   * stdout; stderr keeps the executor's own output cap.
   */
  stdoutMaxBytes: number
  /** Abort signal — implementations kill the command when it fires, and treat a signal that is already aborted as fired. */
  signal?: AbortSignal | undefined
  /** Bytes to write to stdin before closing it; absent means no stdin. */
  stdin?: string | undefined
  /**
   * Ordinary environment entries carried through from
   * {@link ShellExecRequest.env}; {@link dshEnv} still merges after them.
   * OPTIONAL on the spec for the same reason as `stdin`: absent means no
   * ordinary extra environment.
   */
  env?: Record<string, string> | undefined
  /** Managed `DSH_*` snapshot (typed to managed keys); merges after {@link env}. */
  dshEnv?: DshEnvironment | undefined
  /** Resolved sandbox policy; ignored by executors that do not confine. */
  sandboxPolicy: SandboxExecutionPolicy | undefined
}
```

`stdin` 和 `env` 是受信任的程序內外掛輸入，不由 `dsh-tool-bash` 暴露。本地執行器會先清除環境中的憑證，再合併呼叫方顯式提供的 env。

`stdoutMaxBytes` 同樣僅供受信任外掛使用。它讓前臺消費方能在有界解析預算內請求完整 stdout，而不會改變 stderr、後臺任務或面向模型的 bash 工具的常規輸出上限。

## 前臺執行：`ShellRunResult`

一次已完成（或被終止）的前臺執行的結果。正交的結果**獨立報告**：一個程序可以同時超時並以結束代碼 0 退出（因為它捕捉了訊號），因此 `timedOut`、`aborted`、`signal` 和 `exitCode` 各自獨立為一個欄位；呼叫方永遠不會把一次被提前中斷的執行誤讀為正常成功。

```ts type-equiv
/** The outcome of a foreground run, including timeout during preparation. */
interface ShellRunResult {
  /** Exit code; null when preparation expired or the process died from a signal. */
  exitCode: number | null
  /** Terminating signal, or null when none was reported, including preparation expiry. */
  signal: NodeJS.Signals | null
  /**
   * True when the executor's own timeout was the FIRST cause to cut the command
   * short. Mutually exclusive with {@link aborted}: one fused deadline drives
   * both the timeout and the caller's cancellation, so a timeout and an abort
   * racing before process close report the single first-abort cause, not both
   * (see the [timeout-library Agent Note](../../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)).
   */
  timedOut: boolean
  /**
   * True when the caller's `AbortSignal` was the FIRST cause to kill the command
   * (and it was not the executor's own timeout). Mutually exclusive with
   * {@link timedOut} — see there for the first-cause classification.
   */
  aborted: boolean
  /** The effective timeout applied to this run (after defaulting/capping). */
  timeoutMs: number
  stdout: CollectedOutput
  stderr: CollectedOutput
  /** Sandbox execution facts, absent for an unsandboxed executor. */
  sandbox?: ShellSandboxInfo
}
```

每個流是一個 `CollectedOutput`：（可能被截斷的）文字加恢復資訊；截斷時，`text` 是**尾部**，完整流溢位到一個私有檔案。這些欄位歸[子程序 seam](subprocess.zh.md)所有，由 `dsh-shell` 重匯出。

## 檔案沙箱：`ShellSandboxInfo`

使用沙箱的執行器透過 `ShellExecutor.sandboxMode` 暴露其已設定的模式退回值。工具層請求 [`@deepseek-ai/dsh-sandbox-policy`](../../packages/sandbox/sandbox-policy/README.zh.md)，把每個呼叫工作階段的持久 `sandbox/mode` 覆蓋值與不可變 cwd 解析為 `ShellExecRequest.sandboxPolicy`；經使用者批准、嚴格更寬鬆的呼叫只替換模式。模式/root/enforcement 詞彙歸 [`@deepseek-ai/dsh-sandbox` 沙箱 seam](sandbox.zh.md) 所有；模式僅管轄檔案效果。

沙箱化執行會報告其模式、保守的拒絕分類與強制執行完整度。`runnerFailed` 標記命令執行前沙箱 runner 已失敗；前臺執行會丟擲 `SANDBOX_UNAVAILABLE`，而已結束的後臺程序只能透過其事實通道報告。

```ts type-equiv
/**
 * Sandbox facts for one run, present iff a sandboxing executor handled it.
 * Facts are reported independently of process exit status so callers can
 * distinguish command failures from policy denials and runner failures.
 */
interface ShellSandboxInfo {
  /** The mode the command actually ran under. */
  mode: SandboxMode
  /** Whether the sandbox denied a file operation. */
  denied: boolean
  /** How completely the selected runner enforced the requested mode. */
  enforcement?: SandboxEnforcement
  /** Whether the sandbox runner failed before the command could run. */
  runnerFailed?: boolean
}
```

當受限模式沒有可用後端時，`ctx.sandbox` 提供者會丟擲、執行器會傳播由[沙箱 seam](sandbox.zh.md)所有的 `SANDBOX_UNAVAILABLE` 錯誤碼。選定的 runner 拒絕其 profile 時會觸達同一個故障關閉的前臺錯誤；已結束的後臺任務則記錄 `runnerFailed`。模型會在結果中收到拒絕/runner 事實，僅當拒絕標記指出生效模式時才得知該模式，並可透過 `sandbox_permissions` 加 `justification` 請求一次性、嚴格更寬鬆的重試；執行任何操作前，`ctx.approval` 必須批准該次確切呼叫。完整的策略與切換設計見[沙箱 Agent Note](../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)。

## 後臺程序：`ShellProcess`

`start()` 在非同步啟動準備完成後返回控制代碼；取消或準備失敗會在釋出前拒絕呼叫。該控制代碼沒有 id 或 owner。`dsh-tool-bash` 將它適應為 `ctx.jobs.start()` 掛鉤；隨後由通用執行時擁有任務標識與生命週期。`done` 會在底層程序結算時完成且絕不 reject；subprocess 提供者的 rejection 會生成狀態為 `killed` 的程序，並把不宣告階段的錯誤寫入 stderr。程序結算後仍可讀取，並且沙箱事實會在 `done` 完成前寫入。

```ts type-equiv
/**
 * A background process handle returned by {@link ShellExecutor.start}. It is the
 * only access path; buffered output remains readable after exit. Composition
 * teardown (the subprocess service's disposal) kills running processes and
 * awaits {@link done}; an executor-only reload leaves them running.
 */
interface ShellProcess {
  /** Process lifecycle state (settled exactly once). */
  status: ShellProcessStatus
  /** Exit code once finished (null = killed by signal / still running). */
  exitCode: number | null
  /** Terminating signal name, when signal-killed. */
  signal: NodeJS.Signals | null
  /**
   * Resolves when the underlying process settles (never rejects — provider
   * rejection settles as `killed` with a stage-neutral error on stderr).
   */
  readonly done: Promise<void>
  /** Sandbox facts, stamped once a confined process settles. */
  sandbox?: ShellSandboxInfo
  /**
   * Read output produced since the previous read (consuming — consecutive
   * reads never re-deliver). Reads that lost data flag `lossy` and point at
   * full-stream spill files when available.
   */
  readOutput(): ShellProcessRead
  /**
   * Non-consuming offset readers over the same captured streams the consuming
   * {@link readOutput} cursor drains, including the provider-failure note a
   * rejected spawn leaves on stderr. Independent observers read here at their
   * own offsets without stealing bytes from `readOutput`.
   */
  observed: ShellObservedStreams
  /**
   * Terminate the provider-managed range. Returns false when it had already finished
   * (no-op); idempotent.
   */
  kill(): boolean
}
```

`readOutput()` 返回增量內容與 spill 恢復資訊：

```ts type-equiv
/** One incremental {@link ShellProcess.readOutput} read. */
interface ShellProcessRead {
  /** Output produced since the previous read (stderr in a marked section). */
  delta: string
  /** True when truncation dropped unread bytes the delta cannot include. */
  lossy: boolean
  /** Full stdout spill file, when stdout truncation occurred and a safe path is available. */
  stdoutSpillPath?: string
  /** Full stderr spill file, when stderr truncation occurred and a safe path is available. */
  stderrSpillPath?: string
}
```

## 服務

`ShellExecutor` 擁有 `resolve`、前臺 `run`、後臺程序 `start` 以及 `sandboxMode` 能力事實。`dsh-bash-local` 擁有命令預設值補全、超時/中止分類、終端環境以及後臺讀取合併；managed-range 終止、有界收集器、spill 檔案、憑證清除與 dispose（資源釋放）後完全停穩歸[子程序服務](subprocess.zh.md)所有。`dsh-tool-bash` 擁有面向模型的渲染，並將後臺控制代碼適應到[通用任務執行時](jobs.zh.md)。`dsh-shell` 擁有 shell 工具共享的退出狀態約定：匯出的 `parseExitStatus`/`ParsedExitStatus` 是 `dsh-tool-bash` 的 `renderResult` 與 `dsh-tool-pwsh` 的 `renderPwshResult` 所追加的 `[exit code: N]` / `[killed by signal: X]` 標記的逆解析，兩個工具的 `presentResult` 都用它把渲染文字拆分為 terminal 卡的輸出正文與退出狀態 pill。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxshell--shellexecutor-abstract-seam"></a>

### `ctx.shell` — `ShellExecutor` (abstract seam)

Abstract bash execution service. Subclass, implement the abstract methods, and load the subclass as a plugin — it registers as `ctx.shell` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

execute resolves with the process handle after preparation. "Foreground" is a property of what the caller awaits, not of the spawn — a caller that awaits ShellExecution.result ran the command in the foreground; one that keeps the handle ran it in the background. A caller that waits only for a while runs the command under `onExpiry: 'none'` and bounds its own wait; the handle stays valid after the caller stops waiting.

Implementations must honor these semantics:

- ShellExecution.result rejects only for infrastructure failures. Nonzero exits, timeout kills, and abort kills resolve with a descriptive result: first-cause `timedOut`/`aborted`, the spec's `timeoutMs` echoed.
- The handle is published after preparation. `done` settles at process close and never rejects; spawn failures settle as `killed` with the error on the read path, while `result()` carries the same failure as its rejection.
- `onExpiry: 'none'` arms no deadline; `'kill'` kills at expiry. Expiry during preparation returns a settled timed-out handle without output.
- ShellProcess.readOutput is incremental: consecutive reads never repeat output. Lossy reads report truncation and available spill files.
- A still-running process is stopped and awaited when its owning composition tears down. With the subprocess seam that boundary is `ctx.subprocess` disposal, so a process survives an executor-only reload.

```ts cordis-catalog
/**
 * Apply implementation-owned defaults and caps to a request before execution.
 * @param request - the caller's request; omitted fields get this
 *   implementation's defaults, capped fields are clamped.
 * @returns the fully-specified spec to hand to {@link execute}.
 */
abstract resolve(request: ShellExecRequest): ShellExecSpec

/**
 * Prepare and spawn the command under its resolved deadline.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the prepared handle, including its result projection;
 *   preparation timeout yields an already-settled handle with no output.
 * @throws on preparation failure or caller cancellation before process publication.
 */
abstract execute(spec: ShellExecSpec): Promise<ShellExecution>
```

Source: [`packages/shell/shell/src/index.ts`](../../packages/shell/shell/src/index.ts)

<a id="ctxshellenv--shellenvregistry"></a>

### `ctx.shellEnv` — `ShellEnvRegistry`

Registry (`ctx.shellEnv`) for trusted, per-execution `DSH_*` variables. The namespace is rebuilt for every model shell call: ambient `DSH_*` values are discarded by the executor, then the registry's current snapshot is injected. Built-in shell facts remain owned by the registry itself while plugins can register additional, enumerable facts with effect-scoped disposal.

```ts cordis-catalog
/**
 * Register one environment contributor. Names and keys are unique; built-in
 * keys are reserved. Registration is disposed with the calling plugin fiber.
 * @param contributor - declared key ownership and per-execution resolver.
 * @returns the disposer that unregisters the contribution.
 */
register(contributor: BashEnvContributor): () => void

/**
 * Build the trusted `DSH_*` snapshot for one shell tool execution.
 * @param execution - the current tool execution.
 * @returns an immutable environment overlay containing built-ins and current contributions.
 */
collect(execution: ToolExecution): DshEnvironment

/**
 * Enumerate plugin-contributed variables without executing their resolvers.
 * @returns declarations sorted by environment variable name.
 */
list(): BashEnvVariableInfo[]
```

Types: [DshEnvironment](subprocess.zh.md) · [ToolExecution](tools.zh.md)

Source: [`packages/shell/shell-env/src/index.ts`](../../packages/shell/shell-env/src/index.ts)
<!-- END GENERATED cordis-surface -->
