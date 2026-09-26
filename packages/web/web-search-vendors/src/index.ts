/**
 * Register model-vendor native web search providers in `ctx.web`: the Claude
 * API, OpenAI, xAI, Gemini, OpenRouter, Mistral, and Z.AI. Each provider
 * resolves its own credential reference for every search, so a vendor whose
 * key is absent fails only when a composition selects it.
 * @module @deepseek-ai/dsh-web-search-vendors
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-web'
import { ClaudeApiSearchProvider } from './anthropic.ts'
import type { ClaudeWebSearchToolType } from './anthropic.ts'
import type { ResolveApiKey, VendorOptions } from './common.ts'
import {
  GeminiSearchProvider, MistralSearchProvider, OpenAiSearchProvider, OpenRouterSearchProvider, XaiSearchProvider,
  ZaiSearchProvider,
} from './vendors.ts'

export { CLAUDE_API_PROVIDER_ID, ClaudeApiSearchProvider, mapClaudeBlocks } from './anthropic.ts'
export type { ClaudeApiOptions, ClaudeWebSearchToolType } from './anthropic.ts'
export { VendorSearchProvider } from './common.ts'
export type { ResolveApiKey, VendorOptions } from './common.ts'
export {
  GeminiSearchProvider, mapGemini, mapResponses, MistralSearchProvider, OpenAiSearchProvider, OpenRouterSearchProvider,
  VENDOR_PROVIDER_IDS, XaiSearchProvider, ZaiSearchProvider,
} from './vendors.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-vendors'

/** The web seam these providers register into. */
export const inject = ['web']

/** One vendor's endpoint, credential reference, and model (for Z.AI, the search engine). */
export interface VendorConfig {
  /** Credential reference resolved for each search. */
  apiKeyEnv: string
  /** Vendor API base. */
  baseURL: string
  /** Vendor model, or Z.AI search engine. */
  model: string
}

/** Claude API settings. */
export interface ClaudeConfig extends VendorConfig {
  /** `web_search` server-tool version; the basic version serves models older than Opus 4.6 and Sonnet 4.6. */
  toolType: ClaudeWebSearchToolType
  /** Maximum `web_search` uses per request. */
  maxUses: number
  /** Upper bound on generated tokens per Messages request. */
  maxTokens: number
}

/** Plugin config after schema defaults: one complete section per vendor. */
export interface ResolvedConfig {
  /** Claude API settings. */
  claude: ClaudeConfig
  /** OpenAI settings. */
  openai: VendorConfig
  /** xAI settings. */
  xai: VendorConfig
  /** Gemini settings. */
  gemini: VendorConfig
  /** OpenRouter settings. */
  openrouter: VendorConfig
  /** Mistral settings. */
  mistral: VendorConfig
  /** Z.AI settings; `model` names the search engine. */
  zai: VendorConfig
}

/** Plugin config: every section and field is optional and defaulted per vendor. */
export interface Config {
  /** Claude API settings. */
  claude?: Partial<ClaudeConfig>
  /** OpenAI settings. */
  openai?: Partial<VendorConfig>
  /** xAI settings. */
  xai?: Partial<VendorConfig>
  /** Gemini settings. */
  gemini?: Partial<VendorConfig>
  /** OpenRouter settings. */
  openrouter?: Partial<VendorConfig>
  /** Mistral settings. */
  mistral?: Partial<VendorConfig>
  /** Z.AI settings; `model` names the search engine. */
  zai?: Partial<VendorConfig>
}

function vendor(apiKeyEnv: string, baseURL: string, model: string): z<Partial<VendorConfig>, VendorConfig> {
  return z.object({
    apiKeyEnv: z.string().role('credential-ref').default(apiKeyEnv),
    baseURL: z.string().default(baseURL),
    model: z.string().default(model),
  }).default({ apiKeyEnv, baseURL, model })
}

export const Config: z<Config, ResolvedConfig> = z.object({
  claude: z.object({
    apiKeyEnv: z.string().role('credential-ref').default('ANTHROPIC_API_KEY'),
    baseURL: z.string().default('https://api.anthropic.com'),
    model: z.string().default('claude-opus-5'),
    toolType: z.union(['web_search_20260209', 'web_search_20250305'] as const).default('web_search_20260209'),
    maxUses: z.natural().min(1).default(5),
    maxTokens: z.natural().min(1).default(16000),
  }).default({
    apiKeyEnv: 'ANTHROPIC_API_KEY', baseURL: 'https://api.anthropic.com', model: 'claude-opus-5',
    toolType: 'web_search_20260209', maxUses: 5, maxTokens: 16000,
  }),
  openai: vendor('OPENAI_API_KEY', 'https://api.openai.com/v1', 'gpt-6-astra'),
  xai: vendor('XAI_API_KEY', 'https://api.x.ai/v1', 'grok-4.7'),
  gemini: vendor('GEMINI_API_KEY', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-3.8-flash'),
  openrouter: vendor('OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1', 'openrouter/auto'),
  mistral: vendor('MISTRAL_API_KEY', 'https://api.mistral.ai/v1', 'mistral-medium-latest'),
  zai: vendor('ZAI_API_KEY', 'https://api.z.ai/api/paas/v4', 'search-prime'),
})

/**
 * Resolve a credential reference through the credentials seam, or through the
 * launch environment when the seam is not composed.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @returns the resolver every provider uses per search.
 */
function keyResolver(ctx: Context): ResolveApiKey {
  return async (ref) => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) return (await credentials.resolve(credentialRef(ref)))?.value
    const ambient = launchEnvironmentOf(ctx).get(ref)
    return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
  }
}

/** Register every vendor search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  const resolved = Config(config)
  const resolveApiKey = keyResolver(ctx)
  const options = (section: VendorConfig): VendorOptions => ({
    apiKeyEnv: credentialRef(section.apiKeyEnv), baseURL: section.baseURL.replace(/\/+$/, ''), model: section.model,
  })
  ctx.web.registerSearchProvider(new ClaudeApiSearchProvider({
    ...options(resolved.claude),
    toolType: resolved.claude.toolType,
    maxUses: resolved.claude.maxUses,
    maxTokens: resolved.claude.maxTokens,
  }, resolveApiKey))
  ctx.web.registerSearchProvider(new OpenAiSearchProvider(options(resolved.openai), resolveApiKey))
  ctx.web.registerSearchProvider(new XaiSearchProvider(options(resolved.xai), resolveApiKey))
  ctx.web.registerSearchProvider(new GeminiSearchProvider(options(resolved.gemini), resolveApiKey))
  ctx.web.registerSearchProvider(new OpenRouterSearchProvider(options(resolved.openrouter), resolveApiKey))
  ctx.web.registerSearchProvider(new MistralSearchProvider(options(resolved.mistral), resolveApiKey))
  ctx.web.registerSearchProvider(new ZaiSearchProvider(options(resolved.zai), resolveApiKey))
}
