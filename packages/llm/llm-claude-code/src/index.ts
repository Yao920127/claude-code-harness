/**
 * Claude Code model route: registers a `ctx.llm` provider route whose every
 * model call runs one complete Claude Code turn through the official Agent
 * SDK, signed in with the host's own Claude Code login.
 *
 * @module @deepseek-ai/dsh-llm-claude-code
 */

import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { resolveRetryPolicy, RetryPolicySchema, type RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subprocess'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type {} from '@deepseek-ai/dsh-user-approval'
import {
  CLAUDE_CODE_ROUTE_PERMISSION_MODES,
  ClaudeCodeAdapter,
  type ClaudeCodeRoutePermissionMode,
} from './adapter.ts'
import type { ClaudeCodeModelEntry } from './models.ts'

export { ClaudeCodeAdapter } from './adapter.ts'
export type { ClaudeCodeAdapterOptions, ClaudeCodeRoutePermissionMode } from './adapter.ts'
export { modelEntries, NATIVE_MODEL_ID } from './models.ts'
export type { ClaudeCodeModelEntry } from './models.ts'
export { readReplay, replayEnvelope } from './replay.ts'
export type { ClaudeCodeChainEntryId, ClaudeCodeReplay, ClaudeCodeSessionId } from './replay.ts'

export const name = 'llm-claude-code'
export const inject = ['llm', 'subprocess', 'sessions', 'agents']

/** Deployment-owned route identity, models, permissions, environment, and process release. */
export interface Config {
  /** Provider route registered on `ctx.llm` (default `claude-code`). */
  provider?: string
  /** Route label shown by model selectors (default `Claude Code`). */
  displayName?: string
  /**
   * Selectable models; the id `default` leaves native Claude settings in
   * charge. Absent or empty lists the models the signed-in Claude Code
   * installation reports for its account.
   */
  models?: ClaudeCodeModelEntry[]
  /**
   * Native permission mode for every turn (default `default`). Operations the
   * host's Claude permission rules leave undecided are asked through
   * `ctx.approval`; `bypassPermissions` skips every check.
   */
  permissionMode?: ClaudeCodeRoutePermissionMode
  /** Explicit environment entries layered over the credential-scrubbed parent environment. */
  env?: Record<string, string>
  /** Grace in milliseconds between Claude Code managed-range termination tiers. */
  disposeGraceMs?: number
  /**
   * Model-request retry policy. The default performs no retry, because a
   * failed Claude Code turn may already have run tools with side effects.
   */
  retryPolicy?: RetryPolicyConfig
}

export const Config: z<Config> = z.object({
  provider: z.string().min(1).default('claude-code'),
  displayName: z.string().min(1).default('Claude Code'),
  models: z.array(z.object({
    id: z.string().min(1).required(),
    name: z.string().min(1).required(),
    description: z.string(),
  })),
  permissionMode: z.union([...CLAUDE_CODE_ROUTE_PERMISSION_MODES]).default('default'),
  env: z.dict(z.string()).default({}),
  disposeGraceMs: z.number().default(3_000),
  retryPolicy: RetryPolicySchema.default({ mode: 'normal', maxRetries: 0 }),
})

/**
 * Register the Claude Code route.
 * @param ctx - context carrying the LLM, subprocess, session, and agent services.
 * @param config - route identity, models, permission mode, environment, disposal grace, and retry policy.
 */
export function apply(ctx: Context, config: Config): void {
  const disposeGraceMs = config.disposeGraceMs as number
  if (!Number.isFinite(disposeGraceMs) || disposeGraceMs <= 0 || disposeGraceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`llm-claude-code: disposeGraceMs must be a positive number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  // The schema materializes `[]` for an absent array, so empty also means "discover".
  const models = config.models?.length === 0 ? undefined : config.models
  const provider = config.provider as string
  const adapter = new ClaudeCodeAdapter({
    provider,
    displayName: config.displayName as string,
    ...models === undefined ? {} : { models },
    discoveryCwd: homedir(),
    onDiscoveryError: (error) => { ctx.logger.warn('llm-claude-code: model discovery failed: %o', error) },
    permissionMode: config.permissionMode as ClaudeCodeRoutePermissionMode,
    env: config.env as Record<string, string>,
    disposeGraceMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-claude-code.retryPolicy'),
    spawn: spec => ctx.subprocess.spawn(spec),
    approval: () => ctx.get('approval'),
    initiator: () => ctx.agents.currentInitiator(),
    sessionCwd: sessionId => ctx.sessions.get(sessionId)?.header.cwd,
  })
  ctx.llm.registerAdapter([provider], adapter)
}
