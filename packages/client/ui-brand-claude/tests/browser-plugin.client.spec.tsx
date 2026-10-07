// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import {
  CLAUDE_HERO_MARK_SIZE, ClaudeBrandName, ClaudeHeroHeadline, ClaudeHeroMark, ClaudeMark,
} from '../src/client/Brand.tsx'
import { claudeMarkDataUrl } from '../src/client/mark.ts'
import { CLAUDE_THEME_TOKENS } from '../src/client/theme.ts'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

const HOLES = ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark', 'conversation.hero.brand.headline'] as const

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const removeLayer = vi.fn()
  const theme = { overrideTokens: vi.fn((_source: string, _tokens: typeof CLAUDE_THEME_TOKENS) => removeLayer) }
  ctx.provide('theme', theme as never)
  // The partial root declaration carries only the brand holes under test.
  slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  return { ctx, slots, locale, theme, removeLayer }
}

describe('Claude browser-brand plugin', () => {
  it('keeps the host Loader entry inert and declares the services it uses', () => {
    expect(hostApply).not.toThrow()
    expect(inject).toEqual(['slots', 'locale', 'theme'])
  })

  it('fills every brand slot, swaps the page icon, and restores both on teardown', async () => {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.href = 'http://localhost/favicon.svg'
    document.head.append(icon)
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)
    expect(icon.href).toBe(claudeMarkDataUrl())
    expect(subject.theme.overrideTokens).toHaveBeenCalledExactlyOnceWith('@deepseek-ai/dsh-client-ui-brand-claude', CLAUDE_THEME_TOKENS)
    const fonts = document.head.querySelector<HTMLStyleElement>('style[data-plugin-css="@deepseek-ai/dsh-client-ui-brand-claude/fonts.css"]')
    expect(fonts).not.toBeNull()
    expect(subject.locale.bind('brand.claude')('name')).toBe('Claude Code')
    expect(subject.slots.entries('conversation.hero.brand.mark')[0]?.component).toBe(ClaudeHeroMark)
    expect(subject.slots.entries('conversation.hero.brand.headline')[0]?.component).toBe(ClaudeHeroHeadline)

    await fiber.dispose()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
    expect(icon.href).toBe('http://localhost/favicon.svg')
    expect(subject.removeLayer).toHaveBeenCalledOnce()
    expect(document.head.querySelector('style')).toBeNull()
    expect(subject.locale.bind('brand.claude')('name')).toBe('name')
  })

  it('skips the page icon where no document exists', async () => {
    const subject = await bench()
    vi.stubGlobal('document', undefined)
    try {
      const fiber = subject.ctx.plugin({ inject: [...inject], apply })
      await fiber.await()
      expect(subject.slots.entries('sidebar.brand.mark')).toHaveLength(1)
      expect(subject.theme.overrideTokens).toHaveBeenCalledOnce()
      await fiber.dispose()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('renders the mark at the requested size, the enlarged hero mark, an empty headline, and the translated name', () => {
    const mark = render(<ClaudeMark size={34} className="hero" />)
    const svg = mark.container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('34')
    expect(svg?.getAttribute('class')).toBe('hero')
    expect(svg?.querySelector('path')?.getAttribute('fill')).toBe('#D97757')

    const name = render(<ClaudeBrandName t={key => `[${key}]`} />)
    expect(name.container.textContent).toBe('[name]')
    const hero = render(<ClaudeHeroMark size={34} className="fish" />)
    const heroSvg = hero.container.querySelector('svg')
    expect(heroSvg?.getAttribute('width')).toBe(String(CLAUDE_HERO_MARK_SIZE))
    expect(heroSvg?.getAttribute('class')).toBe('fish')
    expect(render(<ClaudeHeroHeadline />).container.innerHTML).toBe('')
  })

  it('encodes the mark as a standalone SVG page icon', () => {
    const svg = decodeURIComponent(claudeMarkDataUrl())
    expect(svg.startsWith('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">')).toBe(true)
    expect(svg).toContain('<path d="M4.709')
  })

  it('maps the Claude palette onto both color schemes and renders display headlines in the serif face', () => {
    expect(CLAUDE_THEME_TOKENS['--dsw-alias-bg-base']).toEqual({ light: '#faf9f5', dark: '#181715' })
    expect(CLAUDE_THEME_TOKENS['--dsw-alias-brand-primary']).toEqual({ light: '#cc785c', dark: '#d97757' })
    expect(CLAUDE_THEME_TOKENS['--dsw-static-neutral-bluish-1000']).toEqual({ light: '#141413', dark: '#141413' })
    expect(CLAUDE_THEME_TOKENS['--dsw-static-deepseek-500']).toEqual({ light: '#cc785c', dark: '#cc785c' })
    expect(CLAUDE_THEME_TOKENS['--dsw-font-markdown-h1']?.light).toBe('500 calc(24px + var(--dsh-content-font-delta)) / calc(32px + var(--dsh-content-font-delta)) var(--cch-font-display)')
    expect(CLAUDE_THEME_TOKENS['--cch-font-display']?.dark).toMatch(/^'EB Garamond'/u)
    for (const modes of Object.values(CLAUDE_THEME_TOKENS)) {
      expect(modes.light).not.toBe('')
      expect(modes.dark).not.toBe('')
    }
    const faces = readFileSync(join(import.meta.dirname, '../src/fonts/fonts.css'), 'utf8')
    expect(faces).toContain("font-family: 'EB Garamond'")
    expect(faces).toContain("font-family: 'Inter'")
    const embedded = [...faces.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/gu)].map(match => match[1])
    const files = ['eb-garamond-latin.woff2', 'inter-latin.woff2']
      .map(name => readFileSync(join(import.meta.dirname, '../src/fonts', name)).toString('base64'))
    expect(embedded).toEqual(files)
  })
})
