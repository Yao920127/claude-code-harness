import { existsSync, readFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import LlmRuntime, { createAssistantMessage, createUserMessage, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import * as plugin from '../src/index.ts'
import { CodingCliAdapter, type CodingCliAdapterOptions } from '../src/adapter.ts'
import { CODING_CLIS, GROK_IMAGE_MAX_BYTES } from '../src/clis.ts'
import { replayEnvelope, type CodingCliConversationId } from '../src/replay.ts'

const CWD = '/work/project'
const appended: { type: string; data: unknown }[] = []
const session = {
  id: 'session-1', header: { cwd: CWD },
  append: (type: string, data: unknown) => { appended.push({ type, data }) },
} as never as Session
const agent = { id: 'agent', session } as Agent

interface ChildScript {
  readonly stdout?: string
  readonly stderr?: string
  readonly exitCode?: number | null
}

/** A finished child that printed `stdout` and exited with `exitCode`. */
function scriptedChild(script: ChildScript) {
  const stdout = new PassThrough()
  stdout.end(script.stdout ?? '')
  const text = script.stdout ?? ''
  const terminate = vi.fn()
  const handle: SubprocessHandle = {
    control: undefined,
    stdin: undefined,
    stdout,
    stderr: undefined,
    collected: {
      stdout: { readFrom: () => ({ text, nextOffset: text.length, lossy: false }) },
      stderr: { readFrom: () => ({ text: script.stderr ?? '', nextOffset: 0, lossy: false }) },
    },
    done: Promise.resolve<SubprocessOutcome>({ exitCode: script.exitCode === undefined ? 0 : script.exitCode, signal: null }),
    terminate,
    waitForExit: vi.fn(() => Promise.resolve(true)),
  }
  return { handle, terminate }
}

function adapter(scripts: ChildScript[], overrides: Partial<CodingCliAdapterOptions> = {}) {
  const children = scripts.map(scriptedChild)
  let next = 0
  const spawn = vi.fn((_spec: SubprocessSpawnSpec) => (children[next++] ?? scriptedChild({})).handle)
  let now = 0
  const options: CodingCliAdapterOptions = {
    provider: 'codex',
    cli: 'codex',
    definition: CODING_CLIS.codex,
    displayName: 'Codex',
    executable: () => '/bin/codex',
    env: executable => ({ PATH: `${executable}-dir` }),
    discoveryCwd: '/home/me',
    discoveryTimeoutMs: 1_000,
    discoveryMaxBytes: 1_000_000,
    modelsFreshMs: 100,
    onDiscoveryError: vi.fn(),
    access: 'session',
    defaultEffort: 'medium',
    disposeGraceMs: 1_000,
    retryPolicy: resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'test'),
    spawn,
    initiator: () => agent,
    session: () => session,
    attachments: () => undefined,
    sessionPermissions: () => ({ sandbox: 'workspace-write', approval: 'ask' }),
    now: () => now,
    ...overrides,
  }
  return { adapter: new CodingCliAdapter(options), spawn, options, children, advance: (ms: number) => { now += ms } }
}

const codexCatalog = readFileSync(new URL('fixtures/codex-models.json', import.meta.url), 'utf8')
const codexTurn = readFileSync(new URL('fixtures/codex-turn.jsonl', import.meta.url), 'utf8')

function request(extra: Partial<GenerateOptions> = {}): GenerateOptions {
  return { provider: 'codex', model: 'gpt-6-luna', messages: [createUserMessage({ content: [{ type: 'text', text: 'read a.txt' }], source: { kind: 'user' } })], ...extra }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('CodingCliAdapter models', () => {
  it('lists the CLI-settings entry and the models the CLI reports, then reuses the list while it is fresh', async () => {
    const { adapter: route, spawn, advance } = adapter([{ stdout: codexCatalog }, { stdout: '{"models":[]}' }])
    const models = await route.listModels('codex')
    expect(models.map(model => model.id)).toEqual(['default', 'gpt-6-luna', 'gpt-5.6-terra', 'gpt-5.6-luna', 'claude/claude-haiku-5-5'])
    expect(models[0]).toEqual({ provider: 'codex', id: 'default', name: 'Codex (CLI settings)', inputModalities: ['text', 'image'] })
    expect(spawn.mock.calls[0]?.[0]).toMatchObject({ argv: ['/bin/codex', 'debug', 'models'], cwd: '/home/me', env: { PATH: '/bin/codex-dir' } })
    await expect(route.resolveModel('codex', 'gpt-6-luna')).resolves.toMatchObject({
      name: 'GPT-6-Luna', reasoning: { defaultEffort: 'medium' },
    })
    await expect(route.resolveModel('codex', 'unknown')).resolves.toEqual({ provider: 'codex', id: 'unknown', name: 'unknown', inputModalities: ['text', 'image'] })
    expect(spawn).toHaveBeenCalledTimes(1)
    advance(100)
    await expect(route.listModels('codex')).resolves.toHaveLength(1)
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('offers only the CLI-settings entry when listing fails, and asks again on the next read', async () => {
    const { adapter: route, options, spawn } = adapter([{ exitCode: 1, stderr: 'not signed in' }, { exitCode: 0, stdout: 'x', stderr: '' }])
    await expect(route.listModels('codex')).resolves.toHaveLength(1)
    expect(options.onDiscoveryError).toHaveBeenCalledWith(new Error('listing Codex models failed (exit 1): not signed in'))
    await expect(route.listModels('codex')).resolves.toHaveLength(1)
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(vi.mocked(options.onDiscoveryError).mock.calls[1]?.[0].message).toMatch(/JSON/u)
  })

  it('reports a listing without output or a non-Error failure', async () => {
    const { adapter: route, options } = adapter([{ exitCode: 2 }], { definition: { ...CODING_CLIS.codex, parseModels: () => { throw 'bad' as never } } })
    await route.listModels('codex')
    expect(options.onDiscoveryError).toHaveBeenCalledWith(new Error('listing Codex models failed (exit 2)'))
    const thrown = adapter([{}], { definition: { ...CODING_CLIS.codex, parseModels: () => { throw 'bad' as never } } })
    await thrown.adapter.listModels('codex')
    expect(thrown.options.onDiscoveryError).toHaveBeenCalledWith(new Error('bad'))
  })

  it('reports a failed listing without error output, and keeps a newer listing when an older one fails', async () => {
    let fail!: () => void
    const pending: SubprocessHandle = {
      ...scriptedChild({}).handle,
      collected: {},
      done: new Promise<SubprocessOutcome>((resolve) => { fail = () => { resolve({ exitCode: 1, signal: null }) } }),
    }
    const { adapter: route, options, advance } = adapter([], {
      spawn: vi.fn().mockReturnValueOnce(pending).mockReturnValue(scriptedChild({ stdout: codexCatalog }).handle),
    })
    const first = route.listModels('codex')
    advance(100)
    await expect(route.listModels('codex')).resolves.toHaveLength(5)
    fail()
    await expect(first).resolves.toHaveLength(1)
    expect(options.onDiscoveryError).toHaveBeenCalledWith(new Error('listing Codex models failed (exit 1)'))
    await expect(route.listModels('codex')).resolves.toHaveLength(5)
  })

  it('reports a listing that timed out', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort())
    const { adapter: route, options } = adapter([{ stdout: codexCatalog }])
    await route.listModels('codex')
    expect(options.onDiscoveryError).toHaveBeenCalledWith(new Error('listing Codex models timed out'))
    timeout.mockRestore()
  })

  it('lists only the CLI-settings entry when the CLI is not installed, and serves configured models', async () => {
    const missing = adapter([], { executable: () => undefined })
    await expect(missing.adapter.listModels('codex')).resolves.toHaveLength(1)
    expect(missing.spawn).not.toHaveBeenCalled()
    const configured = adapter([], { models: [{ id: 'm', name: 'M', description: 'd' }] })
    await expect(configured.adapter.listModels('codex')).resolves.toEqual([{ provider: 'codex', id: 'm', name: 'M', description: 'd', inputModalities: ['text', 'image'] }])
    expect(configured.adapter.providerInfo('codex')).toEqual({ id: 'codex', name: 'Codex' })
    expect(configured.adapter.providerRetryPolicy()).toMatchObject({ maxRetries: 0 })
  })
})

describe('CodingCliAdapter turns', () => {
  it('runs one headless turn in the Session workspace and streams its output', async () => {
    const { adapter: route, spawn, children } = adapter([{ stdout: `banner\n{broken\n${codexTurn}` }])
    const chunks = await collect(route.stream(request({ reasoningEffort: 'low' as never })))
    expect(spawn.mock.calls[0]?.[0]).toMatchObject({
      argv: ['/bin/codex', 'exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--model', 'gpt-6-luna', '--config', 'model_reasoning_effort="low"', '-'],
      cwd: CWD,
      env: { PATH: '/bin/codex-dir', PWD: CWD },
      stdio: { stdin: { data: 'read a.txt' }, stdout: 'pipe' },
    })
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(children[0]?.terminate).toHaveBeenCalled()
  })

  it('continues the CLI conversation and leaves the model to the CLI settings', async () => {
    const { adapter: route, spawn } = adapter([{ stdout: codexTurn }])
    const previous = createAssistantMessage({ content: [{ type: 'text', text: 'hi' }], source: { provider: 'codex', model: 'default', replayState: replayEnvelope('codex', 't1' as CodingCliConversationId) } })
    await collect(route.stream(request({ model: 'default', sessionId: 's' as SessionId, messages: [...request().messages, previous, ...request().messages] })))
    expect(spawn.mock.calls[0]?.[0].argv).toEqual(['/bin/codex', 'exec', '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', 'resume', 't1', '-'])
  })

  it('records each reported tool state as a coding-cli/tool event in harness terms', async () => {
    appended.length = 0
    const { adapter: route } = adapter([{ stdout: codexTurn }])
    await collect(route.stream(request()))
    expect(appended.map(event => event.type)).toEqual(['coding-cli/tool', 'coding-cli/tool'])
    const [started, settled] = appended.map(event => event.data as Record<string, unknown>)
    expect(started).toMatchObject({ provider: 'codex', name: 'bash', arguments: '{"command":"cat a.txt"}', status: 'running' })
    expect(settled).toMatchObject({ name: 'bash', status: 'completed', output: 'hello\n' })
    expect(settled?.callId).toBe(started?.callId)
    expect(String(started?.callId)).toMatch(/:item_2$/u)
  })

  it('attaches prompt images as turn-owned files and removes them afterwards', async () => {
    const readImage = vi.fn(() => Promise.resolve({ data: new Uint8Array([137, 80, 78, 71]) }))
    const { adapter: route, spawn } = adapter([{ stdout: codexTurn }], { attachments: () => ({ readImage }) as never })
    const png = { attachmentId: 'a1', mediaType: 'image/png', bytes: 4, width: 1, height: 1 } as ImageAttachmentRef
    await collect(route.stream(request({ messages: [createUserMessage({ content: [{ type: 'image', attachment: png }, { type: 'text', text: 'look' }], source: { kind: 'user' } })] })))
    const argv = spawn.mock.calls[0]?.[0].argv ?? []
    const path = argv[argv.indexOf('--image') + 1] as string
    expect(path).toMatch(/image-1\.png$/u)
    expect(existsSync(path)).toBe(false)
    expect(readImage).toHaveBeenCalledWith(png, undefined)
  })

  it('sends a smaller version of an image larger than the CLI accepts', async () => {
    const readImageRequest = vi.fn(() => Promise.resolve({ data: new Uint8Array([1]), mediaType: 'image/jpeg' }))
    const { adapter: route, spawn } = adapter([{ stdout: codexTurn }], {
      cli: 'grok', definition: CODING_CLIS.grok, attachments: () => ({ readImageRequest }) as never,
    })
    const large = { attachmentId: 'a1', mediaType: 'image/png', bytes: GROK_IMAGE_MAX_BYTES + 1, width: 4000, height: 3000 } as ImageAttachmentRef
    await collect(route.stream(request({ messages: [createUserMessage({ content: [{ type: 'image', attachment: large }], source: { kind: 'user' } })] })))
    expect(readImageRequest).toHaveBeenCalledWith(large, { width: 4000, height: 3000, maxBytes: GROK_IMAGE_MAX_BYTES }, undefined)
    expect(spawn.mock.calls[0]?.[0].argv.at(-1)).toContain('"mimeType":"image/jpeg"')
  })

  it('refuses images without the attachment service and removes written files when a read fails', async () => {
    const png = { attachmentId: 'a1', mediaType: 'image/webp', bytes: 4, width: 1, height: 1 } as ImageAttachmentRef
    const messages = [createUserMessage({ content: [{ type: 'image', attachment: png }], source: { kind: 'user' } })]
    const missing = adapter([])
    await expect(collect(missing.adapter.stream(request({ messages })))).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT' })
    const failing = adapter([], { attachments: () => ({ readImage: () => Promise.reject(new Error('gone')) }) as never })
    await expect(collect(failing.adapter.stream(request({ messages })))).rejects.toThrow('gone')
    expect(failing.spawn).not.toHaveBeenCalled()
  })

  it('answers with plain standard output when the CLI printed no records, keeping a bounded head', async () => {
    const { adapter: route } = adapter([{ stdout: 'plain answer\n' }])
    const chunks = await collect(route.stream(request()))
    expect(chunks).toContainEqual({ type: 'block-end', index: 0, block: { type: 'text', text: 'plain answer' } })
    const long = adapter([{ stdout: `${'x'.repeat(70_000)}\nlast line\n` }])
    const text = (await collect(long.adapter.stream(request()))).find(chunk => chunk.type === 'block-end')
    expect(text).toMatchObject({ block: { text: 'x'.repeat(70_000) } })
  })

  it('runs auxiliary requests read-only and records no tool events', async () => {
    appended.length = 0
    const { adapter: route, spawn } = adapter([{ stdout: codexTurn }], { definition: CODING_CLIS.opencode, cli: 'opencode' })
    await collect(route.stream(request({ purpose: 'session-title' })))
    expect(appended).toEqual([])
    expect(spawn.mock.calls[0]?.[0]).toMatchObject({ stdio: { stdin: 'ignore' } })
    expect(spawn.mock.calls[0]?.[0].argv).not.toContain('--auto')
  })

  it('refuses a turn without a workspace or without the CLI', async () => {
    const noSession = adapter([], { initiator: () => undefined })
    await expect(collect(noSession.adapter.stream(request()))).rejects.toMatchObject({ code: 'NO_WORKSPACE' })
    const missing = adapter([], { executable: () => undefined })
    await expect(collect(missing.adapter.stream(request()))).rejects.toThrow(LlmError)
    await expect(collect(missing.adapter.stream(request()))).rejects.toMatchObject({ code: 'CODING_CLI_NOT_INSTALLED' })
  })

  it('rethrows the abort reason of a stopped turn and still stops the process', async () => {
    const { adapter: route, children } = adapter([{ exitCode: null }])
    const controller = new AbortController()
    controller.abort(new Error('stopped'))
    await expect(collect(route.stream(request({ signal: controller.signal })))).rejects.toThrow('stopped')
    expect(children[0]?.terminate).toHaveBeenCalled()
  })

  it('finishes without reading output when the process has no stdout pipe', async () => {
    const pipeless = { ...scriptedChild({ exitCode: 3 }).handle, stdout: undefined, collected: {} }
    const { adapter: route } = adapter([], { spawn: () => pipeless })
    const chunks = await collect(route.stream(request()))
    expect(chunks.at(-1)).toMatchObject({ reason: { kind: 'error' } })
  })
})

describe('llm-coding-cli plugin', () => {
  async function host(spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle = () => scriptedChild({ stdout: codexTurn }).handle) {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    // Partial service doubles expose only the members the route calls.
    ctx.provide('subprocess', { spawn } as never)
    ctx.provide('sessions', { get: () => session } as never)
    ctx.provide('agents', { currentInitiator: () => agent } as never)
    return ctx
  }

  it('registers one route per mount, named by the CLI, and removes it on unload', async () => {
    const ctx = await host()
    const fiber = await ctx.plugin(plugin, plugin.Config({ cli: 'grok', executable: process.execPath }))
    await ctx.plugin(plugin, plugin.Config({ cli: 'codex', provider: 'my-codex', displayName: 'Mine', models: [{ id: 'm', name: 'M' }] }))
    expect(ctx.llm.listProviders()).toEqual([{ id: 'grok-cli', name: 'Grok Build' }, { id: 'my-codex', name: 'Mine' }])
    await fiber.dispose()
    expect(ctx.llm.listProviders()).toEqual([{ id: 'my-codex', name: 'Mine' }])
  })

  it('follows the Session\'s sandbox mode and approval policy when both services are mounted', async () => {
    const spawn = vi.fn((_spec: SubprocessSpawnSpec) => scriptedChild({ stdout: codexTurn }).handle)
    const ctx = await host(spawn)
    ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access', workspaceRoot: CWD }) } as never)
    ctx.provide('approval', { effectivePolicy: () => 'never' } as never)
    await ctx.plugin(plugin, plugin.Config({ cli: 'codex', executable: process.execPath, env: { EXTRA: '1' } }))
    const chunks = await collect(ctx.llm.stream(request({ provider: 'codex-cli', sessionId: 's' as SessionId })))
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(spawn.mock.calls.at(-1)).toMatchObject([{ argv: [process.execPath, 'exec', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '--model', 'gpt-6-luna', '-'], env: { EXTRA: '1' } }])
  })

  it('reads prompt images from the mounted attachment store', async () => {
    const spawn = vi.fn((_spec: SubprocessSpawnSpec) => scriptedChild({ stdout: codexTurn }).handle)
    const ctx = await host(spawn)
    const readImage = vi.fn(() => Promise.resolve({ data: new Uint8Array([1]) }))
    ctx.provide('attachments', { readImage } as never)
    await ctx.plugin(plugin, plugin.Config({ cli: 'codex', executable: process.execPath, models: [{ id: 'm', name: 'M' }] }))
    const png = { attachmentId: 'a1', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } as ImageAttachmentRef
    await collect(ctx.llm.stream(request({ provider: 'codex-cli', model: 'm', sessionId: 's' as SessionId, messages: [createUserMessage({ content: [{ type: 'image', attachment: png }], source: { kind: 'user' } })] })))
    expect(readImage).toHaveBeenCalledOnce()
    expect(spawn.mock.calls.at(-1)?.[0].argv).toContain('--image')
  })

  it('runs read-only without sandbox and approval services and reports listing failures', async () => {
    const spawn = vi.fn((_spec: SubprocessSpawnSpec) => scriptedChild({ stdout: codexTurn, exitCode: 1 }).handle)
    const ctx = await host(spawn)
    const warn = vi.spyOn(ctx.logger, 'warn')
    await ctx.plugin(plugin, plugin.Config({ cli: 'codex', executable: process.execPath }))
    await collect(ctx.llm.stream(request({ provider: 'codex-cli', sessionId: 's' as SessionId })))
    expect(spawn.mock.calls.at(-1)?.[0].argv).toContain('read-only')
    await ctx.llm.listModels('codex-cli')
    expect(warn).toHaveBeenCalled()
  })

  it('searches for the CLI when no executable is configured', async () => {
    const ctx = await host()
    await ctx.plugin(plugin, plugin.Config({ cli: 'opencode', env: { PATH: '/nonexistent' } }))
    await expect(ctx.llm.listModels('opencode-cli')).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'default' })]))
  })

  it('refuses an unusable disposal grace or executable', async () => {
    const ctx = await host()
    expect(() => { plugin.apply(ctx, plugin.Config({ cli: 'codex', disposeGraceMs: 0 })) }).toThrow('disposeGraceMs')
    expect(() => { plugin.apply(ctx, plugin.Config({ cli: 'codex', executable: 'codex' })) }).toThrow('executable must be an absolute path')
    expect(() => { plugin.apply(ctx, plugin.Config({ cli: 'codex', executable: '/no/such/codex' })) }).toThrow('executable must be an absolute path')
  })
})
