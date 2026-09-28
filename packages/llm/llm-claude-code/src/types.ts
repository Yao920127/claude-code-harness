/** Wire types of the Claude Code usage Remote. */

/** Plan window a usage figure measures. */
export type ClaudeCodeUsageWindowKind = 'five-hour' | 'seven-day' | 'seven-day-opus' | 'seven-day-sonnet' | 'model'

/** One plan rate-limit window of the signed-in account. */
export interface ClaudeCodeUsageWindow {
  readonly kind: ClaudeCodeUsageWindowKind
  /** Server label of a per-model window; absent for the named plan windows. */
  readonly label?: string
  /** Percentage of the window used, 0–100; null when the server reports none. */
  readonly utilization: number | null
  /** ISO 8601 time the window resets; null when the server reports none. */
  readonly resetsAt: string | null
}

/** Plan usage of the Claude Code sign-in the Host's turns use. */
export interface ClaudeCodeUsageView {
  /** Claude subscription type, such as `pro` or `max`; null for API-key and third-party sign-ins. */
  readonly subscription: string | null
  /** Whether plan windows apply to this sign-in; false leaves `windows` empty. */
  readonly available: boolean
  /** Reported windows, five-hour first, then weekly windows, then per-model windows. */
  readonly windows: readonly ClaudeCodeUsageWindow[]
  /** ISO 8601 time the Host read this usage from Claude Code. */
  readonly readAt: string
}
