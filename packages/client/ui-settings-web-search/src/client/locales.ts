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
  'provider.claudeCode': 'Claude Code（使用你的登录，无需密钥）',
  'provider.claudeApi': 'Claude API',
  'provider.deepseek': 'DeepSeek',
  'provider.openai': 'OpenAI',
  'provider.xai': 'xAI Grok',
  'provider.gemini': 'Google Gemini',
  'provider.openrouter': 'OpenRouter',
  'provider.mistral': 'Mistral',
  'provider.zai': 'Z.AI（智谱 GLM）',
  'provider.perplexity': 'Perplexity',
  'provider.exa': 'Exa',
  providerTitle: '搜索来源',
  providerDescription: '选择由哪个服务回答网页搜索。',
  provider: '提供方',
  providerHint: '从下一次搜索起，网页搜索使用此提供方。',
  providerInherited: '使用默认值',
  providerApiKey: 'API Key（{ref}）',
  providerEnvironment: '此提供方从启动应用程序的环境变量读取 {variable}。',
  providerLogin: '此提供方使用本机的 Claude Code 登录，无需密钥。',
  apiKeyHint: '不写入设置文件。留空表示保持当前密钥。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥；配置之前搜索不可用。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: WebSearchSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
