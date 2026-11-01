/**
 * Coding-CLI-backed implementation of the harness LLM seam.
 *
 * One model call runs one headless turn of an installed coding CLI in the
 * Session workspace, signed in with that CLI's own login: the CLI plans, runs
 * its own tools, and answers. The harness receives the turn's text and
 * thinking as one assistant message whose replay state holds the CLI
 * conversation id, and each tool call the CLI ran as a `coding-cli/tool`
 * Session event.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/adapter
 */

import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, ResolvedRetryPolicy, StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { resolveAccess, type CodingCliRouteAccess, type SessionPermissions } from './access.ts'
import type { CliInvocation, CodingCliDefinition, CodingCliId } from './clis.ts'
import { withEfforts, type ReadTextFile } from './efforts.ts'
import { writeTurnImages, type TurnImageData } from './images.ts'
import { modelReasoning, NATIVE_MODEL_ID, type CodingCliModelEntry } from './models.ts'
import { planTurn } from './request.ts'
import { CodingCliStreamTranslator } from './stream.ts'
import { ToolEventRecorder } from './tool-events.ts'

/** Bytes of standard error kept for failure messages. */
const STDERR_TAIL_BYTES = 64 * 1024

/** Characters of non-JSON standard output kept as the fallback answer. */
const PLAIN_OUTPUT_MAX_CHARS = 64 * 1024

/** Resolved deployment choices and host hooks for one route. */
export interface CodingCliAdapterOptions {
  /** Route name registered on `ctx.llm`. */
  readonly provider: string
  readonly cli: CodingCliId
  readonly definition: CodingCliDefinition
  /** Route label shown by model selectors. */
  readonly displayName: string
  /** Advertised models in selector order; absent asks the CLI. */
  readonly models?: readonly CodingCliModelEntry[]
  /** Locates the CLI executable; undefined when it is not installed. */
  readonly executable: () => string | undefined
  /** Environment layered over the credential-scrubbed parent environment, given the located executable. */
  readonly env: (executable: string) => Readonly<Record<string, string>>
  /** The user's home directory, where CLIs keep the files that declare their models' effort levels. */
  readonly home: string
  /** Reads one text file; undefined when it does not exist or cannot be read. */
  readonly readTextFile: ReadTextFile
  /** Working directory of the model-listing process. */
  readonly discoveryCwd: string
  /** Milliseconds the model-listing process may run. */
  readonly discoveryTimeoutMs: number
  /** Milliseconds one model list answers selectors before the CLI is asked again. */
  readonly modelsFreshMs: number
  /** Largest model-listing output accepted, in bytes. */
  readonly discoveryMaxBytes: number
  /** Reports a failed model listing; the selector then offers only the CLI-settings entry. */
  readonly onDiscoveryError: (error: Error) => void
  readonly access: CodingCliRouteAccess
  /** Effort level selected for a model that accepts it when a request names none. */
  readonly defaultEffort: string
  /** Grace between managed-range termination tiers. */
  readonly disposeGraceMs: number
  readonly retryPolicy: ResolvedRetryPolicy
  /** Shared subprocess spawn operation owning the CLI process tree. */
  readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
  /** The Agent whose model call is running, when an Agent initiated it. */
  readonly initiator: () => Agent | undefined
  /** One live Session, when it is loaded. */
  readonly session: (sessionId: SessionId) => Session | undefined
  /** The attachment store, when the composition mounts one; prompt images are read from it. */
  readonly attachments: () => AttachmentStore | undefined
  /** A Session's permission knobs, when the composition mounts sandbox and approval services. */
  readonly sessionPermissions: (session: Session) => SessionPermissions | undefined
  /** Current time in milliseconds. */
  readonly now: () => number
}

interface Discovery {
  readonly models: Promise<readonly CodingCliModelEntry[]>
  readonly at: number
}

/** Coding-CLI turns as model calls on one harness provider route. */
export class CodingCliAdapter extends LlmAdapter {
  private discovery: Discovery | undefined

  constructor(private readonly options: CodingCliAdapterOptions) {
    super()
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const entries = await this.models()
    return entries.map(entry => textModel(provider, entry))
  }

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const entries = await this.models()
    const entry = entries.find(candidate => candidate.id === model) ?? { id: model, name: model }
    const reasoning = modelReasoning(entry, this.options.defaultEffort)
    return reasoning === undefined ? textModel(provider, entry) : { ...textModel(provider, entry), reasoning }
  }

  override providerInfo(provider: string): LlmProviderInfo {
    const { displayName } = this.options
    return { id: provider, name: displayName }
  }

  /** @returns the route's retry policy; by default a failed turn is never retried. */
  override providerRetryPolicy(): ResolvedRetryPolicy {
    const { retryPolicy } = this.options
    return retryPolicy
  }

  /** The configured models, or the CLI's list, reused for `modelsFreshMs`. */
  private models(): Promise<readonly CodingCliModelEntry[]> {
    const configured = this.options.models
    if (configured !== undefined) return Promise.resolve(configured)
    const now = this.options.now()
    const current = this.discovery
    if (current !== undefined && now - current.at < this.options.modelsFreshMs) return current.models
    const native: CodingCliModelEntry = { id: NATIVE_MODEL_ID, name: `${this.options.displayName} (CLI settings)` }
    const discovery: Discovery = {
      at: now,
      models: this.discover().then(models => [native, ...models], (error: unknown) => {
        if (this.discovery === discovery) this.discovery = undefined
        this.options.onDiscoveryError(error instanceof Error ? error : new Error(String(error)))
        return [native]
      }),
    }
    this.discovery = discovery
    return discovery.models
  }

  /**
   * Run the CLI's model-listing command.
   * @returns the CLI's models; none when the CLI is not installed.
   */
  private async discover(): Promise<CodingCliModelEntry[]> {
    const executable = this.options.executable()
    if (executable === undefined) return []
    const signal = AbortSignal.timeout(this.options.discoveryTimeoutMs)
    const child = this.options.spawn({
      argv: [executable, ...this.options.definition.modelArgs],
      cwd: this.options.discoveryCwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: this.options.discoveryMaxBytes },
        stderr: { maxBytes: STDERR_TAIL_BYTES },
      },
      graceMs: this.options.disposeGraceMs,
      signal,
      env: this.options.env(executable),
    })
    const outcome = await child.done
    await child.waitForExit()
    const stdout = child.collected.stdout?.readFrom(0)
    if (signal.aborted) throw new Error(`listing ${this.options.displayName} models timed out`)
    if (outcome.exitCode !== 0 || stdout === undefined || stdout.lossy) {
      const stderr = child.collected.stderr?.readFrom(0).text.trim() ?? ''
      throw new Error(`listing ${this.options.displayName} models failed (exit ${String(outcome.exitCode)})${stderr.length === 0 ? '' : `: ${stderr}`}`)
    }
    const { definition, home, readTextFile } = this.options
    const listed = definition.parseModels(stdout.text)
    const declared = definition.modelEfforts?.(home, readTextFile)
    return declared === undefined ? listed : withEfforts(listed, declared)
  }

  /**
   * Run one CLI turn and stream it as harness chunks. A conversation turn
   * records each tool call the CLI reports as a `coding-cli/tool` Session event.
   * @param options - the assembled request; `signal` stops the CLI process.
   * @returns the chunk stream, ending in exactly one `finish` chunk.
   */
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const { provider, cli, definition, displayName } = this.options
    const plan = planTurn(provider, cli, options)
    const session = this.turnSession(options)
    const cwd = session.header.cwd as string
    const executable = this.options.executable()
    if (executable === undefined) {
      throw new LlmError(`${provider}: ${displayName} is not installed; install its CLI (\`${definition.command}\`) and sign in, then send again`, 'CODING_CLI_NOT_INSTALLED')
    }
    const auxiliary = options.purpose !== undefined
    const files = await writeTurnImages(plan.images, ref => this.readImage(ref, options.signal))
    try {
      const invocation = definition.turn({
        prompt: plan.prompt,
        images: files.images,
        ...options.model === NATIVE_MODEL_ID ? {} : { model: options.model },
        ...options.reasoningEffort === undefined ? {} : { effort: options.reasoningEffort },
        // Auxiliary calls answer from their prompt alone and must not change the workspace.
        access: auxiliary ? 'read-only' : resolveAccess(this.options.access, this.options.sessionPermissions(session)),
        ...plan.resume === undefined ? {} : { resume: plan.resume },
      })
      const tools = auxiliary ? undefined : new ToolEventRecorder(provider, (data) => { session.append('coding-cli/tool', data) })
      yield * this.run(executable, invocation, cwd, options.signal, tools)
    } finally {
      await files.dispose()
    }
  }

  /**
   * Resolve the Session a request runs in.
   * @param options - the request; its Session, or the initiating Agent's.
   * @returns the loaded Session, which has a working directory.
   * @throws {LlmError} code `NO_WORKSPACE` when neither names a loaded Session with a working directory.
   */
  private turnSession(options: GenerateOptions): Session {
    const agent = this.options.initiator()
    const session = options.sessionId === undefined ? agent?.session : this.options.session(options.sessionId)
    if (session?.header.cwd !== undefined) return session
    const { provider, displayName } = this.options
    throw new LlmError(`${provider}: a ${displayName} turn runs in its Session's workspace; call this route for a loaded Session that has a working directory`, 'NO_WORKSPACE')
  }

  /**
   * Read one prompt image, as a smaller version when it exceeds the CLI's image size limit.
   * @param ref - the image.
   * @param signal - the request's cancellation.
   * @returns the bytes and their media type.
   * @throws {LlmError} code `UNSUPPORTED_CONTENT` when the composition mounts no attachment store.
   */
  private async readImage(ref: ImageAttachmentRef, signal: AbortSignal | undefined): Promise<TurnImageData> {
    const attachments = this.options.attachments()
    if (attachments === undefined) {
      throw new LlmError(`${this.options.provider}: images need the attachment service, which this composition does not mount`, 'UNSUPPORTED_CONTENT')
    }
    const maxBytes = this.options.definition.imageMaxBytes
    if (maxBytes !== undefined && ref.bytes > maxBytes) {
      const smaller = await attachments.readImageRequest(ref, { width: ref.width, height: ref.height, maxBytes }, signal)
      return { data: smaller.data, mediaType: smaller.mediaType }
    }
    const stored = await attachments.readImage(ref, signal)
    return { data: stored.data, mediaType: ref.mediaType }
  }

  /**
   * Run the CLI process and translate its output.
   * @param executable - the located CLI.
   * @param invocation - the turn's arguments and standard input.
   * @param cwd - the Session workspace.
   * @param signal - the request's cancellation, which stops the process.
   * @param tools - records reported tool calls; absent for auxiliary calls.
   * @returns the chunk stream, ending in exactly one `finish` chunk.
   */
  private async * run(
    executable: string, invocation: CliInvocation, cwd: string, signal: AbortSignal | undefined, tools: ToolEventRecorder | undefined,
  ): AsyncIterable<StreamChunk> {
    const child = this.options.spawn({
      argv: [executable, ...invocation.args],
      cwd,
      stdio: {
        stdin: invocation.stdin === undefined ? 'ignore' : { data: invocation.stdin },
        stdout: 'pipe',
        stderr: { maxBytes: STDERR_TAIL_BYTES },
      },
      graceMs: this.options.disposeGraceMs,
      signal,
      // OpenCode resolves its project from PWD, which the harness process would otherwise pass down unchanged.
      env: { ...this.options.env(executable), PWD: cwd },
    })
    const translator = new CodingCliStreamTranslator(this.options.cli, this.options.displayName)
    const decoder = this.options.definition.decoder()
    let plain = ''
    try {
      for await (const line of createInterface({ input: child.stdout ?? Readable.from([]), crlfDelay: Infinity })) {
        const record = parseLine(line)
        if (record === undefined) {
          if (plain.length < PLAIN_OUTPUT_MAX_CHARS) plain += `${line}\n`
          continue
        }
        for (const event of decoder.accept(record)) {
          if (event.kind === 'tool') tools?.record(event)
          yield * translator.accept(event)
        }
      }
      const outcome = await child.done
      if (signal?.aborted === true) throw signal.reason
      yield * translator.finish({ code: outcome.exitCode, stderr: child.collected.stderr?.readFrom(0).text ?? '' }, plain)
    } finally {
      child.terminate()
      await child.waitForExit()
    }
  }
}

/**
 * Describe one advertised model; every CLI route takes text and images.
 * @param provider - the route.
 * @param entry - the advertised model.
 * @returns selector metadata for the model.
 */
function textModel(provider: string, entry: CodingCliModelEntry): LlmModelInfo {
  const info: LlmModelInfo = { provider, id: entry.id, name: entry.name, inputModalities: ['text', 'image'] }
  return entry.description === undefined ? info : { ...info, description: entry.description }
}

/**
 * Parse one output line as JSON.
 * @param line - one standard-output line.
 * @returns the parsed value, or undefined for a line that is not JSON, such as a CLI banner.
 */
function parseLine(line: string): unknown {
  const text = line.trim()
  if (!text.startsWith('{')) return undefined
  try {
    const value: unknown = JSON.parse(text)
    return value
  } catch (_notJson) {
    // A line that starts like JSON but is not complete JSON carries no event.
    return undefined
  }
}
