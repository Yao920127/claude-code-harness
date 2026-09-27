/**
 * The search-provider page's staged form over the `web` settings namespace:
 * which provider serves `web_search`, and — for a provider that reads a
 * stored key — that key. The key's literal never rides a response, so the
 * page learns only whether one is configured and writes it through the
 * credentials domain under the provider's reference. Both are staged
 * together, so one save covers the choice and the key it needs.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormShell, type SettingsFormScope,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { searchProviderEntry, type SearchProviderCredential } from './search-providers.ts'

/** Namespace of the web service, spelled here because a client package must not depend on a Host package. */
export const WEB_NS = 'web'

/** Form field the provider choice stages under. */
const PROVIDER_FIELD = 'searchProvider'

/** Form field the credential control stages under. */
const API_KEY_FIELD = 'apiKey'

/** The web-service field this page edits. */
export interface SearchProviderSettings {
  /** Selected search provider id; absent inherits the composition. */
  searchProvider?: string
}

/** What the search-provider page renders. */
export interface SearchProviderCardState extends SettingsFormShell {
  /** The staged provider choice. */
  provider: SettingsFieldState
  /** Provider the next search uses once the draft saves. */
  effectiveProvider: string | undefined
  /** How the effective provider authenticates; undefined for a provider this page does not list. */
  credential: SearchProviderCredential | undefined
  /** The staged key, which starts blank on every load. */
  apiKey: SettingsFieldState
  /** Whether the Host reports a key stored for the effective provider's reference. */
  apiKeyConfigured: boolean
  /** Whether the credentials domain accepts a write for it. */
  apiKeyWritable: boolean
}

/** The registration-side face the page's slot entry injects. */
export interface SearchProviderCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as useSearchProviderCard. */
    searchProviderCard: SnapshotStore<SearchProviderCardState>
  }
}

/** What the credentials domain last reported, and for which reference. */
interface CredentialState {
  /** Reference this answer describes; a stale response for another one is dropped. */
  readonly ref: string
  /** Whether any layer supplies a value for it. */
  readonly configured: boolean
  /** Whether `credentials/set` can affect it; false disables the control. */
  readonly writable: boolean
}

/** Bridges the `web` scope and the credentials domain onto the page. */
export class SearchProviderCardController {
  private readonly form: SettingsFormModel<SearchProviderSettings>
  private readonly store: SnapshotStore<SearchProviderCardState>
  private credential: CredentialState = { ref: '', configured: false, writable: true }
  private readonly unsubscribe: () => void

  /**
   * @param scope - the bound settings scope for the `web` namespace.
   * @param ctx - the page plugin's context, whose `remote.credentials` namespace answers for stored keys.
   */
  constructor(private readonly scope: SettingsFormScope<SearchProviderSettings>, private readonly ctx: ClientContext) {
    this.form = new SettingsFormModel(scope, [settingsTextField(PROVIDER_FIELD)], [
      { field: API_KEY_FIELD, write: text => this.writeKey(text) },
    ])
    this.store = this.form.bind(() => this.projection())
    this.unsubscribe = scope.subscribe(() => { void this.readCredential() })
    void this.readCredential()
  }

  /**
   * The provider the next search would use: the staged choice, else the
   * composition layer a cleared choice reverts to.
   */
  private effectiveProvider(): string | undefined {
    const draft = this.form.field(PROVIDER_FIELD).text.trim()
    if (draft.length > 0) return draft
    const base = this.scope.getSnapshot().base
    const inherited: unknown = base instanceof Object ? Reflect.get(base, PROVIDER_FIELD) : undefined
    return typeof inherited === 'string' && inherited.length > 0 ? inherited : undefined
  }

  /** @returns the stored-key reference of the effective provider, when it reads one. */
  private credentialRef(): string | undefined {
    const credential = searchProviderEntry(this.effectiveProvider())?.credential
    return credential?.kind === 'credential' ? credential.ref : undefined
  }

  private projection(): SearchProviderCardState {
    const effectiveProvider = this.effectiveProvider()
    const matches = this.credential.ref === this.credentialRef()
    return {
      ...this.form.shell(),
      provider: this.form.field(PROVIDER_FIELD),
      effectiveProvider,
      credential: searchProviderEntry(effectiveProvider)?.credential,
      apiKey: this.form.field(API_KEY_FIELD),
      apiKeyConfigured: matches && this.credential.configured,
      apiKeyWritable: !matches || this.credential.writable,
    }
  }

  /**
   * Ask the credentials domain about the reference in force. The answer is
   * stored with the reference it describes: the reference can change between
   * the request and its response, and two reads can settle out of order, so a
   * response is published only while it still answers for the reference in force.
   */
  private async readCredential(): Promise<void> {
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

  /**
   * Build the face the page's slot registration injects. A provider edit
   * re-reads the key state for the newly chosen provider.
   * @returns the page's snapshot and its form actions.
   */
  inject(): SearchProviderCardFace {
    const actions = this.form.actions()
    return {
      hooks: { searchProviderCard: this.store },
      ...actions,
      edit: (field, text) => {
        actions.edit(field, text)
        if (field === PROVIDER_FIELD) void this.readCredential()
      },
      // The provider is the only resettable field: the key is a secret control.
      resetField: (field) => {
        actions.resetField(field)
        void this.readCredential()
      },
    }
  }

  /** Release configuration subscriptions. */
  dispose(): void { this.unsubscribe(); this.form.dispose() }
}
