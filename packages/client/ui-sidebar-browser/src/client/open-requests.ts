/** Opens a Browser tab for each Agent open request the Host streams to this app window. */
import type { RemoteStream } from '@deepseek-ai/dsh-api-gateway/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { BrowserOpenStreamItem } from '../types.ts'

/**
 * Consume the Host's open-request stream until disposal.
 * @param stream - reconnecting `sidebarBrowser.watchOpenRequests` stream owned by this call.
 * @param openTab - opens one address in a new Browser tab of one Session.
 * @param failed - reports a stream failure other than disposal.
 * @returns a disposer that stops the stream and waits for it to close.
 */
export function followOpenRequests(
  stream: RemoteStream<BrowserOpenStreamItem>,
  openTab: (sessionId: SessionId, url: string) => void,
  failed: (error: unknown) => void,
): () => Promise<void> {
  void (async () => {
    for await (const item of stream) {
      if (item.value.kind === 'open') openTab(item.value.request.sessionId, item.value.request.url)
      item.accept()
    }
  })().catch((error: unknown) => {
    if (!stream.signal.aborted) failed(error)
  })
  return () => stream.dispose()
}
