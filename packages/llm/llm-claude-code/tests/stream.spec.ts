import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome, ApprovalService } from '@deepseek-ai/dsh-user-approval'
import { approvalCallback, toolActivityText } from '../src/approval.ts'
import { ClaudeCodeStreamTranslator } from '../src/stream.ts'

const SESSION = 'native-session'

// Partial SDK fixtures carry only the fields the translator reads.
function event(value: object, parent: string | null = null): SDKMessage {
  return { type: 'stream_event', event: value, parent_tool_use_id: parent, uuid: 'e', session_id: SESSION } as never
}

function assistant(content: object[], uuid = 'assistant-uuid', parent: string | null = null): SDKMessage {
  return {
    type: 'assistant',
    message: { content },
    parent_tool_use_id: parent,
    uuid,
    session_id: SESSION,
  } as never
}

function success(extra: object = {}): SDKMessage {
  return { type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: SESSION, ...extra } as never
}

function toolResults(content: object[], uuid = 'results-uuid'): SDKMessage {
  return { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, uuid, session_id: SESSION } as never
}

function reasoningTexts(chunks: StreamChunk[]): string[] {
  return chunks.flatMap(chunk => chunk.type === 'block-end' && chunk.block.type === 'reasoning' ? [chunk.block.text] : [])
}

function run(messages: SDKMessage[]): StreamChunk[] {
  const translator = new ClaudeCodeStreamTranslator()
  return [...messages.flatMap(message => translator.accept(message)), ...translator.finish()]
}

describe('ClaudeCodeStreamTranslator', () => {
  it('streams text, thinking, and live tool activity, reports failed results, and finishes with usage and the resume cursor', () => {
    const chunks = run([
      { type: 'system', subtype: 'init', session_id: SESSION } as never,
      event({ type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 } } }),
      event({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
      event({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } }),
      event({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 's' } }),
      event({ type: 'content_block_stop', index: 0 }),
      event({ type: 'content_block_start', index: 1, content_block: { type: 'text' } }),
      event({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hel' } }),
      event({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'lo' } }),
      event({ type: 'content_block_stop', index: 1 }),
      event({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tool-1', name: 'Bash' } }),
      event({ type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"command":' } }),
      event({ type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"ls"}' } }),
      event({ type: 'content_block_stop', index: 2 }),
      event({ type: 'message_delta', usage: { output_tokens: 7 } }),
      event({ type: 'message_stop' }),
      assistant([{ type: 'text', text: 'Hello' }, { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'ls' } }]),
      toolResults([{ type: 'tool_result', tool_use_id: 'tool-1', is_error: true, content: 'The user rejected this operation.' }], 'tool-result-uuid'),
      success(),
    ])
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'hmm' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'hmm' } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'Hel' },
      { type: 'text-delta', index: 1, text: 'lo' },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'Hello' } },
      { type: 'block-start', index: 2, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 2, text: 'Claude Code ran Bash' },
      { type: 'reasoning-delta', index: 2, text: ': ls\n' },
      { type: 'block-end', index: 2, block: { type: 'reasoning', text: 'Claude Code ran Bash: ls\n' } },
      { type: 'block-start', index: 3, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 3, text: 'Claude Code\'s Bash failed: The user rejected this operation.\n' },
      { type: 'block-end', index: 3, block: { type: 'reasoning', text: 'Claude Code\'s Bash failed: The user rejected this operation.\n' } },
      { type: 'usage', usage: { inputTokens: 17, outputTokens: 7, totalTokens: 24, cacheReadTokens: 5, cacheWriteTokens: 2 } },
      {
        type: 'finish',
        reason: { kind: 'stop' },
        replayState: { response: { kind: 'claude-code', version: 1, sessionId: SESSION, resumeAt: 'tool-result-uuid' } },
      },
    ])
  })

  it('ignores nested subagent traffic and replayed prompts without a uuid', () => {
    const chunks = run([
      event({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }, 'task-1'),
      assistant([{ type: 'tool_use', name: 'Read', input: { file_path: 'a' } }], 'nested', 'task-1'),
      { type: 'user', message: { role: 'user', content: [] }, parent_tool_use_id: 'task-1', uuid: 'nested-user', session_id: SESSION } as never,
      { type: 'user', message: { role: 'user', content: 'x' }, parent_tool_use_id: null, session_id: SESSION } as never,
      assistant([{ type: 'text', text: 'ok' }], 'top'),
      success(),
    ])
    expect(chunks).toEqual([
      {
        type: 'finish',
        reason: { kind: 'stop' },
        replayState: { response: { kind: 'claude-code', version: 1, sessionId: SESSION, resumeAt: 'top' } },
      },
    ])
  })

  it('renders nothing for a block that receives no text', () => {
    const chunks = run([
      event({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
      event({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '' } }),
      event({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 's' } }),
      event({ type: 'content_block_stop', index: 0 }),
      event({ type: 'content_block_start', index: 1, content_block: { type: 'text' } }),
      assistant([]),
      success(),
    ])
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('renders a tool input that is not an object by name alone and ignores deltas for unknown blocks', () => {
    const chunks = run([
      event({ type: 'content_block_delta', index: 9, delta: { type: 'text_delta', text: 'x' } }),
      event({ type: 'content_block_stop', index: 9 }),
      assistant([{ type: 'tool_use', id: 'tool-m', name: 'Mystery', input: null }]),
      success(),
    ])
    expect(chunks.slice(0, 3)).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'Claude Code ran Mystery\n' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'Claude Code ran Mystery\n' } },
    ])
  })

  it('names a failure by its first text line, bounded, and ignores successful results', () => {
    const long = 'x'.repeat(250)
    const chunks = run([
      event({ type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srv', name: 'web_search' } }),
      event({ type: 'content_block_stop', index: 0 }),
      assistant([{ type: 'tool_use', id: 'tool-e', name: 'Edit', input: { file_path: 'a.py' } }]),
      toolResults('a string prompt' as never),
      toolResults([
        { type: 'tool_result', tool_use_id: 'tool-e', content: 'ok' },
        { type: 'tool_result', tool_use_id: 'tool-e', is_error: true, content: [{ type: 'image' }, { type: 'text', text: '\n  first line \nsecond' }] },
        { type: 'tool_result', tool_use_id: 'unknown', is_error: true },
        { type: 'tool_result', tool_use_id: 'tool-e', is_error: true, content: long },
        { type: 'text', text: 'not a result' },
      ]),
      success(),
    ])
    expect(reasoningTexts(chunks)).toEqual([
      'Claude Code ran Edit: a.py\n',
      'Claude Code\'s Edit failed: first line\n',
      'Claude Code\'s tool failed\n',
      `Claude Code's Edit failed: ${'x'.repeat(199)}…\n`,
    ])
  })

  it('keeps a streamed tool line to its name when the input never completes', () => {
    const chunks = run([
      event({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool-w', name: 'Write' } }),
      event({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"file_path":"a' } }),
      event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ignored' } }),
    ])
    expect(chunks.slice(0, 4)).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'Claude Code ran Write' },
      { type: 'reasoning-delta', index: 0, text: '\n' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'Claude Code ran Write\n' } },
    ])
  })

  it('closes blocks still open when the SDK stream ends and omits usage without a model call', () => {
    const chunks = run([
      event({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'partial' } }),
    ])
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'partial' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'partial' } },
      { type: 'finish', reason: { kind: 'error', failure: { message: 'Claude Code ended without reporting a turn result', code: 'CLAUDE_CODE_NO_RESULT' } } },
    ])
  })

  it('reports usage without cache counters when none were reported', () => {
    const chunks = run([
      event({ type: 'message_start', message: { usage: { input_tokens: 3, output_tokens: 0, cache_read_input_tokens: null, cache_creation_input_tokens: null } } }),
      assistant([]),
      success(),
    ])
    expect(chunks[0]).toEqual({ type: 'usage', usage: { inputTokens: 3, outputTokens: 0, totalTokens: 3 } })
  })

  it.each<[string, object, string, number | undefined, string]>([
    ['sign-in', { is_error: true, result: 'Invalid API key', api_error_status: 401 }, 'INVALID_CREDENTIAL', 401, 'Sign in to Claude Code'],
    ['forbidden', { is_error: true, result: 'x', api_error_status: 403 }, 'INVALID_CREDENTIAL', 403, '/login'],
    ['rate limit', { is_error: true, result: 'slow down', api_error_status: 429 }, 'RATE_LIMIT', 429, 'slow down'],
    ['other API error', { is_error: true, result: '', api_error_status: null }, 'CLAUDE_CODE_ERROR', undefined, 'Claude Code turn failed (success)'],
    ['execution error', { subtype: 'error_during_execution', errors: ['boom'] }, 'CLAUDE_CODE_EXECUTION', undefined, 'boom'],
    ['limit', { subtype: 'error_max_turns', errors: [] }, 'CLAUDE_CODE_LIMIT', undefined, '(error_max_turns)'],
  ])('maps a %s result to a terminal failure', (_label, extra, code, status, text) => {
    const chunks = run([assistant([]), success(extra)])
    const finish = chunks.at(-1)
    expect(finish).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code } } })
    const failure = finish?.type === 'finish' && finish.reason.kind === 'error' ? finish.reason.failure : undefined
    expect(failure?.status).toBe(status)
    expect(failure?.message).toContain(text)
  })

  it('fails a success result that carries no resumable chain entry', () => {
    expect(run([success()]).at(-1)).toMatchObject({ reason: { kind: 'error', failure: { code: 'CLAUDE_CODE_ERROR' } } })
  })
})

describe('approval bridge', () => {
  const agent = { id: 'agent' } as Agent

  function service(outcome: ApprovalOutcome) {
    const request = vi.fn(() => Promise.resolve(outcome))
    return { approval: { request } as Pick<ApprovalService, 'request'> as ApprovalService, request }
  }

  const options = (title?: string) => ({
    signal: new AbortController().signal,
    toolUseID: 'tool-use',
    requestId: 'request',
    ...title === undefined ? {} : { title },
  })

  it('names the first recognized subject of a native tool input', () => {
    expect(toolActivityText('Bash', { command: 'ls', description: 'list' })).toBe('Bash: ls')
    expect(toolActivityText('Write', { file_path: '/a', content: 'x' })).toBe('Write: /a')
    expect(toolActivityText('Task', { prompt: 'p', description: '' })).toBe('Task')
  })

  it('allows exactly what one approval grants', async () => {
    const { approval, request } = service('allowed-once')
    const signal = new AbortController().signal
    await expect(approvalCallback(approval, agent)('Bash', { command: 'rm x' }, { signal, toolUseID: 't', requestId: 'r' }))
      .resolves.toEqual({ behavior: 'allow', updatedInput: { command: 'rm x' } })
    expect(request).toHaveBeenCalledWith({ agent, toolName: 'Bash', reason: 'Bash: rm x', signal })
  })

  it('prefers the native prompt title as the reason', async () => {
    const { approval, request } = service('allowed-once')
    await approvalCallback(approval, agent)('Edit', {}, options('Claude wants to edit a.ts'))
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Claude wants to edit a.ts' }))
  })

  it.each<[ApprovalOutcome, string]>([
    ['rejected', 'The user rejected this operation.'],
    ['cancelled', 'The approval request was withdrawn before the user answered.'],
    ['unavailable', 'No one is available to approve this operation.'],
  ])('denies a %s outcome', async (outcome, message) => {
    const { approval } = service(outcome)
    await expect(approvalCallback(approval, agent)('Bash', {}, options()))
      .resolves.toEqual({ behavior: 'deny', message })
  })

  it('denies when no approval service or Agent can answer', async () => {
    const { approval, request } = service('allowed-once')
    await expect(approvalCallback(undefined, agent)('Bash', {}, options())).resolves.toMatchObject({ behavior: 'deny' })
    await expect(approvalCallback(approval, undefined)('Bash', {}, options())).resolves.toMatchObject({ behavior: 'deny' })
    expect(request).not.toHaveBeenCalled()
  })
})
