import { PassThrough } from 'node:stream'
import type { Options, Query, SDKMessage, SpawnOptions } from '@anthropic-ai/claude-agent-sdk'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as plugin from '../src/index.ts'
import { ClaudeCodeSearchProvider, mapStructuredOutput, searchPrompt, type ClaudeCodeSearchOptions } from '../src/provider.ts'

type QueryFactory = (params: { prompt: string; options: Options }) => Query

const queryMock = vi.hoisted(() => vi.fn<QueryFactory>())

vi.mock('@anthropic-ai/claude-agent-sdk', async importOriginal => ({
  ...await importOriginal<typeof import('@anthropic-ai/claude-agent-sdk')>(),
  query: queryMock,
}))

afterEach(() => {
  queryMock.mockReset()
})

const spawnOptions: SpawnOptions = { command: '/bin/claude', args: [], cwd: '/home/user', env: {}, signal: new AbortController().signal }

function fakeChild() {
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

/** A Query that spawns through the options hook, then yields the scripted messages or throws. */
function scripted(messages: SDKMessage[], fail?: unknown, onOptions?: (options: Options) => void): QueryFactory {
  return ({ options }) => {
    onOptions?.(options)
    options.spawnClaudeCodeProcess?.(spawnOptions)
    async function* iterate(): AsyncGenerator<SDKMessage, void> {
      for (const message of messages) yield message
      if (fail !== undefined) throw fail
    }
    return Object.assign(iterate(), { close: vi.fn() }) as Pick<Query, 'close'> & AsyncGenerator<SDKMessage, void> as Query
  }
}

function provider(overrides: Partial<ClaudeCodeSearchOptions> = {}) {
  const child = fakeChild()
  const spawn = vi.fn((_spec: SubprocessSpawnSpec) => child.handle)
  return {
    child,
    spawn,
    search: new ClaudeCodeSearchProvider({
      model: undefined, maxTurns: 4, env: { EXTRA: '1' }, cwd: '/home/user', disposeGraceMs: 1_000, spawn, ...overrides,
    }),
  }
}

// Partial SDK fixtures carry only the fields the provider reads.
const success = (structured: unknown): SDKMessage => ({ type: 'result', subtype: 'success', structured_output: structured } as never)

describe('Claude Code search provider', () => {
  it('runs one WebSearch-only query with structured output and releases the process', async () => {
    let seen: Options | undefined
    queryMock.mockImplementation(scripted([
      { type: 'assistant' } as never,
      success({ answer: 'Found it.', sources: [{ url: 'https://a.test', title: 'A', snippet: 'quote' }, { url: 'https://b.test' }] }),
    ], undefined, (options) => { seen = options }))
    const { child, spawn, search } = provider({ model: 'sonnet' })
    await expect(search.search({ query: 'news', maxResults: 2 })).resolves.toEqual({
      content: 'Found it.',
      sources: [{ url: 'https://a.test', title: 'A', snippet: 'quote' }, { url: 'https://b.test' }],
      truncated: false,
    })
    expect(queryMock.mock.calls[0]![0].prompt).toContain('Return at most 2 sources.\nQuery: news')
    expect(seen).toMatchObject({
      cwd: '/home/user', model: 'sonnet', tools: ['WebSearch'], allowedTools: ['WebSearch'], maxTurns: 4, persistSession: false,
      outputFormat: { type: 'json_schema' },
    })
    expect(seen?.env).toMatchObject({ EXTRA: '1' })
    expect(spawn).toHaveBeenCalledOnce()
    expect(child.terminate).toHaveBeenCalledOnce()
    expect(child.waitForExit).toHaveBeenCalledOnce()
  })

  it('reports unsuccessful results, missing results, and process failures', async () => {
    queryMock
      .mockImplementationOnce(scripted([{ type: 'result', subtype: 'error_max_turns' } as never]))
      .mockImplementationOnce(scripted([]))
      .mockImplementationOnce(scripted([], new Error('not logged in')))
      .mockImplementationOnce(scripted([], 'plain failure'))
    const { search } = provider()
    await expect(search.search({ query: 'q' })).rejects.toThrow('error_max_turns')
    await expect(search.search({ query: 'q' })).rejects.toThrow('without a result message')
    await expect(search.search({ query: 'q' })).rejects.toThrow(/not logged in.*Sign in with the Claude Code CLI/)
    await expect(search.search({ query: 'q' })).rejects.toThrow('Claude Code search failed: plain failure')
  })

  it('maps cancellation before and during a search to WEB_ABORTED', async () => {
    const { search } = provider()
    await expect(search.search({ query: 'q' }, AbortSignal.abort())).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    const controller = new AbortController()
    queryMock.mockImplementation(({ options }) => {
      async function* iterate(): AsyncGenerator<SDKMessage, void> {
        controller.abort('stop')
        expect(options.abortController?.signal.aborted).toBe(true)
        throw new Error('interrupted')
      }
      return Object.assign(iterate(), { close: vi.fn() }) as Pick<Query, 'close'> & AsyncGenerator<SDKMessage, void> as Query
    })
    await expect(search.search({ query: 'q' }, controller.signal)).rejects.toMatchObject({ code: 'WEB_ABORTED', cause: 'stop' })
  })

  it('validates structured output at the process boundary', () => {
    expect(mapStructuredOutput({
      answer: '  ',
      sources: [null, { url: 'not a url' }, { url: 'https://a.test', title: '', snippet: 1 }, { url: 'https://a.test', title: 'dup' }],
    })).toEqual({ sources: [{ url: 'https://a.test' }], truncated: false })
    expect(() => mapStructuredOutput(undefined)).toThrow('no web sources')
    expect(() => mapStructuredOutput({ sources: 'x' })).toThrow('no web sources')
    expect(searchPrompt({ query: 'q' })).not.toContain('at most')
    expect(provider({ maxTurns: 0 }).search.available()).toBe(false)
    expect(provider().search.available()).toBe(true)
  })
})

describe('plugin', () => {
  it('leaves the model to the host settings when none is configured', async () => {
    const ctx = new Context()
    ctx.provide('subprocess', { spawn: () => fakeChild().handle } as never)
    await ctx.plugin(WebRuntime, { searchProvider: 'claude-code' })
    await ctx.plugin(plugin, {})
    let seen: Options | undefined
    queryMock.mockImplementation(scripted([success({ sources: [{ url: 'https://a.test' }] })], undefined, (options) => { seen = options }))
    await ctx.web.search({ query: 'q' })
    expect(seen).not.toHaveProperty('model')
    await ctx.fiber.dispose()
  })

  it('registers the claude-code provider, spawns through ctx.subprocess, and unregisters on disposal', async () => {
    const ctx = new Context()
    const child = fakeChild()
    const spawn = vi.fn((_spec: SubprocessSpawnSpec) => child.handle)
    ctx.provide('subprocess', { spawn } as never)
    await ctx.plugin(WebRuntime, { searchProvider: 'claude-code' })
    const fiber = await ctx.plugin(plugin, { model: 'haiku' })
    let seen: Options | undefined
    queryMock.mockImplementation(scripted([success({ sources: [{ url: 'https://a.test' }] })], undefined, (options) => { seen = options }))
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [{ url: 'https://a.test' }] })
    expect(seen).toMatchObject({ model: 'haiku' })
    expect(spawn).toHaveBeenCalledOnce()
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' })
    expect(() => plugin.Config({ disposeGraceMs: 0 })).toThrow()
    await ctx.fiber.dispose()
  })
})
