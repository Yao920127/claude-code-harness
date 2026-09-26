/** The stored-key control both web-search pages render. */

import { SettingsSecretField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsFieldState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WebSearchSettingsLocaleKey } from './locales.ts'

/**
 * Render one page's staged key: it starts blank, reports only whether a key is
 * configured, and is disabled when the credentials domain cannot write it —
 * which is independent of whether the settings document itself is writable.
 * @param props - control id and label, the key state, the locale reader, and the edit action.
 * @returns the labelled secret control.
 */
export function CredentialField(props: {
  id: string
  label: string
  state: { apiKey: SettingsFieldState; apiKeyConfigured: boolean; apiKeyWritable: boolean }
  t: (key: WebSearchSettingsLocaleKey) => string
  onEdit: (text: string) => void
}) {
  const { state, t } = props
  return (
    <SettingsSecretField
      id={props.id}
      label={props.label}
      hint={t('apiKeyHint')}
      disabled={!state.apiKeyWritable}
      text={state.apiKey.text}
      configured={state.apiKeyConfigured}
      stateLabel={state.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset')}
      onEdit={props.onEdit}
    />
  )
}
