// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector, makeTranslate, stubConfigForm, type StubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SearchProviderCard, type SearchProviderCardProps } from '../src/client/SearchProviderCard.tsx'
import {
  SearchProviderCardController, type SearchProviderCardState, type SearchProviderSettings,
} from '../src/client/search-provider-card-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** A Host that accepts every settings mutation. */
function acceptWrites(host: StubConfigForm<SearchProviderSettings>): void {
  host.mutate.mockImplementation((ops: readonly SettingsPathOpView[]) => {
    const value: Record<string, unknown> = { ...host.scope.getSnapshot().value }
    const user: Record<string, unknown> = { ...host.scope.getSnapshot().user as object }
    for (const op of ops) {
      const field = op.path[0]!
      if (op.op === 'set') {
        value[field] = op.value
        user[field] = op.value
      } else {
        Reflect.deleteProperty(user, field)
        value[field] = (host.scope.getSnapshot().base as Record<string, unknown>)[field]
      }
    }
    host.publish({ value, user })
    return Promise.resolve(true)
  })
}

/** Credentials domain scripted per reference. */
function credentials(configured: Record<string, boolean>) {
  const describe = vi.fn((refs: readonly string[]) => Promise.resolve({
    ok: true as const,
    value: Object.fromEntries(refs.map(ref => [ref, { configured: configured[ref] ?? false, writable: ref !== 'READ_ONLY' }])),
  }))
  const set = vi.fn((ref: string) => {
    configured[ref] = true
    return Promise.resolve({ ok: true as const, value: undefined })
  })
  return { ctx: { remote: { credentials: { describe, set } } } as never, describe, set }
}

function ready(host: StubConfigForm<SearchProviderSettings>, searchProvider = 'claude-code'): void {
  host.publish({ status: 'ready', writable: true, value: { searchProvider }, base: { searchProvider }, user: {} })
}

describe('SearchProviderCardController', () => {
  it('reports the inherited provider and how it authenticates', async () => {
    const host = stubConfigForm<SearchProviderSettings>()
    const api = credentials({})
    const controller = new SearchProviderCardController(host.scope, api.ctx)
    ready(host)
    const state = () => controller.inject().hooks.searchProviderCard.getSnapshot()
    await vi.waitFor(() => { expect(state().effectiveProvider).toBe('claude-code') })
    expect(state()).toMatchObject({ provider: { text: 'claude-code', overridden: false }, credential: { kind: 'login' } })
    expect(api.describe).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('switches the provider and stores the key under the chosen provider in one save', async () => {
    const host = stubConfigForm<SearchProviderSettings>()
    acceptWrites(host)
    const api = credentials({})
    const controller = new SearchProviderCardController(host.scope, api.ctx)
    ready(host)
    const face = controller.inject()
    const state = () => face.hooks.searchProviderCard.getSnapshot()

    face.edit('searchProvider', 'openai')
    await vi.waitFor(() => { expect(api.describe).toHaveBeenLastCalledWith(['OPENAI_API_KEY']) })
    expect(state()).toMatchObject({ effectiveProvider: 'openai', credential: { kind: 'credential', ref: 'OPENAI_API_KEY' }, apiKeyConfigured: false })
    face.edit('apiKey', ' sk-test ')
    face.save()
    await vi.waitFor(() => { expect(state().dirty).toBe(false) })
    expect(host.mutate.mock.calls[0]![0]).toEqual([{ op: 'set', path: ['searchProvider'], value: 'openai' }])
    expect(api.set).toHaveBeenCalledWith('OPENAI_API_KEY', 'sk-test')
    expect(state().apiKeyConfigured).toBe(true)

    // A key written elsewhere refreshes only the reference in force.
    api.describe.mockClear()
    controller.refreshCredential('OTHER_KEY')
    controller.refreshCredential('OPENAI_API_KEY')
    await vi.waitFor(() => { expect(api.describe).toHaveBeenCalledOnce() })
    controller.dispose()
  })

  it('drops failed and stale credential reads and defaults an unknown reference to writable', async () => {
    const host = stubConfigForm<SearchProviderSettings>()
    const api = credentials({})
    api.describe.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'down' } } as never)
    const controller = new SearchProviderCardController(host.scope, api.ctx)
    host.publish({ status: 'ready', writable: true, value: {}, base: { searchProvider: '' }, user: {} })
    const face = controller.inject()
    const state = () => face.hooks.searchProviderCard.getSnapshot()
    expect(state().effectiveProvider).toBeUndefined()
    host.publish({ base: undefined })
    expect(state().effectiveProvider).toBeUndefined()
    host.publish({ base: { searchProvider: 5 } })
    expect(state().effectiveProvider).toBeUndefined()
    host.publish({ base: { searchProvider: 'exa' } })
    expect(state()).toMatchObject({ effectiveProvider: 'exa', credential: { kind: 'environment', variable: 'EXA_API_KEY' } })
    api.describe.mockResolvedValueOnce({ ok: true, value: {} } as never)
    face.edit('searchProvider', 'openrouter')
    await vi.waitFor(() => { expect(api.describe).toHaveBeenCalledWith(['OPENROUTER_API_KEY']) })
    expect(state()).toMatchObject({ apiKeyConfigured: false, apiKeyWritable: true })
    face.edit('searchProvider', 'gemini')
    await vi.waitFor(() => { expect(api.describe).toHaveBeenCalledWith(['GEMINI_API_KEY']) })
    const pending = Promise.withResolvers<{ ok: true; value: Record<string, never> }>()
    api.describe.mockReturnValueOnce(pending.promise)
    face.edit('searchProvider', 'mistral')
    face.edit('searchProvider', 'xai')
    face.edit('apiKey', 'draft')
    pending.resolve({ ok: true, value: {} })
    await vi.waitFor(() => { expect(state()).toMatchObject({ effectiveProvider: 'xai', apiKeyWritable: true, apiKeyConfigured: false }) })
    controller.dispose()
  })

  it('reverts to the default, reports read-only keys, and ignores unlisted providers', async () => {
    const host = stubConfigForm<SearchProviderSettings>()
    acceptWrites(host)
    const api = credentials({ READ_ONLY: true })
    const controller = new SearchProviderCardController(host.scope, api.ctx)
    host.publish({ status: 'ready', writable: true, value: { searchProvider: 'zai' }, base: {}, user: { searchProvider: 'zai' } })
    const face = controller.inject()
    const state = () => face.hooks.searchProviderCard.getSnapshot()
    await vi.waitFor(() => { expect(api.describe).toHaveBeenCalledWith(['ZAI_API_KEY']) })
    face.resetField('searchProvider')
    expect(state()).toMatchObject({ effectiveProvider: undefined, credential: undefined })
    face.edit('searchProvider', 'custom-provider')
    face.edit('apiKey', 'unused')
    face.save()
    await vi.waitFor(() => { expect(state().saving).toBe(false) })
    expect(api.set).not.toHaveBeenCalled()
    expect(state().failed).toBe(true)
    controller.dispose()
  })
})

describe('SearchProviderCard', () => {
  const t = makeTranslate(en, {})

  const baseState: SearchProviderCardState = {
    available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false,
    provider: { text: '', overridden: false, invalid: false },
    apiKey: { text: '', overridden: false, invalid: false },
    apiKeyConfigured: false, apiKeyWritable: true, effectiveProvider: undefined, credential: undefined,
  }

  function renderCard(state: Partial<SearchProviderCardState>, view: 'page' | 'summary' = 'page') {
    const actions = { edit: vi.fn(), resetField: vi.fn(), save: vi.fn(), discard: vi.fn() }
    const store = createSnapshotStore<SearchProviderCardState>({ ...baseState, ...state })
    const props = { ...actions, view, t, useSearchProviderCard: bindSnapshotSelector(store) } as SearchProviderCardProps
    const rendered = render(<SearchProviderCard {...props} />)
    return { ...actions, container: rendered.container }
  }

  it('renders the summary line', () => {
    expect(renderCard({}, 'summary').container.textContent).toBe(en.providerDescription)
  })

  it('reports a configured key', () => {
    renderCard({ credential: { kind: 'credential', ref: 'XAI_API_KEY' }, apiKeyConfigured: true })
    expect(screen.getByText(en.apiKeySet)).toBeTruthy()
  })

  it('reports a missing key and disables the control when the reference is not writable', () => {
    renderCard({ credential: { kind: 'credential', ref: 'XAI_API_KEY' }, apiKeyWritable: false })
    expect(screen.getByText(en.apiKeyUnset)).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('API key (XAI_API_KEY)').disabled).toBe(true)
  })

  it('offers every provider and stages a choice', () => {
    const actions = renderCard({ effectiveProvider: 'openai', credential: { kind: 'credential', ref: 'OPENAI_API_KEY' } })
    const select = screen.getByLabelText<HTMLSelectElement>('Provider')
    expect([...select.options].map(option => option.textContent)).toContain('Claude Code (your sign-in, no key)')
    fireEvent.change(select, { target: { value: 'gemini' } })
    expect(actions.edit).toHaveBeenCalledWith('searchProvider', 'gemini')
    fireEvent.change(screen.getByLabelText('API key (OPENAI_API_KEY)'), { target: { value: 'k' } })
    expect(actions.edit).toHaveBeenCalledWith('apiKey', 'k')
  })

  it('explains environment and sign-in authentication and keeps an unlisted stored id selectable', () => {
    renderCard({ provider: { text: 'custom', overridden: true, invalid: false }, credential: { kind: 'environment', variable: 'EXA_API_KEY' } })
    expect(screen.getByText(/EXA_API_KEY/)).toBeTruthy()
    expect(screen.getByRole('option', { name: 'custom' })).toBeTruthy()
    cleanup()
    const actions = renderCard({ provider: { text: 'claude-code', overridden: true, invalid: false }, credential: { kind: 'login' } })
    expect(screen.getByText(en.providerLogin)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.reset }))
    expect(actions.resetField).toHaveBeenCalledWith('searchProvider')
  })
})
