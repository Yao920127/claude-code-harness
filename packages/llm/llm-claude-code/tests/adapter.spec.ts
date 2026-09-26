import { PassThrough } from 'node:stream'
import type { ModelInfo, Options, Query, SDKMessage, SpawnOptions } from '@anthropic-ai/claude-agent-sdk'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, { createAssistantMessage, createUserMessage, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval'
import * as plugin from '../src/index.ts'
import { ClaudeCodeAdapter, type ClaudeCodeAdapterOptions } from '../src/adapter.ts'
import { replayEnvelope, type ClaudeCodeChainEntryId, type ClaudeCodeSessionId } from '../src/replay.ts'

type QueryFactory = (params: { prompt: string; options: Options }) => Query

const queryMock = vi.hoisted(() => vi.fn<QueryFactory>())

vi.mock('@anthropic-ai/claude-agent-sdk', async importOriginal => ({
  ...await importOriginal<typeof import('@anthropic-ai/claude-agent-sdk')>(),
  query: queryMock,
}))

const SESSION = 'native-session'
const CWD = '/work/project'
const agent = { id: 'agent', session: { header: { cwd: CWD } } } as Agent

interface FakeChild {
  readonly handle: SubprocessHandle
  readonly terminate: Mock<SubprocessHandle['terminate']>
  readonly waitForExit: Mock<SubprocessHandle['waitForExit']>
}

function fakeChild(): FakeChild {
  const terminate = vi.fn<SubprocessHandle['terminate']>()
  const waitForExit = vi.fn<SubprocessHandle['waitForExit']>(() => Promise.resolve(true))
  const handle: SubprocessHandle = {
    control: undefined,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: undefined,
    collected: {},
    done: new Promise<SubprocessOutcome>(() => {}),
    terminate,
    waitForExit,
  }
  return { handle, terminate, waitForExit }
}

/** A Query that spawns through the options hook, then yields the scripted messages. */
function scriptedQuery(messages: SDKMessage[], spawnOptions: SpawnOptions, fail?: Error): QueryFactory {
  return ({ options }) => {
    options.spawnClaudeCodeProcess?.(spawnOptions)
    const close = vi.fn()
    async function* iterate(): AsyncGenerator<SDKMessage, void> {
      for (const message of messages) yield message
      if (fail !== undefined) throw fail
    }
    return Object.assign(iterate(), { close }) as Pick<Query, 'close'> & AsyncGenerator<SDKMessage, void> as Query
  }
}

/** A Query that answers `supportedModels()` after spawning, or rejects with `fail`. */
function discoveryQuery(models: ModelInfo[], fail?: Error): QueryFactory {
  return ({ options }) => {
    options.spawnClaudeCodeProcess?.(spawnOptions)
    return {
      close: vi.fn(),
      supportedModels: () => fail === undefined ? Promise.resolve(models) : Promise.reject(fail),
    } as Pick<Query, 'close' | 'supportedModels'> as Query
  }
}

// Partial ModelInfo fixtures carry only the fields discovery reads.
const accountModels: ModelInfo[] = [
  { value: 'default', resolvedModel: 'claude-sonnet-5', displayName: 'Default (recommended)', description: 'Sonnet 5 · Efficient for routine tasks' },
  { value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: 'Sonnet 5 · Efficient for routine tasks' },
  { value: 'claude-fable-5-1[1m]', resolvedModel: 'claude-fable-5-1', displayName: 'Fable', description: 'Fable 5.1 · Most capable · Requires usage credits' },
  { value: 'haiku', displayName: 'Haiku', description: 'Haiku' },
] as never

const spawnOptions: SpawnOptions = { command: '/bin/claude', args: ['--x'], cwd: CWD, env: {}, signal: new AbortController().signal }

// Partial SDK fixtures carry only the fields the translator reads.
const turn: SDKMessage[] = [
  { type: 'assistant', message: { content: [] }, parent_tool_use_id: null, uuid: 'entry-1', session_id: SESSION } as never,
  { type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: SESSION } as never,
]

function adapter(overrides: Partial<ClaudeCodeAdapterOptions> = {}, configuredModels = true) {
  const child = fakeChild()
  const spawn = vi.fn((_spec: SubprocessSpawnSpec) => child.handle)
  const options: ClaudeCodeAdapterOptions = {
    provider: 'claude-code',
    displayName: 'Claude Code',
    ...configuredModels ? { models: [{ id: 'default', name: 'Claude Code', description: 'native' }, { id: 'opus', name: 'Opus' }] } : {},
    permissionMode: 'default',
    env: { EXTRA: '1' },
    disposeGraceMs: 1_000,
    retryPolicy: resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'test'),
    spawn,
    discoveryCwd: '/home/user',
    onDiscoveryError: vi.fn(),
    approval: () => undefined,
    initiator: () => agent,
    sessionCwd: () => CWD,
    ...overrides,
  }
  return { adapter: new ClaudeCodeAdapter(options), child, spawn, options }
}

function request(extra: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'claude-code',
    model: 'default',
    messages: [createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } })],
    ...extra,
  }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function lastOptions(): Options {
  const call = queryMock.mock.calls.at(-1)
  if (call === undefined) throw new Error('query was not called')
  return call[0].options
}

afterEach(() => {
  queryMock.mockReset()
})

describe('ClaudeCodeAdapter metadata', () => {
  it('describes the route, its models, and its retry policy', async () => {
    const { adapter: route } = adapter()
    expect(route.providerInfo('claude-code')).toEqual({ id: 'claude-code', name: 'Claude Code' })
    expect(route.providerRetryPolicy()).toMatchObject({ mode: 'normal', maxRetries: 0 })
    await expect(route.listModels('claude-code')).resolves.toEqual([
      { provider: 'claude-code', id: 'default', name: 'Claude Code', description: 'native', inputModalities: ['text'] },
      { provider: 'claude-code', id: 'opus', name: 'Opus', inputModalities: ['text'] },
    ])
    await expect(route.resolveModel('claude-code', 'opus')).resolves.toEqual({
      provider: 'claude-code', id: 'opus', name: 'Opus', inputModalities: ['text'],
    })
    await expect(route.resolveModel('claude-code', 'claude-x')).resolves.toMatchObject({ name: 'claude-x' })
  })
})

describe('ClaudeCodeAdapter model discovery', () => {
  it('lists the account models once, naming the native default and dropping its duplicate alias', async () => {
    const { adapter: route, child, spawn } = adapter({}, false)
    queryMock.mockImplementation(discoveryQuery(accountModels))
    await expect(route.resolveModel('claude-code', 'default')).resolves.toMatchObject({ name: 'default' })
    const listed = await route.listModels('claude-code')
    expect(listed.map(model => [model.id, model.name, model.description])).toEqual([
      ['default', 'Claude Sonnet 5 (default)', 'Efficient for routine tasks'],
      ['claude-fable-5-1[1m]', 'Claude Fable 5.1', 'Most capable · Requires usage credits'],
      ['haiku', 'Claude Haiku', undefined],
    ])
    await route.listModels('claude-code')
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(lastOptions()).toMatchObject({ cwd: '/home/user', persistSession: false })
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(child.terminate).toHaveBeenCalled()
    await expect(route.resolveModel('claude-code', 'claude-fable-5-1[1m]')).resolves.toMatchObject({ name: 'Claude Fable 5.1' })
  })

  it('offers only the native default after a failure and retries on the next read', async () => {
    const { adapter: route, options, spawn } = adapter({}, false)
    // This double fails before the SDK spawns a process.
    queryMock.mockImplementation(() => ({ close: vi.fn(), supportedModels: () => Promise.reject(new Error('not signed in')) }) as never)
    await expect(route.listModels('claude-code')).resolves.toEqual([
      { provider: 'claude-code', id: 'default', name: 'Claude Code', inputModalities: ['text'] },
    ])
    expect(options.onDiscoveryError).toHaveBeenCalledWith(expect.objectContaining({ message: 'not signed in' }))
    expect(spawn).not.toHaveBeenCalled()

    queryMock.mockImplementation(() => { throw 'spawn refused' })
    await route.listModels('claude-code')
    expect(options.onDiscoveryError).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'spawn refused' }))

    queryMock.mockImplementation(discoveryQuery(accountModels))
    await expect(route.listModels('claude-code')).resolves.toHaveLength(3)
  })
})

describe('ClaudeCodeAdapter.stream', () => {
  it('runs one native turn in the Session workspace and releases the process', async () => {
    const { adapter: route, child, spawn } = adapter()
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    const chunks = await collect(route.stream(request({ sessionId: 's' as SessionId })))
    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      reason: { kind: 'stop' },
      replayState: { response: { kind: 'claude-code', version: 1, sessionId: SESSION, resumeAt: 'entry-1' } },
    })
    const call = queryMock.mock.calls[0]?.[0]
    expect(call?.prompt).toBe('hello')
    const options = lastOptions()
    expect(options).toMatchObject({
      cwd: CWD,
      includePartialMessages: true,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      disallowedTools: ['AskUserQuestion'],
      permissionMode: 'default',
    })
    expect(options.env).toMatchObject({ EXTRA: '1' })
    expect(options).not.toHaveProperty('model')
    expect(options).not.toHaveProperty('resume')
    expect(options).not.toHaveProperty('allowDangerouslySkipPermissions')
    expect(typeof options.canUseTool).toBe('function')
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ argv: ['/bin/claude', '--x'], cwd: CWD, graceMs: 1_000 }))
    expect(child.terminate).toHaveBeenCalled()
    expect(child.waitForExit).toHaveBeenCalled()
  })

  it('passes the model and resume cursor and keeps Claude Code\'s own system prompt', async () => {
    const { adapter: route } = adapter()
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request({
      model: 'opus',
      system: 'Be brief.',
      messages: [
        createUserMessage({ content: [{ type: 'text', text: 'one' }], source: { kind: 'user' } }),
        createAssistantMessage({
          content: [{ type: 'text', text: 'first' }],
          source: {
            provider: 'claude-code', model: 'opus',
            replayState: replayEnvelope('prior' as ClaudeCodeSessionId, 'cursor' as ClaudeCodeChainEntryId),
          },
        }),
        createUserMessage({ content: [{ type: 'text', text: 'two' }], source: { kind: 'user' } }),
      ],
    })))
    expect(lastOptions()).toMatchObject({
      model: 'opus',
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      resume: 'prior',
      resumeSessionAt: 'cursor',
    })
    expect(lastOptions().systemPrompt).not.toHaveProperty('append')
  })

  it('runs an auxiliary call without tools or a persisted transcript', async () => {
    const { adapter: route } = adapter()
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request({ purpose: 'session-title', maxTokens: 20, system: 'Title it.' })))
    expect(lastOptions()).toMatchObject({
      tools: [], maxTurns: 1, persistSession: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Title it.' },
    })
  })

  it('skips every permission check only in bypass mode', async () => {
    const { adapter: route } = adapter({ permissionMode: 'bypassPermissions' })
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request()))
    expect(lastOptions()).toMatchObject({ permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true })
    expect(lastOptions()).not.toHaveProperty('canUseTool')
  })

  it('asks the approval service through the native permission callback', async () => {
    const approvalRequest = vi.fn(() => Promise.resolve('allowed-once' as const))
    const approval = { request: approvalRequest } as Pick<ApprovalService, 'request'> as ApprovalService
    const { adapter: route } = adapter({ approval: () => approval })
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request()))
    const signal = new AbortController().signal
    await expect(lastOptions().canUseTool?.('Bash', { command: 'ls' }, { signal, toolUseID: 't', requestId: 'r' }))
      .resolves.toMatchObject({ behavior: 'allow' })
    expect(approvalRequest).toHaveBeenCalledWith(expect.objectContaining({ agent, toolName: 'Bash' }))
  })

  it('uses the initiating Agent workspace when the request names no Session', async () => {
    const sessionCwd = vi.fn(() => '/elsewhere')
    const { adapter: route } = adapter({ sessionCwd })
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request()))
    expect(lastOptions().cwd).toBe(CWD)
    expect(sessionCwd).not.toHaveBeenCalled()
  })

  it('refuses a turn with no workspace before starting Claude Code', async () => {
    const { adapter: route } = adapter({ sessionCwd: () => undefined, initiator: () => undefined })
    await expect(collect(route.stream(request({ sessionId: 's' as SessionId })))).rejects.toMatchObject({ code: 'NO_WORKSPACE' })
    await expect(collect(route.stream(request()))).rejects.toMatchObject({ code: 'NO_WORKSPACE' })
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('wraps a process failure and still releases the process', async () => {
    const { adapter: route, child } = adapter()
    queryMock.mockImplementation(scriptedQuery([], spawnOptions, new Error('exited 1')))
    const failure = collect(route.stream(request()))
    await expect(failure).rejects.toBeInstanceOf(LlmError)
    await expect(failure).rejects.toMatchObject({ code: 'CLAUDE_CODE_PROCESS' })
    await expect(failure).rejects.toThrow('exited 1')
    expect(child.terminate).toHaveBeenCalled()
  })

  it('wraps a non-Error rejection and rethrows adapter errors unchanged', async () => {
    const { adapter: route } = adapter()
    queryMock.mockImplementation(() => { throw 'text failure' })
    await expect(collect(route.stream(request()))).rejects.toThrow('text failure')
    queryMock.mockImplementation(() => { throw new LlmError('refused', 'CUSTOM') })
    await expect(collect(route.stream(request()))).rejects.toMatchObject({ code: 'CUSTOM' })
  })

  it('propagates request cancellation to the native turn', async () => {
    const { adapter: route } = adapter()
    const controller = new AbortController()
    let nativeSignal: AbortSignal | undefined
    queryMock.mockImplementation((params) => {
      nativeSignal = params.options.abortController?.signal
      return scriptedQuery(turn, spawnOptions)(params)
    })
    const pending = collect(route.stream(request({ signal: controller.signal })))
    controller.abort(new Error('stop'))
    await pending
    expect(nativeSignal?.aborted).toBe(true)

    const aborted = new AbortController()
    aborted.abort()
    await collect(route.stream(request({ signal: aborted.signal })))
    expect(nativeSignal?.aborted).toBe(true)
  })
})

describe('llm-claude-code plugin', () => {
  const spawn = vi.fn(() => fakeChild().handle)

  async function host() {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    // Partial service doubles expose only the members the route calls.
    ctx.provide('subprocess', { spawn } as never)
    ctx.provide('sessions', { get: () => ({ header: { cwd: CWD } }) } as never)
    ctx.provide('agents', { currentInitiator: () => agent } as never)
    return ctx
  }

  it('registers the default route with no retries and removes it on unload', async () => {
    const ctx = await host()
    const fiber = await ctx.plugin(plugin, plugin.Config({}))
    expect(ctx.llm.listProviders()).toEqual([{ id: 'claude-code', name: 'Claude Code' }])
    queryMock.mockImplementation(discoveryQuery([], new Error('offline')))
    await expect(ctx.llm.listModels('claude-code')).resolves.toHaveLength(1)
    await fiber.dispose()
    expect(ctx.llm.listProviders()).toEqual([])
  })

  it('runs a turn through the host LLM service in the Session workspace', async () => {
    const ctx = await host()
    await ctx.plugin(plugin, plugin.Config({}))
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    const chunks = await collect(ctx.llm.stream(request({ sessionId: 's' as SessionId })))
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(lastOptions().cwd).toBe(CWD)
    expect(spawn).toHaveBeenCalled()
  })

  it('refuses an unusable disposal grace and serves configured models without discovery', async () => {
    const ctx = await host()
    expect(() => { plugin.apply(ctx, plugin.Config({ disposeGraceMs: 0 })) }).toThrow('disposeGraceMs')
    await ctx.plugin(plugin, plugin.Config({ models: [{ id: 'opus', name: 'Opus' }] }))
    await expect(ctx.llm.listModels('claude-code')).resolves.toEqual([
      { provider: 'claude-code', id: 'opus', name: 'Opus', inputModalities: ['text'] },
    ])
    expect(queryMock).not.toHaveBeenCalled()
  })
})
