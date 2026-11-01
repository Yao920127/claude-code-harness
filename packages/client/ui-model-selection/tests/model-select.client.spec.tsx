// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import { ModelSelect } from '../src/client/ModelSelect.tsx'
import { en, zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

// The seat's key domain is model ∪ common; the stub mirrors the real lookup
// chain: package dictionary, then common vocabulary, then the key.
const t: ComponentProps<typeof ModelSelect>['t'] = (key, params) => {
  const template = (zh as Record<string, string>)[key]
    ?? (commonZh as Record<string, string>)[key]
    ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

const reasoning = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max', description: 'Largest budget' },
  ],
  defaultEffort: 'high',
}

function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        description: 'Fast catalog description',
        reasoning,
      }],
    }],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
    ...overrides,
  }
}

afterEach(cleanup)

describe('ModelSelect reasoning effort', () => {
  it('shows the effort levels as slider stops and submits the released level, keeping the menu open', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ current: selection }))
      return { ok: true as const, value: undefined }
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', {
      name: '選擇模型，目前 DeepSeek-V4-Flash，推理等級 High',
    })
    fireEvent.click(trigger)
    const slider = screen.getByRole('slider', { name: /推理等級/ })
    expect([(slider as HTMLInputElement).max, slider.getAttribute('aria-valuetext')]).toEqual(['2', 'High'])
    expect(screen.getByText('(High)')).toBeTruthy()
    expect(screen.queryByText('Largest budget')).toBeNull()

    fireEvent.change(slider, { target: { value: '2' } })
    expect(screen.getByText('(Max)')).toBeTruthy()
    expect(select).not.toHaveBeenCalled()
    fireEvent.pointerUp(slider)
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'max',
      })
      expect(trigger.getAttribute('aria-label')).toBe('選擇模型，目前 DeepSeek-V4-Flash，推理等級 Max')
    })
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('commits keyboard steps on key release and on blur, and skips an unchanged level', () => {
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    render(<ModelSelect locked={false} available directory={createSnapshotStore(state())} load={vi.fn()} select={select} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇模型/ }))
    const slider = screen.getByRole('slider', { name: /推理等級/ })
    fireEvent.change(slider, { target: { value: '0' } })
    fireEvent.keyUp(slider, { key: 'Shift' })
    expect(select).not.toHaveBeenCalled()
    fireEvent.keyUp(slider, { key: 'Home' })
    expect(select).toHaveBeenLastCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'off' })
    fireEvent.change(slider, { target: { value: '2' } })
    fireEvent.blur(slider)
    expect(select).toHaveBeenLastCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'max' })
    fireEvent.change(slider, { target: { value: '1' } })
    fireEvent.pointerUp(slider)
    fireEvent.pointerUp(slider)
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('offers provider default only when the adapter does not configure a model default', async () => {
    const directory = createSnapshotStore(state({
      groups: [{
        id: 'provider',
        name: 'Provider',
        models: [{
          id: 'model',
          name: 'Model',
          reasoning: { efforts: [{ id: 'standard', name: 'Standard' }] },
        }],
      }],
      current: { provider: 'provider', model: 'model' },
    }))
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)

    fireEvent.click(screen.getByRole('button', {
      name: '選擇模型，目前 Model，推理等級 Default',
    }))
    const slider = screen.getByRole('slider', { name: /推理等級/ })
    expect([(slider as HTMLInputElement).max, slider.getAttribute('aria-valuetext')]).toEqual(['1', 'Default'])
    fireEvent.change(slider, { target: { value: '1' } })
    fireEvent.pointerUp(slider)
    expect(select).toHaveBeenCalledWith({ provider: 'provider', model: 'model', reasoningEffort: 'standard' })
    directory.set(state({
      groups: [{ id: 'provider', name: 'Provider', models: [{ id: 'model', name: 'Model', reasoning: { efforts: [{ id: 'standard', name: 'Standard' }] } }] }],
      current: { provider: 'provider', model: 'model', reasoningEffort: 'standard' },
    }))
    fireEvent.change(await screen.findByRole('slider', { name: /推理等級/ }), { target: { value: '0' } })
    fireEvent.pointerUp(screen.getByRole('slider', { name: /推理等級/ }))
    expect(select).toHaveBeenLastCalledWith({ provider: 'provider', model: 'model' })
  })

  it('disables the slider of a model with a single level', () => {
    const directory = createSnapshotStore(state({
      groups: [{ id: 'p', name: 'P', models: [{ id: 'm', name: 'M', reasoning: { efforts: [{ id: 'only', name: 'Only' }], defaultEffort: 'only' } }] }],
      current: { provider: 'p', model: 'm' },
    }))
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /選擇模型/ }))
    expect(screen.getByRole('slider', { name: /推理等級/ }).hasAttribute('disabled')).toBe(true)
  })

  it('shows the durable model id when the catalog has no matching display name', () => {
    const directory = createSnapshotStore(state({
      current: { provider: 'deepseek-official', model: 'removed-model' },
    }))
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', { name: '選擇模型，目前 deepseek-official/removed-model' })
    expect(trigger.textContent).toContain('deepseek-official/removed-model')
    fireEvent.click(trigger)
    expect(screen.queryByRole('menuitem', { name: /推理等級/ })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    expect(screen.queryByRole('menuitemradio', { name: 'removed-model' })).toBeNull()
    expect(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })).toBeTruthy()
    expect(screen.queryByText('Fast catalog description')).toBeNull()
  })

  it.each(['model', 'provider'])('keeps the saved id and effort when the selected %s disappears', (removed) => {
    const directory = createSnapshotStore(state({ retainedEffort: 'High' }))
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
    expect(screen.getByRole('button', { name: /選擇模型，目前/ }).textContent).toContain('DeepSeek-V4-Flash')
    act(() => { directory.update((snapshot) => {
      snapshot.groups = removed === 'provider' ? [] : snapshot.groups.map(group => ({ ...group, models: [] }))
      snapshot.routable = false
    }) })
    expect(screen.getByRole('button', { name: /選擇模型，目前/ }).textContent)
      .toMatchInlineSnapshot('"deepseek-official/deepseek-v4-flashHigh"')
    expect(directory.getSnapshot().current).toEqual(state().current)
  })

  it('shows loading until the catalog and Session projection are both ready', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: null,
      routable: null,
      groups: [],
      status: 'loading',
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
      t={t}
    />)

    expect(screen.getByRole('button', { name: '正在載入模型…' }).textContent)
      .toContain('正在載入模型…')
    directory.set(state())
    await waitFor(() => {
      expect(screen.getByRole('button', {
        name: '選擇模型，目前 DeepSeek-V4-Flash，推理等級 High',
      })).toBeTruthy()
    })
  })

  it.each([false, true])('announces rejected selections with ownership guidance only for held writers (%s)', async (sessionInUse) => {
    const groups = [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({ groups }))
    const select = vi.fn(async () => {
      const error = sessionInUse
        ? new RemoteError('session/writer-held', 'writer held', { sessionId: SessionId('owned') })
        : new RemoteError('session/model-unavailable', 'session already contains images', { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
      directory.set(state({ groups, status: 'error', error: 'unrelated catalog refresh' }))
      return { ok: false as const, error }
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    const trigger = screen.getByRole('button', { name: /選擇模型|目前/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }))
    const toast = await screen.findByRole('alert')
    expect(document.activeElement).toBe(trigger)
    expect(toast.textContent).toBe(sessionInUse
      ? zh['error.sessionInUse']
      : '模型操作失敗：session/model-unavailable: session already contains images')
    // The selection failure does not render the in-menu load strip (no Retry).
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull()
  })

  it('spins on the trigger and the chosen model row until the selection settles, across pane changes', async () => {
    const groups = [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
      ],
    }]
    const directory = createSnapshotStore<ModelDirectoryState>(state({ groups }))
    let settle!: () => void
    const select = vi.fn((selection: ModelSelection) => {
      directory.set(state({ groups, status: 'selecting', pending: selection }))
      return new Promise<{ ok: true; value: undefined }>((resolve) => {
        settle = () => {
          directory.set(state({ groups, current: selection }))
          resolve({ ok: true, value: undefined })
        }
      })
    })
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)
    const spinners = () => document.querySelectorAll('[data-state="ongoing"]')

    const trigger = screen.getByRole('button', { name: /選擇模型|目前/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: /模型/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }))
    expect(spinners()).toHaveLength(2)
    expect(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ }).querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(trigger.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(trigger.getAttribute('aria-busy')).toBe('true')

    // Leaving the pane unmounts the row; the trigger keeps the feedback.
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('menuitemradio')).toBeNull()
    expect(spinners()).toHaveLength(1)
    expect(trigger.querySelector('[data-state="ongoing"]')).not.toBeNull()

    await act(async () => { settle() })
    expect(spinners()).toHaveLength(0)
    expect(trigger.getAttribute('aria-busy')).toBe('false')
  })

  it('spins on the effort row only while its own level is pending', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state())
    const select = vi.fn((selection: ModelSelection) => {
      directory.set(state({ status: 'selecting', pending: selection }))
      return new Promise<undefined>(() => {})
    })
    render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={select} t={t} />)

    fireEvent.click(screen.getByRole('button', { name: /選擇模型|目前/ }))
    const slider = screen.getByRole('slider', { name: /推理等級/ })
    fireEvent.change(slider, { target: { value: '2' } })
    fireEvent.pointerUp(slider)
    expect(slider.closest('div')?.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('portals the placed menu card to body and closes only on truly-outside mousedown', () => {
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!
    const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 300 })
    try {
      const { container } = render(<ModelSelect
        locked={false}
        available
        directory={createSnapshotStore(state())}
        load={vi.fn()}
        select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
        t={t}
      />)
      const trigger = screen.getByRole('button', { name: /選擇模型/ })
      fireEvent.click(trigger)
      const menu = screen.getByRole('menu')
      // Outside the composer subtree — column overflow clips cannot crop it.
      expect(container.contains(menu)).toBe(false)
      expect(menu.parentElement).toBe(document.body)
      // jsdom anchor rects are all zero, so the measured 200x300 card clamps
      // to the 12px viewport margin on both axes.
      expect(menu.style.left).toBe('12px')
      expect(menu.style.top).toBe('12px')
      // Interactions inside the trigger subtree or the portaled card stay open.
      expect(fireEvent.mouseDown(menu)).toBe(true)
      expect(fireEvent.mouseDown(trigger)).toBe(false)
      fireEvent.blur(trigger, { relatedTarget: menu })
      expect(screen.getByRole('menu')).toBeTruthy()
      fireEvent.mouseDown(document.body)
      expect(screen.queryByRole('menu')).toBeNull()
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth)
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight)
    }
  })

  it('renders no Agent-bound control for an addressed subagent session', () => {
    const load = vi.fn()
    render(<ModelSelect
      locked={false}
      available={false}
      directory={createSnapshotStore(state())}
      load={load}
      select={vi.fn().mockResolvedValue(undefined)}
      t={t}
    />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
})

describe('ModelSelect keyboard walk', () => {
  function mountOpen() {
    const select = vi.fn().mockResolvedValue({ ok: true, value: undefined })
    render(<ModelSelect
      locked={false}
      available
      directory={createSnapshotStore(state())}
      load={vi.fn()}
      select={select}
      t={t}
    />)
    fireEvent.click(screen.getByRole('button', { name: /選擇模型/ }))
    return select
  }

  it('prevents button mousedown defaults in the model pane without selecting it', () => {
    const select = mountOpen()
    const cell = screen.getByRole('menuitem', { name: /^模型/ })
    expect(fireEvent.mouseDown(cell.firstElementChild!)).toBe(false)
    fireEvent.click(cell)
    const rows = screen.getAllByRole('menuitemradio')
    const focused = document.activeElement
    expect(fireEvent.mouseDown(rows[0]!.firstElementChild!)).toBe(false)
    fireEvent.mouseUp(screen.getByRole('menu'))
    expect(select).not.toHaveBeenCalled()
    fireEvent.keyDown(focused!, { key: 'Escape' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /^模型/ }))
  })

  it('↑↓ walk the rows of the shown pane, wrapping, and stay open', () => {
    mountOpen()
    // The trigger holds focus while the menu opens: the first forward step
    // enters at the first cell instead of skipping it. false = preventDefault ran.
    const [cell] = screen.getAllByRole('menuitem')
    const slider = screen.getByRole('slider', { name: /推理等級/ })
    expect(fireEvent.keyDown(cell!, { key: 'ArrowDown' })).toBe(false)
    expect(document.activeElement).toBe(cell)
    fireEvent.keyDown(cell!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(slider)
    fireEvent.keyDown(slider, { key: 'ArrowDown' }) // wraps to the top
    expect(document.activeElement).toBe(cell)
    fireEvent.keyDown(cell!, { key: 'ArrowUp' }) // wraps to the bottom
    expect(document.activeElement).toBe(slider)
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('Tab settles the focused row like Enter and closes the menu', async () => {
    const select = mountOpen()
    fireEvent.click(screen.getByRole('menuitem', { name: /^模型/ }))
    const [row] = screen.getAllByRole('menuitemradio')
    expect(fireEvent.keyDown(row!, { key: 'Tab' })).toBe(false)
    // The model in use settles without a new selection.
    expect(select).not.toHaveBeenCalled()
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull() })
  })

  it('Shift+Tab leaves the model list and then closes, like Escape', () => {
    mountOpen()
    fireEvent.click(screen.getByRole('menuitem', { name: /^模型/ }))
    const rows = screen.getAllByRole('menuitemradio')
    expect(fireEvent.keyDown(rows[0]!, { key: 'Tab', shiftKey: true })).toBe(false)
    const [cell] = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(cell)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(cell!, { key: 'Tab', shiftKey: true })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Tab with the keyboard still on the trigger enters the menu at the value in use', () => {
    render(<ModelSelect
      locked={false}
      available
      directory={createSnapshotStore(state())}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
      t={t}
    />)
    const trigger = screen.getByRole('button', { name: /選擇模型/ })
    fireEvent.click(trigger)
    expect(fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(false)
    // The root pane's first cell carries the current selection.
    const cells = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(cells[0])
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('a backward step from outside the list enters at the last row, and a closed menu leaves Tab native', () => {
    mountOpen()
    const [modelRow] = screen.getAllByRole('menuitem')
    expect(fireEvent.keyDown(modelRow!, { key: 'ArrowUp' })).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('slider', { name: /推理等級/ }))
    const trigger = screen.getByRole('button', { name: /選擇模型/ })
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(fireEvent.keyDown(trigger, { key: 'Tab' })).toBe(true)
  })

  it('keeps the card navigable when a pane has no rows, and leaves a retry its Tab', () => {
    const load = vi.fn()
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      groups: [], failures: [], status: 'error', error: 'catalog down',
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={load}
      select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
      t={t}
    />)
    const trigger = screen.getByRole('button', { name: /選擇模型/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: /^模型/ }))
    // No rows to hand the keyboard to: the trigger keeps it, so the card's
    // keys still reach the menu.
    expect(document.activeElement).toBe(trigger)

    const retry = screen.getByRole('button', { name: '重試' })
    expect(fireEvent.mouseDown(retry)).toBe(false)
    fireEvent.click(retry)
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('menu')).toBeTruthy()
    retry.focus()
    // A control that is not a row keeps the browser's traversal.
    expect(fireEvent.keyDown(retry, { key: 'Tab' })).toBe(true)
    // Escape still backs out of the pane and then closes the card.
    fireEvent.keyDown(retry, { key: 'Escape' })
    // Back on the root pane, whose only cell remains (no model means no effort row).
    const cell = screen.getAllByRole('menuitem')[0]!
    fireEvent.keyDown(cell, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('drills into the model list on the selected model', () => {
    mountOpen()
    fireEvent.click(screen.getByRole('menuitem', { name: /^模型/ }))
    const rows = screen.getAllByRole('menuitemradio')
    expect(rows[0]!.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(rows[0])
  })

  it('Escape from the model list lands back on the model cell', () => {
    mountOpen()
    fireEvent.click(screen.getByRole('menuitem', { name: /^模型/ }))
    fireEvent.keyDown(screen.getAllByRole('menuitemradio')[0]!, { key: 'Escape' })
    const cells = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(cells[0])
  })

  it('a pane whose rows mark no current value opens on its first row', () => {
    // The session runs a model the catalog no longer lists: no row is checked.
    render(<ModelSelect
      locked={false}
      available
      directory={createSnapshotStore(state({ current: { provider: 'gone', model: 'gone' } }))}
      load={vi.fn()}
      select={vi.fn().mockResolvedValue({ ok: true, value: undefined })}
      t={t}
    />)
    fireEvent.click(screen.getByRole('button', { name: /選擇模型/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^模型/ }))
    const rows = screen.getAllByRole('menuitemradio')
    expect(rows.every(row => row.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(document.activeElement).toBe(rows[0])
  })
})

it('shows the unselected model control with the inherited effort', async () => {
  const directory = createSnapshotStore<ModelDirectoryState>(state({ current: null, routable: false, retainedEffort: 'High' }))
  render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
  const trigger = screen.getByRole('button', { name: '請選擇模型' })
  expect(trigger.hasAttribute('disabled')).toBe(false)
  await expect(`${trigger.textContent}\n`).toMatchFileSnapshot('./expected/unselected-model.txt')
  expect(trigger.textContent).toContain('High')
  fireEvent.click(trigger)
  expect(screen.queryByRole('menuitem', { name: /模型/ })).toBeNull()
  const model = screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Flash' })
  expect(document.activeElement).toBe(model)
  fireEvent.keyDown(model, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
})


it('places account and official models before third-party models', async () => {
  const groups = ['custom', 'deepseek-official', 'deepseek-account', 'another'].map(id => ({
    id, name: id, models: [1, 2].map(index => ({ id: `${id}-${index}`, name: `${id}-${index}` })),
  }))
  const directory = createSnapshotStore<ModelDirectoryState>(state({ current: null, groups }))
  render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: '請選擇模型' }))
  const names = screen.getAllByRole('menuitemradio').map(row => row.textContent)
  expect(names).toEqual([
    'deepseek-account-1', 'deepseek-account-2', 'deepseek-official-1', 'deepseek-official-2',
    'custom-1', 'custom-2', 'another-1', 'another-2',
  ])
  expect(groups.map(group => group.id)).toEqual(['custom', 'deepseek-official', 'deepseek-account', 'another'])
  await expect(`${names.join('\n')}\n`).toMatchFileSnapshot('./expected/account-first.txt')
})

it.each([en, zh])('localizes the account group while preserving external names', (copy) => {
  const groups = ['deepseek-account', 'custom'].map(id => ({
    id, name: id === 'deepseek-account' ? 'DeepSeek Account' : 'My Gateway',
    models: [{ id: 'model', name: 'Model' }],
  }))
  render(<ModelSelect locked={false} available
    directory={createSnapshotStore(state({ current: null, groups }))}
    load={vi.fn()} select={vi.fn()} t={key => key in copy ? copy[key as keyof typeof copy] : key} />)
  fireEvent.click(screen.getByRole('button', { name: copy['trigger.selectAria'] }))
  expect(screen.getByRole('group', { name: copy['provider.account'] })).toBeTruthy()
  expect(screen.getByRole('group', { name: 'My Gateway' })).toBeTruthy()
})

it('restores the account model name after login without changing the saved route', () => {
  const groups = [{ id: 'deepseek-account', name: 'DeepSeek Account', models: [
    { id: 'deepseek-flash', name: 'DeepSeek Flash', reasoning },
  ] }]
  const selected = { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' }
  const directory = createSnapshotStore(state({ current: selected, groups, retainedEffort: 'High' }))
  render(<ModelSelect locked={false} available directory={directory} load={vi.fn()} select={vi.fn()} t={t} />)
  expect(screen.getByRole('button', { name: /選擇模型，目前/ }).textContent).toBe('DeepSeek FlashHigh')
  act(() => { directory.update((snapshot) => { snapshot.groups = []; snapshot.routable = false }) })
  expect(screen.getByRole('button', { name: /選擇模型，目前/ }).textContent)
    .toMatchInlineSnapshot('"deepseek-account/deepseek-flashHigh"')
  act(() => { directory.update((snapshot) => { snapshot.groups = groups; snapshot.routable = true }) })
  expect(screen.getByRole('button', { name: /選擇模型，目前/ }).textContent).toBe('DeepSeek FlashHigh')
  expect(directory.getSnapshot().current).toEqual(selected)
})
