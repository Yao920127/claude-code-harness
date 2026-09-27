/**
 * Native permission mode selection for one Claude Code turn.
 *
 * Claude Code runs its own tools, so the harness sandbox never confines them;
 * the route instead maps the Session's permission knobs onto Claude Code's
 * native permission mode, so a Session's permission preset grants Claude
 * Code the same latitude it grants harness tools.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/permissions
 */

import type { Options } from '@anthropic-ai/claude-agent-sdk'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type { ApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { assertNever } from '@deepseek-ai/dsh-util-values'

/** Native permission modes a route may pin for every turn. */
export const CLAUDE_CODE_NATIVE_PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'auto',
  'plan',
  'bypassPermissions',
] as const satisfies readonly NonNullable<Options['permissionMode']>[]

/** A native permission mode the route passes to Claude Code. */
export type ClaudeCodeNativePermissionMode = typeof CLAUDE_CODE_NATIVE_PERMISSION_MODES[number]

/** Route permission setting that derives each turn's native mode from the Session's permission knobs. */
export const SESSION_PERMISSION_MODE = 'session'

/** Every route permission setting: {@link SESSION_PERMISSION_MODE} or one pinned native mode. */
export const CLAUDE_CODE_ROUTE_PERMISSION_MODES = [SESSION_PERMISSION_MODE, ...CLAUDE_CODE_NATIVE_PERMISSION_MODES] as const

/** Route-selected permission setting. */
export type ClaudeCodeRoutePermissionMode = typeof CLAUDE_CODE_ROUTE_PERMISSION_MODES[number]

/** The permission knobs in effect for one Session. */
export interface SessionPermissions {
  /** The Session's effective file-sandbox mode. */
  readonly sandbox: SandboxMode
  /** The Session's effective approval policy. */
  readonly approval: ApprovalPolicy
}

/**
 * Resolve the native permission mode for one turn. A pinned native mode
 * applies unchanged. Under {@link SESSION_PERMISSION_MODE}, full access with
 * the `never` approval policy skips every native check, because that policy
 * would otherwise reject every native permission prompt; `workspace-write`
 * accepts file edits without asking; every other combination, including a
 * composition without sandbox or approval services, asks through the approval
 * callback for each operation the host's Claude rules leave undecided.
 * @param configured - the route's permission setting.
 * @param session - the Session's permission knobs, when the composition mounts both services.
 * @returns the native permission mode for the turn.
 */
export function resolvePermissionMode(
  configured: ClaudeCodeRoutePermissionMode,
  session: SessionPermissions | undefined,
): ClaudeCodeNativePermissionMode {
  if (configured !== SESSION_PERMISSION_MODE) return configured
  if (session === undefined) return 'default'
  switch (session.sandbox) {
    case 'danger-full-access':
      return session.approval === 'never' ? 'bypassPermissions' : 'default'
    case 'workspace-write':
      return 'acceptEdits'
    case 'read-only':
      return 'default'
    /* v8 ignore next 2 -- the sandbox mode union is closed. */
    default:
      return assertNever(session.sandbox, 'sandbox mode')
  }
}
