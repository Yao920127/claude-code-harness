/**
 * Translation from one Claude Code turn's SDK messages to harness stream chunks.
 *
 * Only the top-level conversation is rendered; nested Claude Code subagent
 * traffic stays product-local. Text and thinking stream token by token from
 * partial-message events. Native tool invocations are complete only on the
 * assembled assistant message, and they render as reasoning lines because the
 * harness must not execute or answer them. The turn's terminal SDK result
 * becomes the one terminal `finish` chunk.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/stream
 */

import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import { brandString } from '@deepseek-ai/dsh-brand'
import { INVALID_CREDENTIAL_CODE } from '@deepseek-ai/dsh-llm'
import type { LlmFailure, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { toolActivityText } from './approval.ts'
import { replayEnvelope, type ClaudeCodeChainEntryId, type ClaudeCodeSessionId } from './replay.ts'

type StreamedBlockType = 'text' | 'reasoning'

/** A native text or thinking block; its harness index is allocated by its first non-empty delta. */
interface OpenBlock {
  index: number | undefined
  readonly type: StreamedBlockType
  text: string
}

/** Native input counters reported by a message-start event. */
interface NativeInputUsage {
  readonly input_tokens: number
  readonly cache_creation_input_tokens: number | null
  readonly cache_read_input_tokens: number | null
}

/**
 * Stable failure code for one unsuccessful SDK result.
 * @param result - the terminal SDK result.
 * @returns the provider-neutral routing code.
 */
function failureCode(result: SDKResultMessage): string {
  if (result.subtype !== 'success') return result.subtype === 'error_during_execution' ? 'CLAUDE_CODE_EXECUTION' : 'CLAUDE_CODE_LIMIT'
  switch (result.api_error_status) {
    case 401:
    case 403:
      return INVALID_CREDENTIAL_CODE
    case 429:
      return 'RATE_LIMIT'
    default:
      return 'CLAUDE_CODE_ERROR'
  }
}

function failureMessage(result: SDKResultMessage): string {
  const detail = result.subtype === 'success' ? result.result : result.errors.join('; ')
  const summary = `Claude Code turn failed (${result.subtype})`
  const message = detail.trim().length === 0 ? summary : `${summary}: ${detail}`
  return failureCode(result) === INVALID_CREDENTIAL_CODE
    ? `${message}. Sign in to Claude Code on this machine (run \`claude\`, then /login) and try again.`
    : message
}

/**
 * Stateful translator for exactly one Claude Code turn.
 *
 * Feed every SDK message in order through {@link accept}; after the SDK
 * iterator ends, {@link finish} yields the usage and terminal chunks.
 */
export class ClaudeCodeStreamTranslator {
  private nextIndex = 0
  private readonly open = new Map<number, OpenBlock>()
  private sessionId: ClaudeCodeSessionId | undefined
  private resumeAt: ClaudeCodeChainEntryId | undefined
  private inputUsage: NativeInputUsage | undefined
  private outputTokens = 0
  private result: SDKResultMessage | undefined

  /**
   * Translate one SDK message.
   * @param message - the next message from the SDK query.
   * @returns the chunks this message contributes, in emission order.
   */
  accept(message: SDKMessage): StreamChunk[] {
    switch (message.type) {
      case 'stream_event':
        if (message.parent_tool_use_id !== null) return []
        this.sessionId = brandString<ClaudeCodeSessionId>(message.session_id)
        return this.streamEvent(message.event)
      case 'assistant': {
        if (message.parent_tool_use_id !== null) return []
        this.sessionId = brandString<ClaudeCodeSessionId>(message.session_id)
        this.resumeAt = brandString<ClaudeCodeChainEntryId>(message.uuid)
        const chunks: StreamChunk[] = []
        for (const block of message.message.content) {
          if (block.type !== 'tool_use') continue
          const input = typeof block.input === 'object' && block.input !== null
            ? block.input as Record<string, unknown>
            : {}
          chunks.push(...this.reasoningBlock(`Claude Code ran ${toolActivityText(block.name, input)}\n`))
        }
        return chunks
      }
      case 'user':
        if (message.parent_tool_use_id !== null || message.uuid === undefined) return []
        this.resumeAt = brandString<ClaudeCodeChainEntryId>(message.uuid)
        return []
      case 'result':
        this.sessionId = brandString<ClaudeCodeSessionId>(message.session_id)
        this.result = message
        return []
      default:
        // System, hook, task, and status notifications are product-local.
        return []
    }
  }

  /**
   * Close the turn after the SDK iterator ends.
   * @returns open-block closures, usage, and the terminal finish chunk.
   */
  finish(): StreamChunk[] {
    const chunks: StreamChunk[] = []
    for (const nativeIndex of [...this.open.keys()]) chunks.push(...this.closeBlock(nativeIndex))
    const usage = this.usage()
    if (usage !== undefined) chunks.push({ type: 'usage', usage })
    const result = this.result
    if (result === undefined) {
      chunks.push({ type: 'finish', reason: { kind: 'error', failure: {
        message: 'Claude Code ended without reporting a turn result',
        code: 'CLAUDE_CODE_NO_RESULT',
      } } })
      return chunks
    }
    if (result.subtype === 'success' && !result.is_error && this.sessionId !== undefined && this.resumeAt !== undefined) {
      chunks.push({ type: 'finish', reason: { kind: 'stop' }, replayState: replayEnvelope(this.sessionId, this.resumeAt) })
      return chunks
    }
    const failure: LlmFailure = {
      message: failureMessage(result),
      code: failureCode(result),
      ...result.subtype === 'success' && typeof result.api_error_status === 'number'
        ? { status: result.api_error_status }
        : {},
    }
    chunks.push({ type: 'finish', reason: { kind: 'error', failure } })
    return chunks
  }

  private streamEvent(event: Extract<SDKMessage, { type: 'stream_event' }>['event']): StreamChunk[] {
    switch (event.type) {
      case 'message_start':
        this.inputUsage = event.message.usage
        this.outputTokens = event.message.usage.output_tokens
        return []
      case 'message_delta':
        this.outputTokens = event.usage.output_tokens
        return []
      case 'content_block_start': {
        const type: StreamedBlockType | undefined = event.content_block.type === 'text'
          ? 'text'
          : event.content_block.type === 'thinking' ? 'reasoning' : undefined
        if (type === undefined) return []
        this.open.set(event.index, { index: undefined, type, text: '' })
        return []
      }
      case 'content_block_delta': {
        const block = this.open.get(event.index)
        if (block === undefined) return []
        if (event.delta.type === 'text_delta' && block.type === 'text') return this.appendDelta(block, event.delta.text)
        if (event.delta.type === 'thinking_delta' && block.type === 'reasoning') return this.appendDelta(block, event.delta.thinking)
        return []
      }
      case 'content_block_stop':
        return this.closeBlock(event.index)
      default:
        return []
    }
  }

  /**
   * Append one delta, starting the harness block at the first non-empty text
   * so a thinking block that carries only a signature renders nothing.
   * @param block - the open native block.
   * @param text - the delta text.
   * @returns the start chunk when this delta opens the block, then the delta chunk.
   */
  private appendDelta(block: OpenBlock, text: string): StreamChunk[] {
    if (text.length === 0) return []
    const chunks: StreamChunk[] = []
    if (block.index === undefined) {
      block.index = this.nextIndex++
      chunks.push({ type: 'block-start', index: block.index, blockType: block.type })
    }
    block.text += text
    chunks.push(block.type === 'text'
      ? { type: 'text-delta', index: block.index, text }
      : { type: 'reasoning-delta', index: block.index, text })
    return chunks
  }

  private closeBlock(nativeIndex: number): StreamChunk[] {
    const block = this.open.get(nativeIndex)
    if (block === undefined) return []
    this.open.delete(nativeIndex)
    if (block.index === undefined) return []
    return [{ type: 'block-end', index: block.index, block: { type: block.type, text: block.text } }]
  }

  private reasoningBlock(text: string): StreamChunk[] {
    const index = this.nextIndex++
    return [
      { type: 'block-start', index, blockType: 'reasoning' },
      { type: 'reasoning-delta', index, text },
      { type: 'block-end', index, block: { type: 'reasoning', text } },
    ]
  }

  /**
   * Usage of the turn's last native model call, which measures the context
   * Claude Code currently carries; earlier calls in the same turn are subsumed.
   * @returns harness usage, or `undefined` when no model call reported any.
   */
  private usage(): TokenUsage | undefined {
    const input = this.inputUsage
    if (input === undefined) return undefined
    const cacheRead = input.cache_read_input_tokens ?? 0
    const cacheWrite = input.cache_creation_input_tokens ?? 0
    const inputTokens = input.input_tokens + cacheRead + cacheWrite
    const outputTokens = this.outputTokens
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      ...cacheRead === 0 ? {} : { cacheReadTokens: cacheRead },
      ...cacheWrite === 0 ? {} : { cacheWriteTokens: cacheWrite },
    }
  }
}
