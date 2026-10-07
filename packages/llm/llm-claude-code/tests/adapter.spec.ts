import { PassThrough } from 'node:stream'
import type { ModelInfo, Options, Query, SDKMessage, SdkMcpToolDefinition, SpawnOptions } from '@anthropic-ai/claude-agent-sdk'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, { createAssistantMessage, createUserMessage, LlmError, ReasoningEffortId, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
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
  // The double keeps the tool definitions reachable so a spec can call them.
  createSdkMcpServer: (options: { name: string; tools: SdkMcpToolDefinition[] }) => ({ type: 'sdk', name: options.name, instance: options }),
}))

/**
 * Call the app browser tool registered on the last query, as Claude Code would.
 * @param url - tool input.
 * @returns the tool result.
 */
async function callBrowserTool(url: string): Promise<unknown> {
  const server = lastOptions().mcpServers?.app_browser as { instance: { tools: SdkMcpToolDefinition[] } } | undefined
  const definition = server?.instance.tools[0]
  if (definition === undefined) throw new Error('the browser tool was not offered')
  return await definition.handler({ url }, undefined)
}

const SESSION = 'native-session'
const CWD = '/work/project'
const session = { id: 'session-1', header: { cwd: CWD } } as Session
const agent = { id: 'agent', session } as Agent

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
  {
    value: 'default', resolvedModel: 'claude-sonnet-5', displayName: 'Default (recommended)', description: 'Sonnet 5 · Efficient for routine tasks',
    supportsEffort: true, supportedEffortLevels: ['max', 'low', 'medium', 'high', 'xhigh'],
  },
  {
    value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet', description: 'Sonnet 5 · Efficient for routine tasks',
    supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high'],
  },
  {
    value: 'claude-fable-5-1[1m]', resolvedModel: 'claude-fable-5-1', displayName: 'Fable', description: 'Fable 5.1 · Most capable · Requires usage credits',
    supportsEffort: false, supportedEffortLevels: ['high'],
  },
  { value: 'haiku', displayName: 'Haiku', description: 'Haiku', supportedEffortLevels: ['low', 'max'] },
  // Newer Claude Code names the model in displayName and keeps only notes in description.
  { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5', description: 'For complex work and everyday tasks' },
  { value: 'claude-opus-5', resolvedModel: 'claude-opus-5', displayName: 'Opus 5', description: '' },
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
    permissionMode: 'session',
    env: { EXTRA: '1' },
    disposeGraceMs: 1_000,
    retryPolicy: resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'test'),
    spawn,
    discoveryCwd: '/home/user',
    onDiscoveryError: vi.fn(),
    approval: () => undefined,
    initiator: () => agent,
    session: () => session,
    sessionPermissions: () => undefined,
    appBrowser: () => undefined,
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
  it('lists every account model once, labeling the native default by the settings that choose it', async () => {
    const { adapter: route, child, spawn } = adapter({}, false)
    queryMock.mockImplementation(discoveryQuery(accountModels))
    await expect(route.resolveModel('claude-code', 'default')).resolves.toMatchObject({ name: 'Claude (Claude Code settings)' })
    const listed = await route.listModels('claude-code')
    expect(listed.map(model => [model.id, model.name, model.description])).toEqual([
      ['default', 'Claude (Claude Code settings)', 'The model your Claude Code settings select; Sonnet 5 without a setting'],
      ['sonnet', 'Claude Sonnet 5', 'Efficient for routine tasks'],
      ['claude-fable-5-1[1m]', 'Claude Fable 5.1', 'Most capable · Requires usage credits'],
      ['haiku', 'Claude Haiku', 'Haiku'],
      ['opus', 'Claude Opus 5.5', 'For complex work and everyday tasks'],
      ['claude-opus-5', 'Claude Opus 5', undefined],
    ])
    await route.listModels('claude-code')
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(lastOptions()).toMatchObject({ cwd: '/home/user', persistSession: false })
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(child.terminate).toHaveBeenCalled()
    await expect(route.resolveModel('claude-code', 'claude-fable-5-1[1m]')).resolves.toMatchObject({ name: 'Claude Fable 5.1' })
  })

  it('offers each model the effort levels Claude Code reports, ascending, defaulting to high', async () => {
    const { adapter: route } = adapter({}, false)
    queryMock.mockImplementation(discoveryQuery(accountModels))
    const efforts = async (model: string) => {
      const resolved = await route.resolveModel('claude-code', model)
      return resolved.reasoning === undefined
        ? undefined
        : {
          ids: resolved.reasoning.efforts.map(effort => effort.id),
          names: resolved.reasoning.efforts.map(effort => effort.name),
          defaultEffort: resolved.reasoning.defaultEffort,
        }
    }
    await expect(efforts('default')).resolves.toEqual({
      ids: ['low', 'medium', 'high', 'xhigh', 'max'],
      names: ['Low', 'Medium', 'High', 'Extra high', 'Max'],
      defaultEffort: 'high',
    })
    await expect(efforts('sonnet')).resolves.toMatchObject({ ids: ['low', 'medium', 'high'], defaultEffort: 'high' })
    // A model that takes no effort setting, or offers no high, gets no choice or no default.
    await expect(efforts('claude-fable-5-1[1m]')).resolves.toBeUndefined()
    await expect(efforts('haiku')).resolves.toEqual({ ids: ['low', 'max'], names: ['Low', 'Max'], defaultEffort: undefined })
    await expect(efforts('unlisted')).resolves.toBeUndefined()
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
    await expect(route.listModels('claude-code')).resolves.toHaveLength(6)
  })
})

describe('ClaudeCodeAdapter control requests', () => {
  function controlQuery(answers: Partial<Pick<Query, 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET'>>): QueryFactory {
    return ({ options }) => {
      options.spawnClaudeCodeProcess?.(spawnOptions)
      return { close: vi.fn(), ...answers } as Pick<Query, 'close'> as Query
    }
  }

  it('reads plan usage without the transcript scan from the discovery directory', async () => {
    const h = adapter()
    const answer = { rate_limits_available: false, rate_limits: null, subscription_type: null }
    const usage = vi.fn(() => Promise.resolve(answer))
    queryMock.mockImplementation(controlQuery({ usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: usage as never }))
    await expect(h.adapter.usage()).resolves.toBe(answer)
    expect(usage).toHaveBeenCalledWith({ skipBehaviors: true })
    expect(lastOptions()).toMatchObject({ cwd: '/home/user', persistSession: false })
    expect(h.child.terminate).toHaveBeenCalledOnce()
    expect(h.child.waitForExit).toHaveBeenCalledOnce()
  })

  it('releases nothing when the process never spawned', async () => {
    const h = adapter()
    queryMock.mockImplementation(() => ({
      close: vi.fn(),
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: () => Promise.reject(new Error('no binary')),
    }) as never)
    await expect(h.adapter.usage()).rejects.toThrow('no binary')
    expect(h.child.terminate).not.toHaveBeenCalled()
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
    expect(lastOptions()).not.toHaveProperty('effort')
  })

  it('passes the requested effort level to Claude Code', async () => {
    const { adapter: route } = adapter()
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request({ reasoningEffort: ReasoningEffortId('max') })))
    expect(lastOptions()).toMatchObject({ effort: 'max' })
  })

  it('runs the configured Claude Code executable for turns and control requests', async () => {
    const { adapter: route } = adapter({ executable: '/opt/homebrew/bin/claude' }, false)
    queryMock.mockImplementation(discoveryQuery(accountModels))
    await route.listModels('claude-code')
    expect(lastOptions()).toMatchObject({ pathToClaudeCodeExecutable: '/opt/homebrew/bin/claude' })
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request()))
    expect(lastOptions()).toMatchObject({ pathToClaudeCodeExecutable: '/opt/homebrew/bin/claude' })
  })

  it('offers the app browser tool to conversation turns only, opening tabs in the turn\'s Session', async () => {
    const open = vi.fn((_session: Session, _url: string) => 1)
    const { adapter: route } = adapter({ appBrowser: () => open })
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request()))
    const options = lastOptions()
    expect(options.mcpServers?.app_browser).toMatchObject({ type: 'sdk', name: 'app_browser' })
    const signal = new AbortController().signal
    await expect(options.canUseTool?.('mcp__app_browser__open_browser_tab', { url: 'https://example.com' }, { signal, toolUseID: 't', requestId: 'r' }))
      .resolves.toEqual({ behavior: 'allow', updatedInput: { url: 'https://example.com' } })
    await expect(callBrowserTool('http://localhost:8501')).resolves.toMatchObject({
      content: [{ text: 'Opened http://localhost:8501/ in a new browser tab in the app.' }],
    })
    expect(open).toHaveBeenCalledWith(session, 'http://localhost:8501/')
    await collect(route.stream(request({ purpose: 'session-title', maxTokens: 20 })))
    expect(lastOptions()).not.toHaveProperty('mcpServers')
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

  it('derives the native mode from the permissions of the Session the request names', async () => {
    const named = { header: { cwd: '/named' } } as Session
    const sessionPermissions = vi.fn(() => ({ sandbox: 'danger-full-access' as const, approval: 'never' as const }))
    const { adapter: route } = adapter({ session: () => named, sessionPermissions })
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request({ sessionId: 's' as SessionId })))
    expect(sessionPermissions).toHaveBeenCalledWith(named)
    expect(lastOptions()).toMatchObject({ cwd: '/named', permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true })
    expect(lastOptions()).not.toHaveProperty('canUseTool')

    sessionPermissions.mockReturnValue({ sandbox: 'workspace-write', approval: 'ask' } as never)
    await collect(route.stream(request({ sessionId: 's' as SessionId })))
    expect(lastOptions()).toMatchObject({ permissionMode: 'acceptEdits' })
    expect(typeof lastOptions().canUseTool).toBe('function')
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
    const lookup = vi.fn(() => ({ header: { cwd: '/elsewhere' } }) as Session)
    const { adapter: route } = adapter({ session: lookup })
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(route.stream(request()))
    expect(lastOptions().cwd).toBe(CWD)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('refuses a turn with no workspace before starting Claude Code', async () => {
    const { adapter: route } = adapter({ session: () => undefined, initiator: () => undefined })
    await expect(collect(route.stream(request({ sessionId: 's' as SessionId })))).rejects.toMatchObject({ code: 'NO_WORKSPACE' })
    await expect(collect(route.stream(request()))).rejects.toMatchObject({ code: 'NO_WORKSPACE' })
    const cwdless = adapter({ session: () => ({ header: {} }) as Session }).adapter
    await expect(collect(cwdless.stream(request({ sessionId: 's' as SessionId })))).rejects.toMatchObject({ code: 'NO_WORKSPACE' })
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
    ctx.provide('sessions', { get: () => session } as never)
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
    expect(lastOptions()).toMatchObject({ cwd: CWD, permissionMode: 'default' })
    expect(lastOptions()).not.toHaveProperty('mcpServers')
    expect(spawn).toHaveBeenCalled()
  })

  it('opens pages through the app Browser channel when it is mounted', async () => {
    const ctx = await host()
    const open = vi.fn(() => 2)
    ctx.provide('sidebarBrowser', { open } as never)
    await ctx.plugin(plugin, plugin.Config({}))
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(ctx.llm.stream(request({ sessionId: 's' as SessionId })))
    await callBrowserTool('https://example.com')
    expect(open).toHaveBeenCalledWith('session-1', 'https://example.com/')
  })

  it('follows the Session\'s sandbox mode and approval policy when both services are mounted', async () => {
    const ctx = await host()
    const resolve = vi.fn(() => ({ mode: 'danger-full-access', workspaceRoot: CWD }))
    const effectivePolicy = vi.fn(() => 'never')
    ctx.provide('sandboxPolicy', { resolve } as never)
    ctx.provide('approval', { effectivePolicy } as never)
    await ctx.plugin(plugin, plugin.Config({}))
    queryMock.mockImplementation(scriptedQuery(turn, spawnOptions))
    await collect(ctx.llm.stream(request({ sessionId: 's' as SessionId })))
    expect(resolve).toHaveBeenCalledWith({ session })
    expect(effectivePolicy).toHaveBeenCalledWith(session)
    expect(lastOptions()).toMatchObject({ permissionMode: 'bypassPermissions' })
  })

  it('serves plan usage', async () => {
    const ctx = await host()
    await ctx.plugin(plugin, plugin.Config({}))
    queryMock.mockImplementation(({ options }) => {
      options.spawnClaudeCodeProcess?.(spawnOptions)
      return {
        close: vi.fn(),
        usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: () =>
          Promise.resolve({ rate_limits_available: false, rate_limits: null, subscription_type: null }),
      } as never
    })
    await expect(ctx.claudeCodeUsage.get(false)).resolves.toMatchObject({ available: false, windows: [] })
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

  it('serves configured effort levels and refuses an executable that is not an existing absolute path', async () => {
    const ctx = await host()
    expect(() => { plugin.apply(ctx, plugin.Config({ executable: 'claude' })) }).toThrow('executable must be an absolute path')
    expect(() => { plugin.apply(ctx, plugin.Config({ executable: '/no/such/claude' })) }).toThrow('executable must be an absolute path')
    await ctx.plugin(plugin, plugin.Config({
      executable: process.execPath,
      models: [{ id: 'opus', name: 'Opus', efforts: ['high', 'max'] }, { id: 'plain', name: 'Plain', efforts: [] }],
    }))
    const resolved = await ctx.llm.resolveModelInfo('claude-code', 'opus')
    expect(resolved.reasoning?.efforts.map(effort => effort.id)).toEqual(['high', 'max'])
    await expect(ctx.llm.resolveModelInfo('claude-code', 'plain')).resolves.not.toHaveProperty('reasoning')
    expect(queryMock).not.toHaveBeenCalled()
  })
})
