/**
 * `sidebarDocumentPreview` namespace dictionaries.
 *
 * The failure lines are the point of this file: a preview that cannot show a
 * page has to say which of several different things went wrong, and each one
 * suggests a different next step for the reader.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  loading: '文件渲染中...',
  loadMore: '載入更多',
  changed: '檔案已更新，目前顯示為舊內容',
  reloadNow: '重新載入',
  reload: '重新讀取檔案',
  autoRefresh: '自動重新整理',
  'autoRefresh.enable': '開啟自動重新整理',
  'autoRefresh.disable': '關閉自動重新整理',
  'wrap.enable': '自動換行',
  'wrap.disable': '取消換行',
  'wrap.aria': '自動換行',
  openWith: '開啟方式',
  'edit.enable': '編輯檔案',
  'edit.disable': '返回預覽',
  'edit.aria': '編輯',
  'viewer.text': '純文字',
  resourceUnavailable: '檔案資源服務不可用',
  rendererUnavailable: '預覽器 {name} 不可用',
  unsupportedFile: '該格式檔案暫時無法預覽',
  'error.notFound': '檔案不存在，可能已被移動或刪除',
  'error.tooLarge': '單頁內容超過 {limit} 上限，無法讀取',
  'error.notText': '該格式檔案暫時無法預覽',
  'error.notRegularFile': '該路徑不是普通檔案，沒有可顯示的內容',
  'error.unavailable': '讀取失敗：{message}',
  retry: '重試',
} satisfies Record<string, string>

/** Text-preview dictionary key union. */
export type SidebarDocumentPreviewKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  loading: 'Rendering document...',
  loadMore: 'Load more',
  changed: 'The file has changed, showing the previous content.',
  reloadNow: 'Reload',
  reload: 'Read the file again',
  autoRefresh: 'Auto refresh',
  'autoRefresh.enable': 'Enable auto refresh',
  'autoRefresh.disable': 'Disable auto refresh',
  'wrap.enable': 'Turn on line wrap',
  'wrap.disable': 'Turn off line wrap',
  'wrap.aria': 'Line wrap',
  openWith: 'Open with',
  'edit.enable': 'Edit file',
  'edit.disable': 'Back to preview',
  'edit.aria': 'Edit',
  'viewer.text': 'Plain text',
  resourceUnavailable: 'The file resource service is unavailable.',
  rendererUnavailable: 'The {name} preview is unavailable.',
  unsupportedFile: 'Preview is not available for this file type yet.',
  'error.notFound': 'File not found. It may have been moved or deleted.',
  'error.tooLarge': 'This page exceeds the {limit} limit and cannot be read.',
  'error.notText': 'Preview is not available for this file type yet.',
  'error.notRegularFile': 'Not a regular file, nothing to display.',
  'error.unavailable': 'Read failed: {message}',
  retry: 'Retry',
} satisfies Record<SidebarDocumentPreviewKey, string>
