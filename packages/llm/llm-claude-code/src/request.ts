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

import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, ImageBlock, RequestMessage } from '@deepseek-ai/dsh-llm'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { effortLevel } from './models.ts'
import { readReplay, type ClaudeCodeReplay } from './replay.ts'

/** One Claude Code turn derived from a harness request. */
export interface ClaudeCodeTurnPlan {
  /** Text sent as the native user prompt; the k-th image occurrence appears as `[Image #k]`. */
  readonly prompt: string
  /** Image occurrences the prompt text marks, in marker order; `images[k - 1]` is `[Image #k]`. */
  readonly images: readonly ImageBlock[]
  /** An auxiliary caller's system prompt appended to Claude Code's own; absent for conversation turns. */
  readonly systemAppend?: string
  /** Native chain entry to resume after; absent starts a fresh native conversation. */
  readonly resume?: ClaudeCodeReplay
  /** Claude Code effort level for the turn; absent leaves Claude Code's own setting in charge. */
  readonly effort?: EffortLevel
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
}

/**
 * Map the request's effort to a Claude Code level.
 * @param options - the assembled request.
 * @returns the level, or none when the request names no effort.
 * @throws {LlmError} code `UNSUPPORTED_OPTION` for an effort this route never advertises.
 */
function requestEffort(options: GenerateOptions): Pick<ClaudeCodeTurnPlan, 'effort'> {
  if (options.reasoningEffort === undefined) return {}
  const effort = effortLevel(options.reasoningEffort)
  if (effort === undefined) throw unsupported(`reasoning effort "${options.reasoningEffort}"`, 'Claude Code accepts low, medium, high, xhigh, or max')
  return { effort }
}

/** Collects image occurrences while prompt text is rendered, numbering each marker. */
class ImageMarkers {
  readonly blocks: ImageBlock[] = []

  /**
   * Record one image occurrence.
   * @param block - the image block.
   * @returns the marker that stands for it in the prompt text.
   */
  mark(block: ImageBlock): string {
    this.blocks.push(block)
    return `[Image #${this.blocks.length}]`
  }
}

/**
 * Render the text Claude Code receives for one content list.
 * @param content - message content blocks.
 * @param images - collector that numbers each image occurrence.
 * @returns the joined text with image markers; merge-extensible blocks without a text rendering contribute nothing.
 */
function contentText(content: readonly ContentBlock[], images: ImageMarkers): string {
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
        parts.push(images.mark(block))
        break
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
 * @param images - collector that numbers each image occurrence.
 * @returns their text separated by blank lines.
 */
function promptText(messages: readonly RequestMessage[], images: ImageMarkers): string {
  return messages.map(message => contentText(message.content, images)).join('\n\n')
}

/**
 * Quote earlier conversation the native transcript does not hold.
 * @param messages - conversation messages preceding the prompt.
 * @param images - collector that numbers each image occurrence.
 * @returns the quoted block, or an empty string when no message has text.
 */
function historyText(messages: readonly RequestMessage[], images: ImageMarkers): string {
  const entries: string[] = []
  for (const message of messages) {
    const label = roleLabel(message)
    if (label === undefined) continue
    const text = contentText(message.content, images)
    if (text.trim().length === 0) continue
    entries.push(`<${label}>\n${text}\n</${label}>`)
  }
  if (entries.length === 0) return ''
  return `<conversation_history>\n${entries.join('\n')}\n</conversation_history>\n\n`
}

/** Rendered prompt text and its image markers. */
interface RenderedPrompt {
  /** Quoted history followed by the trailing prompt text. */
  readonly text: string
  /** Image occurrences in marker order. */
  readonly images: readonly ImageBlock[]
  /** Whether the trailing messages, excluding quoted history, hold text or an image. */
  readonly hasPrompt: boolean
}

/**
 * Render quoted history and the trailing prompt, numbering images in reading order.
 * @param history - messages quoted ahead of the prompt.
 * @param trailing - the trailing user messages sent as the prompt.
 * @returns the joined text, its images, and whether the trailing part is non-empty.
 */
function renderPrompt(history: readonly RequestMessage[], trailing: readonly RequestMessage[]): RenderedPrompt {
  const images = new ImageMarkers()
  const quoted = historyText(history, images)
  const quotedImages = images.blocks.length
  const prompt = promptText(trailing, images)
  return {
    text: quoted + prompt,
    images: images.blocks,
    hasPrompt: prompt.trim().length > 0 || images.blocks.length > quotedImages,
  }
}

/**
 * Derive the Claude Code turn for one request. A conversation turn sends
 * person-authored text only and keeps Claude Code's own system prompt; the
 * harness system prompt describes harness tools this route never offers. An
 * auxiliary request (one with a `purpose`) sends every message, appends its
 * system prompt, and never resumes: it answers from its own messages alone.
 * A conversation turn whose trailing user messages hold no person-authored
 * text, such as one woken by a plugin notice, sends those messages instead.
 * Every image occurrence in the sent text, quoted history included, becomes
 * an `[Image #k]` marker whose block is listed in `images`.
 * @param options - the assembled request.
 * @returns the prompt, its images, system text, and optional native resume cursor.
 * @throws {LlmError} code `UNSUPPORTED_OPTION` for an option this route cannot honor,
 *   and code `EMPTY_PROMPT` when the request carries no trailing user text or image.
 */
export function planTurn(options: GenerateOptions): ClaudeCodeTurnPlan {
  assertSupportedOptions(options)
  const effort = requestEffort(options)
  const auxiliary = options.purpose !== undefined
  const systemParts: string[] = []
  if (auxiliary && options.system !== undefined) systemParts.push(options.system)

  let conversation = options.messages
  const first = conversation[0]
  if (first?.role === 'system') {
    if (auxiliary) systemParts.push(contentText(first.content, new ImageMarkers()))
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
  const history = pending.slice(0, promptStart)
  const sentHistory = auxiliary ? history : history.filter(sentInConversation)
  let rendered = renderPrompt(sentHistory, auxiliary ? trailing : trailing.filter(sentInConversation))
  if (!rendered.hasPrompt) rendered = renderPrompt(sentHistory, trailing)
  if (!rendered.hasPrompt) {
    throw new LlmError('llm-claude-code: the request carries no trailing user text to send', 'EMPTY_PROMPT')
  }

  const systemAppend = systemParts.filter(part => part.trim().length > 0).join('\n\n')
  return {
    prompt: rendered.text,
    images: rendered.images,
    ...systemAppend.length === 0 ? {} : { systemAppend },
    ...resume === undefined ? {} : { resume },
    ...effort,
  }
}
