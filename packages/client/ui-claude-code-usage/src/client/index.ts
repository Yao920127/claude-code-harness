/** Claude Code plan usage in the sidebar foot, read through the `claudeCodeUsage` Remote. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { en, zh } from './locales.ts'
import { UsageMeter, type UsageDisplay, type UsageMeterInjected } from './UsageMeter.tsx'
import { UsageSource } from './usage-source.ts'

export type { UsageDisplay } from './UsageMeter.tsx'
export type { UsageState } from './usage-source.ts'

/** Locale namespace of the meter's copy. */
const NS = 'claudeCodeUsage'

/** localStorage key of the viewer's used/remaining choice. */
const DISPLAY_KEY = 'dsh.claude-code-usage.display.v1'

/** Required services: slots, copy, and the mounted usage Remote namespace. */
export const inject = ['slots', 'locale', 'remote', 'remote.claudeCodeUsage']

/**
 * Register the meter at the sidebar foot; it reads usage on mount, when the window becomes visible again, and on request,
 * and keeps the viewer's used/remaining choice in this browser's localStorage.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const source = new UsageSource(async (refresh) => {
    const result = await ctx.remote.claudeCodeUsage.get(refresh)
    if (!result.ok) throw result.error
    return result.value
  })
  const display = createSnapshotStore<UsageDisplay>('remaining', { persist: { name: DISPLAY_KEY } })
  ctx.effect(() => () => { source.dispose() }, 'ui-claude-code-usage: reads')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-claude-code-usage: copy')
  if (typeof document !== 'undefined') {
    ctx.effect(() => {
      const visible = (): void => { if (document.visibilityState === 'visible') source.load(false) }
      document.addEventListener('visibilitychange', visible)
      return () => { document.removeEventListener('visibilitychange', visible) }
    }, 'ui-claude-code-usage: visibility')
  }
  source.load(false)
  ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: '@deepseek-ai/dsh-client-ui-claude-code-usage', locale: NS,
    inject: (): UsageMeterInjected => ({
      hooks: { usage: source.state, display },
      refresh: () => { source.load(true) },
      setDisplay: (value) => { display.set(value) },
    }),
  }, UsageMeter)), 'ui-claude-code-usage: meter')
}
