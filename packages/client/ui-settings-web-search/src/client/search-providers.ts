/**
 * The search providers the shipped compositions register and how each one
 * obtains its credential. Spelled here rather than imported: a client package
 * must not depend on the Host packages that register the providers. The
 * credential references are the providers' shipped defaults.
 */

/** How a search provider authenticates. */
export type SearchProviderCredential =
  /** A key the credentials domain stores under this reference. */
  | { readonly kind: 'credential'; readonly ref: string }
  /** A key only the Host's launch environment supplies. */
  | { readonly kind: 'environment'; readonly variable: string }
  /** The Host's own Claude Code sign-in; no key. */
  | { readonly kind: 'login' }

/** One selectable search provider. */
export interface SearchProviderEntry {
  /** Provider id the web service selects. */
  readonly id: string
  /** Dictionary key of the provider's display name. */
  readonly label: SearchProviderLabelKey
  /** How the provider authenticates. */
  readonly credential: SearchProviderCredential
}

/** Dictionary keys of provider display names. */
export type SearchProviderLabelKey =
  | 'provider.claudeCode' | 'provider.claudeApi' | 'provider.deepseek' | 'provider.openai' | 'provider.xai'
  | 'provider.gemini' | 'provider.openrouter' | 'provider.mistral' | 'provider.zai' | 'provider.perplexity'
  | 'provider.exa'

/** Every shipped search provider, in display order. */
export const SEARCH_PROVIDERS: readonly SearchProviderEntry[] = [
  { id: 'claude-code', label: 'provider.claudeCode', credential: { kind: 'login' } },
  { id: 'claude-api', label: 'provider.claudeApi', credential: { kind: 'credential', ref: 'ANTHROPIC_API_KEY' } },
  { id: 'deepseek-official', label: 'provider.deepseek', credential: { kind: 'credential', ref: 'DEEPSEEK_API_KEY' } },
  { id: 'openai', label: 'provider.openai', credential: { kind: 'credential', ref: 'OPENAI_API_KEY' } },
  { id: 'xai', label: 'provider.xai', credential: { kind: 'credential', ref: 'XAI_API_KEY' } },
  { id: 'gemini', label: 'provider.gemini', credential: { kind: 'credential', ref: 'GEMINI_API_KEY' } },
  { id: 'openrouter', label: 'provider.openrouter', credential: { kind: 'credential', ref: 'OPENROUTER_API_KEY' } },
  { id: 'mistral', label: 'provider.mistral', credential: { kind: 'credential', ref: 'MISTRAL_API_KEY' } },
  { id: 'zai', label: 'provider.zai', credential: { kind: 'credential', ref: 'ZAI_API_KEY' } },
  { id: 'perplexity', label: 'provider.perplexity', credential: { kind: 'environment', variable: 'PERPLEXITY_API_KEY' } },
  { id: 'exa', label: 'provider.exa', credential: { kind: 'environment', variable: 'EXA_API_KEY' } },
]

/**
 * Find a shipped provider by id.
 * @param id - provider id, possibly one this table does not list.
 * @returns the entry, or undefined for an unlisted id.
 */
export function searchProviderEntry(id: string | undefined): SearchProviderEntry | undefined {
  return SEARCH_PROVIDERS.find(entry => entry.id === id)
}
