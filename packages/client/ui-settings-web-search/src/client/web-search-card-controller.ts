/**
 * The web-search page's staged form over the `web-search-deepseek` settings
 * namespace.
 *
 * The key is the one control that does not live in the section: its literal
 * never rides a response, so the page learns only whether one is configured
 * and writes it through the credentials domain, addressed by the reference the
 * section names. It is still staged with the rest of the form, so one save
 * covers everything the page shows.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  settingsNumberField, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormShell, type SettingsFormScope, type SettingsFormScopeSnapshot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { API_KEY_FIELD, CredentialCardController } from './credential-card-controller.ts'

/**
 * Namespace of the DeepSeek search provider. Spelled here rather than
 * imported: a client package must not depend on a Host package.
 */
export const WEB_SEARCH_NS = 'web-search-deepseek'

/** Credential reference the provider resolves when the section names none. */
const DEFAULT_API_KEY_REF = 'DEEPSEEK_API_KEY'

/** The search-provider fields this page edits. */
export interface WebSearchSettings {
  /** Credential reference naming the environment key. */
  apiKeyEnv?: string
  /** Provider endpoint; blank inherits the provider default. */
  baseURL?: string
  /** Maximum searches served within one request. */
  maxUses?: number
}

/** What the web-search page renders. */
export interface WebSearchCardState extends SettingsFormShell {
  /** Provider endpoint. */
  baseURL: SettingsFieldState
  /** Searches allowed per request. */
  maxUses: SettingsFieldState
  /** The staged credential, which starts blank on every load. */
  apiKey: SettingsFieldState
  /** Whether the Host reports a credential configured for the referenced key. */
  apiKeyConfigured: boolean
  /** Whether the credentials domain accepts a write for it; false disables the control. */
  apiKeyWritable: boolean
}

/** The registration-side face the web-search page's slot entry injects. */
export interface WebSearchCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as useWebSearchCard. */
    webSearchCard: SnapshotStore<WebSearchCardState>
  }
}

/** Bridges the `web-search-deepseek` scope and the credentials domain onto the page. */
export class WebSearchCardController extends CredentialCardController<WebSearchSettings, WebSearchCardState> {
  /**
   * @param scope - the bound settings scope for the `web-search-deepseek` namespace.
   * @param ctx - the page plugin's context, whose `remote.credentials` namespace
   * answers for the credential the section references.
   */
  constructor(scope: SettingsFormScope<WebSearchSettings>, ctx: ClientContext) {
    super(scope, ctx, [settingsTextField('baseURL'), settingsNumberField('maxUses')])
  }

  protected projection(): WebSearchCardState {
    return {
      ...this.form.shell(),
      baseURL: this.form.field('baseURL'),
      maxUses: this.form.field('maxUses'),
      apiKey: this.form.field(API_KEY_FIELD),
      apiKeyConfigured: this.credential.configured,
      apiKeyWritable: this.credential.writable,
    }
  }

  protected credentialRef(): string {
    return refOf(this.scope.getSnapshot())
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its form actions.
   */
  inject(): WebSearchCardFace {
    return { hooks: { webSearchCard: this.store }, ...this.form.actions() }
  }
}

/**
 * The credential reference the section names, or the provider's default.
 * @param snapshot - the current scope snapshot.
 * @returns the reference to address.
 */
function refOf(snapshot: SettingsFormScopeSnapshot<WebSearchSettings>): string {
  const declared = snapshot.value?.apiKeyEnv
  return declared !== undefined && declared.length > 0 ? declared : DEFAULT_API_KEY_REF

}
