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
import type {} from '@deepseek-ai/dsh-sandbox-policy'
// Type-only: the optional ctx.sidebarBrowser channel to the app's Browser tabs.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-browser'
import { ClaudeCodeAdapter } from './adapter.ts'
import { ClaudeCodeUsageController } from './usage.ts'
import type { ClaudeCodeModelEntry } from './models.ts'
import {
  CLAUDE_CODE_ROUTE_PERMISSION_MODES,
  SESSION_PERMISSION_MODE,
  type ClaudeCodeRoutePermissionMode,
} from './permissions.ts'

export { ClaudeCodeAdapter } from './adapter.ts'
export { ClaudeCodeUsageController, usageView } from './usage.ts'
export type { ClaudeCodeUsageOptions } from './usage.ts'
export type { ClaudeCodeUsageView, ClaudeCodeUsageWindow, ClaudeCodeUsageWindowKind } from './types.ts'
export type { ClaudeCodeAdapterOptions } from './adapter.ts'
export { modelEntries, NATIVE_MODEL_ID, NATIVE_MODEL_NAME } from './models.ts'
export {
  CLAUDE_CODE_NATIVE_PERMISSION_MODES,
  CLAUDE_CODE_ROUTE_PERMISSION_MODES,
  resolvePermissionMode,
  SESSION_PERMISSION_MODE,
} from './permissions.ts'
export type { ClaudeCodeNativePermissionMode, ClaudeCodeRoutePermissionMode, SessionPermissions } from './permissions.ts'
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
   * Permission setting (default `session`). `session` derives each turn's
   * native mode from the Session's sandbox mode and approval policy: full
   * access with the `never` policy skips every native check, `workspace-write`
   * accepts file edits without asking, and anything else asks. A native mode
   * (`default`, `acceptEdits`, `auto`, `plan`, or `bypassPermissions`) pins
   * every turn instead. Operations the host's Claude permission rules leave
   * undecided are asked through `ctx.approval`; `bypassPermissions` skips
   * every check.
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
  /** Milliseconds one plan-usage read answers app windows before Claude Code is asked again. */
  usageFreshMs?: number
}

export const Config: z<Config> = z.object({
  provider: z.string().min(1).default('claude-code'),
  displayName: z.string().min(1).default('Claude Code'),
  models: z.array(z.object({
    id: z.string().min(1).required(),
    name: z.string().min(1).required(),
    description: z.string(),
  })),
  permissionMode: z.union([...CLAUDE_CODE_ROUTE_PERMISSION_MODES]).default(SESSION_PERMISSION_MODE),
  env: z.dict(z.string()).default({}),
  disposeGraceMs: z.number().default(3_000),
  retryPolicy: RetryPolicySchema.default({ mode: 'normal', maxRetries: 0 }),
  usageFreshMs: z.natural().min(1).default(60_000),
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
    session: sessionId => ctx.sessions.get(sessionId),
    sessionPermissions: (session) => {
      const sandboxPolicy = ctx.get('sandboxPolicy')
      const approval = ctx.get('approval')
      if (sandboxPolicy === undefined || approval === undefined) return undefined
      return { sandbox: sandboxPolicy.resolve({ session }).mode, approval: approval.effectivePolicy(session) }
    },
    appBrowser: () => {
      const browser = ctx.get('sidebarBrowser')
      return browser === undefined ? undefined : (session, url) => browser.open(session.id, url)
    },
  })
  ctx.llm.registerAdapter([provider], adapter)
  ctx.plugin(ClaudeCodeUsageController, {
    read: () => adapter.usage(),
    freshMs: config.usageFreshMs as number,
    now: () => Date.now(),
  })
}
