/** Stream double for the Host's open-request stream. */
import { vi } from 'vitest'
import type { RemoteStream } from '@deepseek-ai/dsh-api-gateway/client'
import type { BrowserOpenStreamItem } from '../src/types.ts'

/**
 * Build a single-generation stream that yields the scripted items, then fails or stays open until disposed.
 * @param items - items in delivery order.
 * @param failure - error thrown after the items; absent keeps the stream open.
 * @returns the stream plus the accepted item kinds, the dispose spy, and the stream lifetime.
 */
export function scriptedStream(items: readonly BrowserOpenStreamItem[], failure?: Error) {
  const lifetime = new AbortController()
  const accepted: BrowserOpenStreamItem['kind'][] = []
  const dispose = vi.fn(() => { lifetime.abort(); return Promise.resolve() })
  async function* iterate() {
    for (const value of items) {
      yield { generation: 1, value, signal: lifetime.signal, accept: () => { accepted.push(value.kind) } }
    }
    if (failure !== undefined) throw failure
    await new Promise<void>((resolve) => { lifetime.signal.addEventListener('abort', () => { resolve() }, { once: true }) })
  }
  const stream = { signal: lifetime.signal, dispose, [Symbol.asyncIterator]: iterate }
  return { stream: stream as never as RemoteStream<BrowserOpenStreamItem>, accepted, dispose, lifetime }
}
