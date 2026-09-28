import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { followOpenRequests } from '../src/client/open-requests.ts'
import { scriptedStream } from './open-request-stream.client.ts'

const SESSION = 'session-1' as SessionId

describe('followOpenRequests', () => {
  it('opens a tab for each open request and accepts every item', async () => {
    const { stream, accepted, dispose } = scriptedStream([
      { kind: 'ready' },
      { kind: 'open', request: { sessionId: SESSION, url: 'https://a.example/' } },
    ])
    const openTab = vi.fn()
    const stop = followOpenRequests(stream, openTab, vi.fn())
    await vi.waitFor(() => { expect(accepted).toEqual(['ready', 'open']) })
    expect(openTab).toHaveBeenCalledExactlyOnceWith(SESSION, 'https://a.example/')
    await stop()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('reports a stream failure while running and stays silent after disposal', async () => {
    const failed = vi.fn()
    const running = scriptedStream([{ kind: 'ready' }], new Error('carrier lost'))
    followOpenRequests(running.stream, vi.fn(), failed)
    await vi.waitFor(() => { expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: 'carrier lost' })) })

    const quiet = vi.fn()
    const disposed = scriptedStream([], new Error('disposed'))
    disposed.lifetime.abort()
    followOpenRequests(disposed.stream, vi.fn(), quiet)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(quiet).not.toHaveBeenCalled()
  })
})
