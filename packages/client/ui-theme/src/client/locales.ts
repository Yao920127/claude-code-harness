/** `settings.theme` namespace dictionaries (the Appearance and font-size rows' copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'appearance.title': '外觀',
  'appearance.light': '淺色',
  'appearance.dark': '深色',
  'appearance.system': '跟隨系統',
  'fontSize.title': '字號大小',
  'fontSize.description': '僅影響工作階段內容的字號',
  'fontSize.unit': 'px',
  'fontSize.increase': '增大字號',
  'fontSize.decrease': '減小字號',
} satisfies Record<string, string>

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'fontSize.title': 'Font size',
  'fontSize.description': 'Only affects conversation content',
  'fontSize.unit': 'px',
  'fontSize.increase': 'Increase font size',
  'fontSize.decrease': 'Decrease font size',
} satisfies Record<ThemeKey, string>
