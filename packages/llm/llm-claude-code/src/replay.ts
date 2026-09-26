/**
 * Durable Claude Code conversation cursor carried in assistant replay state.
 *
 * Claude Code keeps its own transcript under the user's Claude configuration
 * directory. The harness session log stores the rendered conversation plus
 * this cursor, so a later request resumes the exact native chain entry the
 * durable assistant message was produced from — including after a fork,
 * a retry, or a process restart.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/replay
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ReplayEnvelope } from '@deepseek-ai/dsh-llm'

/** Claude Code-issued conversation id passed back through `resume`. */
export type ClaudeCodeSessionId = Branded<'ClaudeCodeSessionId'>

/** Claude Code-issued transcript chain entry passed back through `resumeSessionAt`. */
export type ClaudeCodeChainEntryId = Branded<'ClaudeCodeChainEntryId'>

/** Versioned response-level replay state for one completed Claude Code turn. */
export interface ClaudeCodeReplay {
  /** Replay owner tag; a foreign envelope never parses as this adapter's state. */
  readonly kind: 'claude-code'
  /** Replay state format version. */
  readonly version: 1
  /** Native conversation holding the turn. */
  readonly sessionId: ClaudeCodeSessionId
  /** Last native chain entry of the turn; the next request resumes after it. */
  readonly resumeAt: ClaudeCodeChainEntryId
}

/**
 * Build the replay envelope for one completed turn.
 * @param sessionId - native conversation id reported by Claude Code.
 * @param resumeAt - last native chain entry the turn produced.
 * @returns the envelope stored on the assembled assistant message.
 */
export function replayEnvelope(sessionId: ClaudeCodeSessionId, resumeAt: ClaudeCodeChainEntryId): ReplayEnvelope {
  const response: ClaudeCodeReplay = { kind: 'claude-code', version: 1, sessionId, resumeAt }
  return { response }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Validate stored replay state from durable history.
 * @param envelope - the assistant source's replay state, when present.
 * @returns the cursor, or `undefined` when the state is absent or not a version this build reads.
 */
export function readReplay(envelope: unknown): ClaudeCodeReplay | undefined {
  if (typeof envelope !== 'object' || envelope === null) return undefined
  const response: unknown = (envelope as { response?: unknown }).response
  if (typeof response !== 'object' || response === null) return undefined
  const { kind, version, sessionId, resumeAt } = response as Record<string, unknown>
  if (kind !== 'claude-code' || version !== 1) return undefined
  if (!nonEmptyString(sessionId) || !nonEmptyString(resumeAt)) return undefined
  return {
    kind,
    version,
    sessionId: brandString<ClaudeCodeSessionId>(sessionId),
    resumeAt: brandString<ClaudeCodeChainEntryId>(resumeAt),
  }
}
