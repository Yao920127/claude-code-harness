/** Locale bundles for the agent loop's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type AgentLoopSettingsLocaleKey =
  | 'title' | 'description' | 'maxParallel' | 'maxParallelHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en: Record<AgentLoopSettingsLocaleKey, string> = {
  title: 'Agent loop',
  description: 'Control how the Agent dispatches tool calls.',
  maxParallel: 'Parallel tool calls',
  maxParallelHint: 'Upper bound on parallel-safe calls running at once within one step.',
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
export const zh: Record<AgentLoopSettingsLocaleKey, string> = {
  title: 'Agent 迴圈',
  description: '控制 Agent 派發工具呼叫的方式。',
  maxParallel: '並行工具呼叫數',
  maxParallelHint: '同一步內最多同時執行多少個可並行的呼叫。',
  overridden: '已覆蓋',
  reset: '恢復預設',
  readOnly: '本部署的設定為只讀。',
  unavailable: '該外掛目前未載入，暫時無法設定。',
  save: '儲存',
  saving: '儲存中…',
  saveFailed: '本部署沒有接受這些值，已保留供你修改。',
  invalidNumber: '請填數字；留空表示使用預設值。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: AgentLoopSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
