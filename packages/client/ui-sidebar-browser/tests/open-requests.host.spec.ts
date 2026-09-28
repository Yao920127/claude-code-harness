import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, SidebarBrowserOpener } from '../src/index.ts'
import type { BrowserOpenStreamItem } from '../src/types.ts'

const SESSION = 'session-1' as SessionId

async function opener(): Promise<{ ctx: Context; service: SidebarBrowserOpener }> {
  const ctx = new Context()
  await ctx.plugin(SidebarBrowserOpener).await()
  return { ctx, service: ctx.get('sidebarBrowser') as SidebarBrowserOpener }
}

describe('SidebarBrowserOpener', () => {
  it('reports that no app window received a request made without subscribers', async () => {
    const { ctx, service } = await opener()
    expect(service.open(SESSION, 'https://example.com/')).toBe(0)
    await ctx.fiber.dispose()
  })

  it('streams ready, then each later request in order, and stops delivering after the subscriber leaves', async () => {
    const { ctx, service } = await opener()
    const lifetime = new AbortController()
    const iterator = service.watchOpenRequests(lifetime.signal)[Symbol.asyncIterator]()
    const items: BrowserOpenStreamItem[] = []
    items.push((await iterator.next()).value as BrowserOpenStreamItem)
    expect(service.open(SESSION, 'https://a.example/')).toBe(1)
    expect(service.open(SESSION, 'https://b.example/')).toBe(1)
    items.push((await iterator.next()).value as BrowserOpenStreamItem)
    const waiting = iterator.next()
    items.push((await waiting).value as BrowserOpenStreamItem)
    const idle = iterator.next()
    service.open(SESSION, 'https://c.example/')
    items.push((await idle).value as BrowserOpenStreamItem)
    expect(items).toEqual([
      { kind: 'ready' },
      { kind: 'open', request: { sessionId: SESSION, url: 'https://a.example/' } },
      { kind: 'open', request: { sessionId: SESSION, url: 'https://b.example/' } },
      { kind: 'open', request: { sessionId: SESSION, url: 'https://c.example/' } },
    ])
    const ended = iterator.next()
    lifetime.abort()
    await expect(ended).resolves.toEqual({ done: true, value: undefined })
    expect(service.open(SESSION, 'https://d.example/')).toBe(0)
    await ctx.fiber.dispose()
  })

  it('is provided by the Host half and removed when the plugin is disposed', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({ inject: [], apply })
    await fiber.await()
    expect(ctx.get('sidebarBrowser')).toBeInstanceOf(SidebarBrowserOpener)
    await fiber.dispose()
    expect(ctx.get('sidebarBrowser')).toBeUndefined()
    await ctx.fiber.dispose()
  })
})
