/**
 * `model` namespace dictionaries.
 *
 * `trigger.selectAria` intentionally matches `trigger.fallback` but remains a
 * separate key: the visible fallback label and the accessible name of
 * an unset trigger are free to diverge per locale, and folding it into
 * `trigger.aria` would announce the degenerate "Select model, current Select
 * model".
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'provider.account': 'DeepSeek 帳號',
  'command.label': '模型',
  'command.description': '選擇本工作階段使用的模型',
  'option.loadError': '目錄載入失敗：{message}',
  'option.deepseekV4Flash.description': '快速、高效且經濟；適合目標明確、常規或並行任務。',
  'option.deepseekV4Pro.description': '更強的自主編碼、知識與複雜推理能力；適合複雜或品質優先的任務，但成本更高。',
  'trigger.fallback': '請選擇模型',
  'trigger.loading': '正在載入模型…',
  'trigger.selectAria': '請選擇模型',
  'trigger.aria': '選擇模型，目前 {model}',
  'trigger.ariaEffort': '選擇模型，目前 {model}，推理等級 {effort}',
  'menu.aria': '模型與推理等級',
  'menu.model': '模型',
  'menu.effort': '推理等級',
  'effort.providerDefault': 'Default',
  'status.loading': '正在重新整理模型列表…',
  'error.action': '模型操作失敗：{message}',
  'error.sessionInUse': '目前工作階段已被佔用，可能是其他正在執行的 DSH 導致的（如其他 dsh web、桌面端），請退出其他正在執行的 DSH 後重試。',
  'action.reload': '重新載入',
  'warning.groupLoad': '{name} 載入失敗：{message}',
  'empty.models': '沒有可用的模型。',
  'empty.efforts': '目前模型未提供推理等級。',
} satisfies Record<string, string>

/** The model namespace key union. */
export type ModelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'provider.account': 'DeepSeek Account',
  'command.label': 'Model',
  'command.description': 'Select the model for this conversation',
  'option.loadError': 'Catalog failed to load: {message}',
  'option.deepseekV4Flash.description': 'Fast, efficient, and economical; suited to focused, routine, or parallel tasks.',
  'option.deepseekV4Pro.description': 'Stronger agentic coding, knowledge, and difficult reasoning; suited to complex or quality-critical tasks at higher cost.',
  'trigger.fallback': 'Select model',
  'trigger.loading': 'Loading models…',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
  'menu.aria': 'Model and reasoning effort',
  'menu.model': 'Model',
  'menu.effort': 'Effort',
  'effort.providerDefault': 'Default',
  'status.loading': 'Refreshing model list…',
  'error.action': 'Model operation failed: {message}',
  'error.sessionInUse': 'This session is already in use, possibly by another running DSH instance (such as dsh web or the desktop app). Quit other running DSH instances and try again.',
  'action.reload': 'Reload',
  'warning.groupLoad': '{name} failed to load: {message}',
  'empty.models': 'No models available.',
  'empty.efforts': 'This model provides no reasoning effort levels.',
} satisfies Record<ModelKey, string>
