/**
 * Register the window's bottom terminal panel, the conversation's corner button
 * that shows it, and its shortcut; with the right Sidebar mounted, also its
 * terminal pages and the Start-page card that opens one.
 */
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { SidebarRightTabParamsMap, TabId } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
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
import type { TerminalBodyInjected, TerminalInjected, TerminalLauncherInjected, TerminalPanelInjected } from './face.ts'
import { en, zh } from './locales.ts'
import { parseTerminalKey, TerminalPanels } from './panel-state.ts'
import { TerminalLauncher } from './TerminalLauncher.tsx'
import { TerminalPanel } from './TerminalPanel.tsx'
import { TerminalGuideEntry } from './TerminalGuideEntry.tsx'
import { SidebarTerminalBody, SidebarTerminalTitle } from './SidebarTerminal.tsx'
// import { TerminalCleanup, type TerminalCleanupInjected } from './TerminalCleanup.tsx'

export type { TerminalPanelState, TerminalPanelTab } from './panel-state.ts'

/** Services needed by the panel, its toggle, and its terminal models. */
export const inject = ['slots', 'locale', 'remote', 'webTerminals', 'theme', 'shortcuts', 'uiSession']

/**
 * Register the panel, its corner button, the toggle shortcut, the Sidebar's terminal pages and Start-page card, and terminal retention.
 * @param ctx - Client root Context with the frame and conversation slots and the terminal service.
 */
export function apply(ctx: Context): void {
  const panels = new TerminalPanels(() => randomUUID())
  ctx.effect(() => () => { panels.dispose() }, 'ui-terminal-panel.persistence')
  // Panel tabs and Sidebar terminal pages together hold their Host terminals for this window.
  let sidebarTabs: () => ReturnType<TerminalPanels['retained']> = () => []
  let holding = false
  const retain = (): void => {
    if (holding) ctx.webTerminals.retainTabs([...panels.retained(), ...sidebarTabs()])
  }
  ctx.effect(() => {
    holding = true
    const unsubscribe = panels.subscribe(retain)
    retain()
    return () => { holding = false; unsubscribe(); ctx.webTerminals.retainTabs([]) }
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
  // The right Sidebar shows terminals as its own pages, each a Host terminal
  // apart from the bottom panel's. The Start page offers a card that opens one,
  // so a terminal is reachable before the Session's first turn.
  ctx.inject(['sidebarRight', 'sidebarRightTabs'], (scope) => {
    const { sidebarRight } = scope
    const navigation = (sessionId: SessionId, key: string) =>
      sidebarRight.tabDomain.occurrence(sessionId, { id: key as TabId }).navigation.getSnapshot()
    const terminalId = (params: SidebarRightTabParamsMap['terminal'] | undefined): WebTerminalId | undefined =>
      params !== undefined && 'terminalId' in params ? params.terminalId : undefined
    const sidebarView = (sessionId: SessionId, key: string): TerminalView => {
      const { address, params } = navigation(sessionId, key)
      return ctx.webTerminals.view(sessionId, key, address, terminalId(params),
        params !== undefined && 'shellPath' in params ? params.shellPath : undefined)
    }
    scope.effect(() => {
      sidebarTabs = () => sidebarRight.openTabs.getSnapshot().filter(tab => tab.kind === 'terminal')
      const unsubscribe = sidebarRight.openTabs.subscribe(retain)
      retain()
      return () => { unsubscribe(); sidebarTabs = () => []; retain() }
    }, 'ui-terminal-panel.sidebar-holds')
    scope.effect(() => scope.sidebarRightTabs.register({
      id, kind: 'terminal', multiple: true, priority: 'builtin', title: () => t('title'),
      guide: [{ id: 'open', order: 20, title: () => t('title'), description: () => t('guideDescription'), icon: PluginArtworkTerminal }],
    }), 'ui-terminal-panel.sidebar-type')
    scope.effect(() => sidebarRight.registerCloseHandler('terminal', (sessionId, tab) => {
      ctx.webTerminals.close(sessionId, tab.id, tab.contentId, terminalId(navigation(sessionId, tab.id).params))
    }), 'ui-terminal-panel.sidebar-close')
    const sidebarInject = (sessionId: SessionId): TerminalInjected => ({
      view: key => sidebarView(sessionId, key),
      keyedHooks: { terminal: key => sidebarView(sessionId, key).state },
    })
    scope.effect(() => ctx.slots.inject('sidebar.right.tab.guide.entry', () => ctx.slots.register({
      name: 'sidebar.right.tab.guide.entry', key: id, locale: namespace,
    }, TerminalGuideEntry)), 'ui-terminal-panel.guide-entry')
    scope.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab', key: id, locale: namespace,
      inject: (sessionId): TerminalBodyInjected => ({ ...sidebarInject(sessionId), hooks: { theme } }),
    }, SidebarTerminalBody)), 'ui-terminal-panel.sidebar-body')
    scope.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab.title', key: id, locale: namespace, inject: sidebarInject,
    }, SidebarTerminalTitle)), 'ui-terminal-panel.sidebar-title')
  })
  // ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
  //   name: 'shell.overlay', id, locale: namespace,
  //   inject: (): TerminalCleanupInjected => ({
  //     hooks: { closeFailures: ctx.webTerminals.closeFailures },
  //     retryClose: (terminalId) => { ctx.webTerminals.retryClose(terminalId) },
  //   }),
  // }, TerminalCleanup)), 'ui-terminal-panel.cleanup')
}
