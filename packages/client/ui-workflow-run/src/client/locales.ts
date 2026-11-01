/** `workflowRun` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'workflowRun'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'run.title': '{name}',
  'run.members.one': '{count} 個成員',
  'run.members.other': '{count} 個成員',
  'run.empty': '沒有啟動成員',
  'phase.unassigned': '未分階段',
  'phase.empty': '空階段名',
  'statusCount.running': '執行中 {count}',
  'statusCount.completed': '已完成 {count}',
  'statusCount.failed': '失敗 {count}',
  'statusCount.cancelled': '已取消 {count}',
  'statusCount.interrupted': '已中斷 {count}',
  'member.empty': '空成員名',
  'member.open': '開啟 {name}',
  'status.running': '執行中',
  'status.completed': '已完成',
  'status.failed': '失敗',
  'status.cancelled': '已取消',
  'status.interrupted': '已中斷',
}

/** English dictionary (same key set). */
export const en: Record<WorkflowRunKey, string> = {
  'run.title': '{name}',
  'run.members.one': '{count} member',
  'run.members.other': '{count} members',
  'run.empty': 'No members started',
  'phase.unassigned': 'Unphased',
  'phase.empty': 'Empty phase name',
  'statusCount.running': 'Running {count}',
  'statusCount.completed': 'Completed {count}',
  'statusCount.failed': 'Failed {count}',
  'statusCount.cancelled': 'Cancelled {count}',
  'statusCount.interrupted': 'Interrupted {count}',
  'member.empty': 'Empty member name',
  'member.open': 'Open {name}',
  'status.running': 'Running',
  'status.completed': 'Completed',
  'status.failed': 'Failed',
  'status.cancelled': 'Cancelled',
  'status.interrupted': 'Interrupted',
}

/** Union of this namespace's dictionary keys. */
export type WorkflowRunKey = keyof typeof zh
