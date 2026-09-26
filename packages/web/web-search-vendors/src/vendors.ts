/**
 * Search providers for vendors whose APIs expose native web search over
 * plain JSON: OpenAI and xAI through the Responses API `web_search` tool,
 * Gemini through `google_search` grounding, OpenRouter through its `web`
 * plugin, Mistral through the Conversations API `web_search` tool, and Z.AI
 * through its standalone Web Search API.
 * @module @deepseek-ai/dsh-web-search-vendors/vendors
 */

import type { WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'
import { field, list, SEARCH_INSTRUCTION, source, text, VendorSearchProvider, vendorResult } from './common.ts'

/** Stable ids of the plain-JSON vendor providers. */
export const VENDOR_PROVIDER_IDS = ['openai', 'xai', 'gemini', 'openrouter', 'mistral', 'zai'] as const

/**
 * Map a Responses API reply: `output_text` answer with `url_citation`
 * annotations, plus `web_search_call` action sources and any top-level
 * `citations` list.
 * @param label - vendor name for diagnostics.
 * @param reply - parsed response body.
 * @returns the search result.
 */
export function mapResponses(label: string, reply: unknown): WebSearchResult {
  const answer: string[] = []
  const sources: WebSearchSource[] = []
  for (const item of list(reply, 'output')) {
    if (field(item, 'type') === 'web_search_call') {
      for (const entry of list(field(item, 'action'), 'sources')) {
        const url = typeof entry === 'string' ? entry : text(entry, 'url')
        if (url !== undefined) sources.push(source(url, text(entry, 'title')))
      }
      continue
    }
    if (field(item, 'type') !== 'message') continue
    for (const part of list(item, 'content')) {
      if (field(part, 'type') !== 'output_text') continue
      const body = text(part, 'text')
      if (body !== undefined) answer.push(body)
      for (const annotation of list(part, 'annotations')) {
        const url = text(annotation, 'url')
        if (field(annotation, 'type') === 'url_citation' && url !== undefined) {
          const start = field(annotation, 'start_index')
          const end = field(annotation, 'end_index')
          const excerpt = body !== undefined && typeof start === 'number' && typeof end === 'number' && end > start
            ? body.slice(start, end)
            : undefined
          // Annotated citations lead: they carry titles and the cited span.
          sources.unshift(source(url, text(annotation, 'title'), excerpt))
        }
      }
    }
  }
  for (const entry of list(reply, 'citations')) {
    const url = typeof entry === 'string' ? entry : text(entry, 'url')
    if (url !== undefined) sources.push(source(url, text(entry, 'title')))
  }
  return vendorResult(label, answer.join('\n'), sources)
}

/** OpenAI Responses API with the `web_search` tool, including the complete source list. */
export class OpenAiSearchProvider extends VendorSearchProvider {
  readonly id = 'openai'
  protected readonly label = 'OpenAI'

  protected async dispatch(request: WebSearchRequest, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
    const reply = await this.postJson(`${this.options.baseURL}/responses`, { authorization: `Bearer ${apiKey}` }, {
      model: this.options.model,
      input: SEARCH_INSTRUCTION + request.query,
      tools: [{ type: 'web_search' }],
      include: ['web_search_call.action.sources'],
    }, signal)
    return mapResponses(this.label, reply)
  }
}

/** xAI Responses API with the server-side `web_search` tool. */
export class XaiSearchProvider extends VendorSearchProvider {
  readonly id = 'xai'
  protected readonly label = 'xAI'

  protected async dispatch(request: WebSearchRequest, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
    const reply = await this.postJson(`${this.options.baseURL}/responses`, { authorization: `Bearer ${apiKey}` }, {
      model: this.options.model,
      input: [{ role: 'user', content: SEARCH_INSTRUCTION + request.query }],
      tools: [{ type: 'web_search' }],
    }, signal)
    return mapResponses(this.label, reply)
  }
}

/** Gemini `generateContent` grounded with the `google_search` tool. */
export class GeminiSearchProvider extends VendorSearchProvider {
  readonly id = 'gemini'
  protected readonly label = 'Gemini'

  protected async dispatch(request: WebSearchRequest, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
    const model = encodeURIComponent(this.options.model)
    const reply = await this.postJson(`${this.options.baseURL}/models/${model}:generateContent`, { 'x-goog-api-key': apiKey }, {
      contents: [{ role: 'user', parts: [{ text: SEARCH_INSTRUCTION + request.query }] }],
      tools: [{ google_search: {} }],
    }, signal)
    return mapGemini(reply)
  }
}

/**
 * Map a grounded `generateContent` reply: grounding chunks become sources,
 * and each chunk takes the first supported answer segment as its excerpt.
 * @param reply - parsed response body.
 * @returns the search result.
 */
export function mapGemini(reply: unknown): WebSearchResult {
  const candidate = list(reply, 'candidates')[0]
  const answer = list(field(candidate, 'content'), 'parts')
    .map(part => text(part, 'text'))
    .filter((part): part is string => part !== undefined)
    .join('')
  const metadata = field(candidate, 'groundingMetadata')
  const excerpts = new Map<number, string>()
  for (const support of list(metadata, 'groundingSupports')) {
    const segment = text(field(support, 'segment'), 'text')
    for (const index of list(support, 'groundingChunkIndices')) {
      if (typeof index === 'number' && segment !== undefined && !excerpts.has(index)) excerpts.set(index, segment)
    }
  }
  const sources: WebSearchSource[] = []
  list(metadata, 'groundingChunks').forEach((chunk, index) => {
    const url = text(field(chunk, 'web'), 'uri')
    if (url !== undefined) sources.push(source(url, text(field(chunk, 'web'), 'title'), excerpts.get(index)))
  })
  return vendorResult('Gemini', answer, sources)
}

/** OpenRouter chat completions with the `web` plugin. */
export class OpenRouterSearchProvider extends VendorSearchProvider {
  readonly id = 'openrouter'
  protected readonly label = 'OpenRouter'

  protected async dispatch(request: WebSearchRequest, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
    const reply = await this.postJson(`${this.options.baseURL}/chat/completions`, { authorization: `Bearer ${apiKey}` }, {
      model: this.options.model,
      messages: [{ role: 'user', content: SEARCH_INSTRUCTION + request.query }],
      plugins: [{ id: 'web' }],
    }, signal)
    const message = field(list(reply, 'choices')[0], 'message')
    const sources: WebSearchSource[] = []
    for (const annotation of list(message, 'annotations')) {
      const citation = field(annotation, 'url_citation')
      const url = text(citation, 'url')
      if (field(annotation, 'type') === 'url_citation' && url !== undefined) {
        sources.push(source(url, text(citation, 'title'), text(citation, 'content')))
      }
    }
    return vendorResult(this.label, text(message, 'content'), sources)
  }
}

/** Mistral Conversations API with the built-in `web_search` tool. */
export class MistralSearchProvider extends VendorSearchProvider {
  readonly id = 'mistral'
  protected readonly label = 'Mistral'

  protected async dispatch(request: WebSearchRequest, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
    const reply = await this.postJson(`${this.options.baseURL}/conversations`, { authorization: `Bearer ${apiKey}` }, {
      model: this.options.model,
      inputs: SEARCH_INSTRUCTION + request.query,
      tools: [{ type: 'web_search' }],
    }, signal)
    const answer: string[] = []
    const sources: WebSearchSource[] = []
    for (const output of list(reply, 'outputs')) {
      if (field(output, 'type') !== 'message.output') continue
      const content = field(output, 'content')
      if (typeof content === 'string') {
        answer.push(content)
        continue
      }
      for (const chunk of list(output, 'content')) {
        const kind = field(chunk, 'type')
        const chunkText = text(chunk, 'text')
        const url = text(chunk, 'url')
        if (kind === 'text' && chunkText !== undefined) answer.push(chunkText)
        if (kind === 'tool_reference' && url !== undefined) sources.push(source(url, text(chunk, 'title')))
      }
    }
    return vendorResult(this.label, answer.join(''), sources)
  }
}

/** Z.AI's standalone Web Search API; `model` names the search engine. */
export class ZaiSearchProvider extends VendorSearchProvider {
  readonly id = 'zai'
  protected readonly label = 'Z.AI'

  protected async dispatch(request: WebSearchRequest, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
    const reply = await this.postJson(`${this.options.baseURL}/web_search`, { authorization: `Bearer ${apiKey}` }, {
      search_engine: this.options.model,
      search_query: request.query,
      ...request.maxResults === undefined ? {} : { count: Math.min(Math.max(request.maxResults, 1), 50) },
    }, signal)
    const sources = list(reply, 'search_result').flatMap((entry) => {
      const url = text(entry, 'link')
      return url === undefined ? [] : [source(url, text(entry, 'title'), text(entry, 'content'), text(entry, 'publish_date'))]
    })
    return vendorResult(this.label, undefined, sources)
  }
}
