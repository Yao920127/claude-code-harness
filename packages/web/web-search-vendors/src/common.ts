/**
 * Shared request, credential, and failure handling for the vendor search
 * providers. Each provider supplies one vendor request and its result
 * mapping; this module owns credential resolution, cancellation, JSON
 * dispatch, and the seam's error vocabulary.
 * @module @deepseek-ai/dsh-web-search-vendors/common
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

/** Instruction sent to a vendor model; the query follows it verbatim. */
export const SEARCH_INSTRUCTION = 'Perform a web search for the query and answer briefly with cited sources. Query: '

/** Attribution header sent on every vendor request. */
const USER_AGENT = 'deepseek-harness-web-search-vendors'

/** Endpoint, credential, and model settings one vendor provider searches with. */
export interface VendorOptions {
  /** Credential reference resolved for each search. */
  readonly apiKeyEnv: string
  /** Vendor API base; each provider appends its own path. */
  readonly baseURL: string
  /** Vendor model or search engine name. */
  readonly model: string
}

/** Resolve one credential reference for one search; undefined when nothing is stored or exported. */
export type ResolveApiKey = (ref: string) => Promise<string | undefined>

/**
 * One vendor-backed search provider. Subclasses name the vendor and perform
 * the vendor request with a resolved key; failures other than `WebError`
 * become `WEB_PROVIDER_ERROR`, and cancellation becomes `WEB_ABORTED`.
 */
export abstract class VendorSearchProvider implements WebSearchProvider {
  /** Stable provider id the web service selects. */
  abstract readonly id: string
  /** Vendor name used in diagnostics. */
  protected abstract readonly label: string

  /**
   * @param options - the vendor's endpoint, credential reference, and model.
   * @param resolveApiKey - credential resolution for each search.
   */
  constructor(protected readonly options: VendorOptions, private readonly resolveApiKey: ResolveApiKey) {}

  available(): boolean {
    return URL.canParse(this.options.baseURL) && this.options.model.length > 0
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (isAborted(signal)) throw this.aborted(signal)
    const apiKey = await this.resolveApiKey(this.options.apiKeyEnv)
    if (apiKey === undefined || apiKey.length === 0) {
      throw new WebError(
        `${this.label} search has no API key for "${this.options.apiKeyEnv}"; store it through the credentials service `
        + 'or export it in the launching environment',
        'WEB_PROVIDER_CREDENTIAL_MISSING',
      )
    }
    if (isAborted(signal)) throw this.aborted(signal)
    try {
      return await this.dispatch(request, apiKey, signal)
    } catch (error: unknown) {
      if (error instanceof WebError) throw error
      if (isAborted(signal) || isAbortError(error)) throw this.aborted(signal, error)
      throw new WebError(`${this.label} search failed: ${errorText(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  /**
   * Perform one vendor search with a resolved key.
   * @param request - the normalized search request.
   * @param apiKey - the resolved vendor credential.
   * @param signal - caller cancellation.
   * @returns the mapped result before the seam's `maxResults` bound.
   */
  protected abstract dispatch(request: WebSearchRequest, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult>

  /**
   * POST one JSON body and parse the JSON reply. Redirects fail without
   * contacting the target; a non-2xx status fails with the vendor's message.
   * @param url - the complete endpoint.
   * @param headers - vendor authentication headers.
   * @param body - the JSON request body.
   * @param signal - caller cancellation.
   * @returns the parsed response body.
   */
  protected async postJson(
    url: string,
    headers: Readonly<Record<string, string>>,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', 'accept': 'application/json', 'user-agent': USER_AGENT, ...headers },
      body: JSON.stringify(body),
      ...signal === undefined ? {} : { signal },
    })
    const text = await response.text()
    if (!response.ok) {
      throw new WebError(
        `${this.label} API error (HTTP ${String(response.status)}) from ${url}: ${text.slice(0, 500)}`,
        'WEB_PROVIDER_ERROR',
      )
    }
    const parsed: unknown = JSON.parse(text)
    return parsed
  }

  /**
   * Build the provider's stable cancellation error.
   * @param signal - the aborted caller signal, when one exists.
   * @param fallback - the cause when the signal carries no reason.
   * @returns the `WEB_ABORTED` error.
   */
  protected aborted(signal?: AbortSignal, fallback?: unknown): WebError {
    return new WebError(`${this.label} search aborted`, 'WEB_ABORTED', {
      cause: signal?.aborted === true ? signal.reason : fallback,
    })
  }
}

/**
 * Read a property of an unknown JSON value.
 * @param value - parsed JSON.
 * @param key - property name.
 * @returns the property value, or undefined for non-objects.
 */
export function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined
}

/**
 * Read a JSON array property.
 * @param value - parsed JSON.
 * @param key - property name.
 * @returns the array, or an empty array when absent or not an array.
 */
export function list(value: unknown, key: string): readonly unknown[] {
  const found = field(value, key)
  return Array.isArray(found) ? found : []
}

/**
 * Read a non-blank JSON string property.
 * @param value - parsed JSON.
 * @param key - property name.
 * @returns the string, or undefined when absent or blank.
 */
export function text(value: unknown, key: string): string | undefined {
  const found = field(value, key)
  return typeof found === 'string' && found.trim().length > 0 ? found : undefined
}

/**
 * Keep the first source per URL, filling missing fields from later duplicates.
 * @param sources - candidate sources in vendor order.
 * @returns sources unique by URL.
 */
export function uniqueSources(sources: readonly WebSearchSource[]): WebSearchSource[] {
  const byUrl = new Map<string, WebSearchSource>()
  for (const source of sources) {
    const previous = byUrl.get(source.url)
    byUrl.set(source.url, previous === undefined ? source : { ...source, ...previous })
  }
  return [...byUrl.values()]
}

/**
 * Build one source, omitting blank optional fields.
 * @param url - source URL.
 * @param title - optional title.
 * @param snippet - optional excerpt.
 * @param publishedAt - optional publication time.
 * @returns the source.
 */
export function source(url: string, title?: string, snippet?: string, publishedAt?: string): WebSearchSource {
  return {
    url,
    ...title === undefined ? {} : { title },
    ...snippet === undefined ? {} : { snippet },
    ...publishedAt === undefined ? {} : { publishedAt },
  }
}

/**
 * Finish a mapped vendor result, failing when the vendor returned nothing citeable.
 * @param label - vendor name for the diagnostic.
 * @param content - generated answer text.
 * @param sources - citeable sources.
 * @returns the seam result.
 */
export function vendorResult(label: string, content: string | undefined, sources: readonly WebSearchSource[]): WebSearchResult {
  if (sources.length === 0) {
    throw new WebError(`${label} returned no web sources; the request may not have triggered web search`, 'WEB_PROVIDER_ERROR')
  }
  return {
    ...content === undefined || content.trim().length === 0 ? {} : { content },
    sources: uniqueSources(sources),
    truncated: false,
  }
}

/** Read the caller's cancellation state afresh after each await. */
function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
