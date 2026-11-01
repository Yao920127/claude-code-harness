/** `feedback` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.like': '好的回答',
  'action.likeActive': '取消標記',
  'action.dislike': '有問題的回答',
  'action.dislikeActive': '取消標記',
  'dialog.title': '提交回饋',
  'dialog.categories': '回饋分類',
  'dialog.detail': '回饋詳情',
  'dialog.hint': '填寫詳情以幫助我們改進體驗，提交內容會包括目前對話的日誌',
  'category.task-result': '任務結果',
  'category.instruction-following': '指令理解與遵循',
  'category.product-interaction': '產品功能與互動',
  'category.service-stability': '穩定性和速度',
  'category.resource-cost': '資源使用與費用',
  'category.security-privacy-permission': '安全隱私與權限',
  'category.other': '其他',
  'toast.recorded': '感謝你的回饋',
  'error.conflict': '這條回饋已在別處改動，已顯示最新狀態',
  'error.load': '回饋狀態載入失敗',
  'error.generic': '回饋儲存失敗',
  'error.noteTooLarge': '描述太長，請縮短後再提交',
} satisfies Record<string, string>

/** The feedback namespace key union. */
export type MessageFeedbackKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The feedback surface's copy: the message controls, the dialog, and the acknowledgement. */
    feedback: MessageFeedbackKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'action.like': 'Good response',
  'action.likeActive': 'Remove rating',
  'action.dislike': 'Bad response',
  'action.dislikeActive': 'Remove rating',
  'dialog.title': 'Submit feedback',
  'dialog.categories': 'Feedback category',
  'dialog.detail': 'Feedback details',
  'dialog.hint': 'Add details to help us improve. Your submission will include the current conversation log.',
  'category.task-result': 'Task result',
  'category.instruction-following': 'Instruction understanding and following',
  'category.product-interaction': 'Product features and interaction',
  'category.service-stability': 'Stability and speed',
  'category.resource-cost': 'Resource usage and cost',
  'category.security-privacy-permission': 'Security, privacy, and permissions',
  'category.other': 'Other',
  'toast.recorded': 'Thanks for your feedback',
  'error.conflict': 'This feedback changed elsewhere; the latest state is shown',
  'error.load': 'Could not load feedback',
  'error.generic': 'Could not save feedback',
  'error.noteTooLarge': 'The description is too long; shorten it and submit again',
} satisfies Record<MessageFeedbackKey, string>
