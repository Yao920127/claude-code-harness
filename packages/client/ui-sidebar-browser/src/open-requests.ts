/**
 * Host channel that carries Agent requests to show a page in the app's own
 * Browser: a Host caller hands a Session and an address to {@link SidebarBrowserOpener.open},
 * and every connected app window receives it on its open-request stream and
 * opens a new Browser tab in that Session. Requests are live only: a window
 * that connects later receives none of the earlier ones.
 * @module @deepseek-ai/dsh-client-ui-sidebar-browser/open-requests
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { BrowserOpenRequest, BrowserOpenStreamItem } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host channel opening pages in the app's Browser tabs. */
    sidebarBrowser: SidebarBrowserOpener
  }
}

/** Fans open requests out to the connected app windows. */
export class SidebarBrowserOpener extends TypertRemoteService {
  private readonly listeners = new Set<(request: BrowserOpenRequest) => void>()

  /** @param ctx - Host context; the service key and Remote namespace are both `sidebarBrowser`. */
  constructor(ctx: Context) {
    super(ctx, 'sidebarBrowser', { namespace: 'sidebarBrowser' })
  }

  /**
   * Ask every connected app window to open a page in a new Browser tab.
   * @param sessionId - Session whose Sidebar receives the tab.
   * @param url - HTTP(S) address; the Browser refuses any other address.
   * @returns the number of app windows that received the request; 0 when none is connected.
   */
  open(sessionId: SessionId, url: string): number {
    const request: BrowserOpenRequest = { sessionId, url }
    for (const listener of this.listeners) listener(request)
    return this.listeners.size
  }

  /**
   * Stream the open requests made while subscribed, in order, without replaying earlier ones.
   * @param signal - stream lifetime.
   * @returns `ready` once this window receives requests, then one `open` item per request.
   */
  @Remote({ mode: 'stream' })
  async *watchOpenRequests(signal: AbortSignal): AsyncIterable<BrowserOpenStreamItem> {
    const pending: BrowserOpenRequest[] = []
    let wake: (() => void) | undefined
    const listener = (request: BrowserOpenRequest): void => {
      pending.push(request)
      wake?.()
    }
    const abort = (): void => { wake?.() }
    this.listeners.add(listener)
    signal.addEventListener('abort', abort, { once: true })
    try {
      yield { kind: 'ready' }
      while (!signal.aborted) {
        const next = pending.shift()
        if (next !== undefined) {
          yield { kind: 'open', request: next }
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
        wake = undefined
      }
    } finally {
      this.listeners.delete(listener)
      signal.removeEventListener('abort', abort)
    }
  }
}
