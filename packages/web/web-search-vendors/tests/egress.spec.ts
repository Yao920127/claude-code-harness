import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { installProxyFromEnvironment } from '@deepseek-ai/dsh-http-proxy'

let seen: string[] = []
let proxy: Server
let proxyUrl: string

beforeAll(async () => {
  proxy = createServer((request, response) => {
    seen.push(`REQ ${request.url ?? ''}`)
    response.writeHead(502); response.end('fake-proxy')
  })
  proxy.on('connect', (request, socket) => {
    seen.push(`CONNECT ${request.url ?? ''}`)
    socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); socket.end()
  })
  const a = await new Promise<AddressInfo>((r) => { proxy.listen(0, '127.0.0.1', () => { r(proxy.address() as AddressInfo) }) })
  proxyUrl = `http://127.0.0.1:${String(a.port)}`
})
afterAll(async () => { await new Promise<void>((r) => { proxy.close(() => { r() }) }) })

/** The launch environment of a user who exported one proxy for both schemes. */
function proxyEnv(): { get(name: string): { value: string } | undefined } {
  return { get: name => (name === 'HTTP_PROXY' || name === 'HTTPS_PROXY' ? { value: proxyUrl } : undefined) }
}
async function observe(run: () => Promise<unknown>): Promise<string[]> {
  seen = []
  const dispose = await installProxyFromEnvironment(proxyEnv(), () => undefined)
  try { await run().catch(() => undefined) } finally { await dispose() }
  return seen
}
import { ClaudeApiSearchProvider, OpenAiSearchProvider } from '../src/index.ts'
describe('vendor egress', () => {
  const key = async (): Promise<string> => 'probe'
  it('sends plain JSON vendor requests through the proxy', async () => {
    const provider = new OpenAiSearchProvider({ apiKeyEnv: 'K', baseURL: 'http://openai-probe.invalid/v1', model: 'm' }, key)
    expect(await observe(() => provider.search({ query: 'probe' }))).toEqual(['REQ http://openai-probe.invalid/v1/responses'])
  })

  it('sends Anthropic SDK requests through the proxy', async () => {
    const provider = new ClaudeApiSearchProvider({
      apiKeyEnv: 'K', baseURL: 'http://anthropic-probe.invalid', model: 'm', toolType: 'web_search_20260209', maxUses: 1, maxTokens: 10,
    }, key)
    expect(await observe(() => provider.search({ query: 'probe' }))).toEqual(['REQ http://anthropic-probe.invalid/v1/messages'])
  })
})
