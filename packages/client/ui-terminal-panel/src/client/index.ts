/** Register the window's bottom terminal panel, the conversation's corner button that shows it, its Start-page card, and its shortcut. */
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
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { PluginArtworkTerminal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TerminalView } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  TerminalBodyInjected, TerminalGuideEntryInjected, TerminalLauncherInjected, TerminalPanelInjected, TerminalRedirectInjected,
} from './face.ts'
import { en, zh } from './locales.ts'
import { parseTerminalKey, TerminalPanels } from './panel-state.ts'
import { TerminalLauncher } from './TerminalLauncher.tsx'
import { TerminalPanel } from './TerminalPanel.tsx'
import { TerminalGuideEntry } from './TerminalGuideEntry.tsx'
import { TerminalRedirectBody } from './TerminalRedirectBody.tsx'
// import { TerminalCleanup, type TerminalCleanupInjected } from './TerminalCleanup.tsx'

export type { TerminalPanelState, TerminalPanelTab } from './panel-state.ts'

/** Services needed by the panel, its toggle, and its terminal models. */
export const inject = ['slots', 'locale', 'remote', 'webTerminals', 'theme', 'shortcuts', 'uiSession']

/**
 * Register the panel, its corner button, its Sidebar Start-page card, the toggle shortcut and terminal retention.
 * @param ctx - Client root Context with the frame and conversation slots and the terminal service.
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
  const current: HostObservable<SessionId | undefined> = {
    getSnapshot: () => ctx.uiSession.adapter.current.getSnapshot().key as SessionId | undefined,
    subscribe: listener => ctx.uiSession.adapter.current.subscribe(listener),
  }
  // The panel spans the window below the conversation and the right Sidebar,
  // so it lives in the frame's bottom seat and follows the selected Session.
  ctx.effect(() => ctx.slots.inject('shell.bottom', () => ctx.slots.register({
    name: 'shell.bottom', locale: namespace,
    inject: (): TerminalPanelInjected => ({
      hooks: { current, theme },
      keyedHooks: {
        terminal: (key) => { const { sessionId, tabKey } = parseTerminalKey(key); return view(sessionId, tabKey).state },
        panel: sessionId => panels.panel(sessionId as SessionId),
      },
      view: (key) => { const { sessionId, tabKey } = parseTerminalKey(key); return view(sessionId, tabKey) },
      attach: sessionId => panels.attach(sessionId),
      add: (sessionId, shellPath) => { panels.add(sessionId, shellPath) },
      select: (sessionId, key) => { panels.select(sessionId, key) },
      close: (sessionId, key) => { close(sessionId, key, panels.remove(sessionId, key)) },
      replace: (sessionId, key) => { close(sessionId, key, panels.replace(sessionId, key)) },
      show: (sessionId) => { panels.open(sessionId) },
      hide: (sessionId) => { panels.hide(sessionId) },
      resize: (sessionId, height) => { panels.resize(sessionId, height) },
      loadShells: (sessionId, signal) => ctx.webTerminals.launchShells(sessionId, signal),
      selectShell: (path) => { ctx.webTerminals.selectShell(path) },
    }),
  }, TerminalPanel)), 'ui-terminal-panel.panel')
  ctx.effect(() => ctx.slots.inject('conversation.panel.bottom', () => ctx.slots.register({
    name: 'conversation.panel.bottom', locale: namespace,
    inject: (sessionId): TerminalLauncherInjected => ({
      hooks: { panel: panels.panel(sessionId), shortcuts: ctx.shortcuts.catalog },
      show: () => { panels.toggle(sessionId) },
    }),
  }, TerminalLauncher)), 'ui-terminal-panel.launcher')
  // The right Sidebar's Start page offers the panel as a card: a `terminal`
  // page type carries the card, and a page of that type, such as one a saved
  // layout restores, hands off to the panel. The Sidebar shows the Start page
  // for a Session with no message yet, so the panel is reachable before the
  // first turn.
  ctx.inject(['sidebarRightTabs'], (scope) => {
    scope.effect(() => scope.sidebarRightTabs.register({
      id, kind: 'terminal', priority: 'builtin', title: () => t('title'),
      guide: [{
        id: 'open', order: 20, commandId: 'terminal.toggle' as ShortcutCommandId,
        title: () => t('title'), description: () => t('guideDescription'), icon: PluginArtworkTerminal,
      }],
    }), 'ui-terminal-panel.guide-type')
  })
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.guide.entry', () => ctx.slots.register({
    name: 'sidebar.right.tab.guide.entry', key: id, locale: namespace,
    inject: (sessionId): TerminalGuideEntryInjected => ({
      hooks: { shortcuts: ctx.shortcuts.catalog },
      open: () => { panels.open(sessionId) },
    }),
  }, TerminalGuideEntry)), 'ui-terminal-panel.guide-entry')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: id, locale: namespace,
    inject: (sessionId): TerminalRedirectInjected => ({ open: () => { panels.open(sessionId) } }),
  }, TerminalRedirectBody)), 'ui-terminal-panel.page')
  // ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
  //   name: 'shell.overlay', id, locale: namespace,
  //   inject: (): TerminalCleanupInjected => ({
  //     hooks: { closeFailures: ctx.webTerminals.closeFailures },
  //     retryClose: (terminalId) => { ctx.webTerminals.retryClose(terminalId) },
  //   }),
  // }, TerminalCleanup)), 'ui-terminal-panel.cleanup')
}
