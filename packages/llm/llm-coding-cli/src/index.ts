/**
 * Coding-CLI model route: registers one `ctx.llm` provider route whose every
 * model call runs one headless turn of an installed coding CLI — Codex,
 * Antigravity, Grok Build, or OpenCode — signed in with that CLI's own login.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
// Type-only service merges for ctx.agents, ctx.sessions, ctx.subprocess, ctx.approval, and ctx.sandboxPolicy.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-user-approval'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { resolveRetryPolicy, RetryPolicySchema, type RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { CODING_CLI_ROUTE_ACCESS, SESSION_ACCESS, type CodingCliRouteAccess, type SessionPermissions } from './access.ts'
import { CodingCliAdapter } from './adapter.ts'
import { CODING_CLI_IDS, CODING_CLIS, type CodingCliId } from './clis.ts'
import { cliPath, locateCli } from './locate.ts'
import type { CodingCliModelEntry } from './models.ts'

export { CodingCliAdapter } from './adapter.ts'
export type { CodingCliAdapterOptions } from './adapter.ts'
export { CODING_CLI_ACCESS_LEVELS, CODING_CLI_ROUTE_ACCESS, resolveAccess, SESSION_ACCESS } from './access.ts'
export type { CodingCliAccess, CodingCliRouteAccess, SessionPermissions } from './access.ts'
export { CODING_CLI_IDS, CODING_CLIS } from './clis.ts'
export type { CliImage, CliInvocation, CliTurn, CodingCliDefinition, CodingCliId } from './clis.ts'
export { cliPath, locateCli, searchDirectories } from './locate.ts'
export type { CliSearchHost } from './locate.ts'
export { NATIVE_MODEL_ID } from './models.ts'
export type { CodingCliModelEntry } from './models.ts'
export { readReplay, replayEnvelope } from './replay.ts'
export { harnessToolCall } from './tools.ts'
export type { HarnessToolCall } from './tools.ts'
export type { CodingCliToolEventData, CodingCliToolStatus } from './types.ts'
export type { CodingCliConversationId, CodingCliReplay } from './replay.ts'

export const name = 'llm-coding-cli'
export const inject = ['llm', 'subprocess', 'sessions', 'agents']

/** Deployment-owned CLI, route identity, models, access, environment, and process limits. */
export interface Config {
  /** CLI the route runs. */
  cli: CodingCliId
  /** Provider route registered on `ctx.llm` (default: the `cli` value). */
  provider?: string
  /** Route label shown by model selectors (default: the CLI's name). */
  displayName?: string
  /**
   * Selectable models; the id `default` leaves the CLI's own settings in
   * charge. Absent or empty lists the models the CLI's own listing command
   * reports for its sign-in and configuration.
   */
  models?: CodingCliModelEntry[]
  /** Absolute path of the CLI executable; absent searches PATH and the CLI's install directories. */
  executable?: string
  /**
   * Effort level selected for a model that accepts it when the Session names none (default `medium`); otherwise the
   * CLI's own default applies.
   */
  defaultEffort?: string
  /**
   * Access setting (default `session`). `session` derives each turn's level
   * from the Session's sandbox mode and approval policy; `read-only`,
   * `workspace-write`, or `full-access` pins every turn.
   */
  access?: CodingCliRouteAccess
  /** Explicit environment entries layered over the credential-scrubbed parent environment. */
  env?: Record<string, string>
  /** Grace in milliseconds between CLI managed-range termination tiers. */
  disposeGraceMs?: number
  /** Milliseconds the model-listing command may run. */
  discoveryTimeoutMs?: number
  /** Largest model-listing output accepted, in bytes. */
  discoveryMaxBytes?: number
  /** Milliseconds one model list answers selectors before the CLI is asked again. */
  modelsFreshMs?: number
  /** Model-request retry policy; the default never retries, because a failed turn may already have changed files. */
  retryPolicy?: RetryPolicyConfig
}

export const Config: z<Config> = z.object({
  cli: z.union([...CODING_CLI_IDS]).required(),
  provider: z.string().min(1),
  displayName: z.string().min(1),
  models: z.array(z.object({
    id: z.string().min(1).required(),
    name: z.string().min(1).required(),
    description: z.string(),
    efforts: z.array(z.string().min(1)),
    defaultEffort: z.string().min(1),
  })),
  executable: z.string().min(1),
  defaultEffort: z.string().min(1).default('medium'),
  access: z.union([...CODING_CLI_ROUTE_ACCESS]).default(SESSION_ACCESS),
  env: z.dict(z.string()).default({}),
  disposeGraceMs: z.number().default(3_000),
  discoveryTimeoutMs: z.natural().min(1).default(60_000),
  discoveryMaxBytes: z.natural().min(1).default(16 * 1024 * 1024),
  modelsFreshMs: z.natural().min(1).default(300_000),
  retryPolicy: RetryPolicySchema.default({ mode: 'normal', maxRetries: 0 }),
})

/**
 * Read a Session's permission knobs.
 * @param ctx - context whose optional sandbox-policy and approval services decide them.
 * @param session - the Session.
 * @returns the knobs, or undefined when the composition lacks either service.
 */
function sessionPermissions(ctx: Context, session: Session): SessionPermissions | undefined {
  const policy = ctx.get('sandboxPolicy')
  const approvals = ctx.get('approval')
  return policy === undefined || approvals === undefined
    ? undefined
    : { sandbox: policy.resolve({ session }).mode, approval: approvals.effectivePolicy(session) }
}

/**
 * Register one coding-CLI route.
 * @param ctx - context carrying the LLM, subprocess, session, and agent services.
 * @param config - CLI, route identity, models, executable, access, environment, and process limits.
 */
export function apply(ctx: Context, config: Config): void {
  const cli = config.cli
  const definition = CODING_CLIS[cli]
  const disposeGraceMs = config.disposeGraceMs as number
  if (!Number.isFinite(disposeGraceMs) || disposeGraceMs <= 0 || disposeGraceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`llm-coding-cli: disposeGraceMs must be a positive number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  const configured = config.executable
  if (configured !== undefined && (!isAbsolute(configured) || !existsSync(configured))) {
    throw new Error(`llm-coding-cli: executable must be an absolute path to an existing file; got "${configured}"`)
  }
  const host = { path: process.env.PATH, home: homedir(), platform: process.platform }
  const provider = config.provider ?? cli
  // The schema materializes `[]` for an absent array, so empty also means "discover".
  const models = config.models?.length === 0 ? undefined : config.models
  const extraEnv = config.env as Record<string, string>
  const adapter = new CodingCliAdapter({
    provider,
    cli,
    definition,
    displayName: config.displayName ?? definition.displayName,
    ...models === undefined ? {} : { models },
    executable: () => configured ?? locateCli(definition.command, definition.homeDirectories, host),
    env: executable => ({ PATH: cliPath(executable, definition.homeDirectories, host), ...extraEnv }),
    discoveryCwd: host.home,
    discoveryTimeoutMs: config.discoveryTimeoutMs as number,
    discoveryMaxBytes: config.discoveryMaxBytes as number,
    modelsFreshMs: config.modelsFreshMs as number,
    onDiscoveryError: (error) => { ctx.logger.warn('llm-coding-cli: %s model discovery failed: %o', cli, error) },
    access: config.access as CodingCliRouteAccess,
    defaultEffort: config.defaultEffort as string,
    disposeGraceMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-coding-cli.retryPolicy'),
    spawn: spec => ctx.subprocess.spawn(spec),
    initiator: () => ctx.agents.currentInitiator(),
    session: sessionId => ctx.sessions.get(sessionId),
    attachments: () => ctx.get('attachments'),
    sessionPermissions: session => sessionPermissions(ctx, session),
    now: () => Date.now(),
  })
  ctx.llm.registerAdapter([provider], adapter)
}
