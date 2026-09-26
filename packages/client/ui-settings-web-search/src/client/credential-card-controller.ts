/**
 * The shared half of a settings page that stages one stored key beside its
 * settings fields. The key's literal never rides a response, so the page learns
 * only whether one is configured and writes it through the credentials domain,
 * addressed by the reference the page names. It is staged with the other
 * fields, so one save covers everything the page shows.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SettingsFormModel, type SettingsFieldSpec, type SettingsFormScope } from '@deepseek-ai/dsh-client-ui-primitives'

/** Form field the credential control stages under. */
export const API_KEY_FIELD = 'apiKey'

/** What the credentials domain last reported, and for which reference. */
export interface CredentialState {
  /** Reference this answer describes; a stale response for another one is dropped. */
  readonly ref: string
  /** Whether any layer supplies a value for it. */
  readonly configured: boolean
  /** Whether `credentials/set` can affect it; false disables the control. */
  readonly writable: boolean
}

/** A page's staged form over one namespace plus one stored key. */
export abstract class CredentialCardController<T, S> {
  protected readonly form: SettingsFormModel<T>
  protected readonly store: SnapshotStore<S>
  protected credential: CredentialState = { ref: '', configured: false, writable: true }
  private readonly unsubscribe: () => void

  /**
   * @param scope - the bound settings scope of the page's namespace.
   * @param ctx - the page plugin's context, whose `remote.credentials` namespace answers for stored keys.
   * @param fields - the namespace fields the page stages beside the key.
   */
  constructor(
    protected readonly scope: SettingsFormScope<T>,
    private readonly ctx: ClientContext,
    fields: SettingsFieldSpec[],
  ) {
    this.form = new SettingsFormModel(scope, fields, [{ field: API_KEY_FIELD, write: text => this.writeKey(text) }])
    this.store = this.form.bind(() => this.projection())
    this.unsubscribe = scope.subscribe(() => { void this.readCredential() })
    void this.readCredential()
  }

  /** @returns the page snapshot, rebuilt from the form and the credential state. */
  protected abstract projection(): S

  /** @returns the reference of the key the page stages, or undefined when the page stages none. */
  protected abstract credentialRef(): string | undefined

  /**
   * Ask the credentials domain about the reference in force. The answer is
   * stored with the reference it describes: the reference can change between
   * the request and its response, and two reads can settle out of order, so a
   * response is published only while it still answers for the reference in force.
   */
  protected async readCredential(): Promise<void> {
    const ref = this.credentialRef()
    if (ref === undefined) return
    if (ref !== this.credential.ref) {
      // A new reference knows nothing yet; keeping the old answer would claim
      // the key is configured under a name nobody has checked.
      this.credential = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    const response = await this.ctx.remote.credentials.describe([ref])
    if (!response.ok || ref !== this.credentialRef()) return
    // An unknown reference is treated as writable: the control stays usable
    // and the Host is what refuses, rather than the page guessing a refusal.
    const view = response.value[ref] ?? { configured: false, writable: true }
    if (view.configured === this.credential.configured && view.writable === this.credential.writable) return
    this.credential = { ref, configured: view.configured, writable: view.writable }
    this.store.set(this.projection())
  }

  /**
   * Re-read after the Host reports a change to the reference this page watches.
   * A key written on another surface changes no settings section, so this is
   * the only signal that reaches the page.
   * @param ref - the reference the Host reports as changed.
   */
  refreshCredential(ref: string): void {
    if (ref !== this.credentialRef()) return
    void this.readCredential()
  }

  /**
   * Write the staged key under the reference in force, then re-read whether the Host now holds one.
   * @param value - the staged credential literal.
   * @returns whether the Host reports a configured credential afterwards.
   */
  private async writeKey(value: string): Promise<boolean> {
    const ref = this.credentialRef()
    if (ref === undefined) return false
    // Refusals surface through the re-read below: the Host is the only
    // authority on whether the key now exists.
    await this.ctx.remote.credentials.set(ref, value)
    await this.readCredential()
    return this.credential.configured
  }

  /** Release configuration subscriptions. */
  dispose(): void { this.unsubscribe(); this.form.dispose() }
}
