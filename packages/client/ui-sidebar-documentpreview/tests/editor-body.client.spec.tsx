// @vitest-environment jsdom
/** The editor body's load, save, conflict, and reload behavior, with a textarea standing in for CodeMirror. */
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { DocumentContent } from '../src/client/document/contract.ts'
import { EditorBody, type EditorBodyProps } from '../src/client/editor/EditorBody.tsx'
import { EditorDrafts, type EditorFiles, type LoadedText, type SaveOutcome } from '../src/client/editor/files.ts'
import { en } from '../src/client/editor/locales.ts'
import { ADDRESS, FILE } from './fixtures.client.ts'

vi.mock('../src/client/editor/code-editor.tsx', () => ({
  CodeEditor: ({ initialText, label, onChange, onSave }: {
    initialText: string
    label: string
    onChange: (text: string) => void
    onSave: () => void
  }): ReactNode => (
    <textarea
      aria-label={label} defaultValue={initialText}
      onChange={(event) => { onChange(event.currentTarget.value) }}
      onKeyDown={(event) => { if (event.key === 's' && event.metaKey) onSave() }}
    />
  ),
}))

afterEach(() => { cleanup() })

const TAB = 'tab-1' as TabId

/** A deferred value the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function setup(options: { files?: Partial<EditorFiles>; drafts?: EditorDrafts; content?: DocumentContent } = {}) {
  const lifetime = new AbortController()
  const loaded = vi.fn()
  const failed = vi.fn()
  const reload = vi.fn()
  let revision = 1
  const request = (): DocumentContent => ({ kind: 'renderer', revision, loaded, failed, reload })
  const load = vi.fn<EditorFiles['load']>(async () => ({ text: 'one\n', version: 'v1' }))
  const version = vi.fn<EditorFiles['version']>(async () => 'v9')
  const save = vi.fn<EditorFiles['save']>(async () => ({ kind: 'saved', version: 'v2' }))
  const files: EditorFiles = { load, version, save, ...options.files }
  const drafts = options.drafts ?? new EditorDrafts()
  const props = (content: DocumentContent): EditorBodyProps => ({
    resourceAddress: ADDRESS, content, wrap: false, scrollportRef: () => {}, addResource: vi.fn(), setResources: vi.fn(),
    useTabInfo: () => ({ tab: { id: TAB, signal: lifetime.signal } }),
    files, drafts, t: makeTranslate(en),
  }) as never
  const view = render(<EditorBody {...props(options.content ?? request())} />)
  const bump = (): void => { revision += 1; view.rerender(<EditorBody {...props(request())} />) }
  return { view, load, version, save, drafts, loaded, failed, reload, lifetime, bump }
}

async function editor(): Promise<HTMLTextAreaElement> {
  return await screen.findByRole<HTMLTextAreaElement>('textbox', { name: en.title })
}

describe('EditorBody', () => {
  it('renders nothing for content another renderer loads', () => {
    const h = setup({ content: { kind: 'text', text: 'x', pages: [], eof: true } })
    expect(h.view.container.childElementCount).toBe(0)
    expect(h.load).not.toHaveBeenCalled()
  })

  it('loads the file, reports its version, and saves edits with the edited-from version', async () => {
    const h = setup()
    expect(screen.getByRole('status', { name: en.loading })).toBeDefined()
    const area = await editor()
    expect(area.value).toBe('one\n')
    expect(h.loaded).toHaveBeenCalledWith('v1')
    expect(screen.getByText(en.saved)).toBeDefined()
    fireEvent.change(area, { target: { value: 'one\ntwo\n' } })
    expect(screen.getByText(en.unsaved)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(screen.getByText(en.saved)).toBeDefined() })
    expect(h.save).toHaveBeenCalledWith(FILE, 'one\ntwo\n', 'v1')
    expect(h.drafts.get(TAB)).toEqual({ text: 'one\ntwo\n', savedText: 'one\ntwo\n', version: 'v2' })
  })

  it('keeps unsaved text across a remount and offers retry after a failed load', async () => {
    const drafts = new EditorDrafts()
    const first = setup({ drafts })
    fireEvent.change(await editor(), { target: { value: 'kept' } })
    first.view.unmount()
    const second = setup({ drafts, files: { load: vi.fn(async () => ({ text: 'one\n', version: 'v1' })) } })
    expect((await editor()).value).toBe('kept')
    expect(screen.getByText(en.unsaved)).toBeDefined()
    second.view.unmount()
    const broken = setup({ files: { load: vi.fn(async () => { throw new Error('gone') }) } })
    expect(await screen.findByText(en.failed.replace('{message}', 'gone'))).toBeDefined()
    expect(broken.failed).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(broken.reload).toHaveBeenCalledOnce()
    cleanup()
    setup({ files: { load: vi.fn(async () => { throw 'plain' }) } })
    expect(await screen.findByText(en.failed.replace('{message}', 'plain'))).toBeDefined()
  })

  it('refuses to overwrite a changed file until the user saves anyway, and can reload instead', async () => {
    const save = vi.fn<EditorFiles['save']>().mockResolvedValueOnce({ kind: 'changed' }).mockResolvedValueOnce({ kind: 'saved', version: 'v10' })
    const h = setup({ files: { save } })
    fireEvent.change(await editor(), { target: { value: 'mine' } })
    fireEvent.keyDown(await editor(), { key: 's', metaKey: true })
    expect(await screen.findByText(en.changed)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.overwrite }))
    await waitFor(() => { expect(screen.queryByText(en.changed)).toBeNull() })
    expect(h.version).toHaveBeenCalledOnce()
    expect(save).toHaveBeenLastCalledWith(expect.anything(), 'mine', 'v9')
    expect(h.drafts.get(TAB)?.version).toBe('v10')
  })

  it('reloads the file over unsaved changes on request and reports a failed reload', async () => {
    const load = vi.fn<EditorFiles['load']>()
      .mockResolvedValueOnce({ text: 'one\n', version: 'v1' })
      .mockResolvedValueOnce({ text: 'theirs\n', version: 'v3' })
      .mockRejectedValueOnce(new Error('offline'))
    const save = vi.fn<EditorFiles['save']>().mockResolvedValue({ kind: 'changed' })
    setup({ files: { load, save } })
    fireEvent.change(await editor(), { target: { value: 'mine' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    fireEvent.click(await screen.findByRole('button', { name: en.reload }))
    await waitFor(() => { expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('theirs\n') })
    expect(screen.getByText(en.saved)).toBeDefined()
    fireEvent.change(await editor(), { target: { value: 'again' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    fireEvent.click(await screen.findByRole('button', { name: en.reload }))
    expect(await screen.findByText(en.saveFailed.replace('{message}', 'offline'))).toBeDefined()
  })

  it('reports save failures and thrown saves, and ignores a second save while one runs', async () => {
    const pending = deferred<SaveOutcome>()
    const save = vi.fn<EditorFiles['save']>()
      .mockResolvedValueOnce({ kind: 'failed', message: 'disk full' })
      .mockRejectedValueOnce('denied')
      .mockReturnValueOnce(pending.promise)
    setup({ files: { save } })
    const area = await editor()
    fireEvent.change(area, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.saveFailed.replace('{message}', 'disk full'))).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(await screen.findByText(en.saveFailed.replace('{message}', 'denied'))).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    await waitFor(() => { expect(screen.getByText(en.saving)).toBeDefined() })
    fireEvent.keyDown(area, { key: 's', metaKey: true })
    expect(save).toHaveBeenCalledTimes(3)
    await act(async () => { pending.resolve({ kind: 'saved', version: 'v2' }) })
    expect(screen.getByText(en.saved)).toBeDefined()
  })

  it('follows a file changed on disk while clean, warns while dirty, and only updates the version for its own save', async () => {
    const load = vi.fn<EditorFiles['load']>()
      .mockResolvedValueOnce({ text: 'one\n', version: 'v1' })
      .mockResolvedValueOnce({ text: 'disk\n', version: 'v2' })
      .mockResolvedValueOnce({ text: 'disk\n', version: 'v3' })
      .mockResolvedValueOnce({ text: 'other\n', version: 'v4' })
    const h = setup({ files: { load } })
    await editor()
    h.bump()
    await waitFor(() => { expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('disk\n') })
    h.bump()
    await waitFor(() => { expect(h.drafts.get(TAB)?.version).toBe('v3') })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dirty' } })
    h.bump()
    expect(await screen.findByText(en.external)).toBeDefined()
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('dirty')
    expect(h.loaded).toHaveBeenLastCalledWith('v4')
  })

  it('drops loads that finish after the tab closed', async () => {
    const pending = deferred<LoadedText>()
    const failing = deferred<LoadedText>()
    const h = setup({ files: { load: vi.fn(() => pending.promise) } })
    h.lifetime.abort()
    await act(async () => { pending.resolve({ text: 'late', version: 'v1' }) })
    expect(h.loaded).not.toHaveBeenCalled()
    cleanup()
    const g = setup({ files: { load: vi.fn(() => failing.promise) } })
    g.lifetime.abort()
    await act(async () => { failing.reject(new Error('late')) })
    expect(g.failed).not.toHaveBeenCalled()
  })
})
