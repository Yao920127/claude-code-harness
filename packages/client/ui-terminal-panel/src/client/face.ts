/** Injected terminal commands and observable state of the bottom terminal panel. */
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { TerminalLaunchShells, TerminalView, TerminalViewState } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TerminalPanelState } from './panel-state.ts'

/** A tab's React-free terminal model and its keyed observable state. */
export interface TerminalInjected {
  /** @param key - panel tab key. @returns its terminal commands. */
  readonly view: (key: string) => TerminalView
  readonly keyedHooks: { readonly terminal: (key: string) => HostObservable<TerminalViewState> }
}

/** The terminal screen follows the resolved application theme through a framework hook. */
export interface TerminalBodyInjected extends TerminalInjected {
  readonly hooks: { readonly theme: HostObservable<ThemeSnapshot> }
}

/**
 * Everything the window's bottom panel renders and changes. The panel shows
 * the selected Session's terminals, so every command names its Session, and a
 * terminal is addressed by {@link terminalKey}.
 */
export interface TerminalPanelInjected extends Omit<TerminalInjected, 'keyedHooks'> {
  readonly hooks: {
    /** The selected Session, or undefined while none is selected. */
    readonly current: HostObservable<SessionId | undefined>
    readonly theme: HostObservable<ThemeSnapshot>
  }
  readonly keyedHooks: {
    readonly terminal: (key: string) => HostObservable<TerminalViewState>
    /** @param sessionId - owning Session. @returns that Session's panel. */
    readonly panel: (sessionId: string) => HostObservable<TerminalPanelState>
  }
  /** @param sessionId - Session on screen. @returns detach callback; while attached, that Session receives the toggle shortcut. */
  readonly attach: (sessionId: SessionId) => () => void
  /** @param sessionId - owning Session. @param shellPath - explicit shell; absent uses the remembered choice. */
  readonly add: (sessionId: SessionId, shellPath?: string) => void
  /** @param sessionId - owning Session. @param key - tab to show. */
  readonly select: (sessionId: SessionId, key: string) => void
  /** @param sessionId - owning Session. @param key - tab whose terminal ends. */
  readonly close: (sessionId: SessionId, key: string) => void
  /** @param sessionId - owning Session. @param key - tab replaced by a new terminal at the same position. */
  readonly replace: (sessionId: SessionId, key: string) => void
  /** @param sessionId - owning Session whose hidden panel shows, opening a first terminal when it has none. */
  readonly show: (sessionId: SessionId) => void
  /** @param sessionId - owning Session whose panel hides; its terminals keep running. */
  readonly hide: (sessionId: SessionId) => void
  /** @param sessionId - owning Session. @param height - requested panel height in CSS pixels. */
  readonly resize: (sessionId: SessionId, height: number) => void
  /** @param sessionId - owning Session. @param signal - open menu lifetime. @returns current Host choices and browser preference. */
  readonly loadShells: (sessionId: SessionId, signal: AbortSignal) => Promise<TerminalLaunchShells>
  /** @param path - Host-discovered shell selected for the next terminal. */
  readonly selectShell: (path: string) => void
}

/** The conversation's corner button that shows a hidden panel. */
export interface TerminalLauncherInjected {
  readonly hooks: {
    readonly panel: HostObservable<TerminalPanelState>
    readonly shortcuts: HostObservable<readonly ShortcutCatalogEntry[]>
  }
  /** Show this Session's panel, opening a first terminal when it has none. */
  readonly show: () => void
}

/** The right Sidebar Start-page card that opens the panel. */
export interface TerminalGuideEntryInjected {
  readonly hooks: { readonly shortcuts: HostObservable<readonly ShortcutCatalogEntry[]> }
  /** Show this Session's panel, or add a terminal when it is already shown. */
  readonly open: () => void
}

/** A `terminal` Sidebar page, which hands off to the panel and closes. */
export interface TerminalRedirectInjected {
  /** Show this Session's panel, or add a terminal when it is already shown. */
  readonly open: () => void
}
