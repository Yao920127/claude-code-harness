/** The usage meter's state: one Remote read at a time, the latest answer kept. */
import { createSnapshotStore, type ObservableSnapshot, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClaudeCodeUsageView } from '@deepseek-ai/dsh-llm-claude-code/types'

/** What the meter shows. */
export type UsageState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly view: ClaudeCodeUsageView }
  | { readonly phase: 'failed'; readonly message: string }

/** Reads usage through the Host and publishes the result. */
export class UsageSource {
  private readonly store: SnapshotStore<UsageState> = createSnapshotStore<UsageState>({ phase: 'loading' })
  private generation = 0
  private disposed = false

  /** @param read - asks the Host for usage; `refresh` bypasses the Host's freshness window. */
  constructor(private readonly read: (refresh: boolean) => Promise<ClaudeCodeUsageView>) {}

  /** Observable meter state. */
  get state(): ObservableSnapshot<UsageState> { return this.store }

  /**
   * Read usage; a newer read supersedes an older one still in flight.
   * @param refresh - true asks Claude Code again instead of a fresh Host answer.
   */
  load(refresh: boolean): void {
    if (this.disposed) return
    const generation = ++this.generation
    // A shown answer stays on screen while a refresh runs.
    if (this.store.getSnapshot().phase === 'failed') this.store.set({ phase: 'loading' })
    this.read(refresh).then((view) => {
      if (!this.disposed && generation === this.generation) this.store.set({ phase: 'ready', view })
    }, (error: unknown) => {
      if (!this.disposed && generation === this.generation) {
        this.store.set({ phase: 'failed', message: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  /** Ignore reads that settle after the plugin unloads. */
  dispose(): void { this.disposed = true }
}
