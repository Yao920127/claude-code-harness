/** Locale bundles for the web-search provider's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

import type { SearchProviderLabelKey } from './search-providers.ts'

/** Locale keys the pages render. */
export type WebSearchSettingsLocaleKey =
  | SearchProviderLabelKey
  | 'providerTitle' | 'providerDescription' | 'provider' | 'providerHint' | 'providerInherited'
  | 'providerApiKey' | 'providerEnvironment' | 'providerLogin'
  | 'title' | 'description'
  | 'apiKey' | 'apiKeyHint' | 'apiKeySet' | 'apiKeyUnset'
  | 'baseUrl' | 'baseUrlHint' | 'maxUses' | 'maxUsesHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

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
  title: 'Web search',
  description: 'Set up the DeepSeek search provider.',
  apiKey: 'API key',
  apiKeyHint: 'Stored outside the settings file. Leave blank to keep the current key.',
  apiKeySet: 'A key is configured.',
  apiKeyUnset: 'No key is configured; search is unavailable until one is.',
  baseUrl: 'Endpoint',
  baseUrlHint: 'Leave blank to use the provider default.',
  maxUses: 'Max searches per request',
  maxUsesHint: 'How many times one request may search before it must answer.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
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
  title: '网页搜索',
  description: '设置 DeepSeek 的搜索提供方。',
  apiKey: 'API Key',
  apiKeyHint: '不写入设置文件。留空表示保持当前密钥。',
  apiKeySet: '已配置密钥。',
  apiKeyUnset: '未配置密钥；配置之前搜索不可用。',
  baseUrl: '接口地址',
  baseUrlHint: '留空则使用提供方默认地址。',
  maxUses: '单次请求最多搜索次数',
  maxUsesHint: '一次请求在必须作答前最多可以搜索多少次。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidNumber: '请填数字；留空表示使用默认值。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: WebSearchSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
