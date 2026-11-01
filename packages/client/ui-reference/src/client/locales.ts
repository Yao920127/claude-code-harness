/** `reference` namespace dictionaries for the unified `@` source. */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by this plugin. */
export const NS = 'reference'

/**
 * Simplified Chinese dictionary (the key-set source of truth).
 *
 * The `time.*` bucket words are this namespace's own copy of the session-row
 * vocabulary: locale-owned copy keeps the words per plugin, while the
 * bucketing they name is the one shared {@link relativeTime} in ui-primitives.
 */
export const zh = {
  'section.files': '檔案與資料夾',
  'section.subagents': '子智慧代理',
  'section.sessions': '對話',
  'candidate.noCwd': '（無工作目錄）',
  'crumb.root': '工作區',
  'time.now': '剛剛',
  'time.minutes': '{n}分鐘',
  'time.hours': '{n}小時',
  'time.days': '{n}天',
  'time.months': '{n}個月',
  'time.years': '{n}年',
} satisfies Record<string, string>

/** The reference namespace key union. */
export type ReferenceKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The unified `@` reference menu's copy. */
    reference: ReferenceKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'section.files': 'Files & folders',
  'section.subagents': 'Subagents',
  'section.sessions': 'Sessions',
  'candidate.noCwd': '(no cwd)',
  'crumb.root': 'Workspace',
  'time.now': 'now',
  'time.minutes': '{n}min',
  'time.hours': '{n}h',
  'time.days': '{n}d',
  'time.months': '{n}mo',
  'time.years': '{n}y',
} satisfies Record<ReferenceKey, string>
