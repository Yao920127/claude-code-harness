/** `plan` namespace dictionaries (the composer plan chip's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'chip.label': '計劃',
  'preview.title': '計劃',
  'preview.document': '計劃 · Markdown',
  'preview.action': '開啟',
  'preview.open': '在側邊欄開啟計劃',
  'preview.full': '檢視全文',
  'preview.openNamed': '開啟計劃：{title}',
  'preview.loading': '正在讀取計劃…',
  'preview.failed': '無法讀取計劃',
  'preview.invalidAddress': '計劃地址無效',
  'preview.historyUnavailable': '無法讀取工作階段歷史',
  'preview.notFound': '未找到這份計劃',
  'preview.unavailable': '計劃預覽不可用',
  'preview.expired': '臨時計劃預覽已失效，請從仍在等待審批的卡片重新開啟。',
  'chip.on.aria': '計劃模式已開啟，按下關閉',
  'chip.on.title': '計劃模式已開啟 — 點選關閉（/plan off）',
  'chip.exitFailed': '退出計劃模式失敗',
} satisfies Record<string, string>

/** The plan namespace key union. */
export type PlanKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'chip.label': 'Plan',
  'preview.title': 'Plan',
  'preview.document': 'Plan · Markdown',
  'preview.action': 'Open',
  'preview.open': 'Open plan in sidebar',
  'preview.full': 'View full plan',
  'preview.openNamed': 'Open plan: {title}',
  'preview.loading': 'Loading plan…',
  'preview.failed': 'Could not load plan',
  'preview.invalidAddress': 'Invalid plan address',
  'preview.historyUnavailable': 'Session history is unavailable',
  'preview.notFound': 'This plan was not found',
  'preview.unavailable': 'Plan preview is unavailable',
  'preview.expired': 'This temporary plan preview has expired. Reopen it from the pending review card.',
  'chip.on.aria': 'Plan mode on, press to turn off',
  'chip.on.title': 'Plan mode on — click to turn off (/plan off)',
  'chip.exitFailed': 'Failed to exit plan mode',
} satisfies Record<PlanKey, string>
