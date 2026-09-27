/** Register the terminal panel below each Session's conversation, its composer toggle, and its shortcut. */
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-terminal-controller/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { TerminalView } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { TerminalBodyInjected, TerminalPanelInjected, TerminalToggleInjected } from './face.ts'
import { en, zh } from './locales.ts'
import { TerminalPanels } from './panel-state.ts'
import { TerminalPanel } from './TerminalPanel.tsx'
import { TerminalToggle } from './TerminalToggle.tsx'
// import { TerminalCleanup, type TerminalCleanupInjected } from './TerminalCleanup.tsx'

export type { TerminalPanelState, TerminalPanelTab } from './panel-state.ts'

/** Services needed by the panel, its toggle, and its terminal models. */
export const inject = ['slots', 'locale', 'remote', 'webTerminals', 'theme', 'shortcuts']

/**
 * Register the panel, its composer toggle, the toggle shortcut and terminal retention.
 * @param ctx - Client root Context with the conversation slots and terminal service.
 */
export function apply(ctx: Context): void {
  const panels = new TerminalPanels(() => randomUUID())
  ctx.effect(() => () => { panels.dispose() }, 'ui-terminal-panel.persistence')
  ctx.effect(() => {
    const sync = (): void => { ctx.webTerminals.retainTabs(panels.retained()) }
    const unsubscribe = panels.subscribe(sync)
    sync()
    return () => { unsubscribe(); ctx.webTerminals.retainTabs([]) }
  }, 'ui-terminal-panel.window-holds')
  ctx.effect(() => ctx.remote.$on('api-session/removed', (sessionId) => { panels.forget(sessionId) }),
    'ui-terminal-panel.session-removal')
  const view = (sessionId: SessionId, key: string): TerminalView => {
    const tab = panels.get(sessionId).tabs.find(entry => entry.key === key)
    if (tab === undefined) throw new Error(`terminal panel of session ${sessionId} has no tab ${key}`)
    return ctx.webTerminals.view(sessionId, key, tab.contentId, tab.terminalId, tab.shellPath)
  }
  const close = (sessionId: SessionId, key: string, removed: ReturnType<TerminalPanels['remove']>): void => {
    if (removed !== undefined) ctx.webTerminals.close(sessionId, key, removed.contentId, removed.terminalId)
  }
  const namespace = 'terminalPanel'
  const id = '@deepseek-ai/dsh-client-ui-terminal-panel'
  const t = ctx.locale.bind(namespace)
  ctx.effect(() => ctx.shortcuts.register({
    id: 'terminal.toggle' as ShortcutCommandId, label: () => t('toggle'), aliases: ['terminal', 'new terminal', 'shell'],
    defaults: {
      'desktop:macos': { code: 'Backquote', modifiers: ['control'] },
      'desktop:windows': { code: 'Backquote', modifiers: ['control'] },
      'desktop:linux': { code: 'Backquote', modifiers: ['control'] },
      'web:macos': { code: 'Backquote', modifiers: ['control'] },
      'web:windows': { code: 'Backquote', modifiers: ['control'] },
    },
    regions: ['page', 'editable', 'terminal'], modals: [],
    resolve: () => {
      const sessionId = panels.current
      if (sessionId === undefined) return { status: 'blocked', reason: t('shortcut.noSession') }
      return { status: 'handled', run: () => { panels.toggle(sessionId) } }
    },
  }), 'ui-terminal-panel: shortcut')
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'ui-terminal-panel.copy')
  const theme: TerminalBodyInjected['hooks']['theme'] = {
    getSnapshot: () => ctx.theme.getTheme(),
    subscribe: listener => ctx.on('theme/change', listener),
  }
  ctx.effect(() => ctx.slots.inject('conversation.panel.bottom', () => ctx.slots.register({
    name: 'conversation.panel.bottom', locale: namespace,
    inject: (sessionId): TerminalPanelInjected => ({
      hooks: { panel: panels.panel(sessionId), theme },
      keyedHooks: { terminal: key => view(sessionId, key).state },
      view: key => view(sessionId, key),
      attach: () => panels.attach(sessionId),
      add: (shellPath) => { panels.add(sessionId, shellPath) },
      select: (key) => { panels.select(sessionId, key) },
      close: (key) => { close(sessionId, key, panels.remove(sessionId, key)) },
      replace: (key) => { close(sessionId, key, panels.replace(sessionId, key)) },
      hide: () => { panels.hide(sessionId) },
      resize: (height) => { panels.resize(sessionId, height) },
      loadShells: signal => ctx.webTerminals.launchShells(sessionId, signal),
      selectShell: (path) => { ctx.webTerminals.selectShell(path) },
    }),
  }, TerminalPanel)), 'ui-terminal-panel.panel')
  // The composer toolbar shows for every selected Session, including one that
  // has no message yet, so the panel is reachable before the first turn.
  ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id,
    locale: namespace,
    inject: (sessionId): TerminalToggleInjected => ({
      hooks: { panel: panels.panel(sessionId), shortcuts: ctx.shortcuts.catalog },
      toggle: () => { panels.toggle(sessionId) },
    }),
  }, TerminalToggle)), 'ui-terminal-panel.toggle')
  // ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
  //   name: 'shell.overlay', id, locale: namespace,
  //   inject: (): TerminalCleanupInjected => ({
  //     hooks: { closeFailures: ctx.webTerminals.closeFailures },
  //     retryClose: (terminalId) => { ctx.webTerminals.retryClose(terminalId) },
  //   }),
  // }, TerminalCleanup)), 'ui-terminal-panel.cleanup')
}
