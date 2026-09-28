/**
 * Claude Code plan usage over the authenticated Remote, so an app window can
 * show how much of the signed-in account's five-hour and weekly limits
 * remains.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/usage
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SDKControlGetUsageResponse } from '@anthropic-ai/claude-agent-sdk'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ClaudeCodeUsageView, ClaudeCodeUsageWindow, ClaudeCodeUsageWindowKind } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Claude Code plan usage for app windows. */
    claudeCodeUsage: ClaudeCodeUsageController
  }
}

type RateLimits = NonNullable<SDKControlGetUsageResponse['rate_limits']>
type NamedWindow = Exclude<keyof RateLimits, 'model_scoped' | 'extra_usage'>

const NAMED_WINDOWS: readonly (readonly [NamedWindow, ClaudeCodeUsageWindowKind])[] = [
  ['five_hour', 'five-hour'],
  ['seven_day', 'seven-day'],
  ['seven_day_opus', 'seven-day-opus'],
  ['seven_day_sonnet', 'seven-day-sonnet'],
]

/**
 * Convert Claude Code's usage answer to the Remote view.
 * @param usage - Claude Code's `/usage` data.
 * @param readAt - time the Host read it.
 * @returns the plan windows Claude Code reported, in display order.
 */
export function usageView(usage: SDKControlGetUsageResponse, readAt: Date): ClaudeCodeUsageView {
  const limits = usage.rate_limits
  const windows: ClaudeCodeUsageWindow[] = []
  if (limits !== null) {
    for (const [key, kind] of NAMED_WINDOWS) {
      const window = limits[key]
      if (window !== undefined && window !== null) windows.push({ kind, utilization: window.utilization, resetsAt: window.resets_at })
    }
    for (const window of limits.model_scoped ?? []) {
      windows.push({ kind: 'model', label: window.display_name, utilization: window.utilization, resetsAt: window.resets_at })
    }
  }
  return {
    subscription: usage.subscription_type,
    available: usage.rate_limits_available && limits !== null,
    windows,
    readAt: readAt.toISOString(),
  }
}

/** How the usage Remote reads Claude Code. */
export interface ClaudeCodeUsageOptions {
  /** Asks Claude Code for its usage data. */
  readonly read: () => Promise<SDKControlGetUsageResponse>
  /** Milliseconds a read answers later calls before Claude Code is asked again. */
  readonly freshMs: number
  /** Current time in milliseconds. */
  readonly now: () => number
}

/** Serves plan usage, reading Claude Code at most once per freshness window. */
export class ClaudeCodeUsageController extends TypertRemoteService {
  private cached: { readonly at: number; readonly view: Promise<ClaudeCodeUsageView> } | undefined

  /**
   * @param ctx - Host context; the service key and Remote namespace are both `claudeCodeUsage`.
   * @param options - Claude Code reader, freshness window, and clock.
   */
  constructor(ctx: Context, private readonly options: ClaudeCodeUsageOptions) {
    super(ctx, 'claudeCodeUsage', { namespace: 'claudeCodeUsage' })
  }

  /**
   * Read the signed-in account's plan usage.
   * @param refresh - true asks Claude Code again even when an earlier read is still fresh.
   * @returns plan usage; a failed read rejects and is not reused.
   */
  @Remote
  get(refresh: boolean): Promise<ClaudeCodeUsageView> {
    const at = this.options.now()
    const cached = this.cached
    if (!refresh && cached !== undefined && at - cached.at < this.options.freshMs) return cached.view
    const view = this.options.read().then(usage => usageView(usage, new Date(at)))
    const entry = { at, view }
    this.cached = entry
    view.catch(() => { if (this.cached === entry) this.cached = undefined })
    return view
  }
}
