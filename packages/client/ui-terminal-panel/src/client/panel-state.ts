/**
 * Per-Session bottom terminal panel state: whether the panel shows, its
 * height, and its terminal tabs. One browser-storage entry holds every
 * Session's panel, validated on read, so a window restores the panels and the
 * terminal holds of Sessions it has not opened yet.
 */
import { z } from 'zod'
import { createSnapshotStore, type ObservableSnapshot, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WebTerminalId } from '@deepseek-ai/dsh-api-terminal-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Browser-storage key of every Session's panel state. */
export const TERMINAL_PANEL_PERSISTENCE = 'dsh.terminal-panel.v1'

/** Smallest panel height in CSS pixels; below it the tab strip and one screen row no longer fit. */
export const MIN_PANEL_HEIGHT = 120

/** Largest stored panel height in CSS pixels; the rendered panel is also capped by its column. */
export const MAX_PANEL_HEIGHT = 1600

/** Height of a panel that has never been resized. */
export const DEFAULT_PANEL_HEIGHT = 280

/**
 * Address one Session's panel tab in the window-wide terminal panel.
 * @param sessionId - owning Session.
 * @param tabKey - panel-local tab key.
 * @returns the key the terminal service's views and keyed hooks resolve.
 */
export function terminalKey(sessionId: SessionId, tabKey: string): string {
  return `${sessionId}/${tabKey}`
}

/**
 * Split a {@link terminalKey}.
 * @param key - key built by {@link terminalKey}.
 * @returns its Session and panel-local tab key.
 */
export function parseTerminalKey(key: string): { readonly sessionId: SessionId; readonly tabKey: string } {
  const slash = key.lastIndexOf('/')
  return { sessionId: key.slice(0, slash) as SessionId, tabKey: key.slice(slash + 1) }
}

/** One terminal occurrence in a Session's panel. */
export interface TerminalPanelTab {
  /** Panel-local occurrence key. */
  readonly key: string
  /** Globally unique content identity the terminal service binds its Host terminal to. */
  readonly contentId: string
  /** Existing Host terminal restored into this occurrence. */
  readonly terminalId?: WebTerminalId | undefined
  /** Shell chosen for a new terminal; a restored terminal keeps its own. */
  readonly shellPath?: string | undefined
}

/** One Session's panel. */
export interface TerminalPanelState {
  readonly open: boolean
  readonly height: number
  readonly tabs: readonly TerminalPanelTab[]
  /** Key of the shown tab; undefined exactly when there are no tabs. */
  readonly active: string | undefined
  /** Keys minted so far; the next tab is `t<minted + 1>`. */
  readonly minted: number
}

/** A terminal occurrence and its Session, as the terminal service retains them. */
export interface RetainedTerminalTab {
  readonly sessionId: SessionId
  readonly tabId: string
  readonly contentId: string
}

/** Panel of a Session that has none stored. */
export const EMPTY_PANEL: TerminalPanelState = { open: false, height: DEFAULT_PANEL_HEIGHT, tabs: [], active: undefined, minted: 0 }

const tabSchema = z.object({
  key: z.string().regex(/^t[1-9][0-9]*$/u),
  contentId: z.string().min(1),
  // Storage is where a Host terminal id re-enters as the terminal service's input.
  terminalId: z.string().min(1).transform(value => value as WebTerminalId).optional(),
  shellPath: z.string().min(1).optional(),
})
const panelSchema = z.object({
  open: z.boolean(),
  height: z.number().min(MIN_PANEL_HEIGHT).max(MAX_PANEL_HEIGHT),
  tabs: z.array(tabSchema),
  active: z.string().optional(),
  minted: z.int().nonnegative(),
}).refine(panel => panel.tabs.length === 0 ? panel.active === undefined : panel.tabs.some(tab => tab.key === panel.active))
const envelope = z.object({ bySession: z.record(z.string(), panelSchema) })

type Panels = Readonly<Record<string, TerminalPanelState>>

function readPanels(): Panels {
  if (typeof localStorage === 'undefined') return {}
  let raw: string | null
  try { raw = localStorage.getItem(TERMINAL_PANEL_PERSISTENCE) }
  catch (_storageUnavailable) { return {} }
  if (raw === null) return {}
  let saved: z.infer<typeof envelope>['bySession']
  try { saved = envelope.parse(JSON.parse(raw)).bySession }
  catch (_invalidPanels) { return {} }
  return Object.fromEntries(Object.entries(saved).map(([sessionId, panel]) => [sessionId, { ...panel, active: panel.active }]))
}

function writePanels(panels: Panels): void {
  try { localStorage.setItem(TERMINAL_PANEL_PERSISTENCE, JSON.stringify({ bySession: panels })) }
  catch (_storageUnavailable) { /* Unsaved panels only lose restoration after a reload. */ }
}

function clampHeight(height: number): number {
  return Math.round(Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, height)))
}

/** Owns every Session's panel state and which Session's panel is on screen. */
export class TerminalPanels {
  private readonly panels: SnapshotStore<Panels>
  private readonly views = new Map<SessionId, ObservableSnapshot<TerminalPanelState>>()
  private readonly mounted: SessionId[] = []
  private readonly unsubscribe: () => void

  constructor(private readonly contentId: () => string) {
    this.panels = createSnapshotStore<Panels>(readPanels())
    this.unsubscribe = this.panels.subscribe(() => {
      if (typeof localStorage !== 'undefined') writePanels(this.panels.getSnapshot())
    })
  }

  /**
   * Read one Session's panel.
   * @param sessionId - owning Session.
   * @returns the Session's panel, or {@link EMPTY_PANEL} while it has none.
   */
  get(sessionId: SessionId): TerminalPanelState {
    return this.panels.getSnapshot()[sessionId] ?? EMPTY_PANEL
  }

  /**
   * Observe one Session's panel; the same object is returned for every call.
   * @param sessionId - owning Session.
   * @returns a stable observable of that Session's panel.
   */
  panel(sessionId: SessionId): ObservableSnapshot<TerminalPanelState> {
    let view = this.views.get(sessionId)
    if (view === undefined) {
      view = { getSnapshot: () => this.get(sessionId), subscribe: listener => this.panels.subscribe(listener) }
      this.views.set(sessionId, view)
    }
    return view
  }

  /**
   * List every Session's tabs, including Sessions not on screen.
   * @returns the tabs, for the terminal service's window holds.
   */
  retained(): RetainedTerminalTab[] {
    return Object.entries(this.panels.getSnapshot()).flatMap(([sessionId, panel]) =>
      panel.tabs.map(tab => ({ sessionId: sessionId as SessionId, tabId: tab.key, contentId: tab.contentId })))
  }

  /**
   * Observe changes to any Session's panel.
   * @param listener - called after any Session's panel changes.
   * @returns unsubscribe callback.
   */
  subscribe(listener: () => void): () => void { return this.panels.subscribe(listener) }

  /**
   * Record that a Session's panel is on screen until the returned callback runs.
   * @param sessionId - Session whose panel mounted.
   * @returns detach callback.
   */
  attach(sessionId: SessionId): () => void {
    this.mounted.push(sessionId)
    return () => {
      const index = this.mounted.lastIndexOf(sessionId)
      if (index >= 0) this.mounted.splice(index, 1)
    }
  }

  /**
   * The Session the toggle command acts on.
   * @returns the Session whose panel mounted last and is still on screen.
   */
  get current(): SessionId | undefined { return this.mounted.at(-1) }

  /**
   * Hide a shown panel; show a hidden one, opening a first terminal when it has none.
   * @param sessionId - owning Session.
   */
  toggle(sessionId: SessionId): void {
    const panel = this.get(sessionId)
    if (panel.open) this.put(sessionId, { ...panel, open: false })
    else if (panel.tabs.length === 0) this.add(sessionId)
    else this.put(sessionId, { ...panel, open: true })
  }

  /**
   * Show the panel, opening a first terminal when it has none; a shown panel gets another terminal.
   * @param sessionId - owning Session.
   */
  open(sessionId: SessionId): void {
    const panel = this.get(sessionId)
    if (panel.open) this.add(sessionId)
    else this.toggle(sessionId)
  }

  /**
   * Hide the panel without ending its terminals.
   * @param sessionId - owning Session.
   */
  hide(sessionId: SessionId): void {
    const panel = this.get(sessionId)
    if (panel.open) this.put(sessionId, { ...panel, open: false })
  }

  /**
   * Show the panel with a new terminal tab selected.
   * @param sessionId - owning Session.
   * @param shellPath - explicit shell; absent uses the terminal service's choice.
   * @returns the new tab.
   */
  add(sessionId: SessionId, shellPath?: string): TerminalPanelTab {
    const panel = this.get(sessionId)
    const minted = panel.minted + 1
    const tab: TerminalPanelTab = { key: `t${String(minted)}`, contentId: this.contentId(), ...shellPath === undefined ? {} : { shellPath } }
    this.put(sessionId, { ...panel, open: true, tabs: [...panel.tabs, tab], active: tab.key, minted })
    return tab
  }

  /**
   * Select a tab.
   * @param sessionId - owning Session.
   * @param key - tab to show; an unknown key changes nothing.
   */
  select(sessionId: SessionId, key: string): void {
    const panel = this.get(sessionId)
    if (panel.active !== key && panel.tabs.some(tab => tab.key === key)) this.put(sessionId, { ...panel, active: key })
  }

  /**
   * Remove a tab, selecting its neighbour and hiding the panel when none remain.
   * @param sessionId - owning Session.
   * @param key - tab to remove.
   * @returns the removed tab, or undefined when the key is unknown.
   */
  remove(sessionId: SessionId, key: string): TerminalPanelTab | undefined {
    const panel = this.get(sessionId)
    const index = panel.tabs.findIndex(tab => tab.key === key)
    const removed = panel.tabs[index]
    if (removed === undefined) return undefined
    const tabs = panel.tabs.filter(tab => tab.key !== key)
    const neighbour = tabs[Math.min(index, tabs.length - 1)]
    const active = panel.active === key ? neighbour?.key : panel.active
    this.put(sessionId, { ...panel, open: panel.open && tabs.length > 0, tabs, active })
    return removed
  }

  /**
   * Replace a tab with a new terminal at the same position.
   * @param sessionId - owning Session.
   * @param key - tab to replace.
   * @returns the replaced tab, or undefined when the key is unknown.
   */
  replace(sessionId: SessionId, key: string): TerminalPanelTab | undefined {
    const panel = this.get(sessionId)
    const index = panel.tabs.findIndex(tab => tab.key === key)
    const replaced = panel.tabs[index]
    if (replaced === undefined) return undefined
    const minted = panel.minted + 1
    const tab: TerminalPanelTab = { key: `t${String(minted)}`, contentId: this.contentId() }
    const tabs = panel.tabs.map(entry => entry.key === key ? tab : entry)
    this.put(sessionId, { ...panel, tabs, active: panel.active === key ? tab.key : panel.active, minted })
    return replaced
  }

  /**
   * Set the panel height, clamped to the stored bounds.
   * @param sessionId - owning Session.
   * @param height - requested height in CSS pixels.
   */
  resize(sessionId: SessionId, height: number): void {
    const panel = this.get(sessionId)
    const next = clampHeight(height)
    if (next !== panel.height) this.put(sessionId, { ...panel, height: next })
  }

  /**
   * Drop a Session's panel after its Session no longer exists.
   * @param sessionId - removed Session.
   * @returns the tabs it held.
   */
  forget(sessionId: SessionId): readonly TerminalPanelTab[] {
    const panels = this.panels.getSnapshot()
    const panel = panels[sessionId]
    if (panel === undefined) return []
    const { [sessionId]: _removed, ...rest } = panels
    this.panels.set(rest)
    return panel.tabs
  }

  /** Stop persisting. */
  dispose(): void { this.unsubscribe() }

  private put(sessionId: SessionId, panel: TerminalPanelState): void {
    this.panels.set({ ...this.panels.getSnapshot(), [sessionId]: panel })
  }
}
