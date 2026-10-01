// @vitest-environment jsdom
/** Editor registration through the production document and Slot registries, and its Remote binding lifetime. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteError, SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, EDITOR_BODY_ID } from '../src/client/editor/index.ts'
import { EditorBody, type EditorBodyInjected } from '../src/client/editor/EditorBody.tsx'
import { DocumentPreviewRegistry } from '../src/client/document/registry.ts'
import { documentTabInfoFactory } from '../src/client/document/contract.ts'
import { en } from '../src/client/editor/locales.ts'

const SLOT = 'sidebar.right.tab.document'
const FILE = { sessionId: 's1' as SessionId, path: 'a.py' }
const plugin = { inject: ['slots', 'locale', 'documentPreviews'], apply }
let runtime: SlotTestRuntime | undefined

afterEach(async () => {
  await runtime?.dispose()
  runtime = undefined
})

async function boot() {
  const rt = await SlotTestRuntime.create()
  runtime = rt
  const locale = new LocaleRuntime(rt.ctx)
  rt.ctx.provide('locale', locale)
  rt.slots.installLocale(locale)
  const previews = new DocumentPreviewRegistry()
  rt.ctx.provide('documentPreviews', previews)
  await rt.declare({ [SLOT]: { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: documentTabInfoFactory } } } })
  await rt.mount(plugin)
  const entry = rt.slots.entries(SLOT)[0]
  const injected = (entry as { inject: () => EditorBodyInjected } | undefined)?.inject() as EditorBodyInjected
  return { rt, previews, entry, injected }
}

describe('editor registration', () => {
  it('registers a text alternative with its body and reports the file service unavailable without a Remote', async () => {
    const h = await boot()
    expect(h.previews.getSnapshot()).toEqual([expect.objectContaining({
      id: EDITOR_BODY_ID, extensions: [], textAlternative: true, priority: 'builtin', loading: 'renderer', wrap: false,
    })])
    expect(h.previews.getSnapshot()[0]?.title()).toBe(en.title)
    expect(h.entry).toMatchObject({ options: { key: EDITOR_BODY_ID }, locale: 'sidebarTextEditor', component: EditorBody })
    const signal = new AbortController().signal
    await expect(h.injected.files.load(FILE, signal)).rejects.toThrow()
    await expect(h.injected.files.version(FILE, signal)).rejects.toThrow()
    await expect(h.injected.files.save(FILE, 'x', 'v1')).resolves.toMatchObject({ kind: 'failed' })
  })

  it('calls the workspace Remote while it is mounted and falls back once it leaves', async () => {
    const h = await boot()
    const data = new TextEncoder().encode('print(1)\n')
    const stat = { absolutePath: '/w/a.py', version: 'v2', bytes: data.length }
    const workspaceFiles = {
      readBytes: vi.fn(async () => ({ ok: true as const, value: { ...stat, version: 'v1', offset: 0, eof: true, data } })),
      stat: vi.fn(async () => ({ ok: true as const, value: stat })),
      write: vi.fn(async () => ({ ok: true as const, value: stat })),
    }
    h.rt.remote.provideNamespaces({ workspaceFiles })
    const signal = new AbortController().signal
    await vi.waitFor(async () => { await expect(h.injected.files.load(FILE, signal)).resolves.toEqual({ text: 'print(1)\n', version: 'v1' }) })
    await expect(h.injected.files.version(FILE, signal)).resolves.toBe('v2')
    await expect(h.injected.files.save(FILE, 'x', 'v1')).resolves.toEqual({ kind: 'saved', version: 'v2' })
    workspaceFiles.readBytes.mockResolvedValueOnce({ ok: false, error: new RemoteError('workspace-file/not-found', 'gone', { path: 'a.py' }) } as never)
    await expect(h.injected.files.load(FILE, signal)).rejects.toThrow('error.notFound')
    workspaceFiles.readBytes.mockResolvedValueOnce({
      ok: true as const, value: { ...stat, offset: 0, eof: true, data: new Uint8Array([0xff]) },
    })
    await expect(h.injected.files.load(FILE, signal)).rejects.toThrow('error.notText')
    await h.rt.dispose()
    runtime = undefined
    await expect(h.injected.files.save(FILE, 'x', 'v1')).resolves.toMatchObject({ kind: 'failed' })
  })
})
