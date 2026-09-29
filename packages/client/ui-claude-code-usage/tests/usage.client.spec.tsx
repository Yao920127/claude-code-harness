// @vitest-environment jsdom
/** The usage meter's reads, its wide and rail presentations, and the plugin lifetime. */
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ClaudeCodeUsageView } from '@deepseek-ai/dsh-llm-claude-code/types'
import { apply, inject } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'
import {
  resetText, UsageMeter, windowLabel, type UsageDisplay, type UsageMeterInjected, type UsageMeterProps,
} from '../src/client/UsageMeter.tsx'
import { UsageSource } from '../src/client/usage-source.ts'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => { cleanup(); localStorage.clear() })

const t = makeTranslate(en)

const view: ClaudeCodeUsageView = {
  subscription: 'max',
  available: true,
  readAt: '2026-09-29T00:00:00.000Z',
  windows: [
    { kind: 'five-hour', utilization: 87.4, resetsAt: '2026-09-29T03:00:00.000Z' },
    { kind: 'seven-day', utilization: null, resetsAt: 'not a time' },
    { kind: 'model', label: 'Fable', utilization: 120, resetsAt: null },
  ],
}

function settle(): Promise<void> {
  return act(async () => { await Promise.resolve() })
}

describe('UsageSource', () => {
  it('publishes the latest read, keeps a shown answer while refreshing, and ignores superseded or late reads', async () => {
    const reads: { resolve: (value: ClaudeCodeUsageView) => void; reject: (error: unknown) => void }[] = []
    const read = vi.fn((_refresh: boolean) => new Promise<ClaudeCodeUsageView>((resolve, reject) => { reads.push({ resolve, reject }) }))
    const source = new UsageSource(read)
    expect(source.state.getSnapshot()).toEqual({ phase: 'loading' })
    source.load(false)
    source.load(true)
    expect(read.mock.calls).toEqual([[false], [true]])
    reads[0]!.resolve(view)
    reads[1]!.reject('plain failure')
    await settle()
    expect(source.state.getSnapshot()).toEqual({ phase: 'failed', message: 'plain failure' })
    source.load(false)
    expect(source.state.getSnapshot()).toEqual({ phase: 'loading' })
    reads[2]!.resolve(view)
    await settle()
    expect(source.state.getSnapshot()).toEqual({ phase: 'ready', view })
    source.load(true)
    expect(source.state.getSnapshot()).toEqual({ phase: 'ready', view })
    reads[3]!.reject(new Error('offline'))
    await settle()
    expect(source.state.getSnapshot()).toEqual({ phase: 'failed', message: 'offline' })
    source.load(false)
    source.dispose()
    source.load(false)
    expect(read).toHaveBeenCalledTimes(5)
    reads[4]!.resolve(view)
    await settle()
    expect(source.state.getSnapshot()).toEqual({ phase: 'loading' })
  })
})

describe('UsageMeter', () => {
  function mount(wide: boolean, source: UsageSource, initial: UsageDisplay = 'remaining') {
    const refresh = vi.fn()
    const display = createSnapshotStore<UsageDisplay>(initial)
    const setDisplay = vi.fn((value: UsageDisplay) => { display.set(value) })
    const props = {
      wide, t, refresh, setDisplay, useUsage: bindSnapshotSelector(source.state), useDisplay: bindSnapshotSelector(display),
    } as never as UsageMeterProps
    return { refresh, setDisplay, view: render(<UsageMeter {...props} />) }
  }

  it('names windows and their reset times', () => {
    expect(windowLabel({ kind: 'model', label: 'Fable', utilization: 1, resetsAt: null }, t)).toBe('Weekly Fable')
    expect(windowLabel({ kind: 'model', utilization: 1, resetsAt: null }, t)).toBe('Weekly ')
    expect(resetText({ kind: 'five-hour', utilization: 1, resetsAt: null }, t)).toBeUndefined()
    expect(resetText({ kind: 'five-hour', utilization: 1, resetsAt: 'bad' }, t)).toBeUndefined()
    expect(resetText({ kind: 'five-hour', utilization: 1, resetsAt: '2026-09-29T03:00:00.000Z' }, t)).toMatch(/^Resets /u)
  })

  it('shows nothing until a read reports plan windows, then one colored bar per window with the chosen share', async () => {
    const answers: ((value: ClaudeCodeUsageView) => void)[] = []
    const failures: ((error: Error) => void)[] = []
    const source = new UsageSource(() => new Promise((resolve, reject) => { answers.push(resolve); failures.push(reject) }))
    const h = mount(true, source)
    expect(h.view.container.childElementCount).toBe(0)
    source.load(false)
    failures[0]!(new Error('offline'))
    await settle()
    expect(h.view.container.childElementCount).toBe(0)
    source.load(false)
    answers[1]!({ ...view, available: false, windows: [] })
    await settle()
    expect(h.view.container.childElementCount).toBe(0)
    source.load(false)
    answers[2]!({ ...view, windows: [] })
    await settle()
    expect(h.view.container.childElementCount).toBe(0)
    source.load(false)
    answers[3]!(view)
    await settle()
    const meters = screen.getAllByRole('meter')
    expect(meters.map(meter => [meter.getAttribute('aria-label'), meter.getAttribute('aria-valuenow')]))
      .toEqual([['5 hours', '87.4'], ['Weekly', null], ['Weekly Fable', '120']])
    const fills = () => meters.map(meter => Math.round(Number.parseFloat((meter.firstElementChild as HTMLElement).style.width) * 10) / 10)
    expect(screen.getByText('13% left')).toBeDefined()
    expect(screen.getByText('—')).toBeDefined()
    expect(screen.getByText('0% left')).toBeDefined()
    expect(fills()).toEqual([12.6, 0, 0])
    expect(meters.map(meter => meter.firstElementChild?.getAttribute('data-level') ?? null)).toEqual(['high', null, 'high'])
    const rows = h.view.container.querySelectorAll('[title]')
    expect([...rows].map(row => row.getAttribute('title'))).toContain('—')
    fireEvent.click(screen.getByRole('button', { name: en.refresh }))
    expect(h.refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: en['display.remaining'] }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: en['display.used'] }))
    expect(h.setDisplay).toHaveBeenCalledWith('used')
    expect(screen.getByRole('button', { name: en['display.used'] }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('87% used')).toBeDefined()
    expect(screen.getByText('100% used')).toBeDefined()
    expect(fills()).toEqual([87.4, 0, 100])
  })

  it('colors a window by its used share', async () => {
    let answer!: (value: ClaudeCodeUsageView) => void
    const source = new UsageSource(() => new Promise((resolve) => { answer = resolve }))
    mount(true, source)
    source.load(false)
    answer({ ...view, windows: [30, 50, 79.9, 80].map(utilization => ({ kind: 'five-hour' as const, utilization, resetsAt: null })) })
    await settle()
    expect(screen.getAllByRole('meter').map(meter => meter.firstElementChild?.getAttribute('data-level')))
      .toEqual(['low', 'medium', 'medium', 'high'])
  })

  it('shows the first window on the rail and every window as its hover text', async () => {
    let answer!: (value: ClaudeCodeUsageView) => void
    const source = new UsageSource(() => new Promise((resolve) => { answer = resolve }))
    const h = mount(false, source, 'used')
    expect(h.view.container.childElementCount).toBe(0)
    source.load(false)
    answer(view)
    await settle()
    const button = screen.getByRole('button', { name: en.refresh })
    expect(button.textContent).toBe('87% used')
    expect(button.getAttribute('data-level')).toBe('high')
    expect(button.title.split('\n')[1]).toMatch(/^5 hours · 87% used · Resets /u)
    fireEvent.click(button)
    expect(h.refresh).toHaveBeenCalledOnce()
  })
})

describe('Claude Code usage plugin', () => {
  it('reads usage on load, on visibility and on refresh, and releases its registrations on unload', async () => {
    expect(hostApply).not.toThrow()
    const ctx = new Context()
    const entries: { name: string; inject: () => UsageMeterInjected }[] = []
    const dictionaries = new Map<string, unknown>()
    ctx.provide('slots', {
      inject: (_name: string, register: () => () => void) => register(),
      register: (entry: typeof entries[number]) => { entries.push(entry); return () => { entries.splice(entries.indexOf(entry), 1) } },
    } as never)
    ctx.provide('locale', {
      register: (name: string, values: unknown) => { dictionaries.set(name, values); return () => { dictionaries.delete(name) } },
    } as never)
    const get = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: view })
      .mockResolvedValue({ ok: false, error: new Error('offline') })
    ctx.provide('remote', { claudeCodeUsage: { get } } as never)
    ctx.provide('remote.claudeCodeUsage', {} as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(dictionaries.get('claudeCodeUsage')).toEqual({ zh, en })
    const face = entries[0]!.inject()
    await vi.waitFor(() => { expect(face.hooks.usage.getSnapshot()).toEqual({ phase: 'ready', view }) })
    expect(face.hooks.display.getSnapshot()).toBe('remaining')
    face.setDisplay('used')
    expect(face.hooks.display.getSnapshot()).toBe('used')
    expect(localStorage.getItem('dsh.claude-code-usage.display.v1')).toBe('"used"')
    face.refresh()
    expect(get).toHaveBeenLastCalledWith(true)
    await vi.waitFor(() => { expect(face.hooks.usage.getSnapshot()).toEqual({ phase: 'failed', message: 'offline' }) })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(get).toHaveBeenLastCalledWith(false)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(get).toHaveBeenCalledTimes(3)
    Reflect.deleteProperty(document, 'visibilityState')
    await fiber.dispose()
    expect(entries).toEqual([])
    expect(dictionaries.size).toBe(0)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(get).toHaveBeenCalledTimes(3)
  })
})
