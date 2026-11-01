/**
 * `sidebarFiles` namespace dictionaries, and the namespace's declaration.
 *
 * The failure lines name what the tree could not list, one code each, because a
 * directory that is gone, one outside the workspace, and a path that is not a
 * directory each suggest a different next step.
 *
 * The namespace merge lives with its key set so that any module naming
 * `TranslateNS<'sidebarFiles'>` or `PropsLocale<'sidebarFiles'>` needs only this
 * file, whichever entry a program loads first.
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** File-tree type name, guide entry, row states, and failure lines. */
    sidebarFiles: SidebarFilesKey
  }
}

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'shortcut.noSession': '請先選擇工作階段',
  'type.label': '檔案',
  'guide.title': '工作區檔案',
  'guide.description': '瀏覽工作階段工作區的檔案',
  loading: '正在讀取…',
  empty: '空目錄',
  truncated: '條目太多，只顯示了一部分。',
  noWorkspace: '這個工作階段沒有工作區目錄。',
  reload: '重新讀取',
  autoRefresh: '自動重新整理',
  'autoRefresh.enable': '開啟自動重新整理',
  'autoRefresh.disable': '關閉自動重新整理',
  'entry.other': '這不是檔案或目錄，沒法開啟。',
  'error.notFound': '這個目錄不在了。可能已被移動或刪除。',
  'error.outsideWorkspace': '這個目錄在工作區之外，側欄不會讀取它。',
  'error.notDirectory': '這不是一個目錄。',
  'error.unavailable': '讀取失敗：{message}',
} satisfies Record<string, string>

/** Files dictionary key union. */
export type SidebarFilesKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'shortcut.noSession': 'Select a session first',
  'type.label': 'Files',
  'guide.title': 'Workspace files',
  'guide.description': 'Browse files in this session\'s workspace',
  loading: 'Reading…',
  empty: 'Empty directory',
  truncated: 'Too many entries, showing only some of them.',
  noWorkspace: 'This session has no workspace directory.',
  reload: 'Reload',
  autoRefresh: 'Auto refresh',
  'autoRefresh.enable': 'Enable auto refresh',
  'autoRefresh.disable': 'Disable auto refresh',
  'entry.other': 'Not a file or a directory, so it cannot be opened.',
  'error.notFound': 'That directory is gone. It may have been moved or deleted.',
  'error.outsideWorkspace': 'That directory is outside the workspace, so the sidebar will not read it.',
  'error.notDirectory': 'That is not a directory.',
  'error.unavailable': 'Read failed: {message}',
} satisfies Record<SidebarFilesKey, string>
