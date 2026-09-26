/**
 * Register the Claude Code search provider in `ctx.web`. Searches run Claude
 * Code's built-in `WebSearch` tool with the host's Claude Code sign-in, so the
 * provider needs no API key.
 * @module @deepseek-ai/dsh-web-search-claude-code
 */

import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-web'
import { ClaudeCodeSearchProvider } from './provider.ts'

export {
  CLAUDE_CODE_PROVIDER_ID, ClaudeCodeSearchProvider, mapStructuredOutput, SEARCH_OUTPUT_SCHEMA, searchPrompt,
} from './provider.ts'
export type { ClaudeCodeSearchOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-claude-code'

/** The web seam this provider registers into and the subprocess owner that runs Claude Code. */
export const inject = ['web', 'subprocess']

/** Longest timer delay Node accepts, bounding the disposal grace. */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/** Plugin config after schema defaults. */
export interface ResolvedConfig {
  /** Claude Code model; empty uses the model the host's Claude Code settings select. */
  model: string
  /** Maximum agent turns for one search. */
  maxTurns: number
  /** Extra environment variables for the Claude Code process. */
  env: Record<string, string>
  /** Grace period in milliseconds before the process tree is force-killed at release. */
  disposeGraceMs: number
}

/** Plugin config: every field is optional. */
export type Config = Partial<ResolvedConfig>

export const Config: z<Config, ResolvedConfig> = z.object({
  model: z.string().default(''),
  maxTurns: z.natural().min(1).default(4),
  env: z.dict(z.string()).default({}),
  disposeGraceMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(3_000),
})

/** Register the Claude Code search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  const resolved = Config(config)
  ctx.web.registerSearchProvider(new ClaudeCodeSearchProvider({
    model: resolved.model.length === 0 ? undefined : resolved.model,
    maxTurns: resolved.maxTurns,
    env: resolved.env,
    // Claude Code reads the host's user settings; searches need no project workspace.
    cwd: homedir(),
    disposeGraceMs: resolved.disposeGraceMs,
    spawn: spec => ctx.subprocess.spawn(spec),
  }))
}
