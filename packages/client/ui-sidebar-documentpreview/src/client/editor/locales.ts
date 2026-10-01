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
  title: '编辑',
  loading: '正在打开编辑器',
  save: '保存',
  saving: '正在保存',
  saved: '已保存',
  unsaved: '未保存的修改',
  changed: '文件在你打开后已被修改，保存会覆盖那些修改。',
  external: '文件在磁盘上已更新，你仍有未保存的修改。',
  reload: '重新加载文件',
  overwrite: '仍然保存',
  retry: '重试',
  failed: '无法打开文件：{message}',
  saveFailed: '保存失败：{message}',
  unavailable: '文件服务不可用。',
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
