/**
 * Access level of one coding-CLI turn.
 *
 * The CLIs run their own tools in headless mode, where none of them can ask
 * the harness for approval, so each turn runs under one fixed access level
 * that the CLI enforces with its own sandbox or permission flags.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/access
 */

import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type { ApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { assertNever } from '@deepseek-ai/dsh-util-values'

/** Access levels a turn runs under, from narrowest to widest. */
export const CODING_CLI_ACCESS_LEVELS = ['read-only', 'workspace-write', 'full-access'] as const

/** One access level a turn runs under. */
export type CodingCliAccess = typeof CODING_CLI_ACCESS_LEVELS[number]

/** Route setting that derives each turn's access level from the Session's permission knobs. */
export const SESSION_ACCESS = 'session'

/** Every route access setting: {@link SESSION_ACCESS} or one pinned level. */
export const CODING_CLI_ROUTE_ACCESS = [SESSION_ACCESS, ...CODING_CLI_ACCESS_LEVELS] as const

/** Route-selected access setting. */
export type CodingCliRouteAccess = typeof CODING_CLI_ROUTE_ACCESS[number]

/** The permission knobs in effect for one Session. */
export interface SessionPermissions {
  /** The Session's effective file-sandbox mode. */
  readonly sandbox: SandboxMode
  /** The Session's effective approval policy. */
  readonly approval: ApprovalPolicy
}

/**
 * Resolve one turn's access level. A pinned level applies unchanged. Under
 * {@link SESSION_ACCESS}, full access with the `never` approval policy grants
 * `full-access`; any other full-access combination and `workspace-write`
 * grant `workspace-write`, because a headless CLI cannot ask; `read-only` and
 * a composition without sandbox or approval services grant `read-only`.
 * @param configured - the route's access setting.
 * @param session - the Session's permission knobs, when the composition mounts both services.
 * @returns the access level for the turn.
 */
export function resolveAccess(configured: CodingCliRouteAccess, session: SessionPermissions | undefined): CodingCliAccess {
  if (configured !== SESSION_ACCESS) return configured
  if (session === undefined) return 'read-only'
  switch (session.sandbox) {
    case 'danger-full-access':
      return session.approval === 'never' ? 'full-access' : 'workspace-write'
    case 'workspace-write':
      return 'workspace-write'
    case 'read-only':
      return 'read-only'
    /* v8 ignore next 2 -- the sandbox mode union is closed. */
    default:
      return assertNever(session.sandbox, 'sandbox mode')
  }
}
