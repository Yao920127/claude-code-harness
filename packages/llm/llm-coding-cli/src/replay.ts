/**
 * Durable coding-CLI conversation cursor carried in assistant replay state.
 *
 * Each CLI keeps its own conversation transcript. The Session log stores the
 * rendered conversation plus this cursor, so a later request continues the
 * CLI conversation the durable assistant message came from.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/replay
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ReplayEnvelope } from '@deepseek-ai/dsh-llm'
import { CODING_CLI_IDS, type CodingCliId } from './clis.ts'

/** CLI-issued conversation id passed back to continue the conversation. */
export type CodingCliConversationId = Branded<'CodingCliConversationId'>

/** Versioned response-level replay state for one completed CLI turn. */
export interface CodingCliReplay {
  /** Replay owner tag; a foreign envelope never parses as this adapter's state. */
  readonly kind: 'coding-cli'
  /** Replay state format version. */
  readonly version: 1
  /** CLI that holds the conversation; another CLI cannot continue it. */
  readonly cli: CodingCliId
  readonly conversation: CodingCliConversationId
}

/**
 * Build the replay envelope for one completed turn.
 * @param cli - the CLI that ran the turn.
 * @param conversation - conversation id the CLI reported.
 * @returns the envelope stored on the assembled assistant message.
 */
export function replayEnvelope(cli: CodingCliId, conversation: CodingCliConversationId): ReplayEnvelope {
  const response: CodingCliReplay = { kind: 'coding-cli', version: 1, cli, conversation }
  return { response }
}

/**
 * Validate stored replay state from durable history.
 * @param envelope - the assistant source's replay state, when present.
 * @returns the cursor, or undefined when the state is absent or not a version this build reads.
 */
export function readReplay(envelope: unknown): CodingCliReplay | undefined {
  if (typeof envelope !== 'object' || envelope === null) return undefined
  const response: unknown = (envelope as { response?: unknown }).response
  if (typeof response !== 'object' || response === null) return undefined
  const { kind, version, cli, conversation } = response as Record<string, unknown>
  if (kind !== 'coding-cli' || version !== 1) return undefined
  const known = CODING_CLI_IDS.find(id => id === cli)
  if (known === undefined || typeof conversation !== 'string' || conversation.length === 0) return undefined
  return { kind, version, cli: known, conversation: brandString<CodingCliConversationId>(conversation) }
}
