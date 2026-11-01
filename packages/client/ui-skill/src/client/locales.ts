/** `skill` namespace dictionaries for the dedicated tool row. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'skill'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'row.title': '載入技能',
  'row.running': '正在載入 skill',
  'row.preparing': '準備載入技能',
  'row.failed': 'skill 載入失敗',
  'row.stopped': 'skill 載入已中止',
  'row.instructions': '說明',
  'row.inspect': '檢視',
  'menu.userOnly': '僅使用者',
} satisfies Record<string, string>

/** The skill namespace key union. */
export type SkillKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'row.title': 'Skill',
  'row.running': 'Loading skill',
  'row.preparing': 'Preparing to load a skill',
  'row.failed': 'Skill load failed',
  'row.stopped': 'Skill load stopped',
  'row.instructions': 'Instructions',
  'row.inspect': 'Inspect',
  'menu.userOnly': 'user-only',
} satisfies Record<SkillKey, string>
