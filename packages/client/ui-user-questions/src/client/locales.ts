/** `question` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'error.incomplete': '請先完成這道問題。',
  'error.unanswered': '請選擇一個選項或填寫自定義答案。',
  'nav.prev': '上一題',
  'nav.next': '下一題',
  'nav.minimize': '收起問題卡片',
  'nav.maximize': '展開問題卡片',
  'nav.cancel': '放棄整組問題',
  'option.recommended': '推薦',
  'custom.placeholder': '輸入你的答案',
  'action.skip': '跳過',
  'action.next': '下一題',
  'plan.header': '計劃待審',
  'plan.approve': '同意執行',
  'plan.decline': '拒絕',
  'plan.discuss': '要求修改',
} satisfies Record<string, string>

/** The question namespace key union. */
export type QuestionKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'error.incomplete': 'Please complete this question first.',
  'error.unanswered': 'Please select an option or enter a custom answer.',
  'nav.prev': 'Previous question',
  'nav.next': 'Next question',
  'nav.minimize': 'Collapse the question card',
  'nav.maximize': 'Expand the question card',
  'nav.cancel': 'Dismiss all questions',
  'option.recommended': 'Recommended',
  'custom.placeholder': 'Type your answer',
  'action.skip': 'Skip',
  'action.next': 'Next',
  'plan.header': 'Plan review',
  'plan.approve': 'Approve',
  'plan.decline': 'Refuse',
  'plan.discuss': 'Request changes',
} satisfies Record<QuestionKey, string>
