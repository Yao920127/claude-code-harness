// @vitest-environment jsdom
/** The panel's tabs, shell menu, hide control, resize handle, and corner button as the user operates them. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TerminalLaunchShells, TerminalViewState } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TerminalPanel, type TerminalPanelProps } from '../src/client/TerminalPanel.tsx'
import { TerminalLauncher, type TerminalLauncherProps } from '../src/client/TerminalLauncher.tsx'
import { TerminalGuideEntry, type TerminalGuideEntryProps } from '../src/client/TerminalGuideEntry.tsx'
import { SidebarTerminalBody, SidebarTerminalTitle, type SidebarTerminalBodyProps, type SidebarTerminalTitleProps } from '../src/client/SidebarTerminal.tsx'
import { EMPTY_PANEL, type TerminalPanelState } from '../src/client/panel-state.ts'
import { en } from '../src/client/locales.ts'

vi.mock('../src/client/LazyTerminalBody.tsx', () => ({
  LazyTerminalBody: ({ tabKey, visible, onReplace }: { tabKey: string; visible: boolean; onReplace: () => void }) => (
    <button type="button" data-visible={String(visible)} onClick={onReplace}>{`body ${tabKey}`}</button>
  ),
}))

afterEach(cleanup)

const t = makeTranslate(en)
const shown: TerminalPanelState = {
  open: true, height: 300, active: 't2', minted: 2,
  tabs: [{ key: 't1', contentId: 'c1' }, { key: 't2', contentId: 'c2' }],
}

const SESSION = 'session' as SessionId

/** @param initial - stored panel, or null for a Session that has none. */
function mount(initial: TerminalPanelState | null = shown, shells?: Promise<TerminalLaunchShells>) {
  const store = createSnapshotStore<TerminalPanelState | undefined>(initial ?? undefined)
  const current = createSnapshotStore<SessionId | undefined>(SESSION)
  const panelInfo = createSnapshotStore<{ activePanelId: string | null }>({ activePanelId: null })
  const panel = bindSnapshotSelector(store)
  const states: Record<string, TerminalViewState | undefined> = { 'session/t1': { phase: 'connected', writable: true, title: 'zsh' } }
  const detach = vi.fn()
  const actions = {
    attach: vi.fn(() => detach), add: vi.fn(), select: vi.fn(), close: vi.fn(), replace: vi.fn(),
    show: vi.fn(), hide: vi.fn(), resize: vi.fn(),
    loadShells: vi.fn((_sessionId: SessionId, _signal: AbortSignal) => shells ?? Promise.resolve({ shells: [{ path: '/bin/zsh', name: 'zsh', args: [] }], selectedShell: '/bin/zsh' })),
    selectShell: vi.fn(),
  }
  // The test supplies the hooks the panel reads; the remaining slot props are framework-owned.
  const props: TerminalPanelProps = {
    ...actions, t,
    view: vi.fn(() => ({ rename: vi.fn(async () => {}) })),
    useCurrent: bindSnapshotSelector(current),
    usePanelInfo: bindSnapshotSelector(panelInfo),
    usePanel: (sessionId: SessionId, select: (value: TerminalPanelState | undefined) => unknown) => {
      expect(sessionId).toBe(SESSION)
      return panel(select)
    },
    useTerminal: (key: string, select?: (value: TerminalViewState | undefined) => unknown) =>
      select === undefined ? states[key] : select(states[key]),
    useTheme: vi.fn(),
  } as never
  const view = render(<TerminalPanel {...props} />)
  return { ...actions, detach, store, current, panelInfo, view }
}

describe('TerminalPanel', () => {
  it('attaches while mounted and offers only the fullscreen corner button while hidden', () => {
    // A Session without a stored panel reads as the empty panel.
    const h = mount(null)
    expect(h.attach).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(screen.queryByRole('region', { name: en.title })).toBeNull()
    const launcher = screen.getByRole('button', { name: en.open })
    expect(launcher.hasAttribute('data-terminal-fullscreen-launcher')).toBe(true)
    fireEvent.click(launcher)
    expect(h.show).toHaveBeenCalledExactlyOnceWith(SESSION)
    act(() => { h.store.set({ ...shown, open: false }) })
    expect(screen.queryByRole('region', { name: en.title })).toBeNull()
    act(() => { h.store.set({ ...shown, active: undefined }) })
    expect(h.view.container.childElementCount).toBe(0)
    act(() => { h.store.set(shown) })
    expect(screen.getByRole('region', { name: en.title }).style.height).toBe('300px')
    h.view.unmount()
    expect(h.detach).toHaveBeenCalledOnce()
  })

  it('shows the selected Session only while the conversation is the main panel', () => {
    const h = mount()
    act(() => { h.panelInfo.set({ activePanelId: 'plugins' }) })
    expect(h.view.container.childElementCount).toBe(0)
    expect(h.detach).toHaveBeenCalledOnce()
    act(() => { h.panelInfo.set({ activePanelId: null }) })
    expect(screen.getByRole('region', { name: en.title })).toBeDefined()
    act(() => { h.current.set(undefined) })
    expect(h.view.container.childElementCount).toBe(0)
    expect(h.attach).toHaveBeenCalledTimes(2)
  })

  it('shows every tab, keeps inactive screens mounted but hidden, and selects by click or key', () => {
    const h = mount()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([['zsh', 'false'], [en.title, 'true']])
    const bodies = screen.getAllByRole('tabpanel', { hidden: true })
    expect(bodies.map(body => [body.getAttribute('aria-labelledby'), body.hidden])).toEqual([[tabs[0]!.id, true], [tabs[1]!.id, false]])
    expect(screen.getByText('body session/t1', { selector: 'button' }).dataset.visible).toBe('false')
    expect(screen.getByText('body session/t2').dataset.visible).toBe('true')
    fireEvent.click(tabs[0]!)
    expect(h.select).toHaveBeenLastCalledWith(SESSION, 't1')
    fireEvent.keyDown(tabs[0]!, { key: 'Enter' })
    fireEvent.keyDown(tabs[1]!, { key: ' ' })
    fireEvent.keyDown(tabs[1]!, { key: 'ArrowRight' })
    fireEvent.keyDown(tabs[1]!.querySelector('button')!, { key: 'Enter' })
    expect(h.select.mock.calls).toEqual([[SESSION, 't1'], [SESSION, 't1'], [SESSION, 't2']])
  })

  it('closes a tab without selecting it, replaces a lost terminal, hides, and opens new terminals', () => {
    const h = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal “zsh”' }))
    expect(h.close).toHaveBeenCalledExactlyOnceWith(SESSION, 't1')
    expect(h.select).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('body session/t2'))
    expect(h.replace).toHaveBeenCalledExactlyOnceWith(SESSION, 't2')
    fireEvent.click(screen.getByRole('button', { name: en.hide }))
    expect(h.hide).toHaveBeenCalledExactlyOnceWith(SESSION)
    fireEvent.click(screen.getByRole('button', { name: en.new }))
    expect(h.add).toHaveBeenCalledExactlyOnceWith(SESSION)
  })

  it('opens a terminal in the shell chosen from the menu', async () => {
    const h = mount()
    fireEvent.click(screen.getByRole('button', { name: en.shell }))
    expect(screen.getByRole('menuitem', { name: en.shellLoading })).toBeDefined()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'zsh' }))
    expect(h.selectShell).toHaveBeenCalledWith('/bin/zsh')
    expect(h.add).toHaveBeenCalledWith(SESSION, '/bin/zsh')
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull() })
  })

  it('reports an empty or failed shell discovery and retries on request', async () => {
    const empty = mount(shown, Promise.resolve({ shells: [], selectedShell: undefined }))
    fireEvent.click(screen.getByRole('button', { name: en.shell }))
    expect(await screen.findByRole('menuitem', { name: en.shellEmpty })).toBeDefined()
    empty.view.unmount()
    const failing = mount()
    failing.loadShells.mockImplementationOnce(() => Promise.reject(new Error('no shells')))
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a Host can reject with a non-Error value.
      .mockImplementationOnce(() => Promise.reject('plain'))
    fireEvent.click(screen.getByRole('button', { name: en.shell }))
    expect(await screen.findByRole('menuitem', { name: 'Terminal error: no shells' })).toBeDefined()
    fireEvent.click(screen.getByRole('menuitem', { name: en.retry }))
    expect(await screen.findByRole('menuitem', { name: 'Terminal error: plain' })).toBeDefined()
    expect(failing.loadShells).toHaveBeenCalledTimes(2)
    expect(failing.add).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull() })
  })

  it('ignores a shell discovery that settles after its menu closed', async () => {
    const pending = Promise.withResolvers<TerminalLaunchShells>()
    const h = mount(shown, pending.promise)
    const trigger = screen.getByRole('button', { name: en.shell })
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    pending.resolve({ shells: [{ path: '/bin/sh', name: 'sh', args: [] }], selectedShell: undefined })
    await act(async () => { await pending.promise })
    // The aborted discovery published nothing: reopening starts from loading.
    const rejected = Promise.withResolvers<TerminalLaunchShells>()
    h.loadShells.mockImplementationOnce(() => rejected.promise)
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: en.shellLoading })).toBeDefined()
    fireEvent.click(trigger)
    rejected.reject(new Error('late'))
    await act(async () => { await rejected.promise.catch(() => {}) })
    fireEvent.click(trigger)
    expect(screen.queryByText('Terminal error: late')).toBeNull()
  })

  it('resizes by dragging the top edge and by arrow keys', () => {
    const h = mount()
    const handle = screen.getByRole('separator', { name: en.resize })
    expect(handle.getAttribute('aria-valuenow')).toBe('300')
    handle.setPointerCapture = vi.fn()
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 100 })
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 500 })
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: 100 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 450 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 0 })
    expect(h.resize.mock.calls).toEqual([[SESSION, 350]])
    fireEvent.pointerDown(handle, { pointerId: 3, clientY: 500 })
    fireEvent.pointerCancel(handle, { pointerId: 3 })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(h.resize.mock.calls).toEqual([[SESSION, 350], [SESSION, 324], [SESSION, 276]])
  })
})

describe('TerminalLauncher', () => {
  it('shows a hidden panel from the corner and disappears while the panel is shown', () => {
    const panel = createSnapshotStore<TerminalPanelState>(EMPTY_PANEL)
    const shortcuts = createSnapshotStore([{ id: 'terminal.toggle', aria: 'Control+`', keys: ['⌃', '`'] }])
    const show = vi.fn()
    const props: TerminalLauncherProps = {
      t, show, usePanel: bindSnapshotSelector(panel), useShortcuts: bindSnapshotSelector(shortcuts),
    } as never
    const view = render(<TerminalLauncher {...props} />)
    const button = screen.getByRole('button', { name: en.open })
    expect(button.title).toBe(`${en.open} (⌃\`)`)
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Control+`')
    fireEvent.click(button)
    expect(show).toHaveBeenCalledOnce()
    act(() => { shortcuts.set([]) })
    expect(button.title).toBe(en.open)
    expect(button.hasAttribute('aria-keyshortcuts')).toBe(false)
    act(() => { panel.set({ ...shown }) })
    expect(view.container.childElementCount).toBe(0)
  })
})

describe('TerminalGuideEntry', () => {
  it('replaces the Start page with a terminal page and drops the description when the guide omits it', () => {
    const openTab = vi.fn()
    const useTabInfo = () => ({ tab: { actions: { openTab } } })
    const props: TerminalGuideEntryProps = {
      t, useTabInfo, kind: 'terminal', entryId: 'open', title: en.title, description: en.guideDescription,
    } as never
    const view = render(<TerminalGuideEntry {...props} />)
    const card = screen.getByRole('button', { name: /Terminal/u })
    expect(card.dataset.sidebarRightGuideEntry).toBe('terminal')
    expect(screen.getByText(en.guideDescription)).toBeTruthy()
    expect(card.querySelector('svg')?.getAttribute('width')).toBe('26')
    fireEvent.click(card)
    expect(openTab).toHaveBeenCalledExactlyOnceWith('terminal', { replaceTab: true })
    const bare: TerminalGuideEntryProps = { t, useTabInfo, kind: 'terminal', entryId: 'open', title: en.title } as never
    view.rerender(<TerminalGuideEntry {...bare} />)
    expect(screen.queryByText(en.guideDescription)).toBeNull()
    expect(card.querySelector('svg')?.getAttribute('width')).toBe('22')
  })
})

describe('SidebarTerminal', () => {
  it('shows the page\'s terminal by its tab id and replaces an ended terminal with a new page', () => {
    const openTab = vi.fn()
    const useTabInfo = () => ({ tab: { id: 'p1', visible: false, actions: { openTab } } })
    const bodyProps: SidebarTerminalBodyProps = { t, useTabInfo } as never
    render(<SidebarTerminalBody {...bodyProps} />)
    const body = screen.getByRole('button', { name: 'body p1' })
    expect(body.dataset.visible).toBe('false')
    fireEvent.click(body)
    expect(openTab).toHaveBeenCalledExactlyOnceWith('terminal', { replaceTab: true })
    const useTerminal = vi.fn((_key: string, select: (state: TerminalViewState | undefined) => unknown) => select({ phase: 'connected', writable: true, title: 'zsh' }))
    const titleProps: SidebarTerminalTitleProps = { t, useTabInfo, useTerminal, view: vi.fn() } as never
    render(<SidebarTerminalTitle {...titleProps} />)
    expect(useTerminal).toHaveBeenCalledWith('p1', expect.any(Function))
    expect(screen.getByText('zsh')).toBeTruthy()
  })
})
