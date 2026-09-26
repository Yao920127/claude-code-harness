import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime, { WebError } from '@deepseek-ai/dsh-web'
import * as vendorsPlugin from '@deepseek-ai/dsh-web-search-vendors'
import {
  ClaudeApiSearchProvider, GeminiSearchProvider, MistralSearchProvider, OpenAiSearchProvider, OpenRouterSearchProvider,
  VENDOR_PROVIDER_IDS, XaiSearchProvider, ZaiSearchProvider,
} from '@deepseek-ai/dsh-web-search-vendors'
import type { ResolveApiKey } from '@deepseek-ai/dsh-web-search-vendors'

const key = async (): Promise<string> => 'vendor-key'
const options = (baseURL: string, model = 'model-x') => ({ apiKeyEnv: 'VENDOR_KEY', baseURL, model })

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

/** Stub fetch with one reply per call and record each request's URL, headers, and JSON body. */
function stubFetch(...replies: Response[]) {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    const body: unknown = JSON.parse(await request.text())
    calls.push({ url: request.url, headers: Object.fromEntries(request.headers.entries()), body })
    const reply = replies.shift()
    if (reply === undefined) throw new Error('unexpected fetch')
    return reply
  }))
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Claude API provider', () => {
  const claude = (overrides: Partial<ConstructorParameters<typeof ClaudeApiSearchProvider>[0]> = {}) =>
    new ClaudeApiSearchProvider({
      ...options('https://anthropic.test', 'claude-opus-5'),
      toolType: 'web_search_20260209', maxUses: 3, maxTokens: 1000, ...overrides,
    }, key)

  it('sends the web_search server tool and joins sources to cited excerpts across a paused turn', async () => {
    const calls = stubFetch(
      jsonResponse({
        id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'pause_turn', stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{
          type: 'web_search_tool_result', tool_use_id: 't1',
          content: [{ type: 'web_search_result', url: 'https://a.test', title: 'A', page_age: '2 days', encrypted_content: 'x' }],
        }],
      }),
      jsonResponse({
        id: 'm2', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [
          { type: 'web_search_tool_result', tool_use_id: 't2', content: [{ type: 'web_search_result', url: 'https://b.test', title: '', page_age: null, encrypted_content: 'y' }] },
          { type: 'text', text: 'Answer.', citations: [
            { type: 'web_search_result_location', url: 'https://a.test', title: 'A', cited_text: 'quoted', encrypted_index: 'i' },
            { type: 'web_search_result_location', url: 'https://a.test', title: 'A', cited_text: 'later', encrypted_index: 'j' },
            { type: 'web_search_result_location', url: 'https://b.test', title: null, cited_text: '', encrypted_index: 'k' },
            { type: 'char_location', cited_text: 'doc', document_index: 0, document_title: null, start_char_index: 0, end_char_index: 1 },
          ] },
          { type: 'text', text: '', citations: null },
          { type: 'server_tool_use', id: 's', name: 'web_search', input: {} },
          { type: 'web_search_tool_result', tool_use_id: 't3', content: [{ type: 'web_search_result', url: '', title: 'empty', page_age: null, encrypted_content: 'z' }] },
        ],
      }),
    )
    await expect(claude().search({ query: 'news' })).resolves.toEqual({
      content: 'Answer.',
      sources: [
        { url: 'https://a.test', title: 'A', snippet: 'quoted', publishedAt: '2 days' },
        { url: 'https://b.test' },
      ],
      truncated: false,
    })
    expect(calls[0]).toMatchObject({
      url: 'https://anthropic.test/v1/messages',
      headers: { 'x-api-key': 'vendor-key' },
      body: { model: 'claude-opus-5', max_tokens: 1000, tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }] },
    })
    // The resumed request replays the paused assistant content.
    expect((calls[1]!.body as { messages: unknown[] }).messages).toHaveLength(2)
  })

  it('uses the basic tool version and reports search errors, refusals, and HTTP failures', async () => {
    const message = (content: unknown[], stopReason = 'end_turn') => jsonResponse({
      id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', stop_reason: stopReason, stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 }, content,
    })
    const calls = stubFetch(
      message([{ type: 'web_search_tool_result', tool_use_id: 't', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }]),
      message([], 'refusal'),
      jsonResponse({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } }, { status: 401 }),
    )
    const basic = claude({ toolType: 'web_search_20250305', model: 'claude-haiku-4-5' })
    await expect(basic.search({ query: 'q' })).rejects.toThrow('max_uses_exceeded')
    expect((calls[0]!.body as { tools: { type: string }[] }).tools[0]!.type).toBe('web_search_20250305')
    await expect(basic.search({ query: 'q' })).rejects.toThrow('declined')
    await expect(basic.search({ query: 'q' })).rejects.toThrow('HTTP 401')
    expect(claude({ maxUses: 0 }).available()).toBe(false)
  })

  it('maps caller cancellation to WEB_ABORTED', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      controller.abort()
      throw Object.assign(new Error('aborted', { cause: init?.signal }), { name: 'AbortError' })
    }))
    await expect(claude().search({ query: 'q' }, controller.signal)).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })
})

describe('Responses API providers', () => {
  it('OpenAI requests the complete source list and leads with annotated citations', async () => {
    const calls = stubFetch(jsonResponse({
      output: [
        { type: 'web_search_call', action: { type: 'search', sources: [{ type: 'url', url: 'https://s.test' }, 'https://a.test', { type: 'url' }] } },
        {
          type: 'message',
          content: [{
            type: 'output_text', text: 'Hello world',
            annotations: [
              { type: 'url_citation', url: 'https://a.test', title: 'A', start_index: 6, end_index: 11 },
              { type: 'url_citation', url: 'https://c.test', start_index: 5, end_index: 5 },
              { type: 'url_citation', url: 'https://d.test' },
              { type: 'file_citation' },
            ],
          }, { type: 'output_text', annotations: [{ type: 'url_citation', url: 'https://e.test', start_index: 0, end_index: 2 }] }, { type: 'refusal' }],
        },
        { type: 'reasoning' },
      ],
    }))
    await expect(new OpenAiSearchProvider(options('https://openai.test/v1'), key).search({ query: 'q' })).resolves.toEqual({
      content: 'Hello world',
      sources: [
        { url: 'https://e.test' }, { url: 'https://d.test' }, { url: 'https://c.test' },
        { url: 'https://a.test', title: 'A', snippet: 'world' }, { url: 'https://s.test' },
      ],
      truncated: false,
    })
    expect(calls[0]).toMatchObject({
      url: 'https://openai.test/v1/responses',
      headers: { authorization: 'Bearer vendor-key' },
      body: { model: 'model-x', tools: [{ type: 'web_search' }], include: ['web_search_call.action.sources'] },
    })
  })

  it('xAI reads a top-level citations list', async () => {
    const calls = stubFetch(jsonResponse({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Answer' }] }],
      citations: ['https://x.test', { url: 'https://y.test', title: 'Y' }, 42],
    }))
    await expect(new XaiSearchProvider(options('https://xai.test/v1'), key).search({ query: 'q' })).resolves.toEqual({
      content: 'Answer', sources: [{ url: 'https://x.test' }, { url: 'https://y.test', title: 'Y' }], truncated: false,
    })
    expect(calls[0]).toMatchObject({ url: 'https://xai.test/v1/responses', body: { tools: [{ type: 'web_search' }] } })
  })
})

describe('other vendors', () => {
  it('Gemini maps grounding chunks with their first supported segment', async () => {
    const calls = stubFetch(jsonResponse({
      candidates: [{
        content: { parts: [{ text: 'Grounded ' }, { text: 'answer' }, {}] },
        groundingMetadata: {
          groundingChunks: [{ web: { uri: 'https://g.test', title: 'g.test' } }, { retrievedContext: {} }, { web: { uri: 'https://h.test' } }],
          groundingSupports: [
            { segment: { text: 'Grounded' }, groundingChunkIndices: [0, 2] },
            { segment: { text: 'later' }, groundingChunkIndices: [0, 'x'] },
          ],
        },
      }],
    }))
    await expect(new GeminiSearchProvider(options('https://gemini.test/v1beta', 'gemini/flash'), key).search({ query: 'q' }))
      .resolves.toEqual({
        content: 'Grounded answer',
        sources: [{ url: 'https://g.test', title: 'g.test', snippet: 'Grounded' }, { url: 'https://h.test', snippet: 'Grounded' }],
        truncated: false,
      })
    expect(calls[0]).toMatchObject({
      url: 'https://gemini.test/v1beta/models/gemini%2Fflash:generateContent',
      headers: { 'x-goog-api-key': 'vendor-key' },
      body: { tools: [{ google_search: {} }] },
    })
  })

  it('OpenRouter maps url_citation annotations', async () => {
    const calls = stubFetch(jsonResponse({
      choices: [{ message: { content: 'Routed', annotations: [
        { type: 'url_citation', url_citation: { url: 'https://o.test', title: 'O', content: 'excerpt' } },
        { type: 'other' },
      ] } }],
    }))
    await expect(new OpenRouterSearchProvider(options('https://router.test/api/v1'), key).search({ query: 'q' })).resolves.toEqual({
      content: 'Routed', sources: [{ url: 'https://o.test', title: 'O', snippet: 'excerpt' }], truncated: false,
    })
    expect(calls[0]).toMatchObject({ url: 'https://router.test/api/v1/chat/completions', body: { plugins: [{ id: 'web' }] } })
  })

  it('Mistral maps text and tool_reference chunks from conversation outputs', async () => {
    const calls = stubFetch(jsonResponse({
      outputs: [
        { type: 'tool.execution', name: 'web_search' },
        { type: 'message.output', content: 'Plain. ' },
        { type: 'message.output', content: [
          { type: 'text', text: 'Chunked.' },
          { type: 'tool_reference', tool: 'web_search', title: 'M', url: 'https://m.test', source: 'brave' },
          { type: 'tool_reference', title: 'no url' },
        ] },
      ],
    }))
    await expect(new MistralSearchProvider(options('https://mistral.test/v1'), key).search({ query: 'q' })).resolves.toEqual({
      content: 'Plain. Chunked.', sources: [{ url: 'https://m.test', title: 'M' }], truncated: false,
    })
    expect(calls[0]).toMatchObject({ url: 'https://mistral.test/v1/conversations', body: { tools: [{ type: 'web_search' }] } })
  })

  it('Z.AI maps search results and clamps the requested count', async () => {
    const calls = stubFetch(
      jsonResponse({ search_result: [
        { title: 'Z', link: 'https://z.test', content: 'body', publish_date: '2026-09-01' },
        { title: 'missing link' },
      ] }),
      jsonResponse({ search_result: [{ link: 'https://z2.test' }] }),
      jsonResponse({ search_result: [{ link: 'https://z3.test' }] }),
    )
    const zai = new ZaiSearchProvider(options('https://zai.test/api/paas/v4', 'search-prime'), key)
    await expect(zai.search({ query: 'q', maxResults: 99 })).resolves.toEqual({
      sources: [{ url: 'https://z.test', title: 'Z', snippet: 'body', publishedAt: '2026-09-01' }], truncated: false,
    })
    await zai.search({ query: 'q', maxResults: 0 })
    await zai.search({ query: 'q' })
    expect(calls.map(call => call.body)).toEqual([
      { search_engine: 'search-prime', search_query: 'q', count: 50 },
      { search_engine: 'search-prime', search_query: 'q', count: 1 },
      { search_engine: 'search-prime', search_query: 'q' },
    ])
  })
})

describe('shared failures', () => {
  const openai = (resolve: ResolveApiKey = key) => new OpenAiSearchProvider(options('https://openai.test/v1'), resolve)

  it('reports a missing credential without contacting the vendor', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(openai(async () => undefined).search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
    await expect(openai(async () => '').search({ query: 'q' })).rejects.toThrow('VENDOR_KEY')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('forwards the caller signal and classifies an abort error the signal did not report', async () => {
    const controller = new AbortController()
    let forwarded: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      forwarded = init?.signal ?? undefined
      throw Object.assign(new Error('socket aborted'), { name: 'AbortError' })
    }))
    await expect(openai().search({ query: 'q' }, controller.signal)).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    expect(forwarded).toBe(controller.signal)
  })

  it('maps HTTP errors, unparseable bodies, empty results, and network failures', async () => {
    stubFetch(
      new Response('quota', { status: 429 }),
      new Response('not json'),
      jsonResponse({ output: [] }),
    )
    await expect(openai().search({ query: 'q' })).rejects.toThrow('HTTP 429')
    await expect(openai().search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
    await expect(openai().search({ query: 'q' })).rejects.toThrow('no web sources')
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'socket closed' }))
    await expect(openai().search({ query: 'q' })).rejects.toThrow('OpenAI search failed: socket closed')
  })

  it('refuses before and after credential resolution once the caller aborted', async () => {
    await expect(openai().search({ query: 'q' }, AbortSignal.abort())).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    const controller = new AbortController()
    const resolving = openai(async () => {
      controller.abort()
      return 'vendor-key'
    }).search({ query: 'q' }, controller.signal)
    await expect(resolving).rejects.toBeInstanceOf(WebError)
    expect(openai().available()).toBe(true)
    expect(new OpenAiSearchProvider(options('not a url'), key).available()).toBe(false)
  })
})

describe('plugin registration', () => {
  it('registers every vendor, resolves keys from the launch environment, and unregisters on disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'zai' })
    const fiber = await ctx.plugin(vendorsPlugin, { zai: { apiKeyEnv: 'ZAI_KEY_FOR_TEST', baseURL: 'https://zai.test/', model: 'search-pro' } })
    vi.stubEnv('ZAI_KEY_FOR_TEST', '')
    await expect(ctx.web.search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
    vi.stubEnv('ZAI_KEY_FOR_TEST', 'env-key')
    const calls = stubFetch(jsonResponse({ search_result: [{ link: 'https://z.test' }] }))
    try {
      await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [{ url: 'https://z.test' }] })
      expect(calls[0]).toMatchObject({ url: 'https://zai.test/web_search', headers: { authorization: 'Bearer env-key' } })
    } finally {
      vi.unstubAllEnvs()
    }
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' })
    await ctx.fiber.dispose()
  })

  it.each(['claude-api', ...VENDOR_PROVIDER_IDS])('registers %s under its own id', async (id) => {
    const ctx = new Context()
    ctx.provide('credentials', { resolve: async () => undefined } as never)
    await ctx.plugin(WebRuntime, { searchProvider: id })
    await ctx.plugin(vendorsPlugin, {})
    // A registered provider without a stored key fails on its credential, not on selection.
    await expect(ctx.web.search({ query: 'q' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CREDENTIAL_MISSING' })
    await ctx.fiber.dispose()
  })

  it('resolves keys through the credentials service when one is composed', async () => {
    const ctx = new Context()
    ctx.provide('credentials', { resolve: async () => ({ value: 'stored-key' }) } as never)
    await ctx.plugin(WebRuntime, { searchProvider: 'openrouter' })
    await ctx.plugin(vendorsPlugin, {})
    const calls = stubFetch(jsonResponse({
      choices: [{ message: { content: 'c', annotations: [{ type: 'url_citation', url_citation: { url: 'https://o.test' } }] } }],
    }))
    await ctx.web.search({ query: 'q' })
    expect(calls[0]).toMatchObject({ url: 'https://openrouter.ai/api/v1/chat/completions', headers: { authorization: 'Bearer stored-key' } })
    await ctx.fiber.dispose()
  })
})
