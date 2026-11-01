/** Locale bundles for the search-provider settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

import type { SearchProviderLabelKey } from './search-providers.ts'

/** Locale keys the page renders. */
export type WebSearchSettingsLocaleKey =
  | SearchProviderLabelKey
  | 'providerTitle' | 'providerDescription' | 'provider' | 'providerHint' | 'providerInherited'
  | 'providerApiKey' | 'providerEnvironment' | 'providerLogin'
  | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed'

/** English copy. */
export const en: Record<WebSearchSettingsLocaleKey, string> = {
  'provider.claudeCode': 'Claude Code (your sign-in, no key)',
  'provider.claudeApi': 'Claude API',
  'provider.deepseek': 'DeepSeek',
  'provider.openai': 'OpenAI',
  'provider.xai': 'xAI Grok',
  'provider.gemini': 'Google Gemini',
  'provider.openrouter': 'OpenRouter',
  'provider.mistral': 'Mistral',
  'provider.zai': 'Z.AI (GLM)',
  'provider.perplexity': 'Perplexity',
  'provider.exa': 'Exa',
  providerTitle: 'Search provider',
  providerDescription: 'Choose which service answers web searches.',
  provider: 'Provider',
  providerHint: 'Web searches use this provider from the next search on.',
  providerInherited: 'Use the default',
  providerApiKey: 'API key ({ref})',
  providerEnvironment: 'This provider reads {variable} from the environment the application was launched in.',
  providerLogin: 'This provider uses the Claude Code sign-in on this computer and needs no key.',
  apiKeyHint: 'Stored outside the settings file. Leave blank to keep the current key.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured; search is unavailable until one is.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
}

/** Simplified Chinese copy. */
export const zh: Record<WebSearchSettingsLocaleKey, string> = {
  'provider.claudeCode': 'Claude Code（使用你的登入，無需金鑰）',
  'provider.claudeApi': 'Claude API',
  'provider.deepseek': 'DeepSeek',
  'provider.openai': 'OpenAI',
  'provider.xai': 'xAI Grok',
  'provider.gemini': 'Google Gemini',
  'provider.openrouter': 'OpenRouter',
  'provider.mistral': 'Mistral',
  'provider.zai': 'Z.AI（智譜 GLM）',
  'provider.perplexity': 'Perplexity',
  'provider.exa': 'Exa',
  providerTitle: '搜尋來源',
  providerDescription: '選擇由哪個服務回答網頁搜尋。',
  provider: '提供者',
  providerHint: '從下一次搜尋起，網頁搜尋使用此提供者。',
  providerInherited: '使用預設值',
  providerApiKey: 'API Key（{ref}）',
  providerEnvironment: '此提供者從啟動應用程式的環境變數讀取 {variable}。',
  providerLogin: '此提供者使用本機的 Claude Code 登入，無需金鑰。',
  apiKeyHint: '不寫入設定檔案。留空表示保持目前金鑰。',
  apiKeySet: '已設定金鑰。',
  apiKeyUnset: '未設定金鑰；設定之前搜尋不可用。',
  overridden: '已覆蓋',
  reset: '恢復預設',
  readOnly: '本部署的設定為只讀。',
  unavailable: '該外掛目前未載入，暫時無法設定。',
  save: '儲存',
  saving: '儲存中…',
  saveFailed: '本部署沒有接受這些值，已保留供你修改。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: WebSearchSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
