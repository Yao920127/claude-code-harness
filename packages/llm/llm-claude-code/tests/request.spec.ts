import { describe, expect, it } from 'vitest'
import {
  createAssistantMessage,
  createSystemMessage,
  createToolResultMessage,
  createUserMessage,
  LlmError,
  ReasoningEffortId,
  ToolCallId,
} from '@deepseek-ai/dsh-llm'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import { planTurn } from '../src/request.ts'
import { readReplay, replayEnvelope, type ClaudeCodeChainEntryId, type ClaudeCodeSessionId } from '../src/replay.ts'

const SESSION = 'native-session' as ClaudeCodeSessionId
const ENTRY = 'native-entry' as ClaudeCodeChainEntryId

function user(text: string) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

function assistant(text: string, replay = false) {
  return createAssistantMessage({
    content: [{ type: 'reasoning', text: 'private' }, { type: 'text', text }],
    source: {
      provider: 'claude-code',
      model: 'default',
      ...replay ? { replayState: replayEnvelope(SESSION, ENTRY) } : {},
    },
  })
}

function request(messages: RequestMessage[], extra: Partial<GenerateOptions> = {}): GenerateOptions {
  return { provider: 'claude-code', model: 'default', messages, ...extra }
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
  it('round-trips the native cursor', () => {
    expect(readReplay(replayEnvelope(SESSION, ENTRY))).toEqual({
      kind: 'claude-code', version: 1, sessionId: SESSION, resumeAt: ENTRY,
    })
  })

  it.each([
    undefined,
    null,
    'text',
    {},
    { response: null },
    { response: 'x' },
    { response: { kind: 'pi-ai', version: 1, sessionId: 's', resumeAt: 'e' } },
    { response: { kind: 'claude-code', version: 2, sessionId: 's', resumeAt: 'e' } },
    { response: { kind: 'claude-code', version: 1, sessionId: '', resumeAt: 'e' } },
    { response: { kind: 'claude-code', version: 1, sessionId: 's', resumeAt: 7 } },
  ])('ignores state this build does not read: %j', (envelope) => {
    expect(readReplay(envelope)).toBeUndefined()
  })
})

describe('planTurn', () => {
  it('sends a conversation prompt without the harness system prompt', () => {
    expect(planTurn(request([createSystemMessage('Use the bash tool.'), user('hello')], { system: 'x' }))).toEqual({
      prompt: 'hello',
    })
  })

  it('appends an auxiliary caller\'s system prompt and omits empty parts', () => {
    expect(planTurn(request([createSystemMessage('B'), user('q')], { system: 'A', purpose: 'session-title' })))
      .toEqual({ prompt: 'q', systemAppend: 'A\n\nB' })
    expect(planTurn(request([createSystemMessage(''), user('q')], { purpose: 'session-title' }))).toEqual({ prompt: 'q' })
  })

  it('ignores harness tool schemas', () => {
    expect(planTurn(request([user('x')], { tools: [{ name: 'bash', description: 'd', parameters: {} }] })).prompt).toBe('x')
  })

  it('sends only person-authored text in a conversation turn', () => {
    // A plugin-inserted source kind outside this package's declaration merges.
    const notice = createUserMessage({ content: [{ type: 'text', text: 'Current runtime context.' }], source: { kind: 'runtime-context' } as never })
    const plan = planTurn(request([user('before'), notice, assistant('reply'), user('now'), notice]))
    expect(plan.prompt).toBe('<conversation_history>\n<user>\nbefore\n</user>\n<assistant>\nreply\n</assistant>\n</conversation_history>\n\nnow')
    expect(planTurn(request([user('now'), notice], { purpose: 'session-title' })).prompt).toBe('now\n\nCurrent runtime context.')
    expect(planTurn(request([assistant('reply', true), notice])).prompt).toBe('Current runtime context.')
  })

  it('resumes after the latest replayable assistant and sends only later user text', () => {
    const plan = planTurn(request([user('one'), assistant('first', true), user('two'), user('three')]))
    expect(plan).toEqual({
      prompt: 'two\n\nthree',
      resume: { kind: 'claude-code', version: 1, sessionId: SESSION, resumeAt: ENTRY },
    })
  })

  it('quotes history the native transcript does not hold', () => {
    const call = ToolCallId('call-1')
    const plan = planTurn(request([
      user('earlier'),
      createAssistantMessage({
        content: [{ type: 'tool-call', id: call, name: 'bash', arguments: '{"command":"ls"}' }],
        source: { provider: 'deepseek', model: 'chat' },
      }),
      createToolResultMessage({ callId: call, content: [{ type: 'text', text: 'a.txt' }], isError: false }),
      assistant(''),
      createUserMessage({ content: [], source: { kind: 'user' } }),
      user('now'),
    ]))
    expect(plan.resume).toBeUndefined()
    expect(plan.prompt).toBe([
      '<conversation_history>',
      '<user>\nearlier\n</user>',
      '<assistant>\n[tool call bash: {"command":"ls"}]\n</assistant>',
      '<tool result>\na.txt\n</tool result>',
      '</conversation_history>',
      '',
      '\n\nnow',
    ].join('\n'))
  })

  it('skips developer and later system messages when quoting history', () => {
    const plan = planTurn(request([
      { ...user('tools changed'), role: 'developer' },
      createSystemMessage('later prompt'),
      assistant('reply'),
      user('next'),
    ]))
    expect(plan.prompt).toBe('<conversation_history>\n<assistant>\nreply\n</assistant>\n</conversation_history>\n\nnext')
  })

  it('never resumes an auxiliary call and accepts its output cap', () => {
    const plan = planTurn(request([user('one'), assistant('first', true), user('title please')], {
      purpose: 'session-title',
      maxTokens: 32,
    }))
    expect(plan.resume).toBeUndefined()
    expect(plan.prompt).toContain('<conversation_history>')
  })

  it.each<[string, Partial<GenerateOptions>]>([
    ['temperature', { temperature: 0.5 }],
    ['stop', { stop: ['x'] }],
    ['maxTokens', { maxTokens: 10 }],
    ['an unknown reasoningEffort', { reasoningEffort: ReasoningEffortId('turbo') }],
  ])('refuses %s', (_label, extra) => {
    expect(failureCode(() => planTurn(request([user('x')], extra)))).toBe('UNSUPPORTED_OPTION')
  })

  it('carries a Claude Code effort level and leaves it out when the request names none', () => {
    expect(planTurn(request([user('x')], { reasoningEffort: ReasoningEffortId('xhigh') })).effort).toBe('xhigh')
    expect(planTurn(request([user('x')]))).not.toHaveProperty('effort')
  })

  it('accepts an empty stop list', () => {
    expect(planTurn(request([user('x')], { stop: [] })).prompt).toBe('x')
  })

  it('refuses images and empty prompts', () => {
    const image = createUserMessage({
      content: [{ type: 'image', attachment: { attachmentId: 'a', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } as ImageAttachmentRef }],
      source: { kind: 'user' },
    })
    expect(failureCode(() => planTurn(request([image])))).toBe('UNSUPPORTED_CONTENT')
    expect(failureCode(() => planTurn(request([user('x'), assistant('y', true)])))).toBe('EMPTY_PROMPT')
    expect(failureCode(() => planTurn(request([user('   ')])))).toBe('EMPTY_PROMPT')
  })
})
