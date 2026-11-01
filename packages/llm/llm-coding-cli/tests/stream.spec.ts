import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { CODING_CLIS, type CodingCliId } from '../src/clis.ts'
import {
  AntigravityDecoder, boundedOutput, CodexDecoder, contentText, GenericDecoder, GrokDecoder, OpenCodeDecoder,
  TOOL_OUTPUT_MAX_CHARS, type CliEvent, type CliToolEvent,
} from '../src/events.ts'
import { readReplay } from '../src/replay.ts'
import { CodingCliStreamTranslator } from '../src/stream.ts'

function fixture(name: string): unknown[] {
  return readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')
    .split('\n').filter(line => line.trim().length > 0).map(line => JSON.parse(line) as object)
}

interface Translated {
  readonly chunks: StreamChunk[]
  readonly tools: CliToolEvent[]
}

/** Run recorded output through the CLI's decoder and the translator. */
function translate(cli: CodingCliId, records: readonly unknown[], code: number | null = 0, stderr = '', plain = ''): Translated {
  const decoder = CODING_CLIS[cli].decoder()
  const translator = new CodingCliStreamTranslator(cli, CODING_CLIS[cli].displayName)
  const tools: CliToolEvent[] = []
  const chunks = records.flatMap(record => decoder.accept(record).flatMap((event) => {
    if (event.kind === 'tool') tools.push(event)
    return translator.accept(event)
  }))
  return { chunks: [...chunks, ...translator.finish({ code, stderr }, plain)], tools }
}

function blocks(chunks: readonly StreamChunk[]): { type: string; text: string }[] {
  return chunks.flatMap(chunk => chunk.type === 'block-end' && (chunk.block.type === 'text' || chunk.block.type === 'reasoning')
    ? [{ type: chunk.block.type, text: chunk.block.text }]
    : [])
}

function finish(chunks: readonly StreamChunk[]): Extract<StreamChunk, { type: 'finish' }> {
  const last = chunks.at(-1)
  if (last?.type !== 'finish') throw new Error('the stream did not finish')
  return last
}

describe('recorded turns', () => {
  it('renders a Codex turn and reports its command with output', () => {
    const { chunks, tools } = translate('codex', fixture('codex-turn.jsonl'))
    expect(blocks(chunks)).toEqual([{ type: 'text', text: 'hello' }])
    expect(tools).toEqual([
      { kind: 'tool', id: 'item_2', name: 'command_execution', input: { command: 'cat a.txt' }, status: 'running' },
      { kind: 'tool', id: 'item_2', name: 'command_execution', input: { command: 'cat a.txt' }, status: 'completed', output: 'hello\n' },
    ])
    expect(chunks).toContainEqual({ type: 'usage', usage: { inputTokens: 40724, outputTokens: 112, totalTokens: 40836, cacheReadTokens: 29824 } })
    expect(readReplay(finish(chunks).replayState)).toEqual({
      kind: 'coding-cli', version: 1, cli: 'codex', conversation: '01a19641-fa6e-7c23-a218-dde160fa6e58',
    })
  })

  it('renders a Grok turn with streamed thinking and reports its tool with output', () => {
    const { chunks, tools } = translate('grok', fixture('grok-turn.jsonl'))
    const rendered = blocks(chunks)
    expect(rendered.map(block => block.type)).toEqual(['reasoning', 'reasoning', 'text'])
    expect(rendered[0]?.text).toMatch(/^The user wants me to read a file/u)
    expect(rendered[2]?.text).toBe('hello')
    expect(tools.map(tool => [tool.name, tool.status, tool.output])).toEqual([['read_file', 'running', undefined], ['read_file', 'completed', '1→hello\n']])
    expect(readReplay(finish(chunks).replayState)?.conversation).toBe('01a19642-4e54-7d63-8e57-366240f91c15')
  })

  it('renders an Antigravity turn and reports its tool step', () => {
    const { chunks, tools } = translate('antigravity', fixture('antigravity-turn.jsonl'))
    expect(blocks(chunks)).toEqual([{ type: 'text', text: 'hello\n' }])
    expect(tools.map(tool => [tool.id, tool.name, tool.status])).toEqual([['step-3', 'read_file', 'running'], ['step-3', 'read_file', 'completed']])
    expect(readReplay(finish(chunks).replayState)?.conversation).toBe('5a6fa667-a4f5-471b-9edc-96550bcb93a8')
  })

  it('renders an OpenCode turn and reports its tool', () => {
    const { chunks, tools } = translate('opencode', fixture('opencode-turn.jsonl'))
    expect(blocks(chunks).map(block => block.type)).toEqual(['reasoning', 'text'])
    expect(tools).toMatchObject([{ id: 'chatcmpl-tool-ba82d52cbbe80892', name: 'read', status: 'completed' }])
    expect(readReplay(finish(chunks).replayState)?.conversation).toBe('ses_e69bcd1ceffekLjN9z3legzsIR')
  })
})

describe('failures', () => {
  it('fails a turn the CLI reports failed', () => {
    const { chunks } = translate('codex', [{ type: 'thread.started', thread_id: 't' }, { type: 'turn.failed', error: { message: 'usage limit reached' } }], 1)
    expect(finish(chunks).reason).toEqual({ kind: 'error', failure: { message: 'Codex turn failed: usage limit reached', code: 'CODING_CLI_FAILED' } })
  })

  it('fails a turn that ended without completing, naming the warning or the error output', () => {
    expect(finish(translate('codex', [{ type: 'error', message: 'stream disconnected' }], 1).chunks).reason)
      .toMatchObject({ failure: { message: 'Codex turn failed: the process exited with code 1 without completing the turn: stream disconnected' } })
    expect(finish(translate('grok', [], null, 'line 1\n\nnot signed in\n').chunks).reason)
      .toMatchObject({ failure: { message: 'Grok Build turn failed: the process was stopped without completing the turn: line 1\nnot signed in' } })
    expect(finish(translate('opencode', [], 0).chunks).reason).toEqual({ kind: 'stop' })
    expect(finish(translate('opencode', [], 2).chunks).reason)
      .toMatchObject({ failure: { message: 'OpenCode turn failed: the process exited with code 2 without completing the turn' } })
  })

  it('reports CLI error records', () => {
    expect(new GrokDecoder().accept({ type: 'error', message: 'quota' })).toEqual([{ kind: 'failure', message: 'quota' }])
    expect(new GrokDecoder().accept({ type: 'error' })).toEqual([{ kind: 'failure', message: 'Grok reported an error' }])
    expect(new OpenCodeDecoder().accept({ type: 'error', error: { name: 'ProviderAuthError', data: { message: 'sign in' } } }))
      .toEqual([{ kind: 'failure', message: 'sign in' }])
    expect(new OpenCodeDecoder().accept({ type: 'error', error: {} })).toEqual([{ kind: 'failure', message: 'OpenCode reported an error' }])
    expect(new AntigravityDecoder().accept({ event: 'result', result: { status: 'ERROR', error: 'denied' } }))
      .toContainEqual({ kind: 'failure', message: 'denied' })
    expect(new AntigravityDecoder().accept({ event: 'result', result: { status: 'CANCELLED' } }))
      .toContainEqual({ kind: 'failure', message: 'Antigravity ended with status CANCELLED' })
    expect(new CodexDecoder().accept({ type: 'turn.failed' })).toEqual([{ kind: 'failure', message: 'Codex reported a failed turn' }])
    expect(new CodexDecoder().accept({ type: 'error' })).toEqual([{ kind: 'warning', message: 'Codex reported an error' }])
  })

  it('finishes without replay state when the CLI reported no conversation id', () => {
    const { chunks } = translate('grok', [{ type: 'text', data: 'hi' }, { type: 'end', usage: {} }])
    expect(finish(chunks)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(chunks.some(chunk => chunk.type === 'usage')).toBe(false)
  })
})

describe('fallback answers', () => {
  it('shows the CLI\'s complete answer only when no answer text streamed', () => {
    const silent = translate('antigravity', [{ event: 'result', result: { status: 'SUCCESS', response: 'done.' } }])
    expect(blocks(silent.chunks)).toEqual([{ type: 'text', text: 'done.' }])
    const streamed = translate('antigravity', [
      { event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'done.' } },
      { event: 'result', result: { status: 'SUCCESS', response: 'done.' } },
    ])
    expect(blocks(streamed.chunks)).toEqual([{ type: 'text', text: 'done.' }])
  })

  it('reports why a completed turn gave no answer', () => {
    const denied = translate('antigravity', [{ event: 'result', result: { status: 'SUCCESS', response: '', denied_actions: [{ action: 'command', display_name: 'RunCommand' }, { action: 'mcp' }, {}] } }])
    expect(blocks(denied.chunks)).toEqual([{
      type: 'text', text: 'Antigravity gave no answer: Antigravity was refused permission for RunCommand, mcp, which headless mode cannot ask for',
    }])
    expect(blocks(translate('codex', [{ type: 'turn.completed', usage: {} }], 0, 'jetski: no output produced\n').chunks))
      .toEqual([{ type: 'text', text: 'Codex gave no answer: jetski: no output produced' }])
    expect(blocks(translate('codex', [{ type: 'turn.completed', usage: {} }]).chunks)).toEqual([])
  })

  it('shows plain standard output of a clean exit when the CLI printed no records', () => {
    expect(blocks(translate('grok', [], 0, '', 'plain answer\n').chunks)).toEqual([{ type: 'text', text: 'plain answer' }])
    expect(blocks(translate('grok', [], 1, '', 'partial\n').chunks)).toEqual([])
  })
})

describe('decoders', () => {
  it('reports Codex tool items, failures, and newer item types', () => {
    const decoder = new CodexDecoder()
    const events: CliEvent[] = [
      { type: 'item.completed', item: { id: 'c', type: 'command_execution', command: 'npm test', exit_code: 1, aggregated_output: 'boom' } },
      { type: 'item.started', item: { id: 'q', type: 'command_execution', command: '/bin/zsh -lc "sed -n \'1p\' a"' } },
      { type: 'item.started', item: { id: 'u', type: 'command_execution', command: '/bin/zsh -lc ls' } },
      { type: 'item.completed', item: { id: 'f', type: 'file_change', changes: [{ path: 'a.ts' }, { path: 'b.ts' }, {}] } },
      { type: 'item.completed', item: { id: 'f2', type: 'file_change', status: 'failed' } },
      { type: 'item.started', item: { id: 'f3', type: 'file_change' } },
      { type: 'item.started', item: { id: 'm', type: 'mcp_tool_call', server: 'github', tool: 'search', arguments: { query: 'x' } } },
      { type: 'item.completed', item: { id: 'm', type: 'mcp_tool_call', result: { content: [{ type: 'text', text: 'found' }] } } },
      { type: 'item.completed', item: { id: 'm2', type: 'mcp_tool_call', error: { message: 'denied' } } },
      { type: 'item.completed', item: { id: 'm3', type: 'mcp_tool_call', status: 'failed' } },
      { type: 'item.started', item: { id: 'w', type: 'web_search', query: 'cordis' } },
      { type: 'item.completed', item: { id: 'w', type: 'web_search' } },
      { type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'thinking' } },
      { type: 'item.started', item: { id: 'a', type: 'agent_message' } },
      { type: 'item.completed', item: { id: 't', type: 'todo_list' } },
      { type: 'item.completed', item: { id: 'n', type: 'image_generation', name: 'image_gen', arguments: { prompt: 'cat' }, status: 'completed' } },
      { type: 'item.started', item: { type: 'command_execution' } },
      { type: 'thread.started' },
      'not an object',
    ].flatMap(record => decoder.accept(record))
    expect(events).toEqual([
      { kind: 'tool', id: 'c', name: 'command_execution', input: { command: 'npm test' }, status: 'failed', output: 'boom' },
      { kind: 'tool', id: 'q', name: 'command_execution', input: { command: 'sed -n \'1p\' a' }, status: 'running' },
      { kind: 'tool', id: 'u', name: 'command_execution', input: { command: 'ls' }, status: 'running' },
      { kind: 'tool', id: 'f', name: 'apply_patch', input: { path: 'a.ts, b.ts', changes: [{ path: 'a.ts' }, { path: 'b.ts' }, {}] }, status: 'completed' },
      { kind: 'tool', id: 'f2', name: 'apply_patch', input: { path: '', changes: [] }, status: 'failed' },
      { kind: 'tool', id: 'f3', name: 'apply_patch', input: { path: '', changes: [] }, status: 'running' },
      { kind: 'tool', id: 'm', name: 'github.search', input: { query: 'x' }, status: 'running' },
      { kind: 'tool', id: 'm', name: 'mcp.tool', input: undefined, status: 'completed', output: 'found' },
      { kind: 'tool', id: 'm2', name: 'mcp.tool', input: undefined, status: 'failed', output: 'denied' },
      { kind: 'tool', id: 'm3', name: 'mcp.tool', input: undefined, status: 'failed' },
      { kind: 'tool', id: 'w', name: 'web_search', input: { query: 'cordis' }, status: 'running' },
      { kind: 'tool', id: 'w', name: 'web_search', input: { query: undefined }, status: 'completed' },
      { kind: 'reasoning', text: 'thinking' },
      { kind: 'break' },
      { kind: 'tool', id: 'n', name: 'image_gen', input: { prompt: 'cat' }, status: 'completed' },
      { kind: 'tool', id: '', name: 'command_execution', input: { command: '' }, status: 'running' },
    ])
  })

  it('reports Grok tools and their failures', () => {
    const decoder = new GrokDecoder()
    expect([
      { type: 'tool_call', toolCallId: 'x', title: 'write', rawInput: { file_path: 'a.ts' } },
      { type: 'tool_call_update', toolCallId: 'x', status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'denied' } }] },
      { type: 'tool_call', rawInput: null },
      { type: 'tool_call_update', toolCallId: 'y', status: 'failed', rawOutput: 'gone' },
      { type: 'tool_call_update', status: 'completed' },
      { type: 'tool_call_update', toolCallId: 'x', status: null },
      { type: 'thought' },
      { type: 'usage' },
    ].flatMap(record => decoder.accept(record))).toEqual([
      { kind: 'tool', id: 'x', name: 'write', input: { file_path: 'a.ts' }, status: 'running' },
      { kind: 'tool', id: 'x', name: 'write', status: 'failed', output: 'denied' },
      { kind: 'tool', id: 'grok-1', name: 'tool', input: null, status: 'running' },
      { kind: 'tool', id: 'y', name: 'tool', status: 'failed', output: 'gone' },
      { kind: 'tool', id: '', name: 'tool', status: 'completed' },
    ])
  })

  it('reports Antigravity thinking, failed steps, and newer step types', () => {
    const decoder = new AntigravityDecoder()
    expect([
      { event: 'init' },
      { event: 'step_update', step_update: { step_type: 'planner', thinking_delta: 'plan' } },
      { event: 'step_update', step_update: { step_index: 3, step_type: 'tool', state: 'ERROR', tool_info: { name: 'run_command', parameters: { CommandLine: 'ls' }, error: 'denied' } } },
      { event: 'step_update', step_update: { step_index: 4, step_type: 'tool', state: 'FAILED', tool_info: { error: { type: 'TOOL_ERROR', message: 'denied' } } } },
      { event: 'step_update', step_update: { step_index: 3, step_type: 'tool', state: 'DONE' } },
      { event: 'step_update', step_update: { step_type: 'subagent_reply', text: 'from a newer step', type: 'message' } },
      { event: 'step_update', step_update: { step_type: 'user_input' } },
      { event: 'result', result: { status: 'SUCCESS' } },
      { event: 'other' },
    ].flatMap(record => decoder.accept(record))).toEqual([
      { kind: 'reasoning', text: 'plan' },
      { kind: 'tool', id: 'step-3', name: 'run_command', input: { CommandLine: 'ls' }, status: 'failed', output: 'denied' },
      { kind: 'tool', id: 'step-4', name: 'tool', input: undefined, status: 'failed', output: 'denied' },
      { kind: 'tool', id: 'step-3', name: 'run_command', input: undefined, status: 'completed' },
      { kind: 'text', text: 'from a newer step' },
      { kind: 'usage', usage: { input: 0, output: 0, cacheRead: 0 } },
      { kind: 'done' },
    ])
  })

  it('reports OpenCode tools and usage and ignores other records', () => {
    const decoder = new OpenCodeDecoder()
    expect([
      { type: 'tool_use', part: { callID: 'c1', tool: 'bash', state: { status: 'error', error: 'no such file', input: { command: 'ls' } } } },
      { type: 'tool_use', part: { state: {} } },
      { type: 'text', part: {} },
      { type: 'step_start' },
      { type: 'step_finish', part: { reason: 'stop', tokens: { input: 5, output: 1 } } },
    ].flatMap(record => decoder.accept(record))).toEqual([
      { kind: 'tool', id: 'c1', name: 'bash', input: { command: 'ls' }, status: 'failed', output: 'no such file' },
      { kind: 'tool', id: 'tool', name: 'tool', input: undefined, status: 'running' },
      { kind: 'usage', usage: { input: 5, output: 1, cacheRead: 0 } },
      { kind: 'done' },
    ])
  })
})

describe('GenericDecoder', () => {
  it('reads text, thinking, tools, sessions, failures, and final answers from common field names', () => {
    const decoder = new GenericDecoder()
    expect([
      { type: 'session.created', sessionId: 's1' },
      { type: 'message.delta', delta: 'Hel' },
      { type: 'content_chunk', part: { text: 'lo' } },
      { type: 'thinking', content: [{ text: 'hmm' }] },
      { type: 'tool_started', tool_name: 'Bash', parameters: { cmd: 'ls' }, call_id: 'k' },
      { type: 'tool_progress', name: 'Bash', id: 'k', status: 'success', output: 'a.txt' },
      { kind: 'tool_result', tool: 'read', input: { path: 'x' }, status: 'error', rawOutput: [{ content: { text: 'missing' } }] },
      { type: 'tool', title: 'list', state: 'running' },
      { type: 'error', error: { text: 'quota' } },
      { type: 'error' },
      { type: 'turn.complete', result: 'Hello' },
      { type: 'heartbeat' },
      { type: 'stats', count: 3, text: 'ignored without a text tag' },
    ].flatMap(record => decoder.accept(record))).toEqual([
      { kind: 'session', id: 's1' },
      { kind: 'text', text: 'Hel' },
      { kind: 'text', text: 'lo' },
      { kind: 'reasoning', text: 'hmm' },
      { kind: 'tool', id: 'k', name: 'Bash', input: { cmd: 'ls' }, status: 'running' },
      { kind: 'tool', id: 'k', name: 'Bash', status: 'completed', output: 'a.txt' },
      { kind: 'tool', id: 'generic-0', name: 'read', input: { path: 'x' }, status: 'failed', output: 'missing' },
      { kind: 'tool', id: 'generic-1', name: 'list', status: 'running' },
      { kind: 'failure', message: 'quota' },
      { kind: 'failure', message: 'the CLI reported error' },
      { kind: 'final', text: 'Hello' },
      { kind: 'done' },
    ])
  })

  it('routes only unknown record types to field-name decoding', () => {
    const decoder = CODING_CLIS.grok.decoder()
    expect(decoder.accept({ type: 'available_commands', tools: ['read_file'] })).toEqual([])
    expect(decoder.accept({ type: 'assistant_delta', text: 'new format' })).toEqual([{ kind: 'text', text: 'new format' }])
    expect(CODING_CLIS.codex.decoder().accept({ type: 'turn.done' })).toEqual([{ kind: 'done' }])
    expect(CODING_CLIS.antigravity.decoder().accept({ event: 'final', result: { response: 'ok' } })).toEqual([{ kind: 'final', text: 'ok' }, { kind: 'done' }])
    expect(CODING_CLIS.opencode.decoder().accept({ type: 'session.error', sessionID: 's', message: 'bad' }))
      .toEqual([{ kind: 'session', id: 's' }, { kind: 'failure', message: 'bad' }])
  })

  it('bounds tool output and reads content text', () => {
    expect(boundedOutput(undefined)).toBeUndefined()
    expect(boundedOutput('')).toBeUndefined()
    expect(boundedOutput('x'.repeat(TOOL_OUTPUT_MAX_CHARS + 1))).toBe(`${'x'.repeat(TOOL_OUTPUT_MAX_CHARS)}\n… (truncated)`)
    expect(contentText(['a', { text: 'b' }, 3])).toBe('a\nb')
    expect(contentText([])).toBeUndefined()
    expect(contentText('')).toBeUndefined()
  })
})

describe('CodingCliStreamTranslator', () => {
  it('opens a new block when the block type changes and closes open blocks at a tool call', () => {
    const translator = new CodingCliStreamTranslator('codex', 'Codex')
    const chunks = [
      ...translator.accept({ kind: 'reasoning', text: 'a' }),
      ...translator.accept({ kind: 'text', text: 'b' }),
      ...translator.accept({ kind: 'text', text: 'c' }),
      ...translator.accept({ kind: 'tool', id: 't', name: 'bash', status: 'running' }),
      ...translator.accept({ kind: 'text', text: 'd' }),
      ...translator.accept({ kind: 'break' }),
      ...translator.accept({ kind: 'usage', usage: { input: 5, output: 1, cacheRead: 0 } }),
      ...translator.accept({ kind: 'done' }),
      ...translator.finish({ code: 0, stderr: '' }),
    ]
    expect(blocks(chunks)).toEqual([{ type: 'reasoning', text: 'a' }, { type: 'text', text: 'bc' }, { type: 'text', text: 'd' }])
    expect(chunks).toContainEqual({ type: 'usage', usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 } })
  })
})
