/** The model route the main Session selects, which decides whether the meter shows Claude Code usage. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Selected route of the main Session: its provider id, `null` while the selection is still loading, or `undefined`
 * when no Session is open or the composition publishes no model selection.
 */
export type SelectedRoute = string | null | undefined

/** Model selection of one Session, as the model-selection plugin publishes it. */
export interface SessionSelection {
  getSnapshot(): { readonly current: { readonly provider: string } | null }
  subscribe(listener: () => void): () => void
}

/**
 * Follow the main Session's model selection.
 * @param current - the main Session, if one is open.
 * @param selection - one Session's model selection; undefined when it cannot be resolved.
 * @returns the selected route, re-read when the main Session or its selection changes.
 */
export function selectedRoute(
  current: HostObservable<SessionId | undefined>,
  selection: (sessionId: SessionId) => SessionSelection | undefined,
): HostObservable<SelectedRoute> {
  const read = (): SelectedRoute => {
    const sessionId = current.getSnapshot()
    if (sessionId === undefined) return undefined
    const found = selection(sessionId)
    return found === undefined ? undefined : found.getSnapshot().current?.provider ?? null
  }
  return {
    getSnapshot: read,
    subscribe: (listener) => {
      let detach = (): void => {}
      const follow = (): void => {
        detach()
        const sessionId = current.getSnapshot()
        detach = sessionId === undefined ? () => {} : selection(sessionId)?.subscribe(listener) ?? (() => {})
      }
      follow()
      const stop = current.subscribe(() => {
        follow()
        listener()
      })
      return () => {
        stop()
        detach()
      }
    },
  }
}
