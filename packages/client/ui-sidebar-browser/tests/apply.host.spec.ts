import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, Config, SIDEBAR_BROWSER_NAMESPACE } from '../src/index.ts'

describe('Browser Host half', () => {
  it('serves its preferences without an automatic settings page and releases the presentation', async () => {
    const ctx = new Context()
    const release = vi.fn()
    const configure = vi.fn((_presentation: { auto?: boolean }, _owner: unknown) => release)
    ctx.provide('settings', { configure } as never)
    const fiber = ctx.plugin({ inject: [], apply })
    await fiber.await()
    expect(configure.mock.calls[0]?.[0]).toEqual({ auto: false })
    await fiber.dispose()
    expect(release).toHaveBeenCalledOnce()
    await ctx.fiber.dispose()
  })

  it('names its namespace after the Loader row and accepts only HTTPS search and home addresses', () => {
    expect(SIDEBAR_BROWSER_NAMESPACE).toBe('ui-sidebar-browser')
    expect(Config({}).searchUrl.get()).toBe('https://www.google.com/search?q=%s')
    expect(Config({ searchUrl: 'https://duckduckgo.com/?q=%s' }).searchUrl.get()).toBe('https://duckduckgo.com/?q=%s')
    for (const invalid of ['http://search.test/?q=%s', 'https://search.test/', 'https://search.test/?q=%s&x=%s', 'https://a b/%s']) {
      expect(() => Config({ searchUrl: invalid })).toThrow()
    }
    expect(Config({}).homeUrl.get()).toBe('https://www.google.com')
    expect(Config({ homeUrl: '' }).homeUrl.get()).toBe('')
    for (const invalid of ['http://home.test/', 'home.test', 'https://a b/']) {
      expect(() => Config({ homeUrl: invalid })).toThrow()
    }
  })
})
