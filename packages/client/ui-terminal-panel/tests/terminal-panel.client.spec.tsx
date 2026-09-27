// @vitest-environment jsdom
/** The panel's tabs, shell menu, hide control, resize handle, and header toggle as the user operates them. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TerminalLaunchShells, TerminalViewState } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TerminalPanel, type TerminalPanelProps } from '../src/client/TerminalPanel.tsx'
import { TerminalGuideEntry, type TerminalGuideEntryProps } from '../src/client/TerminalGuideEntry.tsx'
import { TerminalRedirectBody, type TerminalRedirectBodyProps } from '../src/client/TerminalRedirectBody.tsx'
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

function mount(initial: TerminalPanelState = shown, shells?: Promise<TerminalLaunchShells>) {
  const store = createSnapshotStore(initial)
  const states: Record<string, TerminalViewState | undefined> = { t1: { phase: 'connected', writable: true, title: 'zsh' } }
  const detach = vi.fn()
  const actions = {
    attach: vi.fn(() => detach), add: vi.fn(), select: vi.fn(), close: vi.fn(), replace: vi.fn(), hide: vi.fn(), resize: vi.fn(),
    loadShells: vi.fn((_signal: AbortSignal) => shells ?? Promise.resolve({ shells: [{ path: '/bin/zsh', name: 'zsh', args: [] }], selectedShell: '/bin/zsh' })),
    selectShell: vi.fn(),
  }
  // The test supplies the owner share and hooks the panel reads; the remaining slot props are framework-owned.
  const props: TerminalPanelProps = {
    ...actions, t, sessionId: 'session' as SessionId,
    view: vi.fn(() => ({ rename: vi.fn(async () => {}) })),
    usePanel: bindSnapshotSelector(store),
    useTerminal: (key: string, select?: (value: TerminalViewState | undefined) => unknown) =>
      select === undefined ? states[key] : select(states[key]),
    useTheme: vi.fn(),
  } as never
  const view = render(<TerminalPanel {...props} />)
  return { ...actions, detach, store, view }
}

describe('TerminalPanel', () => {
  it('attaches while mounted and renders nothing while hidden', () => {
    const h = mount({ ...EMPTY_PANEL, tabs: [] })
    expect(h.attach).toHaveBeenCalledOnce()
    expect(h.view.container.childElementCount).toBe(0)
    act(() => { h.store.set({ ...shown, open: false }) })
    expect(h.view.container.childElementCount).toBe(0)
    act(() => { h.store.set(shown) })
    expect(screen.getByRole('region', { name: en.title }).style.height).toBe('300px')
    h.view.unmount()
    expect(h.detach).toHaveBeenCalledOnce()
  })

  it('shows every tab, keeps inactive screens mounted but hidden, and selects by click or key', () => {
    const h = mount()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([['zsh', 'false'], [en.title, 'true']])
    const bodies = screen.getAllByRole('tabpanel', { hidden: true })
    expect(bodies.map(body => [body.getAttribute('aria-labelledby'), body.hidden])).toEqual([[tabs[0]!.id, true], [tabs[1]!.id, false]])
    expect(screen.getByText('body t1', { selector: 'button' }).dataset.visible).toBe('false')
    expect(screen.getByText('body t2').dataset.visible).toBe('true')
    fireEvent.click(tabs[0]!)
    expect(h.select).toHaveBeenLastCalledWith('t1')
    fireEvent.keyDown(tabs[0]!, { key: 'Enter' })
    fireEvent.keyDown(tabs[1]!, { key: ' ' })
    fireEvent.keyDown(tabs[1]!, { key: 'ArrowRight' })
    fireEvent.keyDown(tabs[1]!.querySelector('button')!, { key: 'Enter' })
    expect(h.select.mock.calls).toEqual([['t1'], ['t1'], ['t2']])
  })

  it('closes a tab without selecting it, replaces a lost terminal, hides, and opens new terminals', () => {
    const h = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal “zsh”' }))
    expect(h.close).toHaveBeenCalledExactlyOnceWith('t1')
    expect(h.select).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('body t2'))
    expect(h.replace).toHaveBeenCalledExactlyOnceWith('t2')
    fireEvent.click(screen.getByRole('button', { name: en.hide }))
    expect(h.hide).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.new }))
    expect(h.add).toHaveBeenCalledExactlyOnceWith()
  })

  it('opens a terminal in the shell chosen from the menu', async () => {
    const h = mount()
    fireEvent.click(screen.getByRole('button', { name: en.shell }))
    expect(screen.getByRole('menuitem', { name: en.shellLoading })).toBeDefined()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'zsh' }))
    expect(h.selectShell).toHaveBeenCalledWith('/bin/zsh')
    expect(h.add).toHaveBeenCalledWith('/bin/zsh')
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
    expect(h.resize.mock.calls).toEqual([[350]])
    fireEvent.pointerDown(handle, { pointerId: 3, clientY: 500 })
    fireEvent.pointerCancel(handle, { pointerId: 3 })
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(h.resize.mock.calls).toEqual([[350], [324], [276]])
  })
})

describe('TerminalGuideEntry', () => {
  it('opens the panel with its effective shortcut and drops the description when the guide omits it', () => {
    const shortcuts = createSnapshotStore([{ id: 'terminal.toggle', aria: 'Control+`', keys: ['⌃', '`'] }])
    const open = vi.fn()
    const props: TerminalGuideEntryProps = {
      t, open, kind: 'terminal', entryId: 'open', title: en.title, description: en.guideDescription,
      useShortcuts: bindSnapshotSelector(shortcuts),
    } as never
    const view = render(<TerminalGuideEntry {...props} />)
    const card = screen.getByRole('button', { name: /Terminal/u })
    expect(card.dataset.sidebarRightGuideEntry).toBe('terminal')
    expect(card.getAttribute('aria-keyshortcuts')).toBe('Control+`')
    expect(screen.getByText(en.guideDescription)).toBeTruthy()
    expect(card.querySelector('svg')?.getAttribute('width')).toBe('26')
    fireEvent.click(card)
    expect(open).toHaveBeenCalledOnce()
    act(() => { shortcuts.set([]) })
    const bare: TerminalGuideEntryProps = { t, open, kind: 'terminal', entryId: 'open', title: en.title, useShortcuts: bindSnapshotSelector(shortcuts) } as never
    view.rerender(<TerminalGuideEntry {...bare} />)
    expect(card.hasAttribute('aria-keyshortcuts')).toBe(false)
    expect(screen.queryByText(en.guideDescription)).toBeNull()
    expect(card.querySelector('svg')?.getAttribute('width')).toBe('22')
  })
})

describe('TerminalRedirectBody', () => {
  it('opens the panel and closes its Sidebar page once, across re-renders', () => {
    const open = vi.fn()
    const close = vi.fn()
    const tabInfo = { tab: { actions: { close } } }
    const props: TerminalRedirectBodyProps = { open, useTabInfo: () => tabInfo } as never
    const view = render(<TerminalRedirectBody {...props} />)
    expect(view.container.childElementCount).toBe(0)
    view.rerender(<TerminalRedirectBody {...props} open={vi.fn()} />)
    expect(open).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})
