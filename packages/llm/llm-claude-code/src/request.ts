/**
 * Projection from one assembled harness model request to one Claude Code turn.
 *
 * Claude Code owns its own tools, context, and transcript, so a request maps
 * to "resume this native chain entry and send this prompt" rather than to a
 * replayed message list. History the native transcript does not hold — the
 * whole conversation on the first Claude Code request of a Session, or
 * messages another route produced after the last Claude Code turn — is
 * rendered once as quoted text ahead of the prompt.
 *
 * @module @deepseek-ai/dsh-llm-claude-code/request
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { readReplay, type ClaudeCodeReplay } from './replay.ts'

/** One Claude Code turn derived from a harness request. */
export interface ClaudeCodeTurnPlan {
  /** Text sent as the native user prompt. */
  readonly prompt: string
  /** An auxiliary caller's system prompt appended to Claude Code's own; absent for conversation turns. */
  readonly systemAppend?: string
  /** Native chain entry to resume after; absent starts a fresh native conversation. */
  readonly resume?: ClaudeCodeReplay
}

function unsupported(option: string, detail: string): LlmError {
  return new LlmError(`llm-claude-code: ${option} is not supported; ${detail}`, 'UNSUPPORTED_OPTION')
}

/**
 * Refuse request options Claude Code cannot honor. Harness tool schemas are
 * not among them: Claude Code runs its own tools, so a route request never
 * offers the harness's.
 * @param options - the assembled request.
 * @throws {LlmError} code `UNSUPPORTED_OPTION` naming the first unsupported option.
 */
function assertSupportedOptions(options: GenerateOptions): void {
  if (options.temperature !== undefined) throw unsupported('temperature', 'Claude Code chooses its own sampling')
  if (options.stop !== undefined && options.stop.length > 0) throw unsupported('stop sequences', 'Claude Code accepts none')
  // An auxiliary caller's cap is a length hint its prompt already states;
  // Claude Code enforces its own output cap for that one-shot answer.
  if (options.maxTokens !== undefined && options.purpose === undefined) {
    throw unsupported('maxTokens', 'Claude Code chooses its own output cap')
  }
  if (options.reasoningEffort !== undefined) throw unsupported('reasoning effort', 'this route advertises no efforts')
}

/**
 * Render the text Claude Code can receive from one content list.
 * @param content - message content blocks.
 * @returns the joined text; merge-extensible blocks without a text rendering contribute nothing.
 * @throws {LlmError} code `UNSUPPORTED_CONTENT` for an image block.
 */
function contentText(content: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push(block.text)
        break
      case 'tool-call':
        parts.push(`[tool call ${block.name}: ${block.arguments}]`)
        break
      case 'image':
        throw new LlmError(
          'llm-claude-code: images are not supported; this route declares text-only input',
          'UNSUPPORTED_CONTENT',
        )
      default:
        // Reasoning stays with the model that produced it; tool-change blocks
        // and other merge-extensible blocks have no prompt rendering here.
        break
    }
  }
  return parts.join('')
}

function roleLabel(message: RequestMessage): string | undefined {
  switch (message.role) {
    case 'user':
      return 'user'
    case 'assistant':
      return 'assistant'
    case 'tool':
      return 'tool result'
    case 'system':
    case 'developer':
      // A leading system message becomes system text; tool-change messages have no prompt rendering.
      return undefined
    /* v8 ignore next 2 -- the message role map is closed. */
    default:
      return assertNever(message, 'message role')
  }
}

/**
 * Whether a message reaches Claude Code in a conversation turn. User-role
 * messages a harness plugin inserted — runtime-context snapshots, approval
 * policy notices — describe the harness's own tools and sandbox, which
 * Claude Code does not use, so only person-authored user text is sent.
 * @param message - one conversation message.
 * @returns false for a plugin-inserted user-role message.
 */
function sentInConversation(message: RequestMessage): boolean {
  return message.role !== 'user' || message.source === undefined || message.source.kind === 'user'
}

/**
 * Join the text of prompt messages.
 * @param messages - the trailing user messages.
 * @returns their text separated by blank lines.
 */
function promptText(messages: readonly RequestMessage[]): string {
  return messages.map(message => contentText(message.content)).join('\n\n')
}

/**
 * Quote earlier conversation the native transcript does not hold.
 * @param messages - conversation messages preceding the prompt.
 * @returns the quoted block, or an empty string when no message has text.
 */
function historyText(messages: readonly RequestMessage[]): string {
  const entries: string[] = []
  for (const message of messages) {
    const label = roleLabel(message)
    if (label === undefined) continue
    const text = contentText(message.content)
    if (text.trim().length === 0) continue
    entries.push(`<${label}>\n${text}\n</${label}>`)
  }
  if (entries.length === 0) return ''
  return `<conversation_history>\n${entries.join('\n')}\n</conversation_history>\n\n`
}

/**
 * Derive the Claude Code turn for one request. A conversation turn sends
 * person-authored text only and keeps Claude Code's own system prompt; the
 * harness system prompt describes harness tools this route never offers. An
 * auxiliary request (one with a `purpose`) sends every message, appends its
 * system prompt, and never resumes: it answers from its own messages alone.
 * A conversation turn whose trailing user messages hold no person-authored
 * text, such as one woken by a plugin notice, sends those messages instead.
 * @param options - the assembled request.
 * @returns the prompt, system text, and optional native resume cursor.
 * @throws {LlmError} code `UNSUPPORTED_OPTION` or `UNSUPPORTED_CONTENT` for input this route cannot send,
 *   and code `EMPTY_PROMPT` when the request carries no trailing user text.
 */
export function planTurn(options: GenerateOptions): ClaudeCodeTurnPlan {
  assertSupportedOptions(options)
  const auxiliary = options.purpose !== undefined
  const systemParts: string[] = []
  if (auxiliary && options.system !== undefined) systemParts.push(options.system)

  let conversation = options.messages
  const first = conversation[0]
  if (first?.role === 'system') {
    if (auxiliary) systemParts.push(contentText(first.content))
    conversation = conversation.slice(1)
  }

  let resume: ClaudeCodeReplay | undefined
  let resumeIndex = -1
  for (let index = options.purpose === undefined ? conversation.length - 1 : -1; index >= 0; index--) {
    const message = conversation[index] as RequestMessage
    if (message.role !== 'assistant') continue
    const replay = readReplay(message.source.replayState)
    if (replay !== undefined) {
      resume = replay
      resumeIndex = index
      break
    }
  }

  const pending = conversation.slice(resumeIndex + 1)
  let promptStart = pending.length
  while (promptStart > 0 && pending[promptStart - 1]?.role === 'user') promptStart--
  const trailing = pending.slice(promptStart)
  const sent = auxiliary ? trailing : trailing.filter(sentInConversation)
  let prompt = promptText(sent)
  if (prompt.trim().length === 0) prompt = promptText(trailing)
  if (prompt.trim().length === 0) {
    throw new LlmError('llm-claude-code: the request carries no trailing user text to send', 'EMPTY_PROMPT')
  }
  const history = pending.slice(0, promptStart)

  const systemAppend = systemParts.filter(part => part.trim().length > 0).join('\n\n')
  return {
    prompt: historyText(auxiliary ? history : history.filter(sentInConversation)) + prompt,
    ...systemAppend.length === 0 ? {} : { systemAppend },
    ...resume === undefined ? {} : { resume },
  }
}
