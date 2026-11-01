/** Locale bundles for the shell executor's settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type ShellSettingsLocaleKey =
  | 'title' | 'description'
  | 'timeoutMs' | 'timeoutMsHint' | 'maxOutputBytes' | 'maxOutputBytesHint'
  | 'overridden' | 'reset' | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'saveFailed' | 'invalidNumber'

/** English copy. */
export const en: Record<ShellSettingsLocaleKey, string> = {
  title: 'Shell',
  description: 'Limit how long each command may run and how much it may output.',
  timeoutMs: 'Command timeout (ms)',
  timeoutMsHint: 'How long one command may run before it is terminated.',
  maxOutputBytes: 'Output cap per stream (bytes)',
  maxOutputBytesHint: 'Output beyond this spills to a temporary file rather than being lost.',
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
export const zh: Record<ShellSettingsLocaleKey, string> = {
  title: '終端',
  description: '限制每條命令最多能跑多久、最多輸出多少內容。',
  timeoutMs: '命令超時（毫秒）',
  timeoutMsHint: '單條命令允許執行多久，超時即終止。',
  maxOutputBytes: '單流輸出上限（位元組）',
  maxOutputBytesHint: '超出部分會轉存到臨時檔案，而不是被丟棄。',
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
export function formLabels(t: (key: ShellSettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
