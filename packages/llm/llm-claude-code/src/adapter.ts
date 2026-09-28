/**
 * Claude Code-backed implementation of the harness LLM seam.
 *
 * One model call runs one complete Claude Code turn through the official
 * Agent SDK: Claude Code plans, calls its own tools, and answers inside the
 * Session workspace with the host's native Claude settings and sign-in. The
 * harness loop receives the turn's text, thinking, and tool activity as one
 * assistant message whose replay state holds the native resume cursor.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/adapter
 */

import { query as officialQuery, type Options, type Query } from '@anthropic-ai/claude-agent-sdk'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { claudeSpawnSpec, ManagedClaudeCodeProcess } from '@deepseek-ai/dsh-subagent-claude-code'
import { scrubbedParentEnv, type SubprocessHandle, type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval'
import { approvalCallback } from './approval.ts'
import { BROWSER_MCP_SERVER, BROWSER_TOOL_ID, browserToolServer } from './browser-tool.ts'
import { modelEntries, NATIVE_MODEL_ID, type ClaudeCodeModelEntry } from './models.ts'
import { resolvePermissionMode, type ClaudeCodeRoutePermissionMode, type SessionPermissions } from './permissions.ts'
import { planTurn, type ClaudeCodeTurnPlan } from './request.ts'
import { ClaudeCodeStreamTranslator } from './stream.ts'

/** Resolved deployment choices and host hooks for one route. */
export interface ClaudeCodeAdapterOptions {
  /** Route name registered on `ctx.llm`. */
  readonly provider: string
  /** Route label shown by model selectors. */
  readonly displayName: string
  /** Advertised models in selector order; absent asks the signed-in Claude Code installation. */
  readonly models?: readonly ClaudeCodeModelEntry[]
  /** Working directory for the model-discovery process, whose settings select the default model. */
  readonly discoveryCwd: string
  /** Reports a failed model discovery; the selector then offers only the native default. */
  readonly onDiscoveryError: (error: Error) => void
  /** Permission setting: `session` derives each turn's native mode from the Session; any other value pins it. */
  readonly permissionMode: ClaudeCodeRoutePermissionMode
  /** Explicit environment layered over the credential-scrubbed parent environment. */
  readonly env: Readonly<Record<string, string>>
  /** Grace between managed-range termination tiers. */
  readonly disposeGraceMs: number
  /** Retry policy captured with the route registration. */
  readonly retryPolicy: ResolvedRetryPolicy
  /** Shared subprocess spawn operation owning the CLI process tree. */
  readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
  /** Current approval service, when the composition mounts one. */
  readonly approval: () => ApprovalService | undefined
  /** The Agent whose model call is running, when an Agent initiated it. */
  readonly initiator: () => Agent | undefined
  /** One live Session, when it is loaded. */
  readonly session: (sessionId: SessionId) => Session | undefined
  /** A Session's effective permission knobs, when the composition mounts sandbox and approval services. */
  readonly sessionPermissions: (session: Session) => SessionPermissions | undefined
  /**
   * Opens an address in a new app Browser tab of one Session and returns how many app windows received it;
   * undefined when the composition mounts no app Browser, which leaves the browser tool out of every turn.
   */
  readonly appBrowser: () => ((session: Session, url: string) => number) | undefined
}

/** Claude Code turns as model calls on one or more harness provider routes. */
export class ClaudeCodeAdapter extends LlmAdapter {
  /** One discovery shared by every selector read; cleared after a failure so the next read retries. */
  private discovered: Promise<readonly ClaudeCodeModelEntry[]> | undefined

  constructor(private readonly options: ClaudeCodeAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.options.displayName }
  }

  override providerRetryPolicy(): ResolvedRetryPolicy {
    return this.options.retryPolicy
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return (await this.models()).map(entry => ({
      provider,
      id: entry.id,
      name: entry.name,
      ...entry.description === undefined ? {} : { description: entry.description },
      inputModalities: ['text'],
    }))
  }

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    // Every model call resolves its model, so only an already-started discovery is consulted.
    const known = this.options.models ?? await this.discovered
    const entry = known?.find(candidate => candidate.id === model)
    return { provider, id: model, name: entry?.name ?? model, inputModalities: ['text'] }
  }

  /** The configured models, or the signed-in installation's list, discovered once. */
  private models(): Promise<readonly ClaudeCodeModelEntry[]> {
    const configured = this.options.models
    if (configured !== undefined) return Promise.resolve(configured)
    this.discovered ??= this.discover().catch((error: unknown) => {
      this.discovered = undefined
      this.options.onDiscoveryError(error instanceof Error ? error : new Error(String(error)))
      return [{ id: NATIVE_MODEL_ID, name: this.options.displayName }]
    })
    return this.discovered
  }

  /**
   * Ask Claude Code for the account's models without sending a prompt.
   * @returns selector entries in Claude Code's order.
   */
  private async discover(): Promise<ClaudeCodeModelEntry[]> {
    let release!: () => void
    const idle = new Promise<void>((resolve) => { release = resolve })
    // A prompt stream that yields nothing keeps the process initialized for
    // control requests without starting a model turn.
    async function* noPrompt(): AsyncGenerator<never, void> {
      await idle
    }
    let child: SubprocessHandle | undefined
    const query = officialQuery({
      prompt: noPrompt(),
      options: {
        cwd: this.options.discoveryCwd,
        env: { ...scrubbedParentEnv(), ...this.options.env },
        persistSession: false,
        spawnClaudeCodeProcess: (spawnOptions) => {
          child = this.options.spawn(claudeSpawnSpec(spawnOptions, this.options.disposeGraceMs))
          return new ManagedClaudeCodeProcess(child)
        },
      },
    })
    try {
      return modelEntries(await query.supportedModels())
    } finally {
      release()
      query.close()
      if (child !== undefined) {
        child.terminate()
        await child.waitForExit()
      }
    }
  }

  /**
   * Run one Claude Code turn and stream it as harness chunks.
   * @param options - the assembled request; `signal` cancels the native turn.
   * @returns the chunk stream, ending in exactly one `finish` chunk.
   */
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const plan = planTurn(options)
    const agent = this.options.initiator()
    const session = options.sessionId === undefined ? agent?.session : this.options.session(options.sessionId)
    const cwd = session?.header.cwd
    if (session === undefined || cwd === undefined) {
      throw new LlmError(
        'llm-claude-code: a Claude Code turn runs in its Session\'s workspace; call this route for a loaded Session that has a working directory',
        'NO_WORKSPACE',
      )
    }
    const controller = new AbortController()
    const onAbort = (): void => { controller.abort(options.signal?.reason) }
    if (options.signal?.aborted === true) onAbort()
    else options.signal?.addEventListener('abort', onAbort, { once: true })

    let child: SubprocessHandle | undefined
    let query: Query | undefined
    const translator = new ClaudeCodeStreamTranslator()
    try {
      query = officialQuery({
        prompt: plan.prompt,
        options: this.queryOptions(options, plan, session, cwd, controller, agent, (handle) => { child = handle }),
      })
      for await (const message of query) yield * translator.accept(message)
      yield * translator.finish()
    } catch (error: unknown) {
      if (error instanceof LlmError) throw error
      throw new LlmError(
        `llm-claude-code: the Claude Code process failed: ${error instanceof Error ? error.message : String(error)}`,
        'CLAUDE_CODE_PROCESS',
        { cause: error },
      )
    } finally {
      options.signal?.removeEventListener('abort', onAbort)
      query?.close()
      if (child !== undefined) {
        child.terminate()
        await child.waitForExit()
      }
    }
  }

  private queryOptions(
    request: GenerateOptions,
    plan: ClaudeCodeTurnPlan,
    session: Session,
    cwd: string,
    controller: AbortController,
    agent: Agent | undefined,
    capture: (child: SubprocessHandle) => void,
  ): Options {
    const permissionMode = resolvePermissionMode(this.options.permissionMode, this.options.sessionPermissions(session))
    const auxiliary = request.purpose !== undefined
    const appBrowser = auxiliary ? undefined : this.options.appBrowser()
    return {
      abortController: controller,
      cwd,
      env: { ...scrubbedParentEnv(), ...this.options.env },
      ...request.model === NATIVE_MODEL_ID ? {} : { model: request.model },
      includePartialMessages: true,
      systemPrompt: plan.systemAppend === undefined
        ? { type: 'preset', preset: 'claude_code' }
        : { type: 'preset', preset: 'claude_code', append: plan.systemAppend },
      // No harness question channel is bridged yet; a native question would
      // otherwise wait for a user interface this route does not supply.
      disallowedTools: ['AskUserQuestion'],
      permissionMode,
      ...permissionMode === 'bypassPermissions'
        ? { allowDangerouslySkipPermissions: true }
        : { canUseTool: approvalCallback(this.options.approval(), agent, appBrowser === undefined ? [] : [BROWSER_TOOL_ID]) },
      ...plan.resume === undefined ? {} : { resume: plan.resume.sessionId, resumeSessionAt: plan.resume.resumeAt },
      // Auxiliary calls (titles, compaction summaries) answer from the prompt
      // alone and leave no native transcript behind.
      ...auxiliary ? { tools: [], maxTurns: 1, persistSession: false } : {},
      // Conversation turns show web pages in the app's Browser; the permission callback allows the tool without asking.
      ...appBrowser === undefined ? {} : {
        mcpServers: { [BROWSER_MCP_SERVER]: browserToolServer(url => appBrowser(session, url)) },
      },
      spawnClaudeCodeProcess: (spawnOptions) => {
        const handle = this.options.spawn(claudeSpawnSpec(spawnOptions, this.options.disposeGraceMs))
        capture(handle)
        return new ManagedClaudeCodeProcess(handle)
      },
    }
  }
}
