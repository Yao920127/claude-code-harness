/**
 * The search-provider page's staged form over the `web` settings namespace:
 * which provider serves `web_search`, and — for a provider that reads a
 * stored key — that key, written through the credentials domain under the
 * provider's reference. Both are staged together, so one save covers the
 * choice and the key it needs.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  settingsTextField, type SettingsFieldState, type SettingsFormActions, type SettingsFormShell, type SettingsFormScope,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { API_KEY_FIELD, CredentialCardController } from './credential-card-controller.ts'
import { searchProviderEntry, type SearchProviderCredential } from './search-providers.ts'

/** Namespace of the web service, spelled here because a client package must not depend on a Host package. */
export const WEB_NS = 'web'

/** Form field the provider choice stages under. */
const PROVIDER_FIELD = 'searchProvider'

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

/** Bridges the `web` scope and the credentials domain onto the page. */
export class SearchProviderCardController extends CredentialCardController<SearchProviderSettings, SearchProviderCardState> {
  /**
   * @param scope - the bound settings scope for the `web` namespace.
   * @param ctx - the page plugin's context, whose `remote.credentials` namespace answers for stored keys.
   */
  constructor(scope: SettingsFormScope<SearchProviderSettings>, ctx: ClientContext) {
    super(scope, ctx, [settingsTextField(PROVIDER_FIELD)])
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
  protected credentialRef(): string | undefined {
    const credential = searchProviderEntry(this.effectiveProvider())?.credential
    return credential?.kind === 'credential' ? credential.ref : undefined
  }

  protected projection(): SearchProviderCardState {
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
}
