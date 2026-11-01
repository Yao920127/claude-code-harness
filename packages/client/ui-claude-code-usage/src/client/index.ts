/** Claude Code plan usage in the sidebar foot, read through the `claudeCodeUsage` Remote. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { en, zh } from './locales.ts'
import { UsageMeter, type UsageDisplay, type UsageMeterInjected } from './UsageMeter.tsx'
import { UsageSource } from './usage-source.ts'
import { selectedRoute, type SessionSelection } from './selected-route.ts'

export type { UsageDisplay } from './UsageMeter.tsx'
export type { UsageState } from './usage-source.ts'
export type { SelectedRoute } from './selected-route.ts'

/** Locale namespace of the meter's copy. */
const NS = 'claudeCodeUsage'

/** localStorage key of the viewer's used/remaining choice. */
const DISPLAY_KEY = 'dsh.claude-code-usage.display.v1'

/** Required services: slots, copy, the main Session, and the mounted usage Remote namespace. */
export const inject = ['slots', 'locale', 'remote', 'uiSession', 'remote.claudeCodeUsage']

/**
 * Read one Session's model selection through the optional model-selection plugin.
 * @param ctx - Client root context.
 * @param sessionId - the Session.
 * @returns its selection, or undefined when the plugin is absent or the Session has no scope yet.
 */
function sessionSelection(ctx: ClientContext, sessionId: SessionId): SessionSelection | undefined {
  const directories = ctx.get('modelDirectories')
  if (directories === undefined) return undefined
  try {
    return directories.directoryFor(sessionId).store
  } catch (_unresolved) {
    // A Session whose scope is not materialized yet has no selection to follow; the next change re-reads it.
    return undefined
  }
}

/**
 * Register the meter at the sidebar foot; it reads usage on mount, when the window becomes visible again, and on request,
 * keeps the viewer's used/remaining choice in this browser's localStorage, and follows the main Session's model route.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const source = new UsageSource(async (refresh) => {
    const result = await ctx.remote.claudeCodeUsage.get(refresh)
    if (!result.ok) throw result.error
    return result.value
  })
  const display = createSnapshotStore<UsageDisplay>('remaining', { persist: { name: DISPLAY_KEY } })
  const route = selectedRoute({
    getSnapshot: () => ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined,
    subscribe: listener => ctx.uiSession.adapter.current.subscribe(listener),
  }, sessionId => sessionSelection(ctx, sessionId))
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
      hooks: { usage: source.state, display, route },
      refresh: () => { source.load(true) },
      setDisplay: (value) => { display.set(value) },
    }),
  }, UsageMeter)), 'ui-claude-code-usage: meter')
}
