# PTC 執行時

[English](ptc-runtime.md) | 中文

PTC 執行[能力 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)透過 [dsh-ptc-runtime](../../packages/ptc-runtime/ptc-runtime) 提供 `ctx.ptcRuntime`。它針對 Host 繫結執行一個程式，報告輸出、失敗與適用的沙箱事實。PTC 執行是可選能力，不屬於[智慧代理迴圈主幹](core.zh.md)。[PTC 基礎](../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md)負責註冊表呈現，[型別化返回約定](../../.agents/notes/implemented/feature/2026-07-20-ptc-typed-tool-returns.zh.md)負責繫結值，[沙箱 Node 決策](../../.agents/notes/implemented/architecture/2026-09-11-sandboxed-node-ptc-runtime.zh.md)負責已釋出的執行提供者。

原始碼：[`packages/ptc-runtime/ptc-runtime/src/types.ts`](../../packages/ptc-runtime/ptc-runtime/src/types.ts)

## 執行：請求進，結果出

`PtcRunRequest` 包含程式、繫結、取消和可選執行選擇。提供者的 `resolve` 驗證支援的選擇並應用部署預設值；`run` 接收目錄與截止選擇明確的 `PtcRunSpec`。省略 timeout 使用提供者預設值，數值請求封頂的經過時間預算，`null` 請求不設經過時間截止。提供者在執行前拒絕不支援的選擇：

```ts type-equiv
/**
 * Caller inputs for one program. The provider's resolve method validates supported
 * options and supplies directory, deadline, and authority before execution.
 */
interface PtcRunRequest {
  /**
   * The program source, in the runtime's {@link ../index.ts | language}. It
   * runs as the body of an async function: top-level `await` and `return`
   * are available, and the completion value becomes
   * {@link PtcRunResult.value}.
   */
  program: string
  /** Host functions exposed to the program, one global object per namespace. */
  bindings: PtcBindingNamespace[]
  /** Working directory in the mounted filesystem and subprocess execution world. */
  cwd?: string
  /**
   * Elapsed execution budget in milliseconds. Omission uses provider defaults;
   * null requests no deadline. Providers validate and cap numeric budgets or reject unsupported choices.
   */
  timeoutMs?: number | null
  /** Resolved authority for this execution. Providers without confinement reject an explicit policy. */
  sandboxPolicy?: SandboxExecutionPolicy
  /**
   * Abort the run: the runtime stops the program (hard, even mid-loop) and
   * resolves with a {@link PtcRunFailure} of kind `'abort'`. In-flight
   * binding calls are the CALLER's to settle — the runtime only stops asking.
   */
  signal?: AbortSignal
}
```

```ts type-equiv
/** Fully resolved execution inputs; run never supplies a missing directory or deadline choice. */
interface PtcRunSpec extends PtcRunRequest {
  /** Absolute directory in the provider's execution world. */
  cwd: string
  /** Positive finite elapsed budget in milliseconds after provider capping, or null for no deadline. */
  timeoutMs: number | null
}
```

```ts type-equiv
/** File confinement applied to a program, independently of its terminal outcome. */
interface PtcRunSandbox {
  /** File-effect mode used for this execution. */
  mode: SandboxMode
  /** Program failure text matched backend diagnostics; not enforcement proof or an exhaustive denial record. */
  denied: boolean
  /** Completeness reported by the selected confining backend; absent for full access. */
  enforcement?: SandboxEnforcement
}
```

程式失敗透過 `PtcRunResult.error` 返回；無效呼叫輸入可能在執行前拒絕。沙箱模式、觀察到的拒絕與強制完整性是獨立事實，因此程式成功本身不能證明每項請求限制均已強制執行：

```ts type-equiv
/**
 * The outcome of one run. An error is a FIELD on a resolved result, never a
 * rejection of `run()` — reporting a failed program is the caller's job, not
 * an exception path.
 */
interface PtcRunResult {
  /** Applied file policy and observed denial, when the provider enforces file policy. */
  sandbox?: PtcRunSandbox
  /**
   * The program's completion value (its top-level `return`), when it ran to
   * completion and the value crossed the runtime's lossless-JSON boundary.
   * Invalid or over-limit completions fail the run instead of substituting a
   * rendered string; a failed or value-less run leaves this absent.
   */
  value?: PtcJsonValue
  /**
   * Captured text. Each source channel preserves emission order; interleaving
   * across independent channels is backend-dependent. Bounded only as part of
   * the outer result.
   */
  logs: string[]
  /** Present iff the run failed; see {@link PtcRunFailure} for the taxonomy. */
  error?: PtcRunFailure
}
```

## 繫結：主機函式作為程式全域變數

每個 `PtcBindingNamespace` 成為一個非同步可呼叫函式的全域物件；PTC 傳入 `tools`。參數與回傳值必須是無損 JSON。提供者強制各自的傳輸上限；seam 不設統一的繫結位元組上限。可選錯誤類描述符建立程式可見的型別化拒絕，無需在執行時內點名消費方。繫結名是自有屬性，因此 `__proto__` 不能遍歷原型：

```ts type-equiv
/**
 * Program-visible typed rejection for one binding namespace. The runtime
 * injects a real error constructor under `name`; rejected member calls become
 * its instances and expose the exact member name through
 * `memberNameProperty`. Both strings are runtime data rather than knowledge
 * of a particular consumer such as PTC mode.
 */
interface PtcBindingErrorClass {
  /** Constructor global and resulting `Error.name`; same portable identifier rule as {@link PtcBindingNamespace.global}. */
  name: string
  /**
   * Non-empty own property for the member name. The portable exclusion set is
   * `RESERVED_ERROR_MEMBERS` plus dunder-form names (`__x__`, non-empty
   * middle), enforced identically by every backend; any other name —
   * identifiers or not — is accepted everywhere.
   */
  memberNameProperty: string
}
```

```ts type-equiv
/**
 * A named group of {@link PtcBindingFunction}s the runtime exposes to the
 * program as one global object (e.g. `tools`). Function names are arbitrary
 * strings — a runtime must treat names like `__proto__` or `constructor` as
 * ordinary own properties (null-prototype construction), never as prototype
 * collisions.
 */
interface PtcBindingNamespace {
  /**
   * The global identifier the program sees. Must match the LANGUAGE-PORTABLE
   * identifier subset `[A-Za-z_][A-Za-z0-9_]*` and no language's reserved
   * words, so the same namespace list works against every backend regardless
   * of `language` — a JS-only spelling like `$tools` is rejected by design,
   * not just by the Python backend. Names that satisfy the identifier rule but
   * name a backend-owned slot (`RESERVED_BINDING_GLOBALS`, e.g. `console`,
   * `__dsh_main__`) are also refused everywhere; see its declaration for the
   * exact set and why each entry is reserved.
   */
  global: string
  /** The callable members, keyed by the exact name the program calls. */
  functions: Record<string, PtcBindingFunction>
  /** Optional program-visible typed rejection contract for this namespace. */
  errorClass?: PtcBindingErrorClass
}
```

```ts type-equiv
/** A lossless JSON value transferable through the dependency-light Service Definition. */
type PtcJsonValue = null | boolean | number | string | PtcJsonValue[] | { [key: string]: PtcJsonValue }
```

```ts type-equiv
/**
 * One host-side function exposed to the program as an async callable. The
 * runtime bridges calls to it (possibly across a serialization boundary), so
 * `args` and the resolution value MUST be lossless JSON. A runtime rejects a
 * lossy or non-cloneable value with a descriptive error rather than corrupting
 * the run. No seam-level byte cap applies to a binding resolution. A rejection
 * of this function surfaces inside the program as a rejection of the
 * corresponding call.
 */
type PtcBindingFunction = (args: unknown) => Promise<PtcJsonValue>
```

## 捕捉的輸出與失敗分類體系

日誌是純字串。每個來源通道保留自身的發出順序；由於通道中繼資料不屬於 seam，相互獨立的通道如何交錯由後端決定。執行時捕捉程式的 console 與流輸出，Consumer 只渲染文字。實作會對序列化後的外層日誌陣列，以及完成值或失敗訊息的組合載荷設定上限；固定的結果封裝語法與 Consumer 展示空白不計入這份可變載荷計量。超限會顯式失敗，而不會在值中插入替代內容。

失敗型別是**正交的結果，獨立報告**（見 [defensive-patterns](../defensive-patterns.zh.md)）：預算耗盡不是異常，中止不是超時，基底崩潰（如 OOM）也不是二者中的任何一個：

```ts type-equiv
/**
 * Why a run failed. The kinds are orthogonal outcomes reported independently
 * (per docs/defensive-patterns.md): a budget expiry is not an exception, an
 * abort is not a timeout, and a substrate death is neither.
 *
 * - `'exception'` — the program threw or failed to parse/transform.
 * - `'timeout'` — an implementation-owned budget expired; the message says which.
 * - `'abort'` — {@link PtcRunRequest.signal} fired.
 * - `'worker-exit'` — the execution substrate died without settling (e.g. OOM).
 * - `'invalid-output'` — the completion value was not lossless JSON.
 * - `'output-limit'` — the serialized outer logs/value/diagnostic exceeded the configured cap.
 * - `'protocol'` — the program sent invalid or over-budget control traffic.
 * - `'sandbox-unavailable'` — required confinement could not be established.
 */
interface PtcRunFailure {
  /** The failure class (see the interface doc for each kind's meaning). */
  kind: 'exception' | 'timeout' | 'abort' | 'worker-exit' | 'invalid-output' | 'output-limit' | 'protocol' | 'sandbox-unavailable'
  /** Human-readable detail, suitable for feeding back to a model to self-correct. */
  message: string
}
```

## 服務

`PtcRuntime` 定義於 [`src/index.ts`](../../packages/ptc-runtime/ptc-runtime/src/index.ts)。`resolve(request)` 返回完整執行輸入，`run(spec)` 執行它們。`executionInstructions` 提供由執行時擁有的使用說明，供消費方呈現。支援逐次覆蓋時，`timeout` 報告設定的經過時間預設值和上限；每次請求仍由 `resolve` 驗證並截斷。`language` 選擇支援的程式呈現；`isolation` 描述執行基底，不作安全宣告。`sandboxMode` 宣告檔案策略支援，不提供約束的提供者返回 `undefined`。每個實作將各次執行的程式狀態分離，並在資源釋放期間終止且等待活躍執行。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxptcruntime--ptcruntime-abstract-seam"></a>

### `ctx.ptcRuntime` — `PtcRuntime` (abstract seam)

Registers one `ctx.ptcRuntime` implementation. Program, budget, abort, and substrate failures resolve in PtcRunResult; only Service Definition contract misuse rejects. Implementations bridge structured-cloneable bindings, materialize each declared namespace rejection class, treat programs as hostile peers, isolate runs from one another, and terminate and await in-flight runs during disposal.

```ts cordis-catalog
/**
 * Resolve supported options and provider defaults before execution.
 * @param request - Program, bindings, cancellation and optional execution choices.
 * @returns Complete directory, deadline and supported authority for run.
 * @throws When an explicit choice is invalid or unsupported by this provider.
 */
abstract resolve(request: PtcRunRequest): PtcRunSpec

/**
 * Execute resolved inputs; program outcomes resolve as result fields.
 * @param spec - directory, deadline, program, bindings, cancellation and supported policy.
 * @returns Captured output and the execution outcome.
 */
abstract run(spec: PtcRunSpec): Promise<PtcRunResult>
```

Source: [`packages/ptc-runtime/ptc-runtime/src/index.ts`](../../packages/ptc-runtime/ptc-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->
