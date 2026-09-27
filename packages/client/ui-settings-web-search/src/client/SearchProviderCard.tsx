/**
 * The search-provider page: which provider serves web search, and the key the
 * chosen provider reads — written through the credentials domain, never into
 * the settings section. Providers that read the launch environment or the
 * host's Claude Code sign-in show how they authenticate instead of a key field.
 */

import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsChoiceField, SettingsForm, SettingsSecretField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './locales.ts'
import type { SearchProviderCardFace } from './search-provider-card-controller.ts'
import { SEARCH_PROVIDERS } from './search-providers.ts'

/** Props the renderer binds for the search-provider page. */
export type SearchProviderCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.webSearch'>
  & InjectFace<SearchProviderCardFace>

/**
 * Render the search-provider one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function SearchProviderCard(props: SearchProviderCardProps) {
  const { t } = props
  const state = props.useSearchProviderCard(snapshot => snapshot)
  if (props.view === 'summary') return t('providerDescription')
  const credential = state.credential
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <SettingsChoiceField
        id="plugin-config-web-search-provider"
        label={t('provider')}
        hint={t('providerHint')}
        inheritedLabel={t('providerInherited')}
        choices={SEARCH_PROVIDERS.map(entry => ({ value: entry.id, label: t(entry.label) }))}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        disabled={!state.writable}
        {...state.provider}
        onEdit={(text) => { props.edit('searchProvider', text) }}
        onReset={() => { props.resetField('searchProvider') }}
      />
      {credential?.kind === 'credential'
        ? (
          // The key starts blank, reports only whether one is configured, and
          // is disabled when the credentials domain cannot write it, which is
          // independent of whether the settings document itself is writable.
          <SettingsSecretField
            id="plugin-config-web-search-provider-key"
            label={t('providerApiKey', { ref: credential.ref })}
            hint={t('apiKeyHint')}
            disabled={!state.apiKeyWritable}
            text={state.apiKey.text}
            configured={state.apiKeyConfigured}
            stateLabel={state.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset')}
            onEdit={(text) => { props.edit('apiKey', text) }}
          />
        )
        : null}
      {credential?.kind === 'environment' ? <p>{t('providerEnvironment', { variable: credential.variable })}</p> : null}
      {credential?.kind === 'login' ? <p>{t('providerLogin')}</p> : null}
    </SettingsForm>
  )
}
