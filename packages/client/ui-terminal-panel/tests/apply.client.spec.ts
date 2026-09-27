// @vitest-environment jsdom
/** Panel registrations, terminal models, retention, shortcut, and HMR disposal through the plugin lifetime. */
import { createElement } from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import type { ShortcutCommand } from '@deepseek-ai/dsh-client-shortcuts/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { LazyTerminalBody } from '../src/client/LazyTerminalBody.tsx'
import { TerminalPanel } from '../src/client/TerminalPanel.tsx'
import { TerminalGuideEntry } from '../src/client/TerminalGuideEntry.tsx'
import { TerminalRedirectBody } from '../src/client/TerminalRedirectBody.tsx'
import type { TerminalGuideEntryInjected, TerminalPanelInjected, TerminalRedirectInjected } from '../src/client/face.ts'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { TERMINAL_PANEL_PERSISTENCE } from '../src/client/panel-state.ts'
import { en, zh } from '../src/client/locales.ts'

vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn() }))
const SHORTCUT_CATALOG: readonly never[] = []

const renderedTerminal = vi.hoisted(() => vi.fn(() => null))
vi.mock('../src/client/terminal.tsx', () => ({ TerminalBody: renderedTerminal }))

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); renderedTerminal.mockClear(); localStorage.clear() })

const SESSION = 'session' as SessionId

async function mountPlugin() {
  const ctx = new Context()
  const entries: {
    name: string
    id?: string
    key?: string
    order?: number
    locale: string
    component: unknown
    inject: (id: SessionId) => unknown
  }[] = []
  const dictionaries = new Map<string, unknown>()
  const model = { state: {} }
  const terminals = {
    retainTabs: vi.fn(), view: vi.fn(() => model), close: vi.fn(),
    launchShells: vi.fn(async () => ({ shells: [], selectedShell: undefined })), selectShell: vi.fn(),
  }
  const commands: ShortcutCommand[] = []
  const removals: ((sessionId: SessionId) => void)[] = []
  const tabs = new SidebarRightTabRegistry(ctx)
  ctx.provide('sidebarRightTabs', tabs)
  ctx.provide('webTerminals', terminals as never)
  ctx.provide('remote', {
    $on: (name: string, listener: (sessionId: SessionId) => void) => {
      expect(name).toBe('api-session/removed')
      removals.push(listener)
      return () => { removals.splice(removals.indexOf(listener), 1) }
    },
  } as never)
  ctx.provide('slots', {
    inject: (_name: string, register: () => () => void) => register(),
    register: (options: Omit<typeof entries[number], 'component'>, component: unknown) => { const entry = { ...options, component }; entries.push(entry); return () => { entries.splice(entries.indexOf(entry), 1) } },
  } as never)
  ctx.provide('shortcuts', { register: (command: ShortcutCommand) => {
    commands.push(command)
    return () => { commands.splice(commands.indexOf(command), 1) }
  }, catalog: { getSnapshot: () => SHORTCUT_CATALOG, subscribe: () => () => {} } } as never)
  ctx.provide('locale', {
    bind: () => (key: string) => key,
    register: (name: string, values: unknown) => { dictionaries.set(name, values); return () => { dictionaries.delete(name) } },
  } as never)
  const theme = { preference: 'light' as const, fontSize: 14, active: { id: 'light', colorScheme: 'light' as const, tokens: {} }, themes: [], revision: 0 }
  ctx.provide('theme', { getTheme: () => theme } as never)
  const fiber = await ctx.plugin({ inject, apply })
  const panel = (sessionId = SESSION) => entries.find(entry => entry.name === 'conversation.panel.bottom')!.inject(sessionId) as TerminalPanelInjected
  const guide = (sessionId = SESSION) => entries.find(entry => entry.name === 'sidebar.right.tab.guide.entry')!.inject(sessionId) as TerminalGuideEntryInjected
  const page = (sessionId = SESSION) => entries.find(entry => entry.name === 'sidebar.right.pane.tab')!.inject(sessionId) as TerminalRedirectInjected
  return {
    entries, dictionaries, terminals, model, theme, commands, removals, panel, guide, page, tabs,
    emitTheme() { ctx.emit('theme/change', theme) },
    async dispose() { await fiber.dispose(); await ctx.fiber.dispose() },
  }
}

it('registers the panel and its Sidebar Start-page card, then releases every contribution on unload', async () => {
  expect(hostApply).not.toThrow()
  const h = await mountPlugin()
  try {
    expect(h.dictionaries.get('terminalPanel')).toEqual({ en, zh })
    expect(h.entries.map(entry => [entry.name, entry.component, entry.locale, entry.key])).toEqual([
      ['conversation.panel.bottom', TerminalPanel, 'terminalPanel', undefined],
      ['sidebar.right.tab.guide.entry', TerminalGuideEntry, 'terminalPanel', '@deepseek-ai/dsh-client-ui-terminal-panel'],
      ['sidebar.right.pane.tab', TerminalRedirectBody, 'terminalPanel', '@deepseek-ai/dsh-client-ui-terminal-panel'],
    ])
    const definition = h.tabs.get('terminal')!
    expect(definition.title('sidebar://terminal')).toBe('title')
    expect(definition.guide?.map(entry => [entry.id, entry.order, entry.commandId, entry.title(), entry.description?.()]))
      .toEqual([['open', 20, 'terminal.toggle', 'title', 'guideDescription']])
    expect(definition.guide?.[0]?.icon).toBeTypeOf('function')
    const face = h.panel()
    expect(face.hooks.theme.getSnapshot()).toBe(h.theme)
    const changed = vi.fn()
    const unsubscribe = face.hooks.theme.subscribe(changed)
    h.emitTheme()
    expect(changed).toHaveBeenCalledOnce()
    unsubscribe()
    h.emitTheme()
    expect(changed).toHaveBeenCalledOnce()
    const signal = new AbortController().signal
    await face.loadShells(signal)
    expect(h.terminals.launchShells).toHaveBeenCalledWith(SESSION, signal)
    face.selectShell('/bin/zsh')
    expect(h.terminals.selectShell).toHaveBeenCalledWith('/bin/zsh')
    expect(h.guide().hooks.shortcuts.getSnapshot()).toBe(SHORTCUT_CATALOG)
  } finally {
    await h.dispose()
  }
  expect(h.entries).toEqual([])
  expect(h.tabs.get('terminal')).toBeUndefined()
  expect(h.dictionaries.size).toBe(0)
  expect(h.commands).toEqual([])
  expect(h.removals).toEqual([])
})

it('resolves terminal models from the panel tabs and ends a closed or replaced tab', async () => {
  const h = await mountPlugin()
  try {
    const face = h.panel()
    expect(() => face.view('t1')).toThrow('has no tab t1')
    face.add('/bin/bash')
    const [first] = face.hooks.panel.getSnapshot().tabs
    expect(face.view('t1')).toBe(h.model)
    expect(h.terminals.view).toHaveBeenLastCalledWith(SESSION, 't1', first!.contentId, undefined, '/bin/bash')
    expect(face.keyedHooks.terminal('t1')).toBe(h.model.state)
    face.add()
    face.select('t1')
    expect(face.hooks.panel.getSnapshot().active).toBe('t1')
    face.replace('t1')
    expect(h.terminals.close).toHaveBeenLastCalledWith(SESSION, 't1', first!.contentId, undefined)
    expect(face.hooks.panel.getSnapshot().tabs.map(tab => tab.key)).toEqual(['t3', 't2'])
    const second = face.hooks.panel.getSnapshot().tabs[1]!
    face.close('t2')
    expect(h.terminals.close).toHaveBeenLastCalledWith(SESSION, 't2', second.contentId, undefined)
    face.close('missing')
    face.replace('missing')
    expect(h.terminals.close).toHaveBeenCalledTimes(2)
    face.resize(400)
    expect(face.hooks.panel.getSnapshot().height).toBe(400)
    face.hide()
    expect(face.hooks.panel.getSnapshot().open).toBe(false)
  } finally { await h.dispose() }
})

it('keeps every Session’s tabs retained, forgets removed Sessions, and releases holds on unload', async () => {
  localStorage.setItem(TERMINAL_PANEL_PERSISTENCE, JSON.stringify({ bySession: {
    dormant: { open: false, height: 280, tabs: [{ key: 't1', contentId: 'dormant-content', terminalId: 'kept' }], active: 't1', minted: 1 },
  } }))
  const h = await mountPlugin()
  expect(h.terminals.retainTabs).toHaveBeenLastCalledWith([{ sessionId: 'dormant', tabId: 't1', contentId: 'dormant-content' }])
  const face = h.panel('dormant' as SessionId)
  face.view('t1')
  expect(h.terminals.view).toHaveBeenLastCalledWith('dormant', 't1', 'dormant-content', 'kept' as WebTerminalId, undefined)
  const current = h.panel()
  current.add()
  expect(h.terminals.retainTabs.mock.lastCall?.[0]).toHaveLength(2)
  for (const removed of h.removals) removed('dormant' as SessionId)
  expect(h.terminals.retainTabs.mock.lastCall?.[0]).toEqual([expect.objectContaining({ sessionId: SESSION })])
  await h.dispose()
  expect(h.terminals.retainTabs).toHaveBeenLastCalledWith([])
  const calls = h.terminals.retainTabs.mock.calls.length
  current.add()
  expect(h.terminals.retainTabs).toHaveBeenCalledTimes(calls)
})

it('toggles the panel of the Session on screen and refuses while none is', async () => {
  const h = await mountPlugin()
  try {
    const command = h.commands[0]!
    expect(command.id).toBe('terminal.toggle')
    expect(command.label()).toBe('toggle')
    const input = { region: 'page', modal: null, target: null } as const
    expect(command.resolve(input)).toEqual({ status: 'blocked', reason: 'shortcut.noSession' })
    const detach = h.panel().attach()
    const result = command.resolve(input)
    if (result.status !== 'handled') throw new Error('Expected the terminal command to be available')
    result.run()
    expect(h.panel().hooks.panel.getSnapshot()).toMatchObject({ open: true, active: 't1' })
    h.guide().open()
    expect(h.panel().hooks.panel.getSnapshot()).toMatchObject({ open: true, active: 't2' })
    h.panel().hide()
    h.page().open()
    expect(h.panel().hooks.panel.getSnapshot()).toMatchObject({ open: true, active: 't2' })
    detach()
    expect(command.resolve(input)).toEqual({ status: 'blocked', reason: 'shortcut.noSession' })
  } finally { await h.dispose() }
})

it('loads the terminal body implementation when its wrapper mounts', async () => {
  render(createElement(LazyTerminalBody, {} as never))
  await waitFor(() => { expect(renderedTerminal).toHaveBeenCalledOnce() })
})
