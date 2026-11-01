/** Locale-owned text editor name, save status, and conflict copy. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Text editor implementation name, save controls, and conflict notices. */
    sidebarTextEditor: keyof typeof zh
  }
}

/** Simplified Chinese dictionary and key source. */
export const zh = {
  title: '編輯',
  loading: '正在開啟編輯器',
  save: '儲存',
  saving: '正在儲存',
  saved: '已儲存',
  unsaved: '未儲存的修改',
  changed: '檔案在你開啟後已被修改，儲存會覆蓋那些修改。',
  external: '檔案在磁碟上已更新，你仍有未儲存的修改。',
  reload: '重新載入檔案',
  overwrite: '仍然儲存',
  retry: '重試',
  failed: '無法開啟檔案：{message}',
  saveFailed: '儲存失敗：{message}',
  unavailable: '檔案服務不可用。',
}

/** English dictionary with the same keys. */
export const en = {
  title: 'Edit',
  loading: 'Opening the editor',
  save: 'Save',
  saving: 'Saving',
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  changed: 'The file changed after you opened it; saving overwrites those changes.',
  external: 'The file was updated on disk, and you still have unsaved changes.',
  reload: 'Reload file',
  overwrite: 'Save anyway',
  retry: 'Retry',
  failed: 'Cannot open the file: {message}',
  saveFailed: 'Save failed: {message}',
  unavailable: 'The file service is unavailable.',
} satisfies Record<keyof typeof zh, string>
