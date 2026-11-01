/** Locale bundles for the Subagent settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type SubagentSettingsLocaleKey =
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed'
  | 'subagentTitle' | 'subagentDescription' | 'subagentLimitsTitle'
  | 'subagentMaxDepth'
  | 'subagentDepthHelpLabel' | 'subagentDepthHelp'
  | 'subagentDepthZero' | 'subagentDepthOne' | 'subagentDepthOverride'
  | 'subagentMaxActive'
  | 'subagentCapacityHelpLabel' | 'subagentCapacityHelp'
  | 'subagentDepthInvalid'
  | 'subagentCapacityInvalid'
  | 'subagentModelSelectionTitle'
  | 'subagentModelSelectionToggle' | 'subagentModelSelectionChoose' | 'subagentModelSelectionAllowed'
  | 'subagentModelSelectionLoading' | 'subagentModelSelectionLoadFailed' | 'subagentModelSelectionRetry'
  | 'subagentModelSelectionPartial' | 'subagentModelSelectionUnavailable'
  | 'subagentModelSelectionUnavailableGroup' | 'subagentModelSelectionEmpty'
  | 'subagentModelSelectionRequired' | 'subagentModelSelectionConflict' | 'subagentModelSelectionOff'

/** English copy. */
export const en: Record<SubagentSettingsLocaleKey, string> = {
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  subagentTitle: 'Subagent',
  subagentDescription: 'Set Subagent recursion depth, count, and models.',
  subagentLimitsTitle: 'Limits',
  subagentMaxDepth: 'Maximum recursion depth',
  subagentDepthHelpLabel: 'About maximum recursion depth',
  subagentDepthHelp: 'Limits how many levels of Subagents an Agent can create.',
  subagentDepthZero: 'Disable Subagents',
  subagentDepthOne: 'Only the main Agent can create Subagents',
  subagentDepthOverride: 'If a tool defines its own maximum recursion depth, that setting takes precedence.',
  subagentMaxActive: 'Subagent parallelism limit',
  subagentCapacityHelpLabel: 'About the Subagent parallelism limit',
  subagentCapacityHelp: 'Total live Subagents under the same main Agent, across all recursion levels. The main Agent is excluded. New start requests are rejected when the limit is reached.',
  subagentDepthInvalid: 'Enter a whole number of 0 or more.',
  subagentCapacityInvalid: 'Enter a whole number of 1 or more.',
  subagentModelSelectionTitle: 'Model selection',
  subagentModelSelectionToggle: 'Allow agents to choose models for Subagents',
  subagentModelSelectionChoose: 'When enabled, agents can choose a provider, model, and reasoning effort for each Subagent from the authorized models below. Applies only to new sessions.',
  subagentModelSelectionAllowed: 'Models agents may choose',
  subagentModelSelectionLoading: 'Loading models…',
  subagentModelSelectionLoadFailed: 'Models could not be loaded.',
  subagentModelSelectionRetry: 'Retry',
  subagentModelSelectionPartial: 'Some model providers could not be loaded; saved choices remain removable.',
  subagentModelSelectionUnavailable: 'Currently unavailable',
  subagentModelSelectionUnavailableGroup: 'Saved but currently unavailable',
  subagentModelSelectionEmpty: 'No model provider currently advertises a model.',
  subagentModelSelectionRequired: 'Select at least one model before saving.',
  subagentModelSelectionConflict: 'Settings changed elsewhere. Discard your draft and try again.',
  subagentModelSelectionOff: 'Subagents use configured defaults or inherit the parent agent\'s model. Saved model choices are retained.',
}

/** Simplified Chinese copy. */
export const zh: Record<SubagentSettingsLocaleKey, string> = {
  overridden: '已覆蓋',
  reset: '恢復預設',
  readOnly: '本部署的設定為只讀。',
  unavailable: '該外掛目前未載入，暫時無法設定。',
  save: '儲存',
  saving: '儲存中…',
  saveFailed: '本部署沒有接受這些值，已保留供你修改。',
  subagentTitle: '子智慧代理',
  subagentDescription: '設定子智慧代理的遞迴層級、數量和模型。',
  subagentLimitsTitle: '執行限制',
  subagentMaxDepth: '最大遞迴深度',
  subagentDepthHelpLabel: '最大遞迴深度說明',
  subagentDepthHelp: '限制 Agent 建立子智慧代理的遞迴層級。',
  subagentDepthZero: '停用子智慧代理',
  subagentDepthOne: '僅允許主 Agent 建立子智慧代理',
  subagentDepthOverride: '如果某個工具單獨設定了最大遞迴深度，以該工具的設定為準。',
  subagentMaxActive: '子智慧代理並行數量上限',
  subagentCapacityHelpLabel: '子智慧代理並行數量上限說明',
  subagentCapacityHelp: '同一主 Agent 下，所有遞迴層級同時存活的子智慧代理總數，主 Agent 不計入。達到上限時，新的啟動請求會被拒絕。',
  subagentDepthInvalid: '請輸入不小於 0 的整數。',
  subagentCapacityInvalid: '請輸入不小於 1 的整數。',
  subagentModelSelectionTitle: '模型選擇',
  subagentModelSelectionToggle: '允許 Agent 為子智慧代理選擇模型',
  subagentModelSelectionChoose: '開啟後，Agent 可以從下方授權模型中，為每個子智慧代理選擇提供者、模型和推理強度。僅影響新工作階段。',
  subagentModelSelectionAllowed: 'Agent 可選擇的模型',
  subagentModelSelectionLoading: '正在載入模型…',
  subagentModelSelectionLoadFailed: '無法載入模型。',
  subagentModelSelectionRetry: '重試',
  subagentModelSelectionPartial: '部分模型提供者暫時無法載入；已儲存的選擇仍可移除。',
  subagentModelSelectionUnavailable: '目前不可用',
  subagentModelSelectionUnavailableGroup: '已儲存但目前不可用',
  subagentModelSelectionEmpty: '目前沒有模型提供者公佈模型。',
  subagentModelSelectionRequired: '儲存前請至少選擇一個模型。',
  subagentModelSelectionConflict: '設定已在其他位置更新。請放棄修改後重試。',
  subagentModelSelectionOff: '關閉後，子智慧代理使用設定的預設模型或繼承父 Agent 的模型；已選模型會保留。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: SubagentSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
