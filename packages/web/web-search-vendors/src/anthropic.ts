/**
 * Claude API search through the official Anthropic SDK and the Messages API
 * `web_search` server tool. Anthropic runs the searches; the provider maps
 * `web_search_tool_result` blocks to sources and joins each source to the
 * excerpt a `web_search_result_location` citation quotes.
 * @module @deepseek-ai/dsh-web-search-vendors/anthropic
 */

import Anthropic from '@anthropic-ai/sdk'
import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { SEARCH_INSTRUCTION, source, VendorSearchProvider, vendorResult } from './common.ts'
import type { ResolveApiKey, VendorOptions } from './common.ts'

/** Stable provider id. */
export const CLAUDE_API_PROVIDER_ID = 'claude-api'

/** `web_search` server-tool versions: dynamic filtering needs Opus 4.6+ or Sonnet 4.6+; older models take the basic one. */
export type ClaudeWebSearchToolType = 'web_search_20260209' | 'web_search_20250305'

/** Claude API provider settings. */
export interface ClaudeApiOptions extends VendorOptions {
  /** Server-tool version sent for the configured model. */
  readonly toolType: ClaudeWebSearchToolType
  /** Maximum `web_search` uses per request. */
  readonly maxUses: number
  /** Upper bound on generated tokens per Messages request. */
  readonly maxTokens: number
}

/** A long server-tool turn may pause; the provider resumes it this many times before mapping what arrived. */
const MAX_CONTINUATIONS = 3

/** Search through the Claude API's `web_search` server tool. */
export class ClaudeApiSearchProvider extends VendorSearchProvider {
  readonly id = CLAUDE_API_PROVIDER_ID
  protected readonly label = 'Claude API'

  /**
   * @param options - endpoint, credential reference, model, and tool settings.
   * @param resolveApiKey - credential resolution for each search.
   */
  constructor(protected override readonly options: ClaudeApiOptions, resolveApiKey: ResolveApiKey) {
    super(options, resolveApiKey)
  }

  override available(): boolean {
    return super.available() && Number.isInteger(this.options.maxUses) && this.options.maxUses > 0
  }

  protected async dispatch(request: WebSearchRequest, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
    const client = new Anthropic({ apiKey, baseURL: this.options.baseURL, maxRetries: 0 })
    const tool: Anthropic.ToolUnion = this.options.toolType === 'web_search_20250305'
      ? { type: 'web_search_20250305', name: 'web_search', max_uses: this.options.maxUses }
      : { type: 'web_search_20260209', name: 'web_search', max_uses: this.options.maxUses }
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: SEARCH_INSTRUCTION + request.query }]
    const blocks: Anthropic.ContentBlock[] = []
    try {
      for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
        const message = await client.messages.create(
          { model: this.options.model, max_tokens: this.options.maxTokens, messages, tools: [tool] },
          signal === undefined ? {} : { signal },
        )
        blocks.push(...message.content)
        if (message.stop_reason === 'refusal') {
          throw new WebError('Claude API declined the search request', 'WEB_PROVIDER_ERROR')
        }
        if (message.stop_reason !== 'pause_turn') break
        messages.push({ role: 'assistant', content: message.content })
      }
    } catch (error: unknown) {
      if (error instanceof Anthropic.APIUserAbortError) throw this.aborted(signal, error)
      if (error instanceof Anthropic.APIError) {
        throw new WebError(`Claude API error (HTTP ${String(error.status)}): ${error.message}`, 'WEB_PROVIDER_ERROR', { cause: error })
      }
      throw error
    }
    return mapClaudeBlocks(blocks)
  }
}

/**
 * Map Messages API content blocks to a search result.
 * @param blocks - every content block of the (possibly resumed) turn.
 * @returns answer text and sources joined to their cited excerpts.
 * @throws {WebError} when every search failed or none returned a result.
 */
export function mapClaudeBlocks(blocks: readonly Anthropic.ContentBlock[]): WebSearchResult {
  const excerpts = new Map<string, string>()
  const answer: string[] = []
  const sources: WebSearchSource[] = []
  const failures: string[] = []
  for (const block of blocks) {
    if (block.type === 'text') {
      answer.push(block.text)
      for (const citation of block.citations ?? []) {
        if (citation.type === 'web_search_result_location' && citation.cited_text.length > 0 && !excerpts.has(citation.url)) {
          excerpts.set(citation.url, citation.cited_text)
        }
      }
      continue
    }
    if (block.type !== 'web_search_tool_result') continue
    if (!Array.isArray(block.content)) {
      failures.push(block.content.error_code)
      continue
    }
    for (const item of block.content) {
      if (item.url.length === 0) continue
      sources.push(source(item.url, item.title.length > 0 ? item.title : undefined, undefined, item.page_age ?? undefined))
    }
  }
  if (sources.length === 0 && failures.length > 0) {
    throw new WebError(`Claude API web search failed: ${failures.join(', ')}`, 'WEB_PROVIDER_ERROR')
  }
  const joined = sources.map((entry) => {
    const excerpt = excerpts.get(entry.url)
    return excerpt === undefined ? entry : { ...entry, snippet: excerpt }
  })
  return vendorResult('Claude API', answer.join(''), joined)
}
