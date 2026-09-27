// @vitest-environment jsdom
/** Per-Session panel transitions, persistence validation, and on-screen Session tracking. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  DEFAULT_PANEL_HEIGHT, EMPTY_PANEL, MAX_PANEL_HEIGHT, MIN_PANEL_HEIGHT, TERMINAL_PANEL_PERSISTENCE, TerminalPanels,
} from '../src/client/panel-state.ts'

const A = 'a' as SessionId
const B = 'b' as SessionId

let minted = 0
const panels: TerminalPanels[] = []
function create(): TerminalPanels {
  const created = new TerminalPanels(() => `content-${String(++minted)}`)
  panels.push(created)
  return created
}
function saved(): unknown {
  return JSON.parse(localStorage.getItem(TERMINAL_PANEL_PERSISTENCE)!)
}

beforeEach(() => { localStorage.clear(); minted = 0 })
afterEach(() => {
  for (const entry of panels.splice(0)) entry.dispose()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('TerminalPanels', () => {
  it('opens a first terminal on toggle, then hides and shows without ending terminals', () => {
    const state = create()
    expect(state.get(A)).toBe(EMPTY_PANEL)
    state.toggle(A)
    expect(state.get(A)).toEqual({ open: true, height: DEFAULT_PANEL_HEIGHT, tabs: [{ key: 't1', contentId: 'content-1' }], active: 't1', minted: 1 })
    state.toggle(A)
    expect(state.get(A)).toMatchObject({ open: false, tabs: [{ key: 't1' }] })
    state.hide(A)
    state.toggle(A)
    expect(state.get(A)).toMatchObject({ open: true, tabs: [{ key: 't1' }] })
    expect(state.get(B)).toBe(EMPTY_PANEL)
  })

  it('opens a hidden panel like the toggle and adds a terminal to a shown one', () => {
    const state = create()
    state.open(A)
    expect(state.get(A)).toMatchObject({ open: true, tabs: [{ key: 't1' }] })
    state.open(A)
    expect(state.get(A)).toMatchObject({ open: true, active: 't2', tabs: [{ key: 't1' }, { key: 't2' }] })
    state.hide(A)
    state.open(A)
    expect(state.get(A)).toMatchObject({ open: true, active: 't2', tabs: [{ key: 't1' }, { key: 't2' }] })
  })

  it('adds, selects, replaces, and removes tabs, choosing a neighbour and hiding when none remain', () => {
    const state = create()
    state.add(A)
    state.add(A, '/bin/zsh')
    state.add(A)
    expect(state.get(A).tabs.map(tab => tab.key)).toEqual(['t1', 't2', 't3'])
    expect(state.get(A).tabs[1]).toEqual({ key: 't2', contentId: 'content-2', shellPath: '/bin/zsh' })
    state.select(A, 't2')
    state.select(A, 't2')
    state.select(A, 'missing')
    expect(state.get(A).active).toBe('t2')
    expect(state.replace(A, 't2')).toMatchObject({ key: 't2' })
    expect(state.get(A)).toMatchObject({ active: 't4', minted: 4 })
    expect(state.replace(A, 't1')).toMatchObject({ key: 't1' })
    expect(state.get(A)).toMatchObject({ active: 't4', tabs: [{ key: 't5' }, { key: 't4' }, { key: 't3' }] })
    expect(state.replace(A, 'missing')).toBeUndefined()
    expect(state.remove(A, 't4')).toMatchObject({ key: 't4' })
    expect(state.get(A).active).toBe('t3')
    expect(state.remove(A, 't5')).toMatchObject({ key: 't5' })
    expect(state.get(A)).toMatchObject({ active: 't3', open: true })
    expect(state.remove(A, 'missing')).toBeUndefined()
    state.remove(A, 't3')
    expect(state.get(A)).toMatchObject({ open: false, tabs: [], active: undefined })
  })

  it('clamps heights and ignores unchanged resizes', () => {
    const state = create()
    const listener = vi.fn()
    state.subscribe(listener)
    state.resize(A, 10)
    expect(state.get(A).height).toBe(MIN_PANEL_HEIGHT)
    state.resize(A, 99_999)
    expect(state.get(A).height).toBe(MAX_PANEL_HEIGHT)
    state.resize(A, 333.6)
    expect(state.get(A).height).toBe(334)
    listener.mockClear()
    state.resize(A, 334)
    expect(listener).not.toHaveBeenCalled()
  })

  it('exposes stable per-Session observables and every Session’s retained tabs', () => {
    const state = create()
    const view = state.panel(A)
    expect(state.panel(A)).toBe(view)
    const listener = vi.fn()
    const unsubscribe = view.subscribe(listener)
    state.add(A)
    state.add(B)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(view.getSnapshot().tabs).toHaveLength(1)
    expect(state.retained()).toEqual([
      { sessionId: A, tabId: 't1', contentId: 'content-1' },
      { sessionId: B, tabId: 't1', contentId: 'content-2' },
    ])
    unsubscribe()
    expect(state.forget(A)).toEqual([{ key: 't1', contentId: 'content-1' }])
    expect(state.forget(A)).toEqual([])
    expect(state.retained()).toEqual([{ sessionId: B, tabId: 't1', contentId: 'content-2' }])
  })

  it('tracks the Session whose panel mounted last and is still on screen', () => {
    const state = create()
    expect(state.current).toBeUndefined()
    const first = state.attach(A)
    const second = state.attach(B)
    expect(state.current).toBe(B)
    second()
    second()
    expect(state.current).toBe(A)
    first()
    expect(state.current).toBeUndefined()
  })

  it('persists every Session’s panel and restores it in a new window', () => {
    const state = create()
    state.add(A, '/bin/bash')
    state.resize(A, 300)
    expect(saved()).toEqual({ bySession: { a: {
      open: true, height: 300, tabs: [{ key: 't1', contentId: 'content-1', shellPath: '/bin/bash' }], active: 't1', minted: 1,
    } } })
    state.dispose()
    state.add(B)
    expect(saved()).not.toHaveProperty('bySession.b')
    expect(create().get(A)).toEqual({ open: true, height: 300, tabs: [{ key: 't1', contentId: 'content-1', shellPath: '/bin/bash' }], active: 't1', minted: 1 })
  })

  it.each([
    ['malformed JSON', '{'],
    ['an unexpected envelope', JSON.stringify({ sessions: {} })],
    ['a height out of range', JSON.stringify({ bySession: { a: { open: true, height: 5, tabs: [], minted: 0 } } })],
    ['an active key without its tab', JSON.stringify({ bySession: { a: { open: true, height: 280, tabs: [], active: 't1', minted: 1 } } })],
    ['tabs without an active key', JSON.stringify({ bySession: { a: { open: true, height: 280, tabs: [{ key: 't1', contentId: 'c' }], minted: 1 } } })],
    ['an invalid tab key', JSON.stringify({ bySession: { a: { open: true, height: 280, tabs: [{ key: 'x', contentId: 'c' }], active: 'x', minted: 1 } } })],
  ])('starts empty from %s', (_case, raw) => {
    localStorage.setItem(TERMINAL_PANEL_PERSISTENCE, raw)
    expect(create().get(A)).toBe(EMPTY_PANEL)
  })

  it('works without readable or writable browser storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const state = create()
    state.add(A)
    expect(state.get(A).tabs).toHaveLength(1)
  })

  it('works where browser storage does not exist', () => {
    vi.stubGlobal('localStorage', undefined)
    try {
      const state = create()
      state.add(A)
      expect(state.get(A).tabs).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
