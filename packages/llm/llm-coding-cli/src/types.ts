/**
 * Session event types of the coding-CLI routes, free of runtime code so app
 * windows can import them.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/types
 */

import type {} from '@deepseek-ai/dsh-session/types'

/** Lifecycle state of one CLI tool call. */
export type CodingCliToolStatus = 'running' | 'completed' | 'failed'

/** One state of one tool call a coding CLI ran inside its own turn. */
export interface CodingCliToolEventData {
  /** Model route whose turn ran the tool. */
  readonly provider: string
  /** Id unique across Sessions; later events with the same id update the same call. */
  readonly callId: string
  /** Harness tool name when the CLI tool has a harness counterpart, otherwise the CLI's own name. */
  readonly name: string
  /** JSON object text of the tool arguments in harness terms. */
  readonly arguments: string
  readonly status: CodingCliToolStatus
  /** Result or error text, bounded for display; absent while running or when the CLI reported none. */
  readonly output?: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * One state of a tool call a coding CLI ran inside its own model turn. Log-only display state: the call already
     * ran inside the CLI, so it never enters derived history and no model request sees it.
     */
    'coding-cli/tool': CodingCliToolEventData
  }
}
