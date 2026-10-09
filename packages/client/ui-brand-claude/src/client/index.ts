/** Claude occupants for the generic browser-brand slots, the page icon, and the Claude theme layer. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ClaudeBrandName, ClaudeHeroHeadline, ClaudeHeroMark, ClaudeMark } from './Brand.tsx'
import { en, zh, type BrandClaudeKey } from './locales.ts'
import { claudeMarkDataUrl } from './mark.ts'
import { CLAUDE_THEME_TOKENS } from './theme.ts'
import fonts from '../fonts/fonts.css?inline'

export type { BrandClaudeKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Claude brand name. */
    'brand.claude': BrandClaudeKey
  }
}

/** Locale namespace owning the brand name. */
const NS = 'brand.claude'

/** Package id naming the theme override layer and the font stylesheet. */
const PLUGIN_ID = '@deepseek-ai/dsh-client-ui-brand-claude'

/** Required services: the UI slot registry, the locale registry, and the theme runtime. */
export const inject = ['slots', 'locale', 'theme']

/**
 * Point every page icon link at the Claude mark until the plugin unloads.
 * @returns restores each link's previous icon.
 */
function replacePageIcon(): () => void {
  // Non-browser runs (node boots of the client tree) have no document.
  if (typeof document === 'undefined') return () => {}
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
  const previous = links.map(link => link.href)
  const href = claudeMarkDataUrl()
  for (const link of links) link.href = href
  return () => {
    for (const [index, link] of links.entries()) link.href = previous[index] as string
  }
}

/**
 * Mount the embedded Inter and EB Garamond faces until the plugin unloads.
 * @returns removes the stylesheet.
 */
function installFonts(): () => void {
  if (typeof document === 'undefined') return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = `${PLUGIN_ID}/fonts.css`
  tag.textContent = fonts
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

/**
 * Apply the Claude palette and typography, fill the sidebar mark and name,
 * show the enlarged hero mark with its product wordmark, and replace the page icon.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-brand-claude: dictionary')
  ctx.effect(installFonts, 'ui-brand-claude: fonts')
  ctx.effect(() => ctx.theme.overrideTokens(PLUGIN_ID, CLAUDE_THEME_TOKENS), 'ui-brand-claude: theme layer')
  ctx.effect(replacePageIcon, 'ui-brand-claude: page icon')
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, ClaudeMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, ClaudeBrandName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.inject('conversation.hero.brand.headline', function* () {
      yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, ClaudeHeroMark)
      yield ctx.slots.register({ name: 'conversation.hero.brand.headline', locale: NS }, ClaudeHeroHeadline)
    }))
}
