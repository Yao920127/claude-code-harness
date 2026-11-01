/** `approval` namespace dictionaries. */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  waiting: '等待審批',
  'detail.aria': '審批詳情',
  escalation: '工具 {toolName} 請求越權執行',
  reject: '拒絕',
  allowOnce: '允許一次',
} satisfies Record<string, string>

/** Approval dictionary key union. */
export type ApprovalKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  waiting: 'Waiting for approval',
  'detail.aria': 'Approval details',
  escalation: 'Tool {toolName} requests privileged execution',
  reject: 'Reject',
  allowOnce: 'Allow once',
} satisfies Record<ApprovalKey, string>
