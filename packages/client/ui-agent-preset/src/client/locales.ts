/** Locale bundles for the agent-preset hero chip, header label, and management section. */

import { guideEn, guideZh, type PresetGuideKey } from './guide-locales.ts'

/** Locale keys these surfaces render. */
export type AgentPresetSettingsKey =
  | PresetGuideKey
  | 'builtInGroup'
  | 'customGroup'
  | 'seatHint'
  | 'headerHint'
  | 'nav'
  | 'sectionIntro'
  | 'setDefault'
  | 'view'
  | 'presetStandardName'
  | 'presetStandardDescription'
  | 'presetPtcName'
  | 'presetPtcDescription'
  | 'presetMinimalName'
  | 'presetMinimalDescription'
  | 'presetCordisName'
  | 'presetCordisDescription'
  | 'inUse'
  | 'noDescription'
  | 'brokenBadge'
  | 'switchRefused'
  | 'close'
  | 'creatorDraft'
  | 'enableDevToolsToSetDefault'
  | 'enableDevToolsToCreate'

/** English copy. */
export const en: Record<AgentPresetSettingsKey, string> = {
  ...guideEn,
  builtInGroup: 'Built-in', customGroup: 'Custom',
  sectionIntro: 'Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to DSH.',

  seatHint: 'Choose the agent preset for your new task',
  headerHint: 'The agent preset chosen when this task started',
  nav: 'Agent presets',

  setDefault: 'Set as new task default',
  view: 'View configuration',

  presetStandardName: 'Standard mode',
  presetStandardDescription:
    'Work with code, files, and information. Suitable for most tasks, with search, editing, terminal commands, and other tools available as needed.',
  presetPtcName: 'PTC mode',
  presetPtcDescription:
    'Includes all Standard mode capabilities. Better suited to tasks that call tools in batches and then filter, organize, deduplicate, count, or summarize the results.',
  presetMinimalName: 'Minimal mode',
  presetMinimalDescription:
    'The agent works using only a terminal tool. Useful for testing and comparing its basic performance.',
  presetCordisName: 'Creator mode',
  presetCordisDescription:
    'Customize DSH through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.',

  inUse: 'New task default',

  noDescription: 'No description.',
  brokenBadge: 'Failed to load',

  switchRefused: 'Could not switch to {name}: {reason}',

  close: 'Close',

  creatorDraft: 'Let the agent help me create a preset',

  enableDevToolsToSetDefault: 'Turn on Coding Tools in General settings to choose a default',
  enableDevToolsToCreate: 'Turn on Coding Tools in General settings to start Creator mode',
}

/** Simplified Chinese copy. */
export const zh: Record<AgentPresetSettingsKey, string> = {
  ...guideZh,
  builtInGroup: '內建', customGroup: '自定義',
  sectionIntro: '選擇 Agent 的工具和工作方式。日常任務用「標準模式」，擴充功能 DSH 的能力用「創造模式」。',

  seatHint: '選擇新任務使用的 Agent 預設',
  headerHint: '本任務的 Agent 預設，在任務開始時確定',
  nav: 'Agent 預設',

  setDefault: '設為新任務預設',
  view: '檢視設定',

  presetStandardName: '標準模式',
  presetStandardDescription: '處理程式碼、檔案和資料，適合大多數任務。Agent 會按需使用檢索、編輯和終端等工具。',
  presetPtcName: 'PTC 模式',
  presetPtcDescription: '包含標準模式的所有能力，更適合批次呼叫工具，並對結果進行篩選、整理、去重、統計或彙總的任務。',
  presetMinimalName: '極簡模式',
  presetMinimalDescription: 'Agent 僅使用終端工具完成任務，適合測試和對比其基礎表現。',
  presetCordisName: '創造模式',
  presetCordisDescription: '用對話定製 DSH：讓 Agent 編寫外掛，新增新功能或介面；也能組合工具和提示詞，建立自己的模式。',

  inUse: '新任務預設',

  noDescription: '暫無描述。',
  brokenBadge: '載入失敗',

  switchRefused: '無法切換到「{name}」：{reason}',

  close: '關閉',

  creatorDraft: '讓 Agent 幫我建立預設模式',

  enableDevToolsToSetDefault: '請先在通用設定中開啟程式碼工作工具，再設定預設值',
  enableDevToolsToCreate: '請先在通用設定中開啟程式碼工作工具，再啟動創造模式',
}

// The resolution itself is the shared fold in `dsh-agent-preset-registry/display`,
// re-exported here so every surface in this plugin reads one path; the
// Settings plugin list inlines the same fold over this plugin's dictionaries.
export { isBuiltInPreset, presetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
export type { PresetDisplaySource, PresetDisplayText } from '@deepseek-ai/dsh-agent-preset-registry/display'
