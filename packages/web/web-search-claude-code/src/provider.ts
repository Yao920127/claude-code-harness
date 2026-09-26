/**
 * Claude Code search: one Agent SDK query, with the host's own Claude Code
 * sign-in, whose only available tool is Claude Code's built-in `WebSearch`,
 * and whose answer is structured output validated against a source schema.
 * The pinned platform CLI runs under `ctx.subprocess` with the same
 * process-tree ownership as the Claude Code subagent.
 * @module @deepseek-ai/dsh-web-search-claude-code/provider
 */

import { query as officialQuery, type Query } from '@anthropic-ai/claude-agent-sdk'
import { claudeSpawnSpec, ManagedClaudeCodeProcess } from '@deepseek-ai/dsh-subagent-claude-code'
import { scrubbedParentEnv, type SubprocessHandle, type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

/** Stable provider id. */
export const CLAUDE_CODE_PROVIDER_ID = 'claude-code'

/** JSON Schema of the structured output Claude Code returns for one search. */
export const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'A brief answer to the query from the search results.' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          snippet: { type: 'string', description: 'The passage of the page that supports the answer.' },
        },
        required: ['url'],
      },
    },
  },
  required: ['sources'],
} as const

/** Claude Code search settings. */
export interface ClaudeCodeSearchOptions {
  /** Claude Code model; undefined uses the model the host's Claude Code settings select. */
  readonly model: string | undefined
  /** Maximum agent turns for one search. */
  readonly maxTurns: number
  /** Extra environment variables for the Claude Code process. */
  readonly env: Readonly<Record<string, string>>
  /** Working directory of the Claude Code process. */
  readonly cwd: string
  /** Grace period before the process tree is force-killed at release. */
  readonly disposeGraceMs: number
  /** Start one owned subprocess. */
  readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
}

/** Search the web through the host's signed-in Claude Code installation. */
export class ClaudeCodeSearchProvider implements WebSearchProvider {
  readonly id = CLAUDE_CODE_PROVIDER_ID

  /** @param options - model, turn bound, environment, and process ownership. */
  constructor(private readonly options: ClaudeCodeSearchOptions) {}

  available(): boolean {
    return Number.isInteger(this.options.maxTurns) && this.options.maxTurns > 0
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (signal !== undefined && isAborted(signal)) throw aborted(signal)
    const controller = new AbortController()
    const onAbort = (): void => { controller.abort(signal?.reason) }
    signal?.addEventListener('abort', onAbort, { once: true })
    let child: SubprocessHandle | undefined
    let query: Query | undefined
    try {
      query = officialQuery({
        prompt: searchPrompt(request),
        options: {
          abortController: controller,
          cwd: this.options.cwd,
          env: { ...scrubbedParentEnv(), ...this.options.env },
          ...this.options.model === undefined ? {} : { model: this.options.model },
          tools: ['WebSearch'],
          allowedTools: ['WebSearch'],
          maxTurns: this.options.maxTurns,
          persistSession: false,
          outputFormat: { type: 'json_schema', schema: SEARCH_OUTPUT_SCHEMA },
          spawnClaudeCodeProcess: (spawnOptions) => {
            child = this.options.spawn(claudeSpawnSpec(spawnOptions, this.options.disposeGraceMs))
            return new ManagedClaudeCodeProcess(child)
          },
        },
      })
      for await (const message of query) {
        if (message.type !== 'result') continue
        if (message.subtype !== 'success') {
          throw new WebError(`Claude Code search ended without a result (${message.subtype})`, 'WEB_PROVIDER_ERROR')
        }
        return mapStructuredOutput(message.structured_output)
      }
      throw new WebError('Claude Code search ended without a result message', 'WEB_PROVIDER_ERROR')
    } catch (error: unknown) {
      if (signal !== undefined && isAborted(signal)) throw aborted(signal)
      if (error instanceof WebError) throw error
      throw new WebError(
        `Claude Code search failed: ${error instanceof Error ? error.message : String(error)}. `
        + 'Sign in with the Claude Code CLI on the host, then retry.',
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    } finally {
      signal?.removeEventListener('abort', onAbort)
      query?.close()
      if (child !== undefined) {
        child.terminate()
        await child.waitForExit()
      }
    }
  }
}

/**
 * The prompt of one search: the query and the requested source count.
 * @param request - the normalized search request.
 * @returns the prompt text.
 */
export function searchPrompt(request: WebSearchRequest): string {
  const count = request.maxResults === undefined ? '' : ` Return at most ${String(request.maxResults)} sources.`
  return `Use WebSearch to search the web for the query below, then answer briefly and list the pages you used.${count}\nQuery: ${request.query}`
}

/**
 * Validate Claude Code's structured output at the process boundary.
 * @param output - the result message's `structured_output`.
 * @returns the search result.
 * @throws {WebError} when the output is not the requested shape or lists no source.
 */
export function mapStructuredOutput(output: unknown): WebSearchResult {
  const record = typeof output === 'object' && output !== null ? output as Record<string, unknown> : {}
  const entries = Array.isArray(record.sources) ? record.sources : []
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue
    const { url, title, snippet } = entry as Record<string, unknown>
    if (typeof url !== 'string' || !URL.canParse(url) || seen.has(url)) continue
    seen.add(url)
    sources.push({
      url,
      ...typeof title === 'string' && title.length > 0 ? { title } : {},
      ...typeof snippet === 'string' && snippet.length > 0 ? { snippet } : {},
    })
  }
  if (sources.length === 0) {
    throw new WebError('Claude Code search returned no web sources', 'WEB_PROVIDER_ERROR')
  }
  const answer = typeof record.answer === 'string' && record.answer.trim().length > 0 ? record.answer : undefined
  return { ...answer === undefined ? {} : { content: answer }, sources, truncated: false }
}

/** Read the caller's cancellation state afresh after each await. */
function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true
}

function aborted(signal: AbortSignal): WebError {
  return new WebError('Claude Code search aborted', 'WEB_ABORTED', { cause: signal.reason })
}
