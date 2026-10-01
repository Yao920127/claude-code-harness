/** Editor file operations over the workspace Remote, per-tab drafts, language choice, and the text-alternative registration rule. */
import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { DocumentPreviewRegistry } from '../src/client/document/registry.ts'
import { EditorDrafts, remoteEditorFiles, type EditorFilesRemote } from '../src/client/editor/files.ts'
import { HIGHLIGHTED_FILES, languageForFile } from '../src/client/editor/languages.ts'

const FILE = { sessionId: 's1' as SessionId, path: 'src/app.py' }
const STAT = { absolutePath: '/w/src/app.py', version: 'v2', bytes: 3 }

const readBytes = vi.fn<EditorFilesRemote['readBytes']>(async () => ({
  ok: true as const, value: { ...STAT, version: 'v1', offset: 0, eof: true, data: new TextEncoder().encode('hi\n') },
}))
const write = vi.fn<EditorFilesRemote['write']>(async () => ({ ok: true as const, value: STAT }))

function remote(overrides: Partial<EditorFilesRemote> = {}): EditorFilesRemote {
  return { readBytes, stat: async () => ({ ok: true as const, value: STAT }), write, ...overrides }
}

const copy = { failure: (failure: { code: string }) => `failed: ${failure.code}`, notText: () => 'not text' }

describe('remoteEditorFiles', () => {
  it('loads UTF-8 text with its version, reads versions, and saves with the edited-from version', async () => {
    const ops = remoteEditorFiles(remote(), copy)
    const signal = new AbortController().signal
    await expect(ops.load(FILE, signal)).resolves.toEqual({ text: 'hi\n', version: 'v1' })
    expect(readBytes).toHaveBeenCalledWith('s1', 'src/app.py', {}, signal)
    await expect(ops.version(FILE, signal)).resolves.toBe('v2')
    await expect(ops.save(FILE, 'new', 'v1')).resolves.toEqual({ kind: 'saved', version: 'v2' })
    expect(write).toHaveBeenCalledWith('s1', 'src/app.py', { text: 'new', version: 'v1' })
  })

  it('reports Remote failures, non-UTF-8 bytes, NUL bytes, and changed files distinctly', async () => {
    const signal = new AbortController().signal
    const failing = remoteEditorFiles(remote({
      readBytes: async () => ({ ok: false as const, error: new RemoteError('workspace-file/not-found', 'gone', { path: 'x' }) }),
      stat: async () => ({ ok: false as const, error: new RemoteError('workspace-file/not-found', 'gone', { path: 'x' }) }),
      write: async () => ({ ok: false as const, error: new RemoteError('workspace-file/changed', 'changed', { path: 'x' }) }),
    }), copy)
    await expect(failing.load(FILE, signal)).rejects.toThrow('failed: workspace-file/not-found')
    await expect(failing.version(FILE, signal)).rejects.toThrow('failed: workspace-file/not-found')
    await expect(failing.save(FILE, 'x', 'v1')).resolves.toEqual({ kind: 'changed' })
    const bytes = (data: Uint8Array) => remoteEditorFiles(remote({
      readBytes: async () => ({ ok: true as const, value: { ...STAT, offset: 0, eof: true, data: new Uint8Array(data) } }),
    }), copy)
    await expect(bytes(new Uint8Array([0xff, 0xfe])).load(FILE, signal)).rejects.toThrow('not text')
    await expect(bytes(new Uint8Array([0x61, 0])).load(FILE, signal)).rejects.toThrow('not text')
    const refused = remoteEditorFiles(remote({
      write: async () => ({ ok: false as const, error: new RemoteError('workspace-file/outside-workspace', 'outside', { path: 'x' }) }),
    }), copy)
    await expect(refused.save(FILE, 'x', 'v1')).resolves.toEqual({ kind: 'failed', message: 'failed: workspace-file/outside-workspace' })
  })
})

describe('EditorDrafts', () => {
  it('keeps a draft until its tab closes and ignores a tab that already closed', () => {
    const drafts = new EditorDrafts()
    const tab = 'tab' as TabId
    const lifetime = new AbortController()
    const draft = { text: 'a', savedText: 'a', version: 'v1' }
    drafts.set(tab, draft, lifetime.signal)
    expect(drafts.get(tab)).toBe(draft)
    lifetime.abort()
    expect(drafts.get(tab)).toBeUndefined()
    drafts.set(tab, draft, lifetime.signal)
    expect(drafts.get(tab)).toBeUndefined()
  })
})

describe('languageForFile', () => {
  it('chooses highlighting by extension or well-known name and leaves other files plain', () => {
    for (const name of ['app.ts', 'App.TSX', 'main.py', 'notes.md', 'Dockerfile', '.zshrc', 'run.sh', 'Cargo.toml', 'x.kt', 'a.cs']) {
      expect(languageForFile(name), name).toBeDefined()
    }
    for (const name of HIGHLIGHTED_FILES) expect(languageForFile(name), name).toBeDefined()
    for (const name of ['notes.txt', 'README', '.env', 'archive.unknownext']) {
      expect(languageForFile(name), name).toBeUndefined()
    }
  })
})

describe('text alternatives', () => {
  it('rejects a text alternative that declares extensions', () => {
    const registry = new DocumentPreviewRegistry()
    expect(() => registry.register({ id: 'editor', extensions: ['py'], textAlternative: true, title: () => 'Edit', loading: 'renderer' }))
      .toThrow('text alternative "editor" must not declare extensions')
    const dispose = registry.register({ id: 'editor', extensions: [], textAlternative: true, title: () => 'Edit', loading: 'renderer' })
    expect(registry.candidates('a.py')).toEqual([])
    dispose()
  })
})
