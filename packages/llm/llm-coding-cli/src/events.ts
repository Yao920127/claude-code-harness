/**
 * Decoders from each coding CLI's headless JSON lines to one event vocabulary.
 *
 * Every CLI prints one JSON record per line on standard output. A CLI decoder
 * reads the record types it knows. A record type it does not know goes to the
 * shared {@link GenericDecoder}, which reads the field names coding CLIs
 * commonly use for text, thinking, tool calls, conversation ids, errors, and
 * final answers, so a CLI release that renames or adds record types still
 * streams its answer and tool activity.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/events
 */

/** Token counts one CLI reports for a turn or its last model call. */
export interface CliUsage {
  /** Input tokens, including cache reads. */
  readonly input: number
  readonly output: number
  /** Input tokens served from the provider cache; 0 when none were reported. */
  readonly cacheRead: number
}

/** Lifecycle state of one CLI tool call. */
export type CliToolStatus = 'running' | 'completed' | 'failed'

/** One tool call the CLI reported, in the CLI's own terms. */
export interface CliToolEvent {
  readonly kind: 'tool'
  /** Id unique within the turn; repeated events with the same id update one call. */
  readonly id: string
  /** The CLI's tool name. */
  readonly name: string
  /** The CLI's tool input; absent on an update that repeats no input. */
  readonly input?: unknown
  readonly status: CliToolStatus
  /** Result or error text, when the CLI reported one. */
  readonly output?: string
}

/** One turn event decoded from a CLI's output. */
export type CliEvent =
  /** Answer text; consecutive deltas form one text block. */
  | { readonly kind: 'text'; readonly text: string }
  /** Thinking text; consecutive deltas form one reasoning block. */
  | { readonly kind: 'reasoning'; readonly text: string }
  /** The current text or reasoning block is complete. */
  | { readonly kind: 'break' }
  | CliToolEvent
  /** The CLI's own conversation id, used to continue the conversation next turn. */
  | { readonly kind: 'session'; readonly id: string }
  | { readonly kind: 'usage'; readonly usage: CliUsage }
  /** The complete answer; shown only when the turn streamed no answer text. */
  | { readonly kind: 'final'; readonly text: string }
  /** A diagnostic that fails the turn only when the CLI reports no completed turn. */
  | { readonly kind: 'warning'; readonly message: string }
  /** The turn failed. */
  | { readonly kind: 'failure'; readonly message: string }
  /** The CLI reported the turn complete. */
  | { readonly kind: 'done' }

/** Stateful decoder for one turn's output. */
export interface CliEventDecoder {
  /**
   * Decode one parsed JSON line.
   * @param record - the parsed value.
   * @returns the events it carries, in order.
   */
  accept(record: unknown): CliEvent[]
}

type JsonRecord = Readonly<Record<string, unknown>>

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function firstString(record: JsonRecord, keys: readonly string[]): string | undefined {
  return keys.map(key => asString(record[key])).find(value => value !== undefined)
}

/** Longest tool output kept for display, in UTF-16 code units. */
export const TOOL_OUTPUT_MAX_CHARS = 20_000

/**
 * Bound one tool output for display.
 * @param text - the CLI's output text.
 * @returns the text, or its head with a truncation marker; undefined for empty output.
 */
export function boundedOutput(text: string | undefined): string | undefined {
  if (text === undefined || text.length === 0) return undefined
  return text.length <= TOOL_OUTPUT_MAX_CHARS ? text : `${text.slice(0, TOOL_OUTPUT_MAX_CHARS)}\n… (truncated)`
}

/**
 * Text of a content value: a string, a `{ text }` object, or a list of either,
 * including agent-protocol `{ type: 'content', content: { text } }` entries.
 * @param content - the content value.
 * @returns the joined text, or undefined when it holds none.
 */
export function contentText(content: unknown): string | undefined {
  if (typeof content === 'string') return asString(content)
  const list = Array.isArray(content) ? content : [content]
  const texts = list.map((entry) => {
    const record = asRecord(entry)
    return asString(record.text) ?? asString(asRecord(record.content).text) ?? (typeof entry === 'string' ? asString(entry) : undefined)
  }).filter(text => text !== undefined)
  return texts.length === 0 ? undefined : texts.join('\n')
}

/** Record tags the generic decoder reads, by the event they carry. */
const TAG_WORDS = {
  reasoning: ['thought', 'thinking', 'reasoning'],
  tool: ['tool'],
  failure: ['error', 'fail'],
  final: ['result', 'final', 'complete', 'end', 'done', 'finish'],
  text: ['text', 'message', 'delta', 'content', 'chunk', 'answer', 'response', 'output'],
} as const

const SESSION_KEYS = ['session_id', 'sessionId', 'sessionID', 'conversation_id', 'conversationId', 'thread_id', 'threadId']
const TOOL_NAME_KEYS = ['toolName', 'tool_name', 'tool', 'name', 'title']
const TOOL_INPUT_KEYS = ['input', 'arguments', 'args', 'parameters', 'rawInput', 'params']
const TOOL_ID_KEYS = ['id', 'toolCallId', 'callId', 'call_id', 'tool_use_id', 'toolUseId']
const TEXT_KEYS = ['text', 'delta', 'data', 'content', 'thinking']
const NESTED_KEYS = ['part', 'item', 'data', 'delta', 'message', 'update', 'step_update', 'result', 'payload']

function hasWord(tag: string, words: readonly string[]): boolean {
  return words.some(word => tag.includes(word))
}

function toolStatus(value: unknown): CliToolStatus {
  const status = typeof value === 'string' ? value.toLowerCase() : ''
  if (hasWord(status, ['error', 'fail', 'denied', 'reject', 'cancel'])) return 'failed'
  if (hasWord(status, ['complete', 'success', 'done', 'finish', 'ok'])) return 'completed'
  return 'running'
}

/**
 * Field-name-driven decoder for records no CLI decoder knows. It reads the
 * record and its first nested object under a common wrapper key such as
 * `part`, `item`, or `data`.
 */
export class GenericDecoder implements CliEventDecoder {
  private session: string | undefined
  private nextTool = 0

  accept(record: unknown): CliEvent[] {
    const outer = asRecord(record)
    const inner = NESTED_KEYS.map(key => outer[key]).find(value => typeof value === 'object' && value !== null && !Array.isArray(value))
    const value: JsonRecord = { ...asRecord(inner), ...outer }
    const tag = [value.type, value.event, value.kind, value.sessionUpdate, asRecord(inner).type]
      .filter(part => typeof part === 'string').join(' ').toLowerCase()
    const events: CliEvent[] = []
    const session = firstString(value, SESSION_KEYS)
    if (session !== undefined && session !== this.session) {
      this.session = session
      events.push({ kind: 'session', id: session })
    }
    const tool = firstString(value, TOOL_NAME_KEYS)
    const input = TOOL_INPUT_KEYS.map(key => value[key]).find(candidate => typeof candidate === 'object' && candidate !== null)
    if (tool !== undefined && (input !== undefined || hasWord(tag, TAG_WORDS.tool))) {
      const reported = asString(value.output) ?? asString(value.result) ?? contentText(value.rawOutput) ?? contentText(value.content)
      const output = boundedOutput(reported)
      events.push({
        kind: 'tool',
        id: firstString(value, TOOL_ID_KEYS) ?? `generic-${this.nextTool++}`,
        name: tool,
        ...input === undefined ? {} : { input },
        status: toolStatus(value.status ?? value.state),
        ...output === undefined ? {} : { output },
      })
      return events
    }
    if (hasWord(tag, TAG_WORDS.failure)) {
      events.push({ kind: 'failure', message: firstString(value, ['message', 'error', 'detail']) ?? contentText(value.error) ?? `the CLI reported ${tag}` })
      return events
    }
    const text = TEXT_KEYS.map(key => typeof value[key] === 'string' ? value[key] : contentText(value[key])).find(candidate => candidate !== undefined && candidate.length > 0)
    if (hasWord(tag, TAG_WORDS.final)) {
      const answer = firstString(value, ['response', 'result', 'answer', 'text'])
      if (answer !== undefined) events.push({ kind: 'final', text: answer })
      events.push({ kind: 'done' })
      return events
    }
    if (text === undefined) return events
    if (hasWord(tag, TAG_WORDS.reasoning)) events.push({ kind: 'reasoning', text })
    else if (hasWord(tag, TAG_WORDS.text)) events.push({ kind: 'text', text })
    return events
  }
}

/**
 * Route records a CLI decoder does not know to the {@link GenericDecoder}.
 * @param known - whether the CLI decoder understands a record, even one that carries no event.
 * @param decoder - the CLI decoder.
 * @returns a decoder that falls back to field-name decoding for unknown records.
 */
export function withFallback(known: (record: JsonRecord) => boolean, decoder: CliEventDecoder): CliEventDecoder {
  const generic = new GenericDecoder()
  return { accept: record => known(asRecord(record)) ? decoder.accept(record) : generic.accept(record) }
}

/** A shell command without the `<shell> -lc …` wrapper Codex reports, quoted or not. */
function codexCommand(command: string): string {
  const wrapped = /^\S+ -lc (?:(['"])(.*)\1|([^'"].*))$/su.exec(command)
  return wrapped?.[2] ?? wrapped?.[3] ?? command
}

/** Codex record types {@link CodexDecoder} reads. */
export const CODEX_RECORD_TYPES: ReadonlySet<string> = new Set([
  'thread.started', 'turn.started', 'turn.completed', 'turn.failed', 'item.started', 'item.updated', 'item.completed', 'error',
])

/** Decoder for `codex exec --json`. */
export class CodexDecoder implements CliEventDecoder {
  private readonly generic = new GenericDecoder()

  accept(record: unknown): CliEvent[] {
    const value = asRecord(record)
    switch (value.type) {
      case 'thread.started': {
        const id = asString(value.thread_id)
        return id === undefined ? [] : [{ kind: 'session', id }]
      }
      case 'item.started':
      case 'item.updated':
      case 'item.completed':
        return this.item(asRecord(value.item), value.type === 'item.completed')
      case 'turn.completed': {
        const usage = asRecord(value.usage)
        return [{ kind: 'usage', usage: {
          input: asNumber(usage.input_tokens), output: asNumber(usage.output_tokens), cacheRead: asNumber(usage.cached_input_tokens),
        } }, { kind: 'done' }]
      }
      case 'turn.failed':
        return [{ kind: 'failure', message: asString(asRecord(value.error).message) ?? 'Codex reported a failed turn' }]
      case 'error':
        return [{ kind: 'warning', message: asString(value.message) ?? 'Codex reported an error' }]
      default:
        return []
    }
  }

  private item(item: JsonRecord, completed: boolean): CliEvent[] {
    const id = asString(item.id) ?? ''
    switch (item.type) {
      case 'agent_message':
      case 'reasoning': {
        const text = asString(item.text)
        if (!completed || text === undefined) return []
        return [{ kind: item.type === 'agent_message' ? 'text' : 'reasoning', text }, { kind: 'break' }]
      }
      case 'command_execution': {
        const exit = item.exit_code
        const output = boundedOutput(asString(item.aggregated_output))
        return [{
          kind: 'tool', id, name: 'command_execution', input: { command: codexCommand(asString(item.command) ?? '') },
          status: !completed ? 'running' : typeof exit === 'number' && exit !== 0 ? 'failed' : 'completed',
          ...output === undefined ? {} : { output },
        }]
      }
      case 'file_change': {
        const changes = Array.isArray(item.changes) ? item.changes : []
        const paths = changes.map(change => asString(asRecord(change).path)).filter(path => path !== undefined)
        return [{
          kind: 'tool', id, name: 'apply_patch', input: { path: paths.join(', '), changes },
          status: !completed ? 'running' : item.status === 'failed' ? 'failed' : 'completed',
        }]
      }
      case 'mcp_tool_call': {
        const output = boundedOutput(contentText(asRecord(item.result).content) ?? asString(asRecord(item.error).message))
        return [{
          kind: 'tool', id, name: `${asString(item.server) ?? 'mcp'}.${asString(item.tool) ?? 'tool'}`, input: item.arguments,
          status: !completed ? 'running' : item.status === 'failed' || item.error !== undefined && item.error !== null ? 'failed' : 'completed',
          ...output === undefined ? {} : { output },
        }]
      }
      case 'web_search':
        return [{ kind: 'tool', id, name: 'web_search', input: { query: item.query }, status: completed ? 'completed' : 'running' }]
      case 'todo_list':
      case 'error':
        // Plans and warnings about local configuration stay inside Codex.
        return []
      default:
        // A newer item type is read by field names.
        return this.generic.accept(item)
    }
  }
}

/** Grok record types {@link GrokDecoder} reads or deliberately skips. */
export const GROK_RECORD_TYPES: ReadonlySet<string> = new Set([
  'text', 'thought', 'tool_call', 'tool_call_update', 'end', 'error', 'usage', 'available_commands',
])

/** Decoder for `grok --output-format streaming-json`. */
export class GrokDecoder implements CliEventDecoder {
  private readonly tools = new Map<string, string>()

  accept(record: unknown): CliEvent[] {
    const value = asRecord(record)
    switch (value.type) {
      case 'text':
      case 'thought': {
        const text = asString(value.data)
        return text === undefined ? [] : [{ kind: value.type === 'text' ? 'text' : 'reasoning', text }]
      }
      case 'tool_call': {
        const name = asString(value.toolName) ?? asString(value.title) ?? 'tool'
        const id = asString(value.toolCallId) ?? `grok-${this.tools.size}`
        this.tools.set(id, name)
        return [{ kind: 'tool', id, name, input: value.rawInput, status: 'running' }]
      }
      case 'tool_call_update': {
        const status = toolStatus(value.status)
        if (status === 'running') return []
        const id = asString(value.toolCallId) ?? ''
        const output = boundedOutput(contentText(value.content) ?? contentText(value.rawOutput))
        return [{ kind: 'tool', id, name: this.tools.get(id) ?? 'tool', status, ...output === undefined ? {} : { output } }]
      }
      case 'end': {
        const events: CliEvent[] = []
        const id = asString(value.sessionId)
        if (id !== undefined) events.push({ kind: 'session', id })
        const usage = asRecord(value.usage)
        const cacheRead = asNumber(usage.cache_read_input_tokens)
        events.push({ kind: 'usage', usage: { input: asNumber(usage.input_tokens) + cacheRead, output: asNumber(usage.output_tokens), cacheRead } })
        events.push({ kind: 'done' })
        return events
      }
      case 'error':
        return [{ kind: 'failure', message: asString(value.message) ?? asString(value.data) ?? asString(asRecord(value.error).message) ?? 'Grok reported an error' }]
      default:
        // Per-call usage and command lists carry nothing the harness shows.
        return []
    }
  }
}

/** Antigravity record events {@link AntigravityDecoder} reads. */
export const ANTIGRAVITY_RECORD_EVENTS: ReadonlySet<string> = new Set(['init', 'step_update', 'result'])

/** Antigravity step types {@link AntigravityDecoder} reads or deliberately skips. */
const ANTIGRAVITY_STEP_TYPES: ReadonlySet<string> = new Set(['agent_response', 'tool', 'user_input', 'unknown', 'planner'])

/** Decoder for `agy --output-format stream-json`. */
export class AntigravityDecoder implements CliEventDecoder {
  private readonly tools = new Map<number, string>()
  private readonly generic = new GenericDecoder()

  accept(record: unknown): CliEvent[] {
    const value = asRecord(record)
    switch (value.event) {
      case 'init': {
        const id = asString(value.conversation_id)
        return id === undefined ? [] : [{ kind: 'session', id }]
      }
      case 'step_update':
        return this.step(asRecord(value.step_update))
      case 'result': {
        const result = asRecord(value.result)
        const events: CliEvent[] = []
        const id = asString(result.conversation_id)
        if (id !== undefined) events.push({ kind: 'session', id })
        const usage = asRecord(result.usage)
        const cacheRead = asNumber(usage.cache_read_tokens)
        events.push({ kind: 'usage', usage: { input: asNumber(usage.input_tokens) + cacheRead, output: asNumber(usage.output_tokens), cacheRead } })
        const response = asString(result.response)
        if (result.status !== 'SUCCESS') {
          events.push({ kind: 'failure', message: asString(result.error) ?? response ?? `Antigravity ended with status ${String(result.status)}` })
          return events
        }
        if (response !== undefined) events.push({ kind: 'final', text: response })
        const denied = (Array.isArray(result.denied_actions) ? result.denied_actions : [])
          .map(action => asString(asRecord(action).display_name) ?? asString(asRecord(action).action))
          .filter(action => action !== undefined)
        if (denied.length > 0) {
          events.push({ kind: 'warning', message: `Antigravity was refused permission for ${denied.join(', ')}, which headless mode cannot ask for` })
        }
        events.push({ kind: 'done' })
        return events
      }
      default:
        return []
    }
  }

  private step(step: JsonRecord): CliEvent[] {
    const type = asString(step.step_type) ?? ''
    if (!ANTIGRAVITY_STEP_TYPES.has(type)) return this.generic.accept(step)
    const events: CliEvent[] = []
    const thinking = asString(step.thinking_delta)
    if (thinking !== undefined) events.push({ kind: 'reasoning', text: thinking })
    if (type === 'agent_response') {
      const text = asString(step.text_delta)
      if (text !== undefined) events.push({ kind: 'text', text })
      if (step.state === 'DONE') events.push({ kind: 'break' })
      return events
    }
    if (type !== 'tool') return events
    const index = asNumber(step.step_index)
    const info = asRecord(step.tool_info)
    const name = asString(step.tool_name) ?? asString(info.name) ?? this.tools.get(index) ?? 'tool'
    this.tools.set(index, name)
    const failed = step.state === 'ERROR' || step.state === 'FAILED'
    const output = boundedOutput(asString(info.error) ?? asString(asRecord(info.error).message) ?? asString(info.output))
    events.push({
      kind: 'tool', id: `step-${index}`, name, input: info.parameters,
      status: failed ? 'failed' : step.state === 'DONE' ? 'completed' : 'running',
      ...output === undefined ? {} : { output },
    })
    return events
  }
}

/** OpenCode record types {@link OpenCodeDecoder} reads or deliberately skips. */
export const OPENCODE_RECORD_TYPES: ReadonlySet<string> = new Set([
  'text', 'reasoning', 'tool_use', 'step_start', 'step_finish', 'error',
])

/** Decoder for `opencode run --format json`. */
export class OpenCodeDecoder implements CliEventDecoder {
  private session: string | undefined

  accept(record: unknown): CliEvent[] {
    const value = asRecord(record)
    const events: CliEvent[] = []
    const id = asString(value.sessionID)
    if (id !== undefined && id !== this.session) {
      this.session = id
      events.push({ kind: 'session', id })
    }
    const part = asRecord(value.part)
    switch (value.type) {
      case 'text':
      case 'reasoning': {
        const text = asString(part.text)
        if (text !== undefined) events.push({ kind: value.type, text }, { kind: 'break' })
        return events
      }
      case 'tool_use': {
        const state = asRecord(part.state)
        const output = boundedOutput(asString(state.output) ?? asString(state.error))
        events.push({
          kind: 'tool', id: asString(part.callID) ?? asString(part.id) ?? asString(part.partID) ?? 'tool', name: asString(part.tool) ?? 'tool',
          input: state.input, status: toolStatus(state.status), ...output === undefined ? {} : { output },
        })
        return events
      }
      case 'step_finish': {
        const tokens = asRecord(part.tokens)
        const cacheRead = asNumber(asRecord(tokens.cache).read)
        events.push({ kind: 'usage', usage: { input: asNumber(tokens.input) + cacheRead, output: asNumber(tokens.output), cacheRead } })
        if (part.reason !== 'tool-calls') events.push({ kind: 'done' })
        return events
      }
      case 'error': {
        const error = asRecord(value.error)
        events.push({ kind: 'failure', message: asString(asRecord(error.data).message) ?? asString(error.message) ?? asString(error.name) ?? 'OpenCode reported an error' })
        return events
      }
      default:
        return events
    }
  }
}
