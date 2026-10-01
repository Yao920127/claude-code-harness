/** The `write` endpoint: a guarded whole-file text replacement inside the workspace. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('dsh-workspace-files-write-')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await harness.dispose()
})

describe('workspaceFiles.write', () => {
  it('replaces the text read at a version and reports the new version and size', async () => {
    const path = join(harness.workspace, 'notes.txt')
    await writeFile(path, 'one\n', 'utf8')
    const endpoint = harness.endpoint()
    const read = await endpoint.stat(harness.scope, 'notes.txt', signal())
    const written = await endpoint.write(harness.scope, 'notes.txt', { text: 'one\ntwo 二\n', version: read.version }, signal())
    expect(await readFile(path, 'utf8')).toBe('one\ntwo 二\n')
    expect(written).toMatchObject({ absolutePath: read.absolutePath, bytes: 12 })
    expect(written.version).not.toBe(read.version)
    await expect(endpoint.stat(harness.scope, 'notes.txt', signal())).resolves.toMatchObject({ version: written.version })
  })

  it('refuses a version the file no longer has and leaves the newer text in place', async () => {
    const path = join(harness.workspace, 'notes.txt')
    await writeFile(path, 'one\n', 'utf8')
    const endpoint = harness.endpoint()
    const read = await endpoint.stat(harness.scope, 'notes.txt', signal())
    await writeFile(path, 'changed by someone else\n', 'utf8')
    await expect(failureOf(endpoint.write(harness.scope, 'notes.txt', { text: 'mine\n', version: read.version }, signal())))
      .resolves.toEqual({ code: 'workspace-file/changed', details: { path: 'notes.txt' } })
    expect(await readFile(path, 'utf8')).toBe('changed by someone else\n')
  })

  it('reports a change that lands between the version check and the write', async () => {
    const path = join(harness.workspace, 'notes.txt')
    await writeFile(path, 'one\n', 'utf8')
    const endpoint = harness.endpoint()
    const read = await endpoint.stat(harness.scope, 'notes.txt', signal())
    const stale = Object.assign(new Error('stale'), { code: 'FS_STALE_VERSION' })
    vi.spyOn(harness.ctx.fs, 'writeText').mockRejectedValueOnce(stale)
    await expect(failureOf(endpoint.write(harness.scope, 'notes.txt', { text: 'mine\n', version: read.version }, signal())))
      .resolves.toMatchObject({ code: 'workspace-file/changed' })
    const broken = new Error('disk full')
    vi.spyOn(harness.ctx.fs, 'writeText').mockRejectedValueOnce(broken)
    await expect(endpoint.write(harness.scope, 'notes.txt', { text: 'mine\n', version: read.version }, signal())).rejects.toBe(broken)
  })

  it('refuses files outside the workspace, oversized text, and NUL bytes without writing', async () => {
    const outsidePath = join(harness.outside, 'secret.txt')
    await writeFile(outsidePath, 'keep\n', 'utf8')
    await writeFile(join(harness.workspace, 'notes.txt'), 'one\n', 'utf8')
    const endpoint = harness.endpoint({ maxFileBytes: 8 })
    const outside = await endpoint.stat(harness.scope, outsidePath, signal())
    await expect(failureOf(endpoint.write(harness.scope, outsidePath, { text: 'x', version: outside.version }, signal())))
      .resolves.toEqual({ code: 'workspace-file/outside-workspace', details: { path: outsidePath } })
    expect(await readFile(outsidePath, 'utf8')).toBe('keep\n')
    const read = await endpoint.stat(harness.scope, 'notes.txt', signal())
    await expect(failureOf(endpoint.write(harness.scope, 'notes.txt', { text: '二二二', version: read.version }, signal())))
      .resolves.toEqual({ code: 'workspace-file/too-large', details: { path: 'notes.txt', limit: 8 } })
    await expect(failureOf(endpoint.write(harness.scope, 'notes.txt', { text: `a${String.fromCharCode(0)}`, version: read.version }, signal())))
      .resolves.toEqual({ code: 'workspace-file/not-text', details: { path: 'notes.txt' } })
    await expect(failureOf(endpoint.write(harness.scope, 'missing.txt', { text: 'x', version: read.version }, signal())))
      .resolves.toMatchObject({ code: 'workspace-file/not-found' })
    expect(await readFile(join(harness.workspace, 'notes.txt'), 'utf8')).toBe('one\n')
  })
})
