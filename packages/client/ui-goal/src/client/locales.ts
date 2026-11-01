/** `goal` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'phase.active': '進行中的目標',
  'phase.active.disarmed': '未執行的目標',
  'phase.paused': '已暫停的目標',
  'phase.blocked': '受阻的目標',
  'objective.aria': '目標內容',
  'commandInput.aria': '指令輸入',
  'action.save': '儲存目標',
  'action.cancel': '取消編輯',
  'action.pause': '暫停目標',
  'action.resume': '恢復目標',
  'action.edit': '編輯目標',
  'action.clear': '清除目標',
} satisfies Record<string, string>

/** The goal namespace key union. */
export type GoalKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'phase.active': 'Ongoing Goal',
  'phase.active.disarmed': 'Inactive Goal',
  'phase.paused': 'Paused Goal',
  'phase.blocked': 'Blocked Goal',
  'objective.aria': 'Goal objective',
  'commandInput.aria': 'Command input',
  'action.save': 'Save goal',
  'action.cancel': 'Cancel edit',
  'action.pause': 'Pause goal',
  'action.resume': 'Resume goal',
  'action.edit': 'Edit goal',
  'action.clear': 'Clear goal',
} satisfies Record<GoalKey, string>
