# 使用者命令

[English](commands.md) | 中文

[`dsh-commands`](../../packages/interaction/commands) 提供的使用者命令註冊表服務。互動式介面卡用它發現外掛擁有的命令，並針對確切的 agent（智慧代理）直接執行這些命令，而不建立模型訊息。[命令 Agent Note](../../.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.zh.md) 負責分發與生命週期的決策依據；[包 README](../../packages/interaction/commands/README.zh.md) 負責組合方式與限制。

來源：[`packages/interaction/commands/src/index.ts`](../../packages/interaction/commands/src/index.ts)

## 輸入中繼資料

該服務公開一個可選的非結構化輸入描述符：提示文字加附件接受標誌。命令的可用性由外掛組合決定：每個消費註冊表的介面卡都會看到全部生效定義。

```ts type-equiv
/** Immutable metadata for a command's optional unstructured input. */
interface CommandInputDescriptor {
  /** Placeholder shown before the user supplies free-form input. */
  readonly hint: string
  /**
   * Whether composer attachments may accompany an invocation. Absent or
   * false = the executor rejects an invocation carrying attachments and capable
   * composers refuse the submission before dispatch. A declaring command's
   * handler receives the admitted durable blocks and owns every further
   * grammar decision, including rejecting sub-commands that cannot use them.
   */
  readonly attachments?: boolean
}
```

## 定義

`CommandDefinition` 是由外掛編寫的註冊定義。註冊表會驗證並凍結一份與原始註冊物件脫離的生效定義。

```ts type-equiv
/** Plugin-owned command registration. */
interface CommandDefinition {
  /** Stable plugin-owned identity; absent for definitions without identity-based client behavior. */
  readonly definitionId?: CommandDefinitionId
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
  /**
   * Whether `command/run` records `rawInput`. Defaults to true. A command
   * whose domain event owns the payload sets this false to avoid duplicating
   * that payload in the session log.
   */
  readonly recordInput?: boolean
  /** Execute against the receiving agent without sending the command to the model. */
  readonly handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>
}
```

## 呼叫與結果

取消由介面卡負責，介面卡會傳入確切的目標 agent。`rawInput` 緊接在解析後的名稱之後，並保留介面卡傳入的分隔符與字尾。結果會直接呈現給 UI，而不是工具結果或工作階段事件。

```ts type-equiv
/** Invocation passed to one registered command handler. */
interface CommandInvocation {
  /** Pairing id already written to this invocation's `command/run` event. */
  readonly commandId: CommandId
  /** Exact agent whose UI received the command. */
  readonly agent: Agent
  /** Exact text following the registered command name, including separator whitespace. */
  readonly rawInput: string
  /**
   * Durably admitted image and file blocks accompanying this invocation, in submission
   * order; empty unless the definition declares `input.attachments`. The handler
   * owns their model-visible use — the registry never schedules them itself —
   * and a handler whose grammar cannot use them in this invocation returns an
   * error so the dispatching composer retains the originals.
   */
  readonly attachments: readonly (ImageBlock | FileBlock)[]
  /** Cancellation signal owned by the dispatching UI request. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Expected command outcome rendered directly by the dispatching UI. */
type CommandResult =
  | {
    readonly kind: 'success'
    readonly text?: string
    /** Earlier authoritative domain event that owns a richer presentation. */
    readonly sourceEventSeq?: SessionSeq
  }
  | { readonly kind: 'error'; readonly text: string }
```

`sourceEventSeq` 是可選欄位，且只用於成功結果。存在時，它指向接收工作階段日誌中更早的一條非命令事件；`command/done` 會持久化同一引用，讓用戶端能夠將命令生命週期與該領域投影合併，而無須解析 `text` 或依賴相鄰行。

## 發現與解析檢視

作用域解析後，介面卡會獲得不含處理器的不可變描述符。`parseCommand()` 在註冊表解析前返回 `ParsedCommand`；語法有效的輸入仍可能指向不可用的命令。

```ts type-equiv
/** Handler-free immutable command view returned to UI adapters. */
interface CommandDescriptor {
  /** Stable plugin-owned identity; absent for definitions without identity-based client behavior. */
  readonly definitionId?: CommandDefinitionId
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
}
```

```ts type-equiv
/** Syntactically valid slash command before registry resolution. */
interface ParsedCommand {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Exact text following the command name. */
  readonly rawInput: string
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcommands--commandruntime"></a>

### `ctx.commands` — `CommandRuntime`

Human-command registry. Plain-context definitions are global; definitions registered through a command-injected child of an agent context shadow globals for that agent.

```ts cordis-catalog
/**
 * Register a global or calling-agent-scoped command.
 * @param definition - discovery metadata and direct UI handler.
 * @returns the exact effect disposer that unregisters this definition.
 */
register(definition: CommandDefinition): () => void

/**
 * Register the sole authority that resolves staged file receipts for command submissions.
 * @param resolver - Session-aware receipt resolver.
 * @returns disposer that removes this exact resolver.
 */
registerFileReceiptResolver(resolver: CommandFileReceiptResolver): () => void

/**
 * List the effective immutable command descriptors for one agent.
 * @param agent - exact receiving agent and scoped-layer key.
 * @returns name-sorted descriptors after scoped shadowing.
 */
@Remote list(agent: Agent): readonly CommandDescriptor[]

/**
 * Resolve one effective command definition.
 * @param agent - exact receiving agent and scoped-layer key.
 * @param name - command name without a slash.
 * @returns the scoped shadow or global definition.
 */
find(agent: Agent, name: string): CommandDefinition | undefined

/**
 * Parse and execute a known command without sending it to the model.
 *
 * A resolved command's lifecycle is logged: `command/run` is appended
 * before the handler is invoked and `command/done` after settlement (a
 * thrown or aborted handler settles as `kind: 'error'`). Both are direct
 * log-only appends — no turn wraps them, and persistence drains them at
 * ordinary checkpoints. Admission misses (syntax or unknown name) log
 * nothing — they never entered a handler. A `command/run` append failure
 * fails the execution loud; a `command/done` append failure on the
 * handler-failure path is contained so the handler's own error stays the
 * reported failure.
 *
 * Attachment admission is enforced here, not in the composer: attachments sent to a
 * command that does not declare `input.attachments`, an absent attachment store,
 * and an exceeded image limit each settle as an error result before
 * the handler runs. Validation rejection starts no attachment writes;
 * a storage failure can leave only unreachable content-addressed objects
 * for deferred collection.
 *
 * @param agent - exact receiving agent.
 * @param line - complete slash-command line.
 * @param submittedAttachments - encoded images and staged file receipts accompanying the line,
 *   in submission order; empty for a plain invocation.
 * @param signal - cancellation signal owned by the UI request.
 * @returns the settled execution (result + lifecycle pairing id), or
 *   `undefined` when syntax or name does not resolve.
 */
@Remote async execute( agent: Agent, line: string, submittedAttachments: readonly CommandSubmitAttachment[], signal: AbortSignal, ): Promise<CommandExecution | undefined>
```

Types: [Agent](core.zh.md)

Source: [`packages/interaction/commands/src/index.ts`](../../packages/interaction/commands/src/index.ts)

<a id="commands-events"></a>

### `commands/*` events

<a id="commandschange--emit"></a>

#### `commands/change` — emit

A command was registered or unregistered. This is an unfiltered registry notification because a global or scoped change may affect any UI view. Observer failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * A command was registered or unregistered. This is an unfiltered registry
 * notification because a global or scoped change may affect any UI view.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'commands/change'(): void
```

Source: [`packages/interaction/commands/src/types.ts`](../../packages/interaction/commands/src/types.ts)
<!-- END GENERATED cordis-surface -->
