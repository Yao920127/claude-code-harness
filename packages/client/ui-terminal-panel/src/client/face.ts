/** Injected terminal commands and observable state of one Session's panel. */
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { TerminalLaunchShells, TerminalView, TerminalViewState } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
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

/** Everything the bottom panel of one Session renders and changes. */
export interface TerminalPanelInjected extends TerminalInjected {
  readonly hooks: {
    readonly panel: HostObservable<TerminalPanelState>
    readonly theme: HostObservable<ThemeSnapshot>
  }
  /** @returns detach callback; while attached, the panel's Session receives the toggle shortcut. */
  readonly attach: () => () => void
  /** @param shellPath - explicit shell; absent uses the remembered choice. */
  readonly add: (shellPath?: string) => void
  /** @param key - tab to show. */
  readonly select: (key: string) => void
  /** @param key - tab whose terminal ends. */
  readonly close: (key: string) => void
  /** @param key - tab replaced by a new terminal at the same position. */
  readonly replace: (key: string) => void
  /** Hide the panel; its terminals keep running. */
  readonly hide: () => void
  /** @param height - requested panel height in CSS pixels. */
  readonly resize: (height: number) => void
  /** @param signal - open menu lifetime. @returns current Host choices and browser preference. */
  readonly loadShells: (signal: AbortSignal) => Promise<TerminalLaunchShells>
  /** @param path - Host-discovered shell selected for the next terminal. */
  readonly selectShell: (path: string) => void
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
