/** Type-only declarations shared by the Host and browser halves: the Electron bridge and Agent open requests. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One request to open a page in a new Browser tab of one Session. */
export interface BrowserOpenRequest {
  /** Session whose right Sidebar receives the tab. */
  readonly sessionId: SessionId
  /** HTTP(S) address the tab opens; the Browser validates it again before navigation. */
  readonly url: string
}

/**
 * One item of the open-request stream: `ready` opens every stream generation
 * once the Host is delivering requests to it, and each `open` item carries one request.
 */
export type BrowserOpenStreamItem =
  | { readonly kind: 'ready' }
  | { readonly kind: 'open'; readonly request: BrowserOpenRequest }

/** Main-issued identity of one guest reservation. */
export type DesktopBrowserLeaseId = Branded<'DesktopBrowserLeaseId'>

/** A guest's approved storage partition, shared by every Sidebar guest and kept across restarts. */
export interface DesktopBrowserReservation {
  readonly lease: DesktopBrowserLeaseId
  readonly partition: string
}

/** Main-approved request to open an HTTP(S) page from an existing guest. */
export interface DesktopBrowserOpenRequest {
  readonly lease: DesktopBrowserLeaseId
  readonly url: string
}

/** Origin-scoped operations; no Electron objects or arbitrary IPC cross this interface. */
export interface DesktopBrowserBridge {
  /** @returns one approved guest reservation in the shared partition. */
  acquire(): Promise<DesktopBrowserReservation>
  /** @param lease - the caller's reservation. @returns after its guest has been destroyed. */
  release(lease: DesktopBrowserLeaseId): Promise<void>
  /** @param lease - originating guest. @param listener - approved URL consumer. @returns unsubscribe callback. */
  onOpenRequested(lease: DesktopBrowserLeaseId, listener: (url: string) => void): () => void
  /** @returns after every cookie and site storage entry of the shared partition has been erased. */
  clearSignIn(): Promise<void>
}
