/**
 * Projection from one assembled harness model request to one CLI turn.
 *
 * The CLI owns its tools, context, and transcript, so a request becomes
 * "continue this CLI conversation with this prompt". Conversation the CLI
 * transcript does not hold — the whole conversation on the CLI's first turn
 * in a Session, or messages another route produced since its last turn — is
 * quoted once ahead of the prompt.
 *
 * @module @deepseek-ai/dsh-llm-coding-cli/request
 */

import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import type { CodingCliId } from './clis.ts'
import { readReplay, type CodingCliConversationId } from './replay.ts'

/** One CLI turn derived from a harness request. */
export interface CodingCliTurnPlan {
  /** Prompt text, including quoted history and auxiliary instructions. */
  readonly prompt: string
  /** CLI conversation to continue; absent starts a new one. */
  readonly resume?: CodingCliConversationId
  /** Images of the prompt messages, in prompt order; earlier images appear in quoted history as `[image]`. */
  readonly images: readonly ImageAttachmentRef[]
}

/**
 * Render the text of one content list.
 * @param content - message content blocks.
 * @param images - receives the prompt's images; absent renders each image as `[image]`.
 * @returns the joined text; blocks without a text rendering contribute nothing.
 */
function textOf(content: readonly ContentBlock[], images?: ImageAttachmentRef[]): string {
  let text = ''
  for (const block of content) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'tool-call') text += `[tool call ${block.name}: ${block.arguments}]`
    else if (block.type === 'image') {
      if (images === undefined || block.offloaded === true) text += '[image]'
      else images.push(block.attachment)
    }
    // Reasoning stays with the model that produced it; other blocks have no prompt rendering.
  }
  return text
}

/**
 * Whether a message reaches the CLI in a conversation turn. User-role
 * messages a harness plugin inserted describe the harness's own tools and
 * sandbox, which the CLI does not use.
 * @param message - one conversation message.
 * @returns false for a plugin-inserted user-role message.
 */
function personAuthored(message: RequestMessage): boolean {
  return message.role !== 'user' || message.source === undefined || message.source.kind === 'user'
}

const HISTORY_LABELS: Partial<Record<RequestMessage['role'], string>> = { user: 'user', assistant: 'assistant', tool: 'tool result' }

function quotedHistory(messages: readonly RequestMessage[]): string {
  const entries = messages.flatMap((message) => {
    const label = HISTORY_LABELS[message.role]
    const text = label === undefined ? '' : textOf(message.content)
    return text.trim().length === 0 ? [] : [`<${label}>\n${text}\n</${label}>`]
  })
  return entries.length === 0 ? '' : `<conversation_history>\n${entries.join('\n')}\n</conversation_history>\n\n`
}

/**
 * Derive the CLI turn for one request. A conversation turn sends
 * person-authored text and continues the CLI conversation of the latest
 * assistant message this CLI produced; the harness system prompt describes
 * harness tools the CLI never uses, so it is not sent. An auxiliary request
 * (one with a `purpose`, such as a title) never continues a conversation and
 * sends its system prompt as leading instructions with every message.
 * @param route - route name used in failure messages.
 * @param cli - the CLI that runs the turn.
 * @param options - the assembled request.
 * @returns the prompt, its images, and the conversation to continue.
 * @throws {LlmError} code `UNSUPPORTED_OPTION` for temperature or stop sequences,
 *   and `EMPTY_PROMPT` without trailing user text or images.
 */
export function planTurn(route: string, cli: CodingCliId, options: GenerateOptions): CodingCliTurnPlan {
  if (options.temperature !== undefined) throw new LlmError(`${route}: temperature is not supported; the CLI chooses its own sampling`, 'UNSUPPORTED_OPTION')
  if (options.stop !== undefined && options.stop.length > 0) throw new LlmError(`${route}: stop sequences are not supported`, 'UNSUPPORTED_OPTION')
  const auxiliary = options.purpose !== undefined
  const instructions: string[] = []
  if (auxiliary && options.system !== undefined) instructions.push(options.system)
  let conversation = options.messages
  if (conversation[0]?.role === 'system') {
    if (auxiliary) instructions.push(textOf(conversation[0].content))
    conversation = conversation.slice(1)
  }

  let resume: CodingCliConversationId | undefined
  let start = 0
  for (let index = auxiliary ? -1 : conversation.length - 1; index >= 0; index--) {
    const message = conversation[index] as RequestMessage
    const replay = message.role === 'assistant' ? readReplay(message.source.replayState) : undefined
    if (replay?.cli !== cli) continue
    resume = replay.conversation
    start = index + 1
    break
  }

  const pending = conversation.slice(start)
  let promptStart = pending.length
  while (promptStart > 0 && pending[promptStart - 1]?.role === 'user') promptStart--
  const trailing = pending.slice(promptStart)
  let images: ImageAttachmentRef[] = []
  const join = (messages: readonly RequestMessage[]): string => {
    images = []
    return messages.map(message => textOf(message.content, images)).join('\n\n')
  }
  let prompt = join(auxiliary ? trailing : trailing.filter(personAuthored))
  if (prompt.trim().length === 0 && images.length === 0) prompt = join(trailing)
  if (prompt.trim().length === 0 && images.length === 0) throw new LlmError(`${route}: the request carries no trailing user text to send`, 'EMPTY_PROMPT')

  const history = pending.slice(0, promptStart)
  const lead = instructions.filter(part => part.trim().length > 0).join('\n\n')
  return {
    prompt: (lead.length === 0 ? '' : `<instructions>\n${lead}\n</instructions>\n\n`)
      + quotedHistory(auxiliary ? history : history.filter(personAuthored)) + prompt,
    ...resume === undefined ? {} : { resume },
    images,
  }
}
