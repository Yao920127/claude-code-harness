/** Locale namespace owned by Session export browser feedback. */
export const NS = 'session-log-download'

/** Simplified-Chinese Session export strings. */
export const zh = {
  'header.more': '更多操作',
  'menu.download': '下載 Session 日誌',
  'menu.feedback': '回饋',
  'dialog.preparingTitle': '正在匯出 Session',
  'dialog.preparingDescription': '正在準備包含目前 Session、子 Session 和附件的 ZIP 檔案。',
  'dialog.successTitle': 'Session 匯出已開始下載',
  'dialog.successDescription': '瀏覽器正在下載 Session ZIP 檔案。',
  'dialog.errorTitle': 'Session 匯出失敗',
  'dialog.close': '關閉',
  'dialog.commandFailed': '無法啟動 Session 匯出。',
} as const

/** English Session export strings. */
export const en: Record<keyof typeof zh, string> = {
  'header.more': 'More actions',
  'menu.download': 'Download session log',
  'menu.feedback': 'Feedback',
  'dialog.preparingTitle': 'Exporting Session',
  'dialog.preparingDescription': 'Preparing a ZIP containing this Session, its sub-Sessions, and attachments.',
  'dialog.successTitle': 'Session download started',
  'dialog.successDescription': 'The browser is downloading the Session ZIP.',
  'dialog.errorTitle': 'Session export failed',
  'dialog.close': 'Close',
  'dialog.commandFailed': 'Could not start the Session export.',
}

/** Stable locale keys consumed by the shared modal. */
export type SessionLogDownloadKey = keyof typeof zh
