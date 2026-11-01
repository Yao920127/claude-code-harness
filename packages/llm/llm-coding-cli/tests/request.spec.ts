import { describe, expect, it } from 'vitest'
import {
  createAssistantMessage, createSystemMessage, createToolResultMessage, createUserMessage, LlmError, ToolCallId,
} from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import type { CodingCliId } from '../src/clis.ts'
import { planTurn } from '../src/request.ts'
import { readReplay, replayEnvelope, type CodingCliConversationId } from '../src/replay.ts'

const CONVERSATION = 'thread-1' as CodingCliConversationId

function user(text: string) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

function assistant(text: string, cli?: CodingCliId) {
  return createAssistantMessage({
    content: [{ type: 'reasoning', text: 'private' }, { type: 'text', text }],
    source: { provider: cli ?? 'deepseek', model: 'm', ...cli === undefined ? {} : { replayState: replayEnvelope(cli, CONVERSATION) } },
  })
}

function request(messages: RequestMessage[], extra: Partial<GenerateOptions> = {}): GenerateOptions {
  return { provider: 'codex', model: 'default', messages, ...extra }
}

function failureCode(action: () => unknown): string | undefined {
  try {
    action()
  } catch (error: unknown) {
    return error instanceof LlmError ? error.code : undefined
  }
  return undefined
}

describe('replay state', () => {
  it('round-trips the conversation and rejects foreign or malformed state', () => {
    expect(readReplay(replayEnvelope('grok', CONVERSATION))).toEqual({ kind: 'coding-cli', version: 1, cli: 'grok', conversation: CONVERSATION })
    for (const envelope of [undefined, null, {}, { response: null }, { response: { kind: 'claude-code', version: 1 } },
      { response: { kind: 'coding-cli', version: 1, cli: 'other', conversation: 'x' } },
      { response: { kind: 'coding-cli', version: 1, cli: 'codex', conversation: '' } }]) {
      expect(readReplay(envelope)).toBeUndefined()
    }
  })
})

const PNG = { attachmentId: 'a1', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } as ImageAttachmentRef

function imageMessage(text: string, offloaded = false) {
  return createUserMessage({
    content: [{ type: 'image', attachment: PNG, ...offloaded ? { offloaded: true as const } : {} }, { type: 'text', text }],
    source: { kind: 'user' },
  })
}

describe('planTurn images', () => {
  it('attaches the prompt\'s images and names earlier ones in quoted history', () => {
    expect(planTurn('codex', 'codex', request([imageMessage('old'), assistant('seen'), imageMessage('new')]))).toEqual({
      images: [PNG],
      prompt: '<conversation_history>\n<user>\n[image]old\n</user>\n<assistant>\nseen\n</assistant>\n</conversation_history>\n\nnew',
    })
  })

  it('sends an image-only prompt and names an offloaded image instead of attaching it', () => {
    const only = createUserMessage({ content: [{ type: 'image', attachment: PNG }], source: { kind: 'user' } })
    expect(planTurn('codex', 'codex', request([only]))).toEqual({ images: [PNG], prompt: '' })
    expect(planTurn('codex', 'codex', request([imageMessage('x', true)]))).toEqual({ images: [], prompt: '[image]x' })
  })
})

describe('planTurn', () => {
  it('sends the whole conversation as quoted history on the CLI\'s first turn', () => {
    const call = ToolCallId('call-1')
    const messages = [
      createSystemMessage('Use the bash tool.'),
      user('first'),
      createAssistantMessage({ content: [{ type: 'tool-call', id: call, name: 'bash', arguments: '{"command":"ls"}' }], source: { provider: 'deepseek', model: 'chat' } }),
      createToolResultMessage({ callId: call, content: [{ type: 'text', text: 'a.txt' }], isError: false }),
      assistant(''),
      createSystemMessage('later system text'),
      user('second'),
    ]
    expect(planTurn('codex', 'codex', request(messages, { system: 'harness' }))).toEqual({
      images: [],
      prompt: '<conversation_history>\n<user>\nfirst\n</user>\n<assistant>\n[tool call bash: {"command":"ls"}]\n</assistant>\n<tool result>\na.txt\n</tool result>\n</conversation_history>\n\nsecond',
    })
  })

  it('continues the conversation of the latest turn this CLI produced', () => {
    const messages = [user('a'), assistant('b', 'codex'), user('c'), assistant('d', 'grok'), user('e')]
    expect(planTurn('codex', 'codex', request(messages))).toEqual({
      images: [],
      prompt: '<conversation_history>\n<user>\nc\n</user>\n<assistant>\nd\n</assistant>\n</conversation_history>\n\ne',
      resume: CONVERSATION,
    })
  })

  it('sends only person-authored text unless the trailing messages have none', () => {
    const notice = createUserMessage({ content: [{ type: 'text', text: 'Runtime context.' }], source: { kind: 'runtime-context' } as never })
    expect(planTurn('codex', 'codex', request([notice, user('hello')])).prompt).toBe('hello')
    expect(planTurn('codex', 'codex', request([user('x'), assistant('y', 'codex'), notice])).prompt).toBe('Runtime context.')
  })

  it('sends an auxiliary request with its instructions and never continues a conversation', () => {
    const messages = [createSystemMessage('B'), user('a'), assistant('b', 'codex'), user('q')]
    expect(planTurn('codex', 'codex', request(messages, { system: 'A', purpose: 'session-title' }))).toEqual({
      images: [],
      prompt: '<instructions>\nA\n\nB\n</instructions>\n\n<conversation_history>\n<user>\na\n</user>\n<assistant>\nb\n</assistant>\n</conversation_history>\n\nq',
    })
  })

  it('refuses options and content the CLI cannot receive', () => {
    expect(failureCode(() => planTurn('codex', 'codex', request([user('x')], { temperature: 0.2 })))).toBe('UNSUPPORTED_OPTION')
    expect(failureCode(() => planTurn('codex', 'codex', request([user('x')], { stop: ['END'] })))).toBe('UNSUPPORTED_OPTION')
    expect(planTurn('codex', 'codex', request([user('x')], { stop: [] })).prompt).toBe('x')
    expect(failureCode(() => planTurn('codex', 'codex', request([user('a'), assistant('b')])))).toBe('EMPTY_PROMPT')
  })
})
