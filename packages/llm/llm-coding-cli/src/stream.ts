/**
 * Translation from one CLI turn's events to harness stream chunks.
 *
 * Text and thinking stream as text and reasoning blocks. A tool call closes
 * the open block; the adapter records the call itself as a display event,
 * because the harness must not execute or answer the CLI's tools. When the
 * turn streamed no answer text, the CLI's complete answer, or else its plain
 * standard output, becomes the answer. The turn ends in exactly one `finish`
 * chunk: `stop` with the CLI conversation as replay state when the CLI
 * reported the turn complete or exited cleanly without a failure, otherwise
 * `error`.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/stream
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { CodingCliId } from './clis.ts'
import type { CliEvent, CliUsage } from './events.ts'
import { replayEnvelope, type CodingCliConversationId } from './replay.ts'

interface OpenBlock {
  readonly index: number
  readonly type: 'text' | 'reasoning'
  text: string
}

/** How the CLI process ended. */
export interface CliExit {
  /** Exit code; null when a signal ended the process. */
  readonly code: number | null
  /** Last lines the process wrote to standard error. */
  readonly stderr: string
}

/**
 * The last non-empty lines of standard error.
 * @param stderr - collected standard error.
 * @returns up to three lines joined by newlines.
 */
function lastLines(stderr: string): string {
  return stderr.trim().split('\n').filter(line => line.trim().length > 0).slice(-3).join('\n')
}

/** Stateful translator for exactly one CLI turn. */
export class CodingCliStreamTranslator {
  private nextIndex = 0
  private open: OpenBlock | undefined
  private conversation: CodingCliConversationId | undefined
  private usage: CliUsage | undefined
  private done = false
  private failure: string | undefined
  private warning: string | undefined
  private answered = false
  private final: string | undefined

  /**
   * @param cli - the CLI running the turn, recorded in the replay state.
   * @param displayName - route label used in failure messages.
   */
  constructor(private readonly cli: CodingCliId, private readonly displayName: string) {}

  /**
   * Translate one decoded event.
   * @param event - the next event of the turn.
   * @returns the chunks it contributes, in emission order.
   */
  accept(event: CliEvent): StreamChunk[] {
    switch (event.kind) {
      case 'text':
      case 'reasoning':
        return this.append(event.kind, event.text)
      case 'break':
        return this.close()
      case 'tool':
        return this.close()
      case 'final':
        this.final = event.text
        return []
      case 'session':
        this.conversation = brandString<CodingCliConversationId>(event.id)
        return []
      case 'usage':
        this.usage = event.usage
        return []
      case 'warning':
        this.warning = event.message
        return []
      case 'failure':
        this.failure ??= event.message
        return []
      case 'done':
        this.done = true
        return []
      /* v8 ignore next 2 -- the event union is closed. */
      default:
        return event satisfies never
    }
  }

  /**
   * Close the turn after the process ended.
   * @param exit - the process exit facts.
   * @param plainText - standard-output lines that were not JSON records.
   * @returns open-block closure, a fallback answer, usage, and the terminal finish chunk.
   */
  finish(exit: CliExit, plainText = ''): StreamChunk[] {
    const chunks = this.close()
    const fallback = this.final ?? (exit.code === 0 ? plainText.trim() : '')
    if (!this.answered && fallback.length > 0) chunks.push(...this.append('text', fallback), ...this.close())
    // A completed turn that produced no answer at all reports why, so it never ends silently.
    if (!this.answered && this.failure === undefined && (this.done || exit.code === 0)) {
      const reason = this.warning ?? lastLines(exit.stderr)
      if (reason.length > 0) chunks.push(...this.append('text', `${this.displayName} gave no answer: ${reason}`), ...this.close())
    }
    const usage = this.usage
    if (usage !== undefined && (usage.input > 0 || usage.output > 0)) {
      chunks.push({ type: 'usage', usage: {
        inputTokens: usage.input,
        outputTokens: usage.output,
        totalTokens: usage.input + usage.output,
        ...usage.cacheRead === 0 ? {} : { cacheReadTokens: usage.cacheRead },
      } })
    }
    // A clean exit also completes the turn: OpenCode prints no completion record for its last step.
    const failure = this.failure ?? (this.done || exit.code === 0 ? undefined : this.unfinished(exit))
    if (failure !== undefined) {
      chunks.push({ type: 'finish', reason: { kind: 'error', failure: { message: `${this.displayName} turn failed: ${failure}`, code: 'CODING_CLI_FAILED' } } })
      return chunks
    }
    const conversation = this.conversation
    chunks.push(conversation === undefined
      ? { type: 'finish', reason: { kind: 'stop' } }
      : { type: 'finish', reason: { kind: 'stop' }, replayState: replayEnvelope(this.cli, conversation) })
    return chunks
  }

  private unfinished(exit: CliExit): string {
    const detail = this.warning ?? lastLines(exit.stderr)
    const status = exit.code === null ? 'the process was stopped' : `the process exited with code ${exit.code}`
    return detail.length === 0 ? `${status} without completing the turn` : `${status} without completing the turn: ${detail}`
  }

  private append(type: OpenBlock['type'], text: string): StreamChunk[] {
    if (type === 'text') this.answered = true
    const chunks = this.open?.type === type ? [] : this.close()
    let block = this.open
    if (block === undefined) {
      block = { index: this.nextIndex++, type, text: '' }
      this.open = block
      chunks.push({ type: 'block-start', index: block.index, blockType: type })
    }
    block.text += text
    chunks.push(type === 'text'
      ? { type: 'text-delta', index: block.index, text }
      : { type: 'reasoning-delta', index: block.index, text })
    return chunks
  }

  private close(): StreamChunk[] {
    const block = this.open
    if (block === undefined) return []
    this.open = undefined
    return [{ type: 'block-end', index: block.index, block: { type: block.type, text: block.text } }]
  }
}
