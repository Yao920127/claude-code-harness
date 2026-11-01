import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { AntigravityDecoder } from '../src/events.ts'
import { writeTurnImages } from '../src/images.ts'
import { ToolEventRecorder } from '../src/tool-events.ts'
import { harnessToolCall } from '../src/tools.ts'
import type { CodingCliToolEventData } from '../src/types.ts'

describe('harnessToolCall', () => {
  it('maps CLI tool names and argument keys onto the harness tools', () => {
    expect(harnessToolCall('run_terminal_command', { command: 'ls' })).toEqual({ name: 'bash', arguments: { command: 'ls' } })
    expect(harnessToolCall('run_command', { CommandLine: 'ls', Cwd: '/w' })).toEqual({ name: 'bash', arguments: { CommandLine: 'ls', Cwd: '/w', command: 'ls' } })
    expect(harnessToolCall('read_file', { target_file: 'a.ts' })).toEqual({ name: 'read', arguments: { target_file: 'a.ts', path: 'a.ts' } })
    expect(harnessToolCall('Write_To_File', { TargetFile: 'b.ts' })).toMatchObject({ name: 'write', arguments: { path: 'b.ts' } })
    expect(harnessToolCall('search_replace', { file_path: 'c.ts' })).toMatchObject({ name: 'edit', arguments: { path: 'c.ts' } })
    expect(harnessToolCall('grep_search', { Query: 'todo' })).toMatchObject({ name: 'grep', arguments: { pattern: 'todo' } })
    expect(harnessToolCall('find_by_name', { Pattern: '*.ts' })).toMatchObject({ name: 'glob', arguments: { pattern: '*.ts' } })
    expect(harnessToolCall('search_web', { query: 'x' })).toMatchObject({ name: 'web_search', arguments: { query: 'x' } })
    expect(harnessToolCall('read_url_content', { Url: 'https://a' })).toMatchObject({ name: 'web_fetch', arguments: { url: 'https://a' } })
  })

  it('keeps an unknown tool and an input without the harness argument unchanged', () => {
    expect(harnessToolCall('list_dir', { path: '.' })).toEqual({ name: 'list_dir', arguments: { path: '.' } })
    expect(harnessToolCall('bash', { other: 1 })).toEqual({ name: 'bash', arguments: { other: 1 } })
    expect(harnessToolCall('read', null)).toEqual({ name: 'read', arguments: {} })
    expect(harnessToolCall('read', ['x'])).toEqual({ name: 'read', arguments: {} })
  })
})

describe('ToolEventRecorder', () => {
  it('keeps a call\'s first name and input on later states that omit them', () => {
    const events: CodingCliToolEventData[] = []
    const recorder = new ToolEventRecorder('grok', (data) => { events.push(data) })
    recorder.record({ kind: 'tool', id: 'x', name: 'read_file', input: { target_file: 'a.ts' }, status: 'running' })
    recorder.record({ kind: 'tool', id: 'x', name: 'tool', status: 'failed', output: 'denied' })
    recorder.record({ kind: 'tool', id: 'y', name: 'tool', status: 'completed' })
    expect(events.map(({ callId: _callId, ...rest }) => rest)).toEqual([
      { provider: 'grok', name: 'read', arguments: '{"target_file":"a.ts","path":"a.ts"}', status: 'running' },
      { provider: 'grok', name: 'read', arguments: '{"target_file":"a.ts","path":"a.ts"}', status: 'failed', output: 'denied' },
      { provider: 'grok', name: 'tool', arguments: '{}', status: 'completed' },
    ])
    expect(events[0]?.callId).toBe(events[1]?.callId)
    expect(events[0]?.callId).not.toBe(events[2]?.callId)
  })
})

describe('writeTurnImages', () => {
  it('writes each image with its extension and removes the directory on dispose', async () => {
    const refs = ['image/png', 'image/gif', 'image/x-unknown'].map((mediaType, index) => ({ attachmentId: String(index), mediaType }) as ImageAttachmentRef)
    const files = await writeTurnImages(refs, ref => Promise.resolve({ data: new Uint8Array([1, 2]), mediaType: ref.mediaType }))
    expect(files.images.map(image => image.path.split('/').at(-1))).toEqual(['image-1.png', 'image-2.gif', 'image-3.img'])
    expect(files.images[0]?.base64).toBe('AQI=')
    expect([...readFileSync(files.images[0]?.path ?? '')]).toEqual([1, 2])
    await files.dispose()
    expect(existsSync(files.images[0]?.path ?? '')).toBe(false)
  })

  it('creates no directory for a turn without images', async () => {
    const read = vi.fn()
    const files = await writeTurnImages([], read)
    expect(files.images).toEqual([])
    await files.dispose()
    expect(read).not.toHaveBeenCalled()
  })
})

describe('AntigravityDecoder', () => {
  it('reads a step without a step type by field names', () => {
    expect(new AntigravityDecoder().accept({ event: 'step_update', step_update: { type: 'message', text: 'hi' } })).toEqual([{ kind: 'text', text: 'hi' }])
  })
})
