/**
 * `slash.menu` namespace dictionaries: group titles keyed by source name
 * (the lookup chain returns the key itself, so an unknown source shows its
 * raw name), the pending row, and the listbox and header aria labels.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'command': '指令',
  'skill': '技能',
  'subagent': '子智慧代理',
  'loading': '正在載入…',
  'drill.aria': '進入目錄',
  'drill.hint': '進入目錄',
  'drill.key': 'Tab',
  'crumbs.aria': '目錄導航',
  'suggestions.aria': '觸發候選建議',
} satisfies Record<string, string>

/** The slash.menu namespace key union. */
export type MenuKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'command': 'Commands',
  'skill': 'Skills',
  'subagent': 'Subagents',
  'loading': 'Loading…',
  'drill.aria': 'Browse folder',
  'drill.hint': 'Browse folder',
  'drill.key': 'Tab',
  'crumbs.aria': 'Folder navigation',
  'suggestions.aria': 'Trigger suggestions',
} satisfies Record<MenuKey, string>
